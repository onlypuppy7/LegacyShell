import path from 'node:path';
import express from 'express';
import { ss } from '#misc';
import wsrequest from '#wsrequest';
import { handleAdminMessage } from './adminProtocol.js';
import { registerRoutingListeners } from './services/registry.js';
import { registerAuthListeners } from './services/auth.js';
import { registerAuditLog, recordAudit, actorFromAuth } from './services/auditLog.js';
import { registerModerationListeners } from './services/moderation.js';
import { registerCatalogBridge } from './services/catalogBridge.js';
import { registerRoomOverview } from './services/roomOverview.js';
import { handleRoomAdminCommand } from './game/roomBridge.js';
import { registerModerationWorkerListeners } from './game/moderationWorker.js';
import { registerBanEnforcement } from './game/banCache.js';
import { registerMuteEnforcement } from './game/muteCache.js';
import { registerChatRelay } from './game/chatRelay.js';
import { buildItemRendererBundle } from './client/buildItemRendererBundle.js';

export const PluginMeta = {
    identifier: "legacyadmin",
    name: 'LegacyAdmin',
    author: 'onlypuppy7',
    version: '1.2.0',
    descriptionShort: 'Unified admin panel - config editor, SQL/table editor, item browser, codes, moderation, live room/chat monitoring',
    descriptionLong: 'Serves /admin (client role) - a single admin panel covering: config-file editing + instance restart (the original scope of this plugin), the SQL/table editor absorbed from /sql, an item-catalog tile browser, code creation, moderation tools (kick/ban/mute), and live room/player/chat monitoring. Two auth tiers: a real per-account login (adminRoles >= Moderator) exposes the moderator-relevant slice of the panel; sqlPassword + auth_key unlocks everything, same as before - auth_key alone stays low-privilege, unrelated to which instance is being managed. Runs on all three roles: services handles its own auth and most admin commands directly (it holds the real password hash and the users/sessions/moderation tables); game/client relay password/session checks to services over #wsrequest and no longer run a dedicated admin WS port of their own - instead, admin commands aimed at a specific game/client instance are routed through services\' existing persistent connection to that instance (see services/registry.js), keyed by a lightweight per-connection ID assigned on connect, not by auth_key.',
    legacyShellVersion: 609,
};

// Two deliberate hardenings beyond the "obvious" version of this check:
//   1. Guard against an empty/missing sqlPassword BEFORE calling comparePassword at all -
//      bcrypt.compareSync throws on a non-string input, and comparePassword's catch block
//      returns the STRING "Database error." on any exception, which is truthy. Without this
//      guard, sending no sqlPassword at all bypasses every command that goes through this
//      function (confirmed live: adminListFiles returned real file paths with an empty
//      password before this fix).
//   2. Compare against the literal `true`, not `!!(...)` - so if comparePassword's contract
//      ever changes again, an unexpected truthy non-boolean fails closed instead of open.
async function servicesVerify(msg, accs) {
    if (typeof msg.sqlPassword !== 'string' || !msg.sqlPassword) return false;
    return (await accs.comparePassword({ password: ss.sqlPassword }, msg.sqlPassword)) === true;
};

const FILE_EDITOR_COMMANDS = ['adminListFiles', 'adminReadFile', 'adminWriteFile', 'adminRestartThis'];
const ROOM_ADMIN_COMMANDS = ['adminListRooms', 'adminGetRoomChat', 'adminKickPlayer'];

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        this.plugins.on('client:onStartServer', this.onClientStartServer.bind(this));
        this.plugins.on('client:servicesCommand', (data) => this.onServicesCommand('client', ss.config.client.sync_server, undefined, data));
        this.plugins.on('game:servicesCommand', (data) => this.onServicesCommand('game', ss.config.game.services_server, ss.config.game.auth_key, data));
        this.plugins.on('services:unhandledCommand', this.onServicesUnhandledCommand.bind(this));

        // Builds/maintains the registry of every currently-connected game/client socket (keyed by
        // a lightweight per-connection ID, not auth_key), and answers adminListServers/
        // adminRouteToServer/adminRouteToServerResponse - see services/registry.js for the full
        // mechanism. This is what replaced the old mainPort+111 dedicated WS server.
        registerRoutingListeners(this.plugins);

        // Services-only: per-account login/session (Tier A) and every services-local command
        // pillar (moderation CRUD, catalog browser, multi-server room overview). Harmless to
        // register on game/client too (their `services:` prefixed emits simply never fire there),
        // matching how every other plugin in this repo registers listeners unconditionally.
        registerAuditLog(this.plugins);
        registerAuthListeners(this.plugins);
        registerModerationListeners(this.plugins);
        registerCatalogBridge(this.plugins);
        registerRoomOverview(this.plugins);

        // Game-only. Every role's store/config/ directory holds every *.yaml regardless of which
        // role is actually running (see misc.instantiateSS), so `ss.config.game` existing isn't a
        // reliable "am I the game role" signal - `plugins.type` (set by loadPlugins(type) before
        // any plugin is constructed) is. Gate here rather than let banCache/muteCache's pollers
        // start up against a services_server/auth_key that means nothing on this role. Within
        // game, each of these further guards itself via parentPort/ss.room checks (main thread vs.
        // room worker).
        if (plugins.type === 'game') {
            registerModerationWorkerListeners(this.plugins);
            registerBanEnforcement(this.plugins);
            registerMuteEnforcement(this.plugins);
            registerChatRelay(this.plugins);
        };
    };

    // --- services: it holds the real password hash, so local admin commands (targeting services
    // itself) are handled directly here, same as before - no routing needed to reach itself.
    async onServicesUnhandledCommand({ msg, ws, accs, ip }) {
        const ADMIN_COMMANDS = ['adminListFiles', 'adminReadFile', 'adminWriteFile', 'adminRestartThis', 'adminRestartServices'];
        if (!ADMIN_COMMANDS.includes(msg.cmd)) return;
        this.plugins.cancel = true;

        await handleAdminMessage({
            msg, ws,
            verify: (m) => servicesVerify(m, accs),
            rootDir: ss.rootDir,
            roleLabel: 'services',
            audit: ({ action, target, result, detail }) => recordAudit({
                action, target, result, detail, ip,
                ...actorFromAuth(result === 'denied' ? null : { tier: 'sqlPassword' }, msg),
            }),
        });
    };

    // --- client: still serves the /admin static page. It no longer runs its own dedicated WS
    // server for admin commands - see onServicesCommand below for how those now arrive instead.
    // Also (re)builds the standalone item-tile-renderer bundle on every boot (cheap - a handful of
    // small file reads/string concat, not a real build step) so it always reflects the current
    // #itemRenderer/#loading/#plugins/#isClientServer source, same as the main client bundle does.
    onClientStartServer(data) {
        // H4: defence-in-depth security headers on the whole /admin surface (the CSP meta tag in
        // index.html covers the document; these cover every asset response and add the headers a
        // meta tag can't set, e.g. frame-ancestors / X-Frame-Options).
        data.app.use('/admin', (req, res, next) => {
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('Referrer-Policy', 'no-referrer');
            res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
            next();
        });
        data.app.use('/admin', express.static(path.join(this.thisDir, 'client')));
        const vendorDir = buildItemRendererBundle(ss.rootDir);
        data.app.use('/admin/vendor', express.static(vendorDir));
    };

    // --- client & game: services routed an admin command to THIS instance specifically (see
    // services/registry.js's adminRouteToServer). The command arrived on the persistent connection
    // this process opened to its own configured services address, and services already authorized
    // the operator at the routing gate - so there is NO credential in the payload and nothing to
    // re-check here; we just run it. The response goes back via a fresh one-off #wsrequest call
    // (wrapped as adminRouteToServerResponse) since our persistent connection is an outbound
    // poller not set up to correlate ad-hoc replies.
    async onServicesCommand(roleLabel, servicesAddress, authKey, { msg }) {
        const requestId = msg.requestId;
        const payload = msg.payload || {};

        const respond = async (responsePayload) => {
            try {
                await wsrequest({ cmd: 'adminRouteToServerResponse', requestId, response: responsePayload }, servicesAddress, authKey);
            } catch (error) {
                // Nothing more we can do - the original browser connection will just see this
                // routed request time out.
            };
        };

        if (FILE_EDITOR_COMMANDS.includes(payload.cmd)) {
            await handleAdminMessage({
                msg: payload, ws: { send: (json) => { let r; try { r = JSON.parse(json); } catch { r = { error: 'Malformed local admin response' }; }; respond(r); } },
                verify: () => true,
                rootDir: ss.rootDir,
                roleLabel,
            });
            return;
        };

        if (ROOM_ADMIN_COMMANDS.includes(payload.cmd)) {
            if (roleLabel !== 'game') { await respond({ error: 'Room actions are only supported on a game instance' }); return; };
            await handleRoomAdminCommand(payload, respond);
            return;
        };

        await respond({ error: 'Unknown admin command: ' + payload.cmd });
    };
};
