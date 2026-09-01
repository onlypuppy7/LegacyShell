// adminGetStorage: at-a-glance storage stats - main DB size, per-table row counts (+ byte sizes
// where the dbstat vtable is available), the backups directory, and the services store/ tree.
// Moderator+ (read-only numbers).
import fs from 'node:fs';
import path from 'node:path';
import { ss } from '#misc';
import { requireModeratorOrAbove } from './auth.js';

function fileSize(p) {
    try { return fs.statSync(p).size; } catch { return 0; };
};

function dirSize(dir, depth = 0) {
    let total = 0, files = 0;
    if (depth > 6) return { total, files };
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return { total, files }; };
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { const s = dirSize(full, depth + 1); total += s.total; files += s.files; }
        else { total += fileSize(full); files++; };
    };
    return { total, files };
};

export function registerStorage(plugins) {
    plugins.on('services:unhandledCommand', async ({ msg, ws, ip }) => {
        if (msg.cmd !== 'adminGetStorage') return;
        plugins.cancel = true;
        if (!(await requireModeratorOrAbove(msg, ws, ip))) return;

        try {
            const dbPath = ss.dbPath;
            const db = {
                path: dbPath,
                bytes: fileSize(dbPath),
                walBytes: fileSize(dbPath + '-wal'),
                shmBytes: fileSize(dbPath + '-shm'),
            };

            const backupDir = ss.config.services.backups?.filepath || ss.backupPath;
            let backupEntries = [];
            try {
                backupEntries = fs.readdirSync(backupDir)
                    .filter(f => f.endsWith('.db'))
                    .map(f => { const st = fs.statSync(path.join(backupDir, f)); return { name: f, bytes: st.size, mtime: Math.floor(st.mtimeMs / 1000) }; })
                    .sort((a, b) => b.mtime - a.mtime);
            } catch { /* no backups yet */ };
            const backups = {
                dir: backupDir,
                count: backupEntries.length,
                bytes: backupEntries.reduce((n, b) => n + b.bytes, 0),
                keep: ss.config.services.backups?.keep ?? null,
                entries: backupEntries.slice(0, 50),
            };

            // per-table row counts, and byte sizes if the dbstat vtable is compiled in
            let dbstat = {};
            try {
                for (const r of await ss.getAll(`SELECT name, SUM(pgsize) AS bytes FROM dbstat GROUP BY name`)) dbstat[r.name] = r.bytes;
            } catch { /* dbstat not available - counts only */ };
            const tableNames = (await ss.getAll(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)).map(r => r.name);
            const tables = [];
            for (const name of tableNames) {
                let rows = null;
                try { rows = (await ss.getOne(`SELECT COUNT(*) AS c FROM "${name}"`)).c; } catch { /* skip */ };
                tables.push({ name, rows, bytes: dbstat[name] ?? null });
            };

            const storeDir = path.join(ss.rootDir, 'server-services', 'store');
            const store = { path: storeDir, ...dirSize(storeDir) };

            ws.send(JSON.stringify({ adminGetStorage: { db, backups, tables, store, generatedAt: Math.floor(Date.now() / 1000) } }));
        } catch (error) {
            ws.send(JSON.stringify({ error: String(error?.message || error) }));
        };
    });
};
