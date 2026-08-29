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
const registeredSockets = new Map(); // ephemeral id -> { ws, serverType, authKey, yourServer, yourServerName }
const pendingAdminRequests = new Map(); // requestId -> the admin caller's own ws

let idCounter = 0;
function nextId(serverType) {
    return `${serverType}-${++idCounter}`;
};
let requestIdCounter = 0;
function nextRequestId() {
    return `admin-${Date.now()}-${++requestIdCounter}`;
};

export function registerRoutingListeners(plugins) {
    plugins.on('services:serverConnected', ({ msg, ws, yourServer, yourServerName, serverType }) => {
        ws._adminRegistryId = nextId(serverType);
        registeredSockets.set(ws._adminRegistryId, { ws, serverType, authKey: msg.auth_key || null, yourServer, yourServerName });
    });

    plugins.on('services:wsDisconnected', ({ ws }) => {
        if (ws._adminRegistryId) registeredSockets.delete(ws._adminRegistryId);
        // A routed request whose target OR whose original caller just disconnected can never be
        // answered - drop it instead of leaking it forever.
        for (const [requestId, callerWs] of pendingAdminRequests) {
            if (callerWs === ws) pendingAdminRequests.delete(requestId);
        };
    });

    plugins.on('services:unhandledCommand', ({ msg, ws }) => {
        if (msg.cmd === 'adminListServers') {
            plugins.cancel = true;
            const servers = [...registeredSockets.entries()].map(([id, entry]) => ({
                id, serverType: entry.serverType, yourServer: entry.yourServer, name: entry.yourServerName,
            }));
            ws.send(JSON.stringify({ adminListServers: { servers } }));
            return;
        };

        if (msg.cmd === 'adminRouteToServer') {
            plugins.cancel = true;
            const target = registeredSockets.get(msg.targetId);
            if (!target || target.ws.readyState !== target.ws.OPEN) {
                ws.send(JSON.stringify({ error: 'Target server not connected' }));
                return;
            };
            const requestId = nextRequestId();
            pendingAdminRequests.set(requestId, ws);
            target.ws.send(JSON.stringify({ cmd: 'servicesCommand', requestId, payload: msg.payload }));
            return;
        };

        // The target instance answering a routed request from above - see legacyadmin's
        // onServicesCommand (index.js), which delivers this via a fresh one-off #wsrequest call
        // rather than replying down its own persistent connection.
        if (msg.cmd === 'adminRouteToServerResponse') {
            plugins.cancel = true;
            const callerWs = pendingAdminRequests.get(msg.requestId);
            pendingAdminRequests.delete(msg.requestId);
            if (callerWs && callerWs.readyState === callerWs.OPEN) callerWs.send(JSON.stringify(msg.response));
            return;
        };
    });
};
