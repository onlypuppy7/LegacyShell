// Account-mutation commands behind the Accounts tab: rename, set password, and mint an
// impersonation token. All gated to Admin (rank 20) or the SQL password - deliberately stricter
// than the Moderator tier the rest of the panel uses, since these can take over any account.
// Every change is written to the audit log.

import accs from '#accountManagement';
import { ss } from '#misc';
import { checkAdminOrSql } from './auth.js';
import { recordAudit, actorFromAuth } from './auditLog.js';

const USERNAME_RE = /^[A-Za-z0-9?!._-]+$/;
const CMDS = ['adminSetUsername', 'adminSetPassword', 'adminImpersonate'];

export function registerAccountManager(plugins) {
    plugins.on('services:unhandledCommand', async ({ msg, ws, ip, rawIp }) => {
        if (!CMDS.includes(msg.cmd)) return;
        plugins.cancel = true;

        const auth = await checkAdminOrSql(msg, ip);
        if (!auth) { ws.send(JSON.stringify({ error: 'Not authorized - account management needs an Admin account or the SQL password.' })); return; };
        const who = actorFromAuth(auth, msg);

        const accountId = parseInt(msg.account_id, 10);
        if (!Number.isInteger(accountId)) { ws.send(JSON.stringify({ error: 'Invalid account_id' })); return; };

        try {
            const target = await ss.getOne(`SELECT account_id, username, authToken FROM users WHERE account_id = ?`, [accountId]);
            if (!target) { ws.send(JSON.stringify({ error: 'No such account' })); return; };

            if (msg.cmd === 'adminSetUsername') {
                const next = String(msg.username || '').trim();
                if (next.length < 3 || !USERNAME_RE.test(next)) {
                    ws.send(JSON.stringify({ error: 'Invalid username - at least 3 chars, only letters / numbers / ?!._-' }));
                    return;
                };
                const clash = await ss.getOne(`SELECT account_id FROM users WHERE username = ? AND account_id != ?`, [next, accountId]);
                if (clash) { ws.send(JSON.stringify({ error: 'That username is already taken' })); return; };
                await ss.runQuery(`UPDATE users SET username = ?, dateModified = strftime('%s','now') WHERE account_id = ?`, [next, accountId]);
                recordAudit({ action: 'adminSetUsername', ...who, ip: rawIp, target: `#${accountId} ${target.username} -> ${next}`, result: 'ok' });
                ws.send(JSON.stringify({ adminSetUsername: { account_id: accountId, username: next } }));
                return;
            };

            if (msg.cmd === 'adminSetPassword') {
                // The panel SHA-256s the new password before it leaves the browser, exactly like
                // the game's own login form does - services only ever bcrypts that digest.
                const sha = String(msg.passwordSha256 || '').toLowerCase();
                if (!/^[a-f0-9]{64}$/.test(sha)) { ws.send(JSON.stringify({ error: 'Bad password hash from client' })); return; };
                const hashed = accs.hashPassword(sha);
                await ss.runQuery(`UPDATE users SET password = ?, dateModified = strftime('%s','now') WHERE account_id = ?`, [hashed, accountId]);
                recordAudit({ action: 'adminSetPassword', ...who, ip: rawIp, target: `#${accountId} ${target.username}`, result: 'ok' });
                ws.send(JSON.stringify({ adminSetPassword: { account_id: accountId } }));
                return;
            };

            if (msg.cmd === 'adminImpersonate') {
                // Hand back the account's current remember-me token (mint one only if it has
                // none). Note: the game rotates this token on every use, so the target will have
                // to re-enter their password on their own device next time - unavoidable with the
                // existing auth-token login flow.
                let token = target.authToken;
                if (!token) token = await accs.generateToken(target.username);
                recordAudit({ action: 'adminImpersonate', ...who, ip: rawIp, target: `#${accountId} ${target.username}`, result: 'ok' });
                ws.send(JSON.stringify({ adminImpersonate: { account_id: accountId, username: target.username, authToken: token } }));
                return;
            };
        } catch (error) {
            recordAudit({ action: msg.cmd, ...who, ip: rawIp, target: `#${accountId}`, result: 'error', detail: { error: String(error?.message || error) } });
            ws.send(JSON.stringify({ error: String(error?.message || error) }));
        };
    });
};
