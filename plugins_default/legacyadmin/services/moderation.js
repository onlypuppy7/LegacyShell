// Global (cross-room) ban/mute list - the one moderation primitive that didn't already exist
// anywhere in core (per-room kick already did, see game/moderationWorker.js). Schema owned
// entirely by this plugin, created via the existing `initTables` emit every other item/content
// plugin already uses to seed its own tables - no core DDL change needed.
//
// CRUD goes through a few small dedicated commands (nicer than making a moderator hand-write SQL,
// even though the underlying table is just as reachable through the SQL/table-editor tab like any
// other USER-EDITABLE table). Enforcement reads happen from game instances via
// adminGetBanList/adminGetMuteList (auth_key gated, not password gated - this is a server-to-
// server poll, not a browser action) - see game/banCache.js and game/muteCache.js.

import { ss } from '#misc';
import { requireModeratorOrAbove } from './auth.js';
import { recordAudit, actorFromAuth } from './auditLog.js';

export function registerModerationListeners(plugins) {
    plugins.on('services:initTables', async () => {
        await ss.runQuery(`
            CREATE TABLE IF NOT EXISTS moderation (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                target_type TEXT NOT NULL,
                target_value TEXT NOT NULL,
                reason TEXT DEFAULT '',
                dateCreated INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `);
    });

    plugins.on('services:unhandledCommand', async ({ msg, ws, accs, ip }) => {
        if (msg.cmd === 'adminGetBanList' || msg.cmd === 'adminGetMuteList') {
            // Server-to-server poll from a game instance's own ban/mute cache - gated by auth_key
            // alone (same low-privilege tier every other game-server-facing read already uses),
            // not by moderator session/sqlPassword.
            if (!msg.auth_key || !(await accs.getAuthKeyData(msg.auth_key))) {
                ws.send(JSON.stringify({ error: 'Invalid auth key' }));
                return;
            };
            plugins.cancel = true;
            const type = msg.cmd === 'adminGetBanList' ? 'ban' : 'mute';
            const rows = await ss.getAll(`SELECT target_type, target_value FROM moderation WHERE type = ?`, [type]);
            // Include target_type so the game-side caches match each entry against the right
            // identity (ip vs uuid vs account_id) instead of comparing one undifferentiated
            // value against all three - see game/banCache.js and game/muteCache.js.
            ws.send(JSON.stringify({ [msg.cmd]: { targets: (rows || []).map(r => ({ type: r.target_type, value: r.target_value })) } }));
            return;
        };

        if (!['adminListModeration', 'adminAddModeration', 'adminRemoveModeration'].includes(msg.cmd)) return;
        plugins.cancel = true;

        const userData = await requireModeratorOrAbove(msg, ws, ip);
        if (!userData) return; // requireModeratorOrAbove already sent the error response
        const who = actorFromAuth(userData, msg);

        try {
            if (msg.cmd === 'adminListModeration') {
                const rows = await ss.getAll(`SELECT * FROM moderation ORDER BY dateCreated DESC`);
                ws.send(JSON.stringify({ adminListModeration: { rows } }));
                return;
            };

            if (msg.cmd === 'adminAddModeration') {
                if (!['ban', 'mute'].includes(msg.type) || !['ip', 'uuid', 'account_id'].includes(msg.targetType) || !msg.targetValue) {
                    ws.send(JSON.stringify({ error: 'Invalid moderation entry' }));
                    return;
                };
                await ss.runQuery(`
                    INSERT INTO moderation (type, target_type, target_value, reason)
                    VALUES (?, ?, ?, ?)
                `, [msg.type, msg.targetType, String(msg.targetValue), msg.reason || '']);
                recordAudit({ action: 'adminAddModeration', ...who, ip, target: `${msg.type}:${msg.targetType}:${msg.targetValue}`, result: 'ok', detail: { reason: msg.reason || '' } });
                ws.send(JSON.stringify({ adminAddModeration: { success: true } }));
                return;
            };

            if (msg.cmd === 'adminRemoveModeration') {
                await ss.runQuery(`DELETE FROM moderation WHERE id = ?`, [msg.id]);
                recordAudit({ action: 'adminRemoveModeration', ...who, ip, target: `id ${msg.id}`, result: 'ok' });
                ws.send(JSON.stringify({ adminRemoveModeration: { success: true } }));
                return;
            };
        } catch (error) {
            ws.send(JSON.stringify({ error: String(error?.message || error) }));
        };
    });
};
