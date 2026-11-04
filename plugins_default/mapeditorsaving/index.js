//this plugin is vibecoded
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { ss } from '#misc';
import crypto from 'node:crypto';
//plugin: mapeditorsaving
//open public maps in the editor, local autosaves (indexeddb) and account saves (services db)

export const PluginMeta = {
    identifier: 'mapeditorsaving',
    name: 'Map Editor Saving',
    author: 'onlypuppy7 (+Claude)', //NOTE! this plugin is VIBECODED.
    version: '1.1.2',
    descriptionShort: 'Open public maps, autosave and account saves for the map editor',
    descriptionLong: 'Open any public map in the editor, keep up to 50 saves/autosaves in the browser, and save maps to your account (10MB each account, 1GB for mods and up).',
    legacyShellVersion: 675,
};

const quotaUser = 10 * 1024 * 1024;
const quotaMod = 1024 * 1024 * 1024;
const modRank = 10;
const commands = ['mapeditorsavingPublicList', 'mapeditorsavingPublicGet', 'mapeditorsavingList', 'mapeditorsavingGet', 'mapeditorsavingSave', 'mapeditorsavingDelete'];

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        if (this.plugins.type === 'services') {
            plugins.on('services:initTables', () => this.initTables());
            plugins.on('services:unhandledCommand', this.unhandledCommand.bind(this));
        };
        if (this.plugins.type === 'client') {
            plugins.on('client:openBeforeDefault', ({ app }) => app.use('/mapeditorsaving', express.static(path.join(thisDir, 'client'))));
            plugins.on('client:replacementsAfter', this.replacementsAfter.bind(this));
        };
    };

    replacementsAfter({ code }) {
        const config = { url: ss.config.client.servicesURL || 'wss://services.legacy.onlypuppy7.org:443', port: ss.config.services.port || 13371 };
        code.mapEditorJs += `\nvar mapeditorsavingConfig = ${JSON.stringify(config)};\n` + fs.readFileSync(path.join(this.thisDir, 'client', 'saving.js'), 'utf8');
        code.mapEditorHtmlContent = code.mapEditorHtmlContent.replace('</head>',
            `<link rel="stylesheet" href="/mapeditorsaving/saving.css?v=${PluginMeta.version}">\n</head>`);
    };

    initTables() {
        ss.db.exec(`CREATE TABLE IF NOT EXISTS editor_saved_maps (
            account_id INTEGER NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL, size INTEGER NOT NULL,
            dateModified INTEGER DEFAULT (strftime('%s', 'now')), PRIMARY KEY (account_id, name)
        )`);
    };

    async unhandledCommand({ msg, ws, ip }) {
        if (!commands.includes(msg.cmd)) return;
        this.plugins.cancel = true;
        const reply = (value) => ws.send(JSON.stringify({ mapeditorsaving: value }));
        try {
            if (msg.cmd === 'mapeditorsavingPublicList') {
                return reply({ maps: ss.db.prepare(`SELECT name, width, height, depth, numPlayers FROM maps WHERE availability IN ('public', 'both') ORDER BY name`).all() });
            };
            if (msg.cmd === 'mapeditorsavingPublicGet') {
                const row = ss.db.prepare(`SELECT * FROM maps WHERE name = ? AND availability IN ('public', 'both')`).get(String(msg.name));
                if (!row) throw new Error('That map is not public.');
                for (const key of ['sun', 'fog', 'data', 'palette', 'render', 'extents', 'modes']) row[key] = JSON.parse(row[key]);
                delete row.dateCreated; delete row.dateModified;
                return reply({ map: row });
            };

            //checks the stored auth token directly: no session made, no token rotated, so the game tab stays signed in
            const user = typeof msg.username === 'string' && typeof msg.authToken === 'string' && msg.authToken ? ss.db.prepare('SELECT account_id, authToken, adminRoles FROM users WHERE username = ?').get(msg.username) : null;
            const given = Buffer.from(String(msg.authToken)), real = Buffer.from(String(user?.authToken ?? ''));
            if (!user || !real.length || given.length !== real.length || !crypto.timingSafeEqual(given, real)) throw new Error('Sign in on the main page first.');
            const id = user.account_id;
            const quota = user.adminRoles >= modRank ? quotaMod : quotaUser;
            const usage = () => ss.db.prepare('SELECT COALESCE(SUM(size), 0) AS used FROM editor_saved_maps WHERE account_id = ?').get(id).used;
            const list = () => ({ saves: ss.db.prepare('SELECT name, size, dateModified FROM editor_saved_maps WHERE account_id = ? ORDER BY dateModified DESC').all(id), used: usage(), quota });

            if (msg.cmd === 'mapeditorsavingList') return reply(list());
            const name = String(msg.name ?? '').trim().slice(0, 64);
            if (!name) throw new Error('Give your map a name first.');
            if (msg.cmd === 'mapeditorsavingGet') {
                const row = ss.db.prepare('SELECT data FROM editor_saved_maps WHERE account_id = ? AND name = ?').get(id, name);
                if (!row) throw new Error('That save is gone.');
                return reply({ name, data: row.data });
            };
            if (msg.cmd === 'mapeditorsavingDelete') {
                ss.db.prepare('DELETE FROM editor_saved_maps WHERE account_id = ? AND name = ?').run(id, name);
                return reply(list());
            };
            if (typeof msg.data !== 'string') throw new Error('Nothing to save.');
            let parsed;
            try { parsed = JSON.parse(msg.data); } catch { throw new Error('That map is not valid.'); };
            if (!parsed || typeof parsed !== 'object' || typeof parsed.data !== 'object') throw new Error('That map is not valid.');
            const size = Buffer.byteLength(msg.data);
            ss.db.transaction(() => {
                const others = usage() - (ss.db.prepare('SELECT size FROM editor_saved_maps WHERE account_id = ? AND name = ?').get(id, name)?.size || 0);
                if (others + size > quota) throw new Error(`Your account is full (${Math.round(quota / 1048576)}MB). Delete a save to make room.`);
                ss.db.prepare(`INSERT INTO editor_saved_maps (account_id, name, data, size) VALUES (?, ?, ?, ?)
                    ON CONFLICT(account_id, name) DO UPDATE SET data = excluded.data, size = excluded.size, dateModified = strftime('%s', 'now')`).run(id, name, msg.data, size);
            }).immediate();
            reply(list());
        } catch (error) {
            console.error('MapEditorSaving:', error.message);
            ws.send(JSON.stringify({ mapeditorsaving: { error: error.message?.length < 120 ? error.message : 'Something cracked. Try again.' } }));
        };
    };
};
