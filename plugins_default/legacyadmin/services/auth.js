// Tier A of legacyadmin's auth: a real per-account login (bcrypt password + adminRoles rank),
// exposing only the moderator-relevant slice of the panel. Reuses #accountManagement/
// #sessionManagement directly - the exact same modules start-services.js itself already imports -
// rather than hooking the player-facing validateLogin flow (services:validateLoginSuccess/Fail),
// which is the wrong context: that's rate-limited player login, not an admin session, and doesn't
// gate on adminRoles at all.
//
// Tier B (sqlPassword + auth_key, full power) stays exactly as it already worked before this
// plugin existed - see index.js's servicesVerify. requireModeratorOrAbove below accepts EITHER
// tier, so a full Tier-B admin never needs a separate account just to use the moderator-only tools.

import accs from '#accountManagement';
import sess from '#sessionManagement';
import { ss } from '#misc';
import { recordAudit } from './auditLog.js';

// Mirrors src/defaultconfig/distributed_permissions.yaml's `ranks` block - keep the numbers in
// sync if that file's thresholds ever change. Only the numeric values matter here.
export const ranksEnum = {
    Guest: 0,
    SignedIn: 1,
    ContentCreator: 5,
    Moderator: 10,
    Admin: 20,
    Superuser: 255,
};

async function verifySqlPassword(msg) {
    if (typeof msg.sqlPassword !== 'string' || !msg.sqlPassword) return false;
    // Strict `=== true`, not `!!(...)` - comparePassword's catch block returns the STRING
    // "Database error." on any exception (e.g. bcrypt throwing because ss.sqlPassword itself
    // isn't set yet), which is truthy. Fail closed on anything that isn't the literal `true`.
    return (await accs.comparePassword({ password: ss.sqlPassword }, msg.sqlPassword)) === true;
};

// Pure check, no side effects. Accepts either a valid moderator+ session (msg.session) or the
// full sqlPassword (msg.sqlPassword). Returns `{ tier: 'account', ...userData }` or
// `{ tier: 'sqlPassword' }` on success, else null.
export async function checkModeratorOrAbove(msg, ip) {
    if (msg.session) {
        const session = await sess.retrieveSession(msg.session, ip, true); // readOnly - a stale admin tab shouldn't wipe the account's real game sessions
        if (session) {
            const userData = await accs.getUserData(session.user_id, false, false);
            if (userData && (userData.adminRoles || 0) >= ranksEnum.Moderator) {
                return { tier: 'account', ...userData };
            };
        };
    };
    if (await verifySqlPassword(msg)) return { tier: 'sqlPassword' };
    return null;
};

// Convenience wrapper for services' own local command handlers (moderation.js, catalogBridge.js,
// roomBridge.js) - sends the standard error response itself on failure, so callers can just
// `if (!userData) return;`.
export async function requireModeratorOrAbove(msg, ws, ip) {
    const result = await checkModeratorOrAbove(msg, ip);
    if (!result) ws.send(JSON.stringify({ error: 'Not authorized - log in with a Moderator+ account or the SQL password.' }));
    return result;
};

// Admin (rank 20) or the SQL password - required for the genuinely dangerous surface (account
// rename/password/impersonation, reading the audit log). Plain Moderator is not enough.
export async function checkAdminOrSql(msg, ip) {
    const auth = await checkModeratorOrAbove(msg, ip);
    if (auth && (auth.tier === 'sqlPassword' || (auth.adminRoles || 0) >= ranksEnum.Admin)) return auth;
    return null;
};

export function registerAuthListeners(plugins) {
    plugins.on('services:unhandledCommand', async ({ msg, ws, ip, rawIp }) => {
        if (msg.cmd === 'adminAccountLogin') {
            plugins.cancel = true;
            try {
                const userData = await accs.getUserData(msg.username, false, true);
                const adminRoles = userData?.adminRoles || 0;
                // Below Content Creator there's nothing in this panel for that account at all -
                // fail the same generic way as a bad username/password so this doesn't leak which
                // usernames happen to carry elevated access.
                if (!userData || adminRoles < ranksEnum.ContentCreator) {
                    recordAudit({ action: 'adminAccountLogin', actor: String(msg.username || '').slice(0, 64) || 'unknown', tier: 'account', ip: rawIp, result: 'denied', detail: { reason: 'no such user or rank too low' } });
                    ws.send(JSON.stringify({ error: 'Username or password is incorrect.' }));
                    return;
                };
                const isCorrect = await accs.comparePassword(userData, msg.password);
                if (isCorrect !== true) {
                    recordAudit({ action: 'adminAccountLogin', actor: userData.username, tier: 'account', ip: rawIp, result: 'denied', detail: { reason: 'bad password' } });
                    ws.send(JSON.stringify({ error: 'Username or password is incorrect.' }));
                    return;
                };
                const session = await sess.createSession(userData.account_id, ip);
                recordAudit({ action: 'adminAccountLogin', actor: userData.username, tier: 'account', ip: rawIp, result: 'ok', detail: { adminRoles } });
                ws.send(JSON.stringify({
                    adminAccountLogin: { session, account_id: userData.account_id, username: userData.username, adminRoles },
                }));
            } catch (error) {
                ws.send(JSON.stringify({ error: 'Database error.' }));
            };
            return;
        };

        // M1: real server-side logout - revoke the session row so a copied token stops working,
        // instead of the UI just clearing its own localStorage.
        if (msg.cmd === 'adminAccountLogout') {
            plugins.cancel = true;
            let actor = 'unknown';
            if (msg.session) {
                const session = await sess.retrieveSession(msg.session, ip, true);
                if (session) {
                    const u = await accs.getUserData(session.user_id, false, false);
                    actor = u?.username || String(session.user_id);
                };
                await sess.deleteSession(msg.session);
            };
            recordAudit({ action: 'adminAccountLogout', actor, tier: 'account', ip: rawIp, result: 'ok' });
            ws.send(JSON.stringify({ adminAccountLogout: { success: true } }));
            return;
        };

        if (msg.cmd === 'adminAccountSession') {
            plugins.cancel = true;
            const session = await sess.retrieveSession(msg.session, ip, true);
            const userData = session ? await accs.getUserData(session.user_id, false, false) : null;
            if (!userData) { ws.send(JSON.stringify({ error: 'Session expired' })); return; };
            ws.send(JSON.stringify({
                adminAccountSession: { account_id: userData.account_id, username: userData.username, adminRoles: userData.adminRoles || 0 },
            }));
            return;
        };
    });
};
