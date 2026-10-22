//legacyshell: replay format (.lsreplay)
//
//file = "LSRP" + u8 version + gzip(body)
//body = u32 headerLen + header json + records
//record = u8 type + u32 tMs + u32 len + bytes
//
//no imports, only web apis (CompressionStream, TextEncoder, etc) so the same file runs in node and in the browser bundle.
//every replay file is untrusted input, see DESIGN.md "reading files safely". nothing in here throws on bad records, it stops and says how far it got.

export const ReplayFormat = {
    MAGIC: [0x4c, 0x53, 0x52, 0x50], //LSRP
    VERSION: 1,

    Type: {
        packets: 0, //raw broadcast packets, same bytes the clients got
        keyframe: 1, //everything needed to start playback from here (packAllPlayers, items, params...)
        marker: 2, //json: { label }
        playerPackets: 3, //u8 toId, then raw packets only that player got (pov mode)
        signature: 4, //json: { keyId, signature, signedAt, serverName }. always last
        sync: 5, //only sync commands, standard core layout, every player. they are most of the data, so they get their own type (cheap to skip, cheap to index)
    },

    //a sync entry as core's Client.packSync writes it: opcode + 16 fixed bytes, then [header.syncFrames] x 5 bytes of input state
    syncFixedBytes: 17,
    syncFrameBytes: 5,

    Limits: {
        maxFile: 64 * 1024 * 1024, //compressed, as uploaded/imported
        maxBody: 256 * 1024 * 1024, //decompressed, gzip bomb cap
        maxHeader: 4 * 1024 * 1024, //has the map in it
        maxRecord: 256 * 1024, //a keyframe with 18 players is a few KB, so this is generous
    },

    maxPlayers: 64,
    maxItems: 2048,
    maxPlugins: 256,

    escapeHtml: function (str) {
        return String(str).replace(/[&<>"'`]/g, (c) => "&#" + c.charCodeAt(0) + ";");
    },

    cleanString: function (str, max = 64) {
        if (typeof str !== "string") return null;
        return str.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max);
    },

    isPlainObject: function (obj) {
        return obj !== null && typeof obj === "object" && !Array.isArray(obj);
    },

    isInt: function (num, min, max) {
        return Number.isInteger(num) && num >= min && num <= max;
    },

    parseJson: function (bytes) { //__proto__ keys are dropped so nothing downstream can get polluted by merging this
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes), (key, val) => key === "__proto__" ? undefined : val);
    },

    //whitelist, not a copy. unknown fields are ignored, wrong fields reject the whole header
    cleanHeader: function (raw) {
        const F = ReplayFormat;
        if (!F.isPlainObject(raw)) throw new Error("header is not an object");
        if (raw.v !== F.VERSION) throw new Error("unsupported header version " + raw.v);

        const header = { v: F.VERSION };

        if (!F.isInt(raw.versionEnum, 0, 1e9)) throw new Error("bad versionEnum");
        header.versionEnum = raw.versionEnum;
        header.versionHash = F.cleanString(raw.versionHash, 64) ?? "";

        if (!F.isInt(raw.mapId, 0, 65535)) throw new Error("bad mapId");
        header.mapId = raw.mapId;
        header.mapName = F.cleanString(raw.mapName, 64) ?? "";
        header.mapHash = F.cleanString(raw.mapHash, 128) ?? "";

        if (raw.map !== undefined && raw.map !== null && !F.isPlainObject(raw.map)) throw new Error("bad map"); //contents are checked by whatever builds the map
        header.map = raw.map ?? null;

        if (raw.items !== undefined) {
            if (!Array.isArray(raw.items) || raw.items.length > F.maxItems || !raw.items.every(F.isPlainObject)) throw new Error("bad items");
            header.items = raw.items;
        } else header.items = [];

        if (!F.isInt(raw.gameType, 0, 255)) throw new Error("bad gameType");
        header.gameType = raw.gameType;

        header.syncFrames = raw.syncFrames === undefined ? 6 : raw.syncFrames;
        if (!F.isInt(header.syncFrames, 1, 60)) throw new Error("bad syncFrames");

        header.startTime = Number.isFinite(raw.startTime) ? raw.startTime : 0;
        header.duration = Number.isFinite(raw.duration) && raw.duration >= 0 ? raw.duration : 0;

        if (!Array.isArray(raw.players) || raw.players.length > F.maxPlayers) throw new Error("bad players");
        header.players = raw.players.map((p) => {
            if (!F.isPlainObject(p) || !F.isInt(p.id, 0, 255)) throw new Error("bad player");
            return { id: p.id, name: F.cleanString(p.name, 64) ?? "" };
        });

        if (!Array.isArray(raw.plugins) || raw.plugins.length > F.maxPlugins) throw new Error("bad plugins");
        header.plugins = raw.plugins.map((p) => {
            const clean = F.cleanString(p, 64);
            if (clean === null) throw new Error("bad plugin name");
            return clean;
        });

        return header;
    },

    //a marker record's bytes. kind is what it is (kill, or empty for one a player dropped), a and b are player ids where that means something
    markerBytes: function (marker) {
        return new TextEncoder().encode(JSON.stringify(marker));
    },

    //a marker record's data as it is used. kind "kill": a killed b
    cleanMarker: function (bytes) {
        const F = ReplayFormat;
        const marker = F.parseJson(bytes);
        const id = (n) => F.isInt(n, 0, 255) ? n : null;
        return { label: F.cleanString(marker?.label, 64) ?? "", kind: F.cleanString(marker?.kind, 16) ?? "", a: id(marker?.a), b: id(marker?.b) };
    },

    cleanSignature: function (raw) {
        const F = ReplayFormat;
        if (!F.isPlainObject(raw)) throw new Error("bad signature");
        const keyId = F.cleanString(raw.keyId, 64), signature = F.cleanString(raw.signature, 256), serverName = F.cleanString(raw.serverName, 64);
        if (!keyId || !signature) throw new Error("bad signature fields");
        return { keyId, signature, serverName: serverName ?? "", signedAt: Number.isFinite(raw.signedAt) ? raw.signedAt : 0 };
    },

    //---- signatures. the signed bytes are the body up to the signature record (header and every record before it). the signature is over sha-256 of those bytes followed by who signed and when,
    //so none of keyId, signedAt or serverName can be changed without it failing. ed25519, which webcrypto has in browsers and node
    signatureText: function (sig) {
        return new TextEncoder().encode(sig.keyId + "|" + sig.signedAt + "|" + sig.serverName);
    },

    async signedMessage(body, signedEnd, sig) {
        const F = ReplayFormat;
        const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", body.subarray(0, signedEnd)));
        return F.concat([digest, F.signatureText(sig)]);
    },

    //a signature record to go on the end of a body, in the same layout as any other record
    signatureRecord: function (sig, tMs) {
        const data = new TextEncoder().encode(JSON.stringify(sig));
        const head = new Uint8Array(9), view = new DataView(head.buffer);
        view.setUint8(0, ReplayFormat.Type.signature);
        view.setUint32(1, tMs, true);
        view.setUint32(5, data.length, true);
        return ReplayFormat.concat([head, data]);
    },

    base64: function (bytes) { return typeof Buffer !== "undefined" ? Buffer.from(bytes).toString("base64") : btoa(String.fromCharCode(...bytes)) },
    unbase64: function (text) { return typeof Buffer !== "undefined" ? new Uint8Array(Buffer.from(text, "base64")) : Uint8Array.from(atob(text), (c) => c.charCodeAt(0)) },

    //who made this file. parsed is what parse gave, body what it was parsed from, keys [{ keyId, publicKey (raw, base64) }] the ones this deployment has used. never throws
    //unsigned: no signature | verified: signed by a key we know | unverified: a key we know, but it doesn't match (edited, or made somewhere else) | unknown: signed by a key we don't have
    async verify(body, parsed, keys) {
        const F = ReplayFormat;
        const sig = parsed.signature;
        if (!sig) return { status: "unsigned" };
        const key = (keys || []).find((k) => k.keyId === sig.keyId);
        if (!key) return { status: "unknown", keyId: sig.keyId, serverName: sig.serverName };
        try {
            const publicKey = await crypto.subtle.importKey("raw", F.unbase64(key.publicKey), { name: "Ed25519" }, false, ["verify"]);
            const ok = await crypto.subtle.verify({ name: "Ed25519" }, publicKey, F.unbase64(sig.signature), await F.signedMessage(body, parsed.signedEnd, sig));
            return { status: ok ? "verified" : "unverified", keyId: sig.keyId, serverName: sig.serverName, signedAt: sig.signedAt };
        } catch (e) {
            return { status: "unverified", keyId: sig.keyId, serverName: sig.serverName };
        };
    },

    syncEntrySize: function (syncFrames) {
        return ReplayFormat.syncFixedBytes + syncFrames * ReplayFormat.syncFrameBytes;
    },

    concat: function (parts) {
        let total = 0;
        parts.forEach((p) => total += p.length);
        const out = new Uint8Array(total);
        let idx = 0;
        parts.forEach((p) => { out.set(p, idx); idx += p.length });
        return out;
    },

    //[ReplayFormat.Writer] builds the (uncompressed) body. the header is cleaned the same way the reader does, so it cant write what it wouldnt read
    Writer: class {
        constructor(header) {
            const F = ReplayFormat;
            this.header = F.cleanHeader({ v: F.VERSION, ...header });
            this.parts = [];
            this.records = 0;
            this.lastT = 0;
        };

        add(type, tMs, data, toId) {
            const F = ReplayFormat;
            tMs = Math.max(this.lastT, Math.floor(tMs)); //never backwards
            this.lastT = tMs;

            if (type === F.Type.playerPackets) data = F.concat([new Uint8Array([toId]), data]);
            if (data.length > F.Limits.maxRecord) throw new Error("record too big");

            const head = new Uint8Array(9);
            const view = new DataView(head.buffer);
            view.setUint8(0, type);
            view.setUint32(1, tMs, true);
            view.setUint32(5, data.length, true);
            this.parts.push(head, data);
            this.records++;
        };

        finish() { //header duration is filled in from the last record if it wasnt given
            const F = ReplayFormat;
            if (!this.header.duration) this.header.duration = this.lastT;
            const headerBytes = new TextEncoder().encode(JSON.stringify(this.header));
            if (headerBytes.length > F.Limits.maxHeader) throw new Error("header too big");
            const lenBytes = new Uint8Array(4);
            new DataView(lenBytes.buffer).setUint32(0, headerBytes.length, true);
            return F.concat([lenBytes, headerBytes, ...this.parts]);
        };
    },

    async gzip(bytes) {
        const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    },

    //stops and throws the moment the output goes over the cap, so a gzip bomb never finishes allocating
    async gunzip(bytes, cap) {
        const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
        const chunks = [];
        let total = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.length;
            if (total > cap) {
                reader.cancel().catch(() => { });
                throw new Error("decompressed size over limit");
            };
            chunks.push(value);
        };
        return ReplayFormat.concat(chunks);
    },

    async pack(body, gzip = ReplayFormat.gzip) { //the game server passes node's zlib so compressing happens off the event loop
        const F = ReplayFormat;
        return F.concat([new Uint8Array([...F.MAGIC, F.VERSION]), await gzip(body)]);
    },

    //file bytes -> body bytes. magic and version are looked at before gzip is touched
    async unpack(file, limits = ReplayFormat.Limits) {
        const F = ReplayFormat;
        if (!(file instanceof Uint8Array)) file = new Uint8Array(file);
        if (file.length > limits.maxFile) throw new Error("file too big");
        if (file.length < 6 || !F.MAGIC.every((b, i) => file[i] === b)) throw new Error("not a replay file");
        if (file[4] !== F.VERSION) throw new Error("unsupported replay version " + file[4]);
        try {
            return await F.gunzip(file.subarray(5), limits.maxBody);
        } catch (e) {
            if (e.message === "decompressed size over limit") throw e;
            throw new Error("replay is damaged (gzip)");
        };
    },

    //body -> { header, records, signature, signedEnd, error }. header problems throw, record problems stop the walk and set error (records before it are still good)
    parse: function (body, limits = ReplayFormat.Limits) {
        const F = ReplayFormat;
        if (!(body instanceof Uint8Array)) body = new Uint8Array(body);
        if (body.length < 4) throw new Error("replay is damaged (no header)");

        const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
        const headerLen = view.getUint32(0, true);
        if (headerLen > limits.maxHeader || 4 + headerLen > body.length) throw new Error("replay is damaged (header length)");

        let header;
        try {
            header = F.cleanHeader(F.parseJson(body.subarray(4, 4 + headerLen)));
        } catch (e) {
            throw new Error("replay header rejected: " + e.message);
        };

        const result = { header, records: [], signature: null, signedEnd: null, error: null };
        const known = Object.values(F.Type);
        let idx = 4 + headerLen, lastT = 0;

        while (idx < body.length) {
            if (result.signature) { result.error = "data after signature"; break };
            if (idx + 9 > body.length) { result.error = "truncated record header"; break };

            const type = view.getUint8(idx), tMs = view.getUint32(idx + 1, true), len = view.getUint32(idx + 5, true);
            if (!known.includes(type)) { result.error = "unknown record type " + type; break };
            if (len > limits.maxRecord) { result.error = "record too big"; break };
            if (idx + 9 + len > body.length) { result.error = "truncated record"; break };
            if (tMs < lastT) { result.error = "timestamps go backwards"; break };

            let data = body.subarray(idx + 9, idx + 9 + len), toId = null;

            if (type === F.Type.playerPackets) {
                if (len < 1) { result.error = "empty player packets"; break };
                toId = data[0];
                data = data.subarray(1);
            } else if (type === F.Type.signature) {
                try {
                    result.signature = F.cleanSignature(F.parseJson(data));
                } catch (e) { result.error = "bad signature record"; break };
                result.signedEnd = idx; //signed bytes are body[0, signedEnd)
            } else if (type === F.Type.sync) {
                if (len === 0 || len % F.syncEntrySize(header.syncFrames) !== 0) { result.error = "bad sync record"; break };
            } else if (type === F.Type.marker) {
                try {
                    data = F.cleanMarker(data);
                } catch (e) { result.error = "bad marker"; break };
            };

            lastT = tMs;
            if (type !== F.Type.signature) result.records.push({ type, tMs, data, toId, offset: idx });
            idx += 9 + len;
        };

        return result;
    },

    //index of the last keyframe at or before tMs, or -1
    findKeyframe: function (records, tMs) {
        let found = -1;
        for (let i = 0; i < records.length; i++) {
            if (records[i].tMs > tMs) break;
            if (records[i].type === ReplayFormat.Type.keyframe) found = i;
        };
        return found;
    },

    //reads past the end are not an error to Comm.In (it gives garbage), so anything that unpacks a record has to check this after
    readerOverran: function (input, data) {
        return input.idx > data.length;
    },
};
