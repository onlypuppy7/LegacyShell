// Tracks every currently-open game/client socket by a lightweight ephemeral connection ID
// (assigned the moment it connects, not tied to auth_key at all) and routes admin-style commands
// to a specific one on demand - this replaces the old mainPort+111 dedicated WS server each
// instance used to run just for admin traffic. Everything here rides the SAME persistent
// connection every game/client instance already holds open to services for requestConfig/
// servicesInfo (see start-game.js/start-client.js) - built entirely off two small core emits
// (`serverConnected`, `wsDisconnected`, added in start-services.js) plus the existing
// `unhandledCommand` emitter every other services command already falls through to.
//
// Deliberately NOT keyed by auth_key: requestConfig (and so `msg.serverType`) only ever comes
// from a real game/client role process, never a browser, so any connection sending it is safe to
// register regardless of whether it presented an auth_key at all - and most of them won't, since
// auth_key's actual job is the sqlPassword+auth_key "full access" gate (see index.js), not
// per-instance identity. Requiring one just to show up in the target list would mean client
// instances (which have no other reason to carry one - see CLAUDE.md, client is deliberately the
// unauthenticated role) needing a manual game_servers registration step just to be manageable at
// all. An auth_key that DOES resolve to a real game_servers row still gets its name/index shown
// for convenience; one that doesn't just shows up unnamed.
import crypto from 'node:crypto';
import { checkModeratorOrAbove } from './auth.js';
import { recordAudit, actorFromAuth } from './auditLog.js';

const registeredSockets = new Map(); // ephemeral id -> { ws, serverType, authKey, yourServer, yourServerName }
const pendingAdminRequests = new Map(); // requestId -> { callerWs, targetId, timer }

// A routed request that never gets a response used to sit in pendingAdminRequests forever (the
// disconnect sweep below only ever matched the caller, never the target, despite the comment
// claiming both). Bound it three ways: a hard cap on concurrent pending requests, a TTL that
// evicts + fails the request if the target never answers, and a target-side match in the
// disconnect sweep.
const MAX_PENDING_ADMIN_REQUESTS = 200;
const PENDING_ADMIN_REQUEST_TTL_MS = 30e3;

// Routed commands that require the full-access (SQL password) tier, not just Moderator+.
const ROUTED_FULL_ACCESS = new Set(['adminListFiles', 'adminReadFile', 'adminWriteFile', 'adminRestartThis']);

let idCounter = 0;
function nextId(serverType) {
    return `${serverType}-${++idCounter}`;
};
function nextRequestId() {
    // Unguessable: this id is the ONLY thing tying a routed response back to its caller (the
    // responder is a fresh short-lived #wsrequest connection, not the registered target socket,
    // and a client-role instance may carry no auth_key at all). A timestamp+counter id was
    // forgeable, letting any socket race a fake adminRouteToServerResponse into someone's request.
    return 'admin-' + crypto.randomBytes(16).toString('hex');
};

function clearPending(requestId) {
    const pending = pendingAdminRequests.get(requestId);
    if (!pending) return null;
    clearTimeout(pending.timer);
    pendingAdminRequests.delete(requestId);
    return pending;
};

export function registerRoutingListeners(plugins) {
    plugins.on('services:serverConnected', ({ msg, ws, yourServer, yourServerName, serverType }) => {
        ws._adminRegistryId = nextId(serverType);
        registeredSockets.set(ws._adminRegistryId, { ws, serverType, authKey: msg.auth_key || null, yourServer, yourServerName });
    });

    plugins.on('services:wsDisconnected', ({ ws }) => {
        if (ws._adminRegistryId) registeredSockets.delete(ws._adminRegistryId);
        // A routed request whose target OR whose original caller just disconnected can never be
        // answered - drop it instead of leaking it forever. (targetId is always a registry id
        // string; a caller ws has no _adminRegistryId, so the two checks can't cross-match.)
        for (const [requestId, pending] of pendingAdminRequests) {
            if (pending.callerWs === ws || pending.targetId === ws._adminRegistryId) clearPending(requestId);
        };
    });

    plugins.on('services:unhandledCommand', async ({ msg, ws, ip }) => {
        if (msg.cmd === 'adminListServers') {
            plugins.cancel = true;
            // H1: topology disclosure. Unauthenticated callers just get an empty list (no error,
            // so the panel's "browsing only" mode still loads cleanly) - the real instance list
            // is Moderator+ / SQL-password only.
            if (!(await checkModeratorOrAbove(msg, ip))) { ws.send(JSON.stringify({ adminListServers: { servers: [] } })); return; };
            const servers = [...registeredSockets.entries()].map(([id, entry]) => ({
                id, serverType: entry.serverType, yourServer: entry.yourServer, name: entry.yourServerName,
            }));
            ws.send(JSON.stringify({ adminListServers: { servers } }));
            return;
        };

        if (msg.cmd === 'adminRouteToServer') {
            plugins.cancel = true;
            const innerCmd = msg.payload?.cmd;
            // Services is the ONLY authorization point for a routed command now - the target
            // instance trusts whatever arrives on its services connection and no longer re-checks.
            // So gate to the right tier here: file/restart actions are full-access (SQL password)
            // everywhere else in the panel, room actions are Moderator+.
            const auth = await checkModeratorOrAbove(msg, ip);
            const allowed = auth && (!ROUTED_FULL_ACCESS.has(innerCmd) || auth.tier === 'sqlPassword');
            if (!allowed) {
                recordAudit({ action: 'adminRouteToServer', ...actorFromAuth(auth, msg), ip, target: msg.targetId, result: 'denied', detail: { cmd: innerCmd } });
                ws.send(JSON.stringify({ error: ROUTED_FULL_ACCESS.has(innerCmd)
                    ? 'Not authorized - file and restart actions require the SQL password.'
                    : 'Not authorized - log in with a Moderator+ account or the SQL password.' }));
                return;
            };
            const target = registeredSockets.get(msg.targetId);
            if (!target || target.ws.readyState !== target.ws.OPEN) {
                ws.send(JSON.stringify({ error: 'Target server not connected' }));
                return;
            };
            if (pendingAdminRequests.size >= MAX_PENDING_ADMIN_REQUESTS) {
                ws.send(JSON.stringify({ error: 'Too many admin requests in flight - try again in a moment' }));
                return;
            };
            recordAudit({ action: 'adminRouteToServer', ...actorFromAuth(auth, msg), ip, target: `${target.serverType}#${target.yourServer ?? '?'}`, result: 'ok', detail: { cmd: innerCmd } });
            // Strip every credential before forwarding - the target executes on trust, it must
            // never receive the SQL password / session / auth_key even if the client sent them.
            const { sqlPassword, session, auth_key, ...cleanPayload } = msg.payload || {};
            const requestId = nextRequestId();
            const timer = setTimeout(() => {
                if (clearPending(requestId) && ws.readyState === ws.OPEN) {
                    ws.send(JSON.stringify({ error: 'Routed request timed out - the target instance did not respond' }));
                };
            }, PENDING_ADMIN_REQUEST_TTL_MS);
            if (timer.unref) timer.unref();
            pendingAdminRequests.set(requestId, { callerWs: ws, targetId: msg.targetId, timer });
            target.ws.send(JSON.stringify({ cmd: 'servicesCommand', requestId, payload: cleanPayload }));
            return;
        };

        // The target instance answering a routed request from above - see legacyadmin's
        // onServicesCommand (index.js), which delivers this via a fresh one-off #wsrequest call
        // rather than replying down its own persistent connection. Authentication here is the
        // unguessable requestId (see nextRequestId): only whoever received our servicesCommand
        // knows it, the entry is consumed on first use, and it expires via clearPending's timer.
        if (msg.cmd === 'adminRouteToServerResponse') {
            plugins.cancel = true;
            const pending = clearPending(msg.requestId);
            if (pending && pending.callerWs.readyState === pending.callerWs.OPEN) pending.callerWs.send(JSON.stringify(msg.response));
            return;
        };
    });
};
