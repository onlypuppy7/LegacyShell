// DB backup management for the SQL tab: list / create / delete / restore the raw-file copies of
// LegacyShellData.db under store/backups/. Admin (rank 20) or the SQL password - restore in
// particular replaces the live database. Every action is audit-logged.
import fs from 'node:fs';
import path from 'node:path';
import { ss } from '#misc';
import log from 'puppylog';
import { checkAdminOrSql } from './auth.js';
import { recordAudit, actorFromAuth } from './auditLog.js';

const CMDS = ['adminListBackups', 'adminCreateBackup', 'adminDeleteBackup', 'adminRestoreBackup'];

function backupDir() {
    return ss.config.services.backups?.filepath || ss.backupPath;
};

// A backup filename must be a plain .db basename in the backup dir - never a path.
function resolveBackup(name) {
    if (typeof name !== 'string' || !/^[A-Za-z0-9._-]+\.db$/.test(name)) return null;
    const dir = backupDir();
    const full = path.join(dir, name);
    if (path.dirname(full) !== path.resolve(dir)) return null;
    return fs.existsSync(full) ? full : null;
};

function listBackups() {
    const dir = backupDir();
    try {
        return fs.readdirSync(dir)
            .filter(f => f.endsWith('.db'))
            .map(f => { const st = fs.statSync(path.join(dir, f)); return { name: f, bytes: st.size, mtime: Math.floor(st.mtimeMs / 1000) }; })
            .sort((a, b) => b.mtime - a.mtime);
    } catch { return []; };
};

export function registerBackups(plugins) {
    plugins.on('services:unhandledCommand', async ({ msg, ws, ip, rawIp }) => {
        if (!CMDS.includes(msg.cmd)) return;
        plugins.cancel = true;

        const auth = await checkAdminOrSql(msg, ip);
        if (!auth) { ws.send(JSON.stringify({ error: 'Not authorized - backup management needs an Admin account or the SQL password.' })); return; };
        const who = actorFromAuth(auth, msg);
        const dir = backupDir();

        try {
            if (msg.cmd === 'adminListBackups') {
                ws.send(JSON.stringify({ adminListBackups: { dir, keep: ss.config.services.backups?.keep ?? null, entries: listBackups() } }));
                return;
            };

            if (msg.cmd === 'adminCreateBackup') {
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                const now = new Date().toISOString();
                const name = 'LegacyShellDataBackup-' + now.split('T')[0] + '_' + now.split('T')[1].split('.')[0].replace(/:/g, '-') + '-manual.db';
                fs.copyFileSync(ss.dbPath, path.join(dir, name));
                recordAudit({ action: 'adminCreateBackup', ...who, ip: rawIp, target: name, result: 'ok' });
                ws.send(JSON.stringify({ adminCreateBackup: { name, entries: listBackups() } }));
                return;
            };

            if (msg.cmd === 'adminDeleteBackup') {
                // { name } deletes one; { keep: N } prunes all but the N newest.
                if (Number.isInteger(msg.keep)) {
                    const stale = listBackups().slice(Math.max(0, msg.keep));
                    for (const b of stale) { try { fs.unlinkSync(path.join(dir, b.name)); } catch {}; };
                    recordAudit({ action: 'adminDeleteBackup', ...who, ip: rawIp, target: `prune to ${msg.keep}`, result: 'ok', detail: { deleted: stale.map(s => s.name) } });
                    ws.send(JSON.stringify({ adminDeleteBackup: { deleted: stale.length, entries: listBackups() } }));
                    return;
                };
                const full = resolveBackup(msg.name);
                if (!full) { ws.send(JSON.stringify({ error: 'Unknown backup file' })); return; };
                fs.unlinkSync(full);
                recordAudit({ action: 'adminDeleteBackup', ...who, ip: rawIp, target: msg.name, result: 'ok' });
                ws.send(JSON.stringify({ adminDeleteBackup: { deleted: 1, entries: listBackups() } }));
                return;
            };

            if (msg.cmd === 'adminRestoreBackup') {
                const full = resolveBackup(msg.name);
                if (!full) { ws.send(JSON.stringify({ error: 'Unknown backup file' })); return; };
                // Safety copy of the current DB first, then swap the file in and bounce - the new
                // process opens the restored file cleanly (avoids writing over an open handle).
                const now = new Date().toISOString().replace(/[:.]/g, '-');
                try { fs.copyFileSync(ss.dbPath, path.join(dir, 'LegacyShellDataBackup-' + now + '-prerestore.db')); } catch {};
                fs.copyFileSync(full, ss.dbPath);
                for (const ext of ['-wal', '-shm']) { try { fs.unlinkSync(ss.dbPath + ext); } catch {}; };
                recordAudit({ action: 'adminRestoreBackup', ...who, ip: rawIp, target: msg.name, result: 'ok' });
                log.bgRed('legacyadmin: DB restored from ' + msg.name + ' - restarting services now.');
                ws.send(JSON.stringify({ adminRestoreBackup: { name: msg.name, restarting: true } }));
                setImmediate(() => process.exit(1337));
                return;
            };
        } catch (error) {
            recordAudit({ action: msg.cmd, ...who, ip: rawIp, target: msg.name || null, result: 'error', detail: { error: String(error?.message || error) } });
            ws.send(JSON.stringify({ error: String(error?.message || error) }));
        };
    });
};
