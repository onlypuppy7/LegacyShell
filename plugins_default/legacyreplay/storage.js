//legacyshell: replay server storage (services only, loaded from index.js when the plugin runs as services)
//replays and the reels made for them, per account. everything the client sends is untrusted: the replay is read back through the same strict reader a downloaded one gets, the reel through the same
//cleaner, and what is kept about them (map, length, key) comes from that, not from what the client says
import { ss } from '#misc';
import accs from '#accountManagement';
import sess from '#sessionManagement';
import { ReplayFormat as F } from './format.js';
import { ReplayTiers } from './tiers.js';
import { ReplaySigning } from './signing.js';

//what one account may keep depends on its rank (tiers.js). only what is not rank dependent is here
const reelBytes = 64 * 1024;

const commands = ['replayList', 'replaySave', 'replayGet', 'replayDelete', 'replayPin', 'replayReels', 'replayReelSave', 'replayReelGet', 'replayReelDelete'];

export const ReplayStorage = {
    registerListeners: function (plugins) {
        plugins.on('services:initTables', () => this.ensureTables());
        plugins.on('services:unhandledCommand', async (data) => {
            if (!commands.includes(data.msg.cmd)) return;
            plugins.cancel = true;
            try {
                await this.ensureTables();
                await this[data.msg.cmd](data.msg, data.ws, data.ip);
            } catch (e) {
                console.log("[legacyreplay] " + data.msg.cmd + " failed:", e);
                data.ws.send(JSON.stringify({ error: "Something went wrong." }));
            };
        });
        this.timer = setInterval(() => this.expire().catch(() => { }), 60 * 60 * 1000);
        if (this.timer.unref) this.timer.unref();
    },

    //the plugin is loaded after the services started its own table setup, so the first command makes sure they are there too
    ensureTables: function () {
        return this.tables || (this.tables = this.initTables());
    },

    initTables: async function () {
        await ss.runQuery(`
            CREATE TABLE IF NOT EXISTS replays (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                owner_id INTEGER NOT NULL,
                replay_key TEXT NOT NULL,
                map_name TEXT DEFAULT '',
                duration INTEGER DEFAULT 0,
                players INTEGER DEFAULT 0,
                bytes INTEGER NOT NULL,
                pinned INTEGER DEFAULT 0,
                dateCreated INTEGER NOT NULL,
                dateExpires INTEGER,
                data BLOB NOT NULL,
                UNIQUE (owner_id, replay_key)
            )
        `);
        await ss.runQuery(`
            CREATE TABLE IF NOT EXISTS replay_reels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                replay_id INTEGER NOT NULL,
                owner_id INTEGER NOT NULL,
                name TEXT DEFAULT '',
                shots INTEGER DEFAULT 0,
                bytes INTEGER NOT NULL,
                dateModified INTEGER NOT NULL,
                data TEXT NOT NULL
            )
        `);
        await ss.runQuery(`CREATE INDEX IF NOT EXISTS replay_reels_replay ON replay_reels (replay_id)`);
        try { await ss.runQuery(`ALTER TABLE replays ADD COLUMN trust TEXT DEFAULT ''`) } catch (e) { } //added after the table, an old table gets it here
    },

    //the signed in account behind msg.session, or null (with the error already sent)
    owner: async function (msg, ws, ip) {
        var session = msg.session ? await sess.retrieveSession(msg.session, ip, false) : null;
        var user = session ? await accs.getUserData(session.user_id, false, false) : null;
        if (!user) {
            ws.send(JSON.stringify({ error: "Sign in to use replay storage." }));
            return null;
        };
        return user.account_id;
    },

    expire: async function () {
        var now = Date.now();
        var gone = await ss.getAll(`SELECT id FROM replays WHERE pinned = 0 AND dateExpires IS NOT NULL AND dateExpires < ?`, [now]);
        for (var row of gone) await this.removeReplay(row.id);
    },

    removeReplay: async function (id) {
        await ss.runQuery(`DELETE FROM replay_reels WHERE replay_id = ?`, [id]);
        await ss.runQuery(`DELETE FROM replays WHERE id = ?`, [id]);
    },

    //this account's numbers, from its rank
    limits: async function (ownerId) {
        var user = await ss.getOne(`SELECT adminRoles FROM users WHERE account_id = ?`, [ownerId]);
        return ReplayTiers.for(user?.adminRoles);
    },

    used: async function (ownerId) {
        var replays = await ss.getOne(`SELECT COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS bytes, COALESCE(SUM(pinned), 0) AS pins FROM replays WHERE owner_id = ?`, [ownerId]);
        var reels = await ss.getOne(`SELECT COALESCE(SUM(bytes), 0) AS bytes FROM replay_reels WHERE owner_id = ?`, [ownerId]);
        return { replays: replays.n, bytes: replays.bytes + reels.bytes, pins: replays.pins };
    },

    own: async function (ownerId, id) {
        return Number.isInteger(id) ? ss.getOne(`SELECT id, replay_key, duration FROM replays WHERE id = ? AND owner_id = ?`, [id, ownerId]) : null;
    },

    //what the list shows for a replay (all of them, or the one asked for)
    rows: async function (ownerId, id) {
        return ss.getAll(`
            SELECT r.id, r.replay_key AS replayKey, r.map_name AS map, r.duration, r.players, r.bytes, r.pinned, r.trust, r.dateCreated AS created, r.dateExpires AS expires,
                (SELECT COUNT(*) FROM replay_reels WHERE replay_id = r.id) AS reels
            FROM replays r WHERE r.owner_id = ? ${id ? "AND r.id = ?" : ""} ORDER BY r.dateCreated DESC
        `, id ? [ownerId, id] : [ownerId]);
    },

    replayList: async function (msg, ws, ip) {
        var ownerId = await this.owner(msg, ws, ip);
        if (ownerId === null) return;
        await this.expire();
        var rows = await this.rows(ownerId);
        ws.send(JSON.stringify({ replayList: { replays: rows, used: await this.used(ownerId), limits: await this.limits(ownerId) } }));
    },

    replaySave: async function (msg, ws, ip) {
        var ownerId = await this.owner(msg, ws, ip);
        if (ownerId === null) return;
        var L = await this.limits(ownerId);
        if (typeof msg.data !== "string" || msg.data.length > Math.ceil(L.file * 4 / 3) + 8) return ws.send(JSON.stringify({ error: "That replay is too big to keep on the server." }));

        var bytes = new Uint8Array(Buffer.from(msg.data, "base64"));
        if (bytes.length > L.file) return ws.send(JSON.stringify({ error: "That replay is too big to keep on the server." }));
        var parsed, body;
        try {
            body = await F.unpack(bytes, { ...F.Limits, maxFile: L.file });
            parsed = F.parse(body);
            if (!parsed.records.length || parsed.error) throw new Error(parsed.error || "it is empty");
        } catch (e) {
            return ws.send(JSON.stringify({ error: "That isn't a good replay: " + e.message }));
        };
        var header = parsed.header, key = header.mapHash + ":" + header.startTime;

        var existing = await ss.getOne(`SELECT id FROM replays WHERE owner_id = ? AND replay_key = ?`, [ownerId, key]);
        if (existing) return ws.send(JSON.stringify({ replaySave: { id: existing.id, key, already: true, replay: (await this.rows(ownerId, existing.id))[0], used: await this.used(ownerId) } }));

        await this.expire();
        var used = await this.used(ownerId);
        if (used.replays >= L.replays) return ws.send(JSON.stringify({ error: "You have " + L.replays + " replays on the server already. Delete one first." }));
        if (used.bytes + bytes.length > L.bytes) return ws.send(JSON.stringify({ error: "That would go over your " + Math.round(L.bytes / 1048576) + "MB of server storage. Delete a replay first." }));

        var now = Date.now();
        var trust = (await F.verify(body, parsed, ReplaySigning.load().list)).status; //who made it, worked out here and not taken from the client
        var result = await ss.runQuery(
            `INSERT INTO replays (owner_id, replay_key, map_name, duration, players, bytes, pinned, dateCreated, dateExpires, data, trust) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
            [ownerId, key, String(header.mapName || "").slice(0, 64), Math.round(header.duration || 0), header.players.length, bytes.length, now, now + L.keepMs, Buffer.from(bytes), trust]
        );
        var id = Number(result.lastInsertRowid);
        ws.send(JSON.stringify({ replaySave: { id, key, replay: (await this.rows(ownerId, id))[0], used: await this.used(ownerId) } }));
    },

    replayGet: async function (msg, ws, ip) {
        var ownerId = await this.owner(msg, ws, ip);
        if (ownerId === null) return;
        var own = await this.own(ownerId, msg.id);
        if (!own) return ws.send(JSON.stringify({ error: "That replay isn't on the server any more." }));
        var row = await ss.getOne(`SELECT data FROM replays WHERE id = ?`, [own.id]);
        var reels = await ss.getAll(`SELECT id, name, shots, dateModified AS updated FROM replay_reels WHERE replay_id = ? ORDER BY dateModified DESC`, [own.id]);
        ws.send(JSON.stringify({ replayGet: { id: own.id, key: own.replay_key, data: Buffer.from(row.data).toString("base64"), reels } }));
    },

    replayDelete: async function (msg, ws, ip) {
        var ownerId = await this.owner(msg, ws, ip);
        if (ownerId === null) return;
        var own = await this.own(ownerId, msg.id);
        if (own) await this.removeReplay(own.id);
        ws.send(JSON.stringify({ replayDelete: { id: msg.id, used: await this.used(ownerId) } }));
    },

    //pinned replays don't expire (they still count against the space)
    replayPin: async function (msg, ws, ip) {
        var ownerId = await this.owner(msg, ws, ip);
        if (ownerId === null) return;
        var own = await this.own(ownerId, msg.id);
        if (!own) return ws.send(JSON.stringify({ error: "That replay isn't on the server any more." }));
        var pinned = msg.pinned ? 1 : 0;
        var L = await this.limits(ownerId);
        if (pinned && (await this.used(ownerId)).pins >= L.pins) return ws.send(JSON.stringify({ error: "You can pin " + L.pins + " replays." }));
        await ss.runQuery(`UPDATE replays SET pinned = ?, dateExpires = ? WHERE id = ?`, [pinned, pinned ? null : Date.now() + L.keepMs, own.id]);
        ws.send(JSON.stringify({ replayPin: { id: own.id, pinned, expires: pinned ? null : (await ss.getOne(`SELECT dateExpires FROM replays WHERE id = ?`, [own.id])).dateExpires } }));
    },

    replayReels: async function (msg, ws, ip) {
        var ownerId = await this.owner(msg, ws, ip);
        if (ownerId === null) return;
        var reels = await ss.getAll(`SELECT e.id, e.name, e.shots, e.dateModified AS updated FROM replay_reels e JOIN replays r ON r.id = e.replay_id WHERE r.owner_id = ? AND r.replay_key = ? ORDER BY e.dateModified DESC`, [ownerId, String(msg.replayKey)]);
        ws.send(JSON.stringify({ replayReels: { reels } }));
    },

    replayReelSave: async function (msg, ws, ip) {
        var ownerId = await this.owner(msg, ws, ip);
        if (ownerId === null) return;
        var L = await this.limits(ownerId);
        var replay = await ss.getOne(`SELECT id, duration FROM replays WHERE owner_id = ? AND replay_key = ?`, [ownerId, String(msg.replayKey)]);
        if (!replay) return ws.send(JSON.stringify({ error: "Keep the replay on the server first." }));

        var { ReplayDirector } = await import('./director.js'); //only needed here, and it pulls in the comm code
        var reel;
        try {
            reel = ReplayDirector.cleanReel(JSON.parse(JSON.stringify(msg.reel)), { duration: replay.duration });
        } catch (e) {
            return ws.send(JSON.stringify({ error: "That isn't a good reel: " + e.message }));
        };
        var json = JSON.stringify(reel), size = Buffer.byteLength(json);
        if (size > reelBytes) return ws.send(JSON.stringify({ error: "That reel is too big." }));

        var name = String(reel.name || "Reel").slice(0, 60);
        var same = await ss.getOne(`SELECT id, bytes FROM replay_reels WHERE replay_id = ? AND name = ?`, [replay.id, name]); //saving under a name that is there again replaces it
        var used = await this.used(ownerId);
        if (used.bytes - (same ? same.bytes : 0) + size > L.bytes) return ws.send(JSON.stringify({ error: "That would go over your server storage." }));
        if (!same && (await ss.getOne(`SELECT COUNT(*) AS n FROM replay_reels WHERE replay_id = ?`, [replay.id])).n >= L.reels) return ws.send(JSON.stringify({ error: "That replay has " + L.reels + " reels already." }));

        var now = Date.now(), id;
        if (same) {
            id = same.id;
            await ss.runQuery(`UPDATE replay_reels SET shots = ?, bytes = ?, dateModified = ?, data = ? WHERE id = ?`, [reel.shots.length, size, now, json, id]);
        } else {
            id = Number((await ss.runQuery(`INSERT INTO replay_reels (replay_id, owner_id, name, shots, bytes, dateModified, data) VALUES (?, ?, ?, ?, ?, ?, ?)`, [replay.id, ownerId, name, reel.shots.length, size, now, json])).lastInsertRowid);
        };
        ws.send(JSON.stringify({ replayReelSave: { id, name } }));
    },

    replayReelGet: async function (msg, ws, ip) {
        var ownerId = await this.owner(msg, ws, ip);
        if (ownerId === null) return;
        var row = Number.isInteger(msg.id) ? await ss.getOne(`SELECT id, name, data FROM replay_reels WHERE id = ? AND owner_id = ?`, [msg.id, ownerId]) : null;
        if (!row) return ws.send(JSON.stringify({ error: "That reel isn't on the server any more." }));
        ws.send(JSON.stringify({ replayReelGet: { id: row.id, name: row.name, reel: JSON.parse(row.data) } }));
    },

    replayReelDelete: async function (msg, ws, ip) {
        var ownerId = await this.owner(msg, ws, ip);
        if (ownerId === null) return;
        if (Number.isInteger(msg.id)) await ss.runQuery(`DELETE FROM replay_reels WHERE id = ? AND owner_id = ?`, [msg.id, ownerId]);
        ws.send(JSON.stringify({ replayReelDelete: { id: msg.id } }));
    },
};
