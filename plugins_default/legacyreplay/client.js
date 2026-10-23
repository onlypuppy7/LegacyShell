//legacyshell: replay client (browser bundle only)
//

export const LegacyReplay = {
    maxChunks: 2048, //64MB at 32KB a chunk, the same as the reader's file limit
    incoming: {}, //clipId -> { count, got, parts }
    dbName: "legacyreplay",

    registerListeners: function (pluginManager) {
        this.plugins = pluginManager;

        this.plugins.on('game:LegacyShellOnMessage', this.onMessage.bind(this));

        if (typeof devmode !== "undefined" && devmode) { //the bundle is wrapped so nothing is reachable from the console, this is for testing
            window.LegacyReplay = this; window.LegacyReplaySession = () => ReplaySession;
            window.LegacyReplayParts = () => ({ ReplaySession, ReplayCamera, ReplayReel, ReplayDirector, ReplayViewer, ReplayEditor, ReplayFx, ReplayAudio, ReplayExport, ReplayLive, ReplayViews, ReplaySpectate });
        };
    },

    chat: function (text) {
        if (typeof addChat === "function") addChat(text, null, Comm.Chat.cmd);
    },

    //every record goes through here on its way to the message handler. plugins can change event.data on replayRecord (anonymising names would be one)
    prepareRecord: async function (record, header) {
        var event = { type: record.type, data: record.data, header };
        await this.plugins.emit('replayRecord', event);
        return event.data;
    },

    clip: function (seconds) { //the clip key will call this
        this.say("/replay clip" + (seconds ? " " + seconds : ""));
    },

    say: function (text) { //same packet the chat box sends, the server does the permission check
        var output = new Comm.Out(3 + 2 * text.length);
        output.packInt8(Comm.Code.chat);
        output.packLongString(text);
        wsSend(output, "chat");
    },

    //recording the whole game: a red badge in the corner while the server is
    status: function (on, seconds) {
        this.recording = on;
        if (this.badge) { this.badge.remove(); this.badge = null };
        if (!on) return;
        this.badge = document.createElement("div");
        this.badge.style.cssText = "position: fixed; top: 2.4em; left: 50%; transform: translateX(-50%); z-index: 9990; pointer-events: none; color: #fff; font-weight: bold; text-shadow: 0 0 4px #000; font-size: 1.1em";
        this.badge.innerHTML = "<span style='color:#f33'>&#9679;</span> REC";
        document.body.appendChild(this.badge);
    },

    onMessage: function (data) {
        if (data.cmd === Comm.Code.replayStatus) {
            this.plugins.cancel = true;
            return this.status(data.input.unPackInt8U() === 1, data.input.unPackInt16U());
        };
        if (data.cmd !== Comm.Code.replayChunk) return;
        this.plugins.cancel = true; //handled, the game shouldnt try to read it as something else

        var input = data.input;
        var clipId = input.unPackInt16U();
        var idx = input.unPackInt16U();
        var count = input.unPackInt16U();
        var len = input.unPackInt16U();
        if (input.idx + len > input.buffer.length) return input.idx = input.buffer.length; //malformed, drop the rest of this message
        var payload = input.buffer.slice(input.idx, input.idx + len);
        input.idx += len;

        if (count < 1 || count > this.maxChunks || idx >= count) return;

        var clip = this.incoming[clipId];
        if (!clip || clip.count !== count) clip = this.incoming[clipId] = { count, got: 0, parts: new Array(count) };
        if (!clip.parts[idx]) clip.got++;
        clip.parts[idx] = payload;

        if (clip.got === count) {
            delete this.incoming[clipId];
            this.finished(ReplayFormat.concat(clip.parts));
        };
    },

    //a clip is read back through the same safe reader before it is kept, so a bad one never makes it into the library
    finished: async function (file) {
        try {
            var parsed = ReplayFormat.parse(await ReplayFormat.unpack(file));
            var id = await this.save(file, parsed);
            this.chat(`Clip saved: ${ReplayFormat.escapeHtml(parsed.header.mapName)}, ${Math.round(parsed.header.duration / 1000)}s, ${Math.ceil(file.length / 1024)}KB. Watch it from Settings, Replay.`);
            if (this.signedIn() && (typeof LegacySettings === "undefined" || LegacySettings.get("replayAutoUpload", true))) {
                try { await this.upload(id); this.chat("It is kept on your account too.") } catch (e) { this.chat("It couldn't be kept on your account: " + ReplayFormat.escapeHtml(e.message)) };
            };
        } catch (e) {
            console.log("[legacyreplay] clip rejected:", e);
            this.chat("The clip couldn't be read: " + ReplayFormat.escapeHtml(e.message));
        };
    },

    open: function () {
        if (!this.dbPromise) this.dbPromise = new Promise((resolve, reject) => {
            var req = indexedDB.open(this.dbName, 2);
            req.onupgradeneeded = () => { //a new store for reels in version 2, replays from version 1 are kept
                if (!req.result.objectStoreNames.contains("replays")) req.result.createObjectStore("replays", { keyPath: "id" });
                if (!req.result.objectStoreNames.contains("reels")) req.result.createObjectStore("reels", { keyPath: "id" });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        return this.dbPromise;
    },

    request: async function (mode, fn, storeName) {
        var db = await this.open();
        return new Promise((resolve, reject) => {
            var req = fn(db.transaction(storeName || "replays", mode).objectStore(storeName || "replays"));
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    save: async function (file, parsed) {
        var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        await this.request("readwrite", (store) => store.put({
            id, created: Date.now(), size: file.length, duration: parsed.header.duration, key: this.keyOf(parsed.header),
            mapName: parsed.header.mapName, players: parsed.header.players.length, bytes: file.buffer.slice(file.byteOffset, file.byteOffset + file.length),
        }));
        return id;
    },

    keyOf: function (header) { //which replay this is, the same on every device and on the server
        return header.mapHash + ":" + header.startTime;
    },

    //reels are the shot lists made for a replay, kept apart from it so the replay file itself never changes. replayKey says which replay (map hash + when it started), so the same
    //replay imported again, or on another device, finds them
    saveReel: async function (replayKey, reel) {
        var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        await this.request("readwrite", (store) => store.put({ id, replayKey, name: reel.name, created: Date.now(), shots: reel.shots.length, reel }), "reels");
        if (await this.isRemote(replayKey)) {
            try { await this.api("replayReelSave", { replayKey, reel }); delete this.reelCache[replayKey] } catch (e) { ReplayViewer.toast("Saved here, but not on your account: " + e.message) };
        };
        return id;
    },

    //local reels, and the ones on the account (ids that start with r, a local reel under the same name as a server one is the same reel)
    listReels: async function (replayKey) {
        var all = await this.request("readonly", (store) => store.getAll(), "reels");
        var mine = all.filter((r) => r.replayKey === replayKey).map(({ reel, ...meta }) => meta);
        if (await this.isRemote(replayKey)) {
            try {
                var cached = this.reelCache[replayKey];
                if (!cached || Date.now() - cached.at > 60000) cached = this.reelCache[replayKey] = { at: Date.now(), reels: (await this.api("replayReels", { replayKey })).reels };
                var remote = cached.reels;
                var names = new Set(remote.map((r) => r.name));
                mine = mine.filter((r) => !names.has(r.name)).concat(remote.map((r) => ({ id: "r" + r.id, replayKey, name: r.name, created: r.updated, shots: r.shots, remote: true })));
            } catch (e) { };
        };
        return mine.sort((a, b) => b.created - a.created);
    },

    getReel: async function (id) {
        if (typeof id === "string" && id[0] === "r" && /^r\d+$/.test(id)) return { id, reel: (await this.api("replayReelGet", { id: Number(id.slice(1)) })).reel };
        return this.request("readonly", (store) => store.get(id), "reels");
    },

    removeReel: async function (id) {
        if (typeof id === "string" && /^r\d+$/.test(id)) { this.reelCache = {}; return this.api("replayReelDelete", { id: Number(id.slice(1)) }) };
        return this.request("readwrite", (store) => store.delete(id), "reels");
    },

    //---- the account's copy (services). nothing here is needed to watch or make replays, signed out it all stays on the device
    remote: { list: null, at: 0, used: null, limits: null },
    reelCache: {}, //replayKey -> { at, reels }

    signedIn: function () {
        return !!(playerAccount && playerAccount.isLoggedIn && playerAccount.session);
    },

    api: function (cmd, payload, anonymous) {
        return new Promise((resolve, reject) => {
            if (!anonymous && !this.signedIn()) return reject(new Error("sign in first"));
            callApi({ cmd, session: anonymous ? undefined : playerAccount.session, ...payload }, (response) => resolve(response[cmd] || response), (response) => {
                var error = (response && response.error) || "couldn't reach the server";
                reject(new Error(/too many requests/i.test(error) ? "too many requests, wait a minute and try again" : error));
            });
        });
    },

    //the keys services signs with (every one it has used). kept in the browser too, so a replay can be checked without the server being reachable
    publicKeys: async function (force) {
        if (this.keyList && !force) return this.keyList;
        var stored = [];
        try { stored = JSON.parse(localStorage.getItem("legacyreplayKeys") || "[]") } catch (e) { };
        try {
            var fresh = (await this.api("replayPublicKeys", {}, true)).keys;
            if (Array.isArray(fresh)) { this.keyList = fresh; try { localStorage.setItem("legacyreplayKeys", JSON.stringify(fresh)) } catch (e) { } };
        } catch (e) { };
        return this.keyList || (this.keyList = stored);
    },

    //where a replay came from: { status: unsigned | verified | unverified | unknown, serverName }. a key we haven't seen gets one fresh look at the server's list
    verify: async function (body, parsed) {
        var result = await ReplayFormat.verify(body, parsed, await this.publicKeys());
        if (result.status === "unknown" && !this.keysRefreshed) {
            this.keysRefreshed = true;
            result = await ReplayFormat.verify(body, parsed, await this.publicKeys(true));
        };
        return result;
    },

    toBase64: function (bytes) {
        var out = "";
        for (var i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(out);
    },

    fromBase64: function (text) {
        var binary = atob(text), out = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
        return out;
    },

    //what the account has. asked again after two minutes or when forced, and if it can't be asked (the request limit, no connection) what was last known is used
    refreshRemote: async function (force) {
        if (!this.signedIn()) return this.remote = { list: null, at: 0, used: null, limits: null };
        if (!force && this.remote.list && Date.now() - this.remote.at < 120000) return this.remote;
        try {
            var result = await this.api("replayList", {});
            this.reelCache = {};
            return this.remote = { list: result.replays, at: Date.now(), used: result.used, limits: result.limits };
        } catch (e) {
            if (this.remote.list) return { ...this.remote, stale: e.message };
            throw e;
        };
    },

    isRemote: async function (replayKey) {
        if (!this.signedIn()) return false;
        try { return (await this.refreshRemote()).list.some((r) => r.replayKey === replayKey) } catch (e) { return false };
    },

    //keep a replay from this device on the account
    upload: async function (id) {
        var replay = await this.get(id);
        if (!replay) throw new Error("it is no longer saved here");
        var result = await this.api("replaySave", { data: this.toBase64(new Uint8Array(replay.bytes)) });
        if (this.remote.list && result.replay) {
            this.remote.list = this.remote.list.filter((r) => r.id !== result.replay.id);
            this.remote.list.unshift(result.replay);
            this.remote.used = result.used;
        };
        return result;
    },

    fetchRemote: async function (remoteId) {
        return this.fromBase64((await this.api("replayGet", { id: remoteId })).data);
    },

    removeRemote: async function (remoteId) {
        var result = await this.api("replayDelete", { id: remoteId });
        if (this.remote.list) { this.remote.list = this.remote.list.filter((r) => r.id !== remoteId); this.remote.used = result.used || this.remote.used };
        this.reelCache = {};
    },

    pinRemote: async function (remoteId, pinned) {
        var result = await this.api("replayPin", { id: remoteId, pinned });
        var row = this.remote.list && this.remote.list.find((r) => r.id === remoteId);
        if (row) { row.pinned = result.pinned; row.expires = result.expires };
    },

    //replays saved before keys were kept get theirs from the file
    fillKeys: async function (items) {
        for (var item of items) {
            if (item.key) continue;
            try {
                var full = await this.get(item.id);
                item.key = this.keyOf(ReplayFormat.parse(await ReplayFormat.unpack(new Uint8Array(full.bytes))).header);
                full.key = item.key;
                await this.request("readwrite", (store) => store.put(full));
            } catch (e) { };
        };
        return items;
    },

    list: async function () { //everything but the bytes
        var all = await this.request("readonly", (store) => store.getAll());
        return all.map(({ bytes, ...meta }) => meta).sort((a, b) => b.created - a.created);
    },

    get: async function (id) {
        return this.request("readonly", (store) => store.get(id));
    },

    remove: async function (id) {
        return this.request("readwrite", (store) => store.delete(id));
    },

    download: async function (id) {
        var replay = await this.get(id);
        if (!replay) return console.log("[legacyreplay] no replay with that id");
        var a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([replay.bytes], { type: "application/octet-stream" }));
        a.download = `${replay.mapName || "replay"}-${new Date(replay.created).toISOString().slice(0, 19).replace(/[:T]/g, "-")}.lsreplay`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1e4);
    },
};

LegacyReplay.registerListeners(plugins);
