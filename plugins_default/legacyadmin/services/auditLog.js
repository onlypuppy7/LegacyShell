// Security-grade audit trail for every privileged action the panel can take: SQL execution,
// config file reads/writes, instance restarts, moderation changes, kicks, auth successes and
// failures, and routed admin commands. Written to its OWN SQLite file
// (server-services/store/LegacyShellAdminLog.db) rather than the main data DB - it must survive
// a main-DB restore, never be reachable through the SQL/table-editor tab (which only knows the
// main DB's tables), and stay append-only in spirit.
//
// Services-only. recordAudit() is imported directly by the other services modules; it silently
// no-ops until registerAuditLog() has opened the DB, so a stray call on another role can't throw.

import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { ss } from '#misc';
import log from 'puppylog';
import { checkAdminOrSql } from './auth.js';

let db = null;
let stmtInsert = null;

// Describes who a verified request belongs to, for the `actor`/`tier` columns. `result` from
// checkModeratorOrAbove is `{ tier: 'account', username, ... }` | `{ tier: 'sqlPassword' }` | null.
export function actorFromAuth(authResult, msg) {
    if (authResult?.tier === 'account') return { actor: authResult.username || String(authResult.account_id || '?'), tier: 'account' };
    if (authResult?.tier === 'sqlPassword') return { actor: 'sqlPassword', tier: 'sqlPassword' };
    if (msg?.auth_key) return { actor: 'auth_key', tier: 'authKey' };
    return { actor: 'unknown', tier: 'none' };
};

export function recordAudit(entry) {
    if (!stmtInsert) return;
    try {
        stmtInsert.run(
            Math.floor(Date.now() / 1000),
            String(entry.action || '?').slice(0, 128),
            String(entry.actor || 'unknown').slice(0, 128),
            String(entry.tier || 'none').slice(0, 32),
            String(entry.ip || '').slice(0, 128),
            entry.target == null ? null : String(entry.target).slice(0, 512),
            String(entry.result || 'ok').slice(0, 32),
            entry.detail == null ? null : JSON.stringify(entry.detail).slice(0, 4096),
        );
    } catch (error) {
        // Auditing must never break the action it's recording - just note it and move on.
        log.red('auditLog: failed to record entry: ' + (error?.message || error));
    };
};

export function registerAuditLog(plugins) {
    if (plugins.type !== 'services') return;

    try {
        const dir = path.join(ss.rootDir, 'server-services', 'store');
        fs.mkdirSync(dir, { recursive: true });
        db = new Database(path.join(dir, 'LegacyShellAdminLog.db'));
        db.pragma('journal_mode = WAL');
        db.exec(`
            CREATE TABLE IF NOT EXISTS admin_log (
                id      INTEGER PRIMARY KEY AUTOINCREMENT,
                at      INTEGER NOT NULL,
                action  TEXT    NOT NULL,
                actor   TEXT    NOT NULL,
                tier    TEXT    NOT NULL,
                ip      TEXT    DEFAULT '',
                target  TEXT,
                result  TEXT    NOT NULL DEFAULT 'ok',
                detail  TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_admin_log_at ON admin_log (at DESC);
        `);
        stmtInsert = db.prepare(`INSERT INTO admin_log (at, action, actor, tier, ip, target, result, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
        log.green('legacyadmin: audit log ready (' + path.join(dir, 'LegacyShellAdminLog.db') + ')');
    } catch (error) {
        log.red('legacyadmin: could not open audit log DB - privileged actions will NOT be recorded: ' + (error?.message || error));
        db = null; stmtInsert = null;
    };

    // Core emits this after every sqlRequest outcome (see server-services/start-services.js).
    plugins.on('services:adminSqlAudit', ({ sql, sqlType, ip, authed, ok, error }) => {
        recordAudit({
            action: 'sqlRequest',
            actor: authed ? 'sqlPassword' : 'unknown',
            tier: authed ? 'sqlPassword' : 'none',
            ip,
            target: String(sql || '').replace(/\s+/g, ' ').trim().slice(0, 300),
            result: ok ? 'ok' : (authed ? 'error' : 'denied'),
            detail: { sqlType, error: error || undefined },
        });
    });

    plugins.on('services:unhandledCommand', async ({ msg, ws, ip }) => {
        if (msg.cmd !== 'adminGetAuditLog') return;
        plugins.cancel = true;
        // Admin (rank 20) or the SQL password - deliberately NOT plain Moderators: the log records
        // what moderators do, so they don't get to read (or quietly audit-check) it themselves.
        if (!(await checkAdminOrSql(msg, ip))) { ws.send(JSON.stringify({ error: 'Not authorized - the audit log requires an Admin account or the SQL password.' })); return; };
        if (!db) { ws.send(JSON.stringify({ adminGetAuditLog: { rows: [], note: 'Audit log DB is not available on this services instance.' } })); return; };
        try {
            const limit = Math.min(Math.max(parseInt(msg.limit, 10) || 200, 1), 1000);
            const before = parseInt(msg.before, 10) || null;
            const rows = before
                ? db.prepare(`SELECT * FROM admin_log WHERE at < ? ORDER BY at DESC, id DESC LIMIT ?`).all(before, limit)
                : db.prepare(`SELECT * FROM admin_log ORDER BY at DESC, id DESC LIMIT ?`).all(limit);
            ws.send(JSON.stringify({ adminGetAuditLog: { rows } }));
        } catch (error) {
            ws.send(JSON.stringify({ error: String(error?.message || error) }));
        };
    });
};
