//legacyshell: replay admin commands (services), for the Replays tab of the admin panel. the login check is legacyadmin's, so this only exists when that plugin does
//moderators and up can look at everyone's replays and take a copy, admins can delete
import { ss } from '#misc';
import { ReplayStorage } from './storage.js';
//

export const ReplayAdmin = {
    commands: ['replayAdminList', 'replayAdminGet', 'replayAdminDelete'],

    registerListeners: async function (plugins) {
        var auth, audit;
        try {
            auth = await import('../legacyadmin/services/auth.js');
            audit = await import('../legacyadmin/services/auditLog.js');
        } catch (e) {
            return; //no admin panel, nothing to add a tab to
        };

        plugins.on('services:unhandledCommand', async ({ msg, ws, ip, rawIp }) => {
            if (!this.commands.includes(msg.cmd)) return;
            plugins.cancel = true;
            try {
                await ReplayStorage.ensureTables();
                var viewer = msg.cmd === 'replayAdminDelete' ? await auth.checkAdminOrSql(msg, ip) : await auth.checkModeratorOrAbove(msg, ip);
                if (!viewer) return ws.send(JSON.stringify({ error: msg.cmd === 'replayAdminDelete' ? 'Not authorized - Admin only.' : 'Not authorized - Moderator+ only.' }));
                var who = audit.actorFromAuth(viewer, msg);
                var reply = await this[msg.cmd](msg);
                if (msg.cmd !== 'replayAdminList') audit.recordAudit({ action: msg.cmd, ...who, ip: rawIp, target: 'replay ' + msg.id, result: reply.error ? 'denied' : 'ok' });
                ws.send(JSON.stringify(reply.error ? { error: reply.error } : { [msg.cmd]: reply }));
            } catch (e) {
                console.log('[legacyreplay] ' + msg.cmd + ' failed:', e);
                ws.send(JSON.stringify({ error: 'Something went wrong.' }));
            };
        });
    },

    //a page of everyone's replays, newest first, with who has what
    replayAdminList: async function (msg) {
        var search = String(msg.search || '').slice(0, 64), like = '%' + search.replace(/[\\%_]/g, '\\$&') + '%';
        var limit = Math.min(Math.max(parseInt(msg.limit) || 50, 1), 200), offset = Math.max(parseInt(msg.offset) || 0, 0);
        var where = search ? `WHERE u.username LIKE ? ESCAPE '\\'` : '', params = search ? [like] : [];
        var rows = await ss.getAll(`
            SELECT r.id, r.owner_id AS ownerId, u.username, r.replay_key AS replayKey, r.map_name AS map, r.duration, r.players, r.bytes, r.pinned, r.trust,
                r.dateCreated AS created, r.dateExpires AS expires, (SELECT COUNT(*) FROM replay_reels WHERE replay_id = r.id) AS reels
            FROM replays r LEFT JOIN users u ON u.account_id = r.owner_id ${where} ORDER BY r.dateCreated DESC LIMIT ? OFFSET ?
        `, [...params, limit, offset]);
        var total = await ss.getOne(`SELECT COUNT(*) AS replays, COALESCE(SUM(r.bytes), 0) AS bytes, COUNT(DISTINCT r.owner_id) AS owners FROM replays r LEFT JOIN users u ON u.account_id = r.owner_id ${where}`, params);
        var heaviest = await ss.getAll(`
            SELECT u.username, COUNT(*) AS replays, SUM(r.bytes) AS bytes FROM replays r LEFT JOIN users u ON u.account_id = r.owner_id GROUP BY r.owner_id ORDER BY bytes DESC LIMIT 10
        `);
        return { rows, total, heaviest, offset, limit };
    },

    //a copy of the file, for downloading
    replayAdminGet: async function (msg) {
        var row = Number.isInteger(msg.id) ? await ss.getOne(`SELECT r.id, r.map_name AS map, r.dateCreated AS created, r.data, u.username FROM replays r LEFT JOIN users u ON u.account_id = r.owner_id WHERE r.id = ?`, [msg.id]) : null;
        if (!row) return { error: 'That replay is gone.' };
        return { id: row.id, map: row.map, created: row.created, username: row.username, data: Buffer.from(row.data).toString('base64') };
    },

    replayAdminDelete: async function (msg) {
        if (!Number.isInteger(msg.id) || !(await ss.getOne(`SELECT id FROM replays WHERE id = ?`, [msg.id]))) return { error: 'That replay is gone.' };
        await ReplayStorage.removeReplay(msg.id);
        return { id: msg.id };
    },
};
