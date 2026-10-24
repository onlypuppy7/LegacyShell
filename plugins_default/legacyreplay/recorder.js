//legacyshell: replay recorder (game side, one per room, lives in the room worker)
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { parentPort } from 'node:worker_threads';
import Comm from '#comm';
import { ss } from '#misc';
import { plugins } from '#plugins';
import { FramesBetweenSyncs } from '#constants';
import { ReplayFormat } from './format.js';
import { ReplayShared } from './shared.js';
import { ReplayTiers } from './tiers.js';
import wsrequest from '#wsrequest';
//

export const settings = {
    windowMs: 3 * 60e3, //how much stays in the rolling buffer
    keyframeMs: 5e3,
    maxBytes: 24 * 1024 * 1024, //hard cap on the buffer, oldest goes first
    clipDefault: 30,
    clipMin: 5,
    clipMax: 60,
    clipCooldownMs: 20e3,
    maxMapBytes: 3 * 1024 * 1024,
    signing: true,
    roomOf: () => ss?.room, //the room this worker runs
    //asks services to sign a digest, resolves to { keyId, signature, signedAt, serverName } or nothing. tests swap this out
    sign: async function (digest) {
        var config = ss?.config?.game;
        if (!config?.auth_key || config.auth_key === 'AUTH_KEY' || !config.services_server) return null;
        var response = await Promise.race([wsrequest({ cmd: 'replaySign', digest }, config.services_server, config.auth_key), new Promise((resolve) => setTimeout(() => resolve(null), 4000))]);
        return response?.replaySign || null;
    },
    enabled: true,
    profile: false, //times every add/keyframe/clip (bench-recorder.js turns it on)
};

const loopDelay = monitorEventLoopDelay({ resolution: 1 }); //this worker's event loop, so a recorder stall would show up here
let loopDelayOn = false;

const newStats = () => ({ syncs: 0, syncMs: 0, syncMax: 0, adds: 0, addMs: 0, addMax: 0, keyframes: 0, keyframeMs: 0, keyframeMax: 0, clips: 0, clipMs: 0, clipMax: 0 });

const recorders = new WeakMap();

//how a message gets to a socket from the room's worker: through the main thread, which owns every socket (tests swap this)
export const transport = {
    send: (wsId, bytes) => parentPort?.postMessage([Comm.Worker.send, bytes, wsId]),
};

const maxCasters = 6;
const gzipAsync = promisify(zlib.gzip); //runs in the threadpool, the room keeps ticking while it works
const gzip = async (bytes) => new Uint8Array(await gzipAsync(bytes));

export class RoomRecorder {
    constructor(room) {
        this.room = room;
        this.startTime = Date.now();
        this.records = []; //{ type, tMs, data }
        this.bytes = 0;
        this.lastKeyframe = -Infinity;
        this.lastClipBy = {};
        this.nextClipId = 1;
        this.casters = new Map(); //wsId -> the time (in recorder ms) that caster's copy starts at
        this.hold = null; //a whole game being recorded: { by (client id), record (the keyframe it starts at), fromMs, maxMs, maxBytes }
        this.sources = {}; //record type -> function(room) that packs that type each sync cycle, see claim()
        this.stats = newStats();
        if (settings.profile && !loopDelayOn) loopDelay.enable(), loopDelayOn = true;
    };

    static get(room) {
        var recorder = recorders.get(room);
        if (!recorder) recorders.set(room, recorder = new RoomRecorder(room));
        return recorder;
    };

    now() {
        return Date.now() - this.startTime;
    };

    add(type, data) {
        var record = { type, tMs: this.now(), data };
        this.records.push(record);
        this.bytes += data.length + 9;
        if (this.casters.size) this.forward(record);
    };

    //---- live casting: a moderator watching the room as it is recorded. what they are sent is the file's records one at a time, so what plays is exactly what a saved replay would
    //message to a caster: u8 replayLive, then u8 0 and the header as json | u8 1, u8 type, u32 tMs (from where their copy starts), the record's bytes
    castHeader(base) {
        var json = new TextEncoder().encode(JSON.stringify({ v: ReplayFormat.VERSION, ...this.header(base) })); //what the reader wants a header to start with
        var message = new Uint8Array(2 + json.length);
        message[0] = Comm.Code.replayLive;
        message[1] = 0;
        message.set(json, 2);
        return message;
    };

    castRecord(record, base) {
        var message = new Uint8Array(7 + record.data.length), view = new DataView(message.buffer);
        view.setUint8(0, Comm.Code.replayLive);
        view.setUint8(1, 1);
        view.setUint8(2, record.type);
        view.setUint32(3, Math.max(0, record.tMs - base), true);
        message.set(record.data, 7);
        return message;
    };

    forward(record) {
        if (record.type === ReplayFormat.Type.playerPackets) return; //for one player, a caster has no use for it
        this.casters.forEach((base, wsId) => transport.send(wsId, this.castRecord(record, base)));
    };

    //a fresh keyframe, then everything from it to now, then whatever comes after as it comes
    addCaster(wsId) {
        if (this.casters.has(wsId) || this.casters.size >= maxCasters) return;
        this.lastKeyframe = -Infinity;
        this.keyframe();
        var from = -1;
        for (var i = this.records.length - 1; i >= 0 && from < 0; i--) if (this.records[i].type === ReplayFormat.Type.keyframe) from = i;
        var base = from >= 0 ? this.records[from].tMs : this.now();

        transport.send(wsId, this.castHeader(base));
        if (from >= 0) for (var i = from; i < this.records.length; i++) this.forward1(wsId, this.records[i], base);
        this.casters.set(wsId, base);
    };

    forward1(wsId, record, base) {
        if (record.type !== ReplayFormat.Type.playerPackets) transport.send(wsId, this.castRecord(record, base));
    };

    removeCaster(wsId) {
        this.casters.delete(wsId);
    };

    addOutput(output, type = ReplayFormat.Type.packets) {
        var bare = ArrayBuffer.isView(output); //reload and swapWeapon go out as a bare buffer, already the right size, with no idx
        if (bare ? !output.length : !output.idx) return;
        var t0 = settings.profile ? performance.now() : 0;
        this.add(type, bare ? new Uint8Array(output) : output.buffer.slice(0, output.idx)); //copy, the output is free to change after this
        if (settings.profile) this.time('add', performance.now() - t0);
    };

    //a kill, as a marker next to the die packet: the viewer puts it on the timeline, and later the highlight reel is built from these. the die packet is: opcode, who died, who killed them
    addKill(output) {
        var bytes = output.buffer;
        if (output.idx < 3 || bytes[0] !== Comm.Code.die) return;
        this.add(ReplayFormat.Type.marker, ReplayFormat.markerBytes({ label: "kill", kind: "kill", a: bytes[2], b: bytes[1] }));
    };

    //another plugin can take over recording a record type: pack(room) runs every sync cycle and returns the bytes (or nothing), and the default recording of that type is skipped.
    //the type is a ReplayFormat.Type, the bytes are in whatever layout the type is documented as
    claim(type, pack) {
        this.sources[type] = pack;
    };

    runSources() {
        for (var type in this.sources) {
            var t0 = settings.profile ? performance.now() : 0;
            var bytes = this.sources[type](this.room);
            if (bytes?.length) this.add(Number(type), bytes);
            if (settings.profile && Number(type) === ReplayFormat.Type.sync) this.time('sync', performance.now() - t0);
        };
    };

    time(what, ms) {
        var s = this.stats;
        s[what + 's']++;
        s[what + 'Ms'] += ms;
        if (ms > s[what + 'Max']) s[what + 'Max'] = ms;
    };

    keyframe() {
        var t0 = settings.profile ? performance.now() : 0;
        var room = this.room;
        var anyoneReady = false;
        room.clients_by_id.forEach((client) => { if (client?.clientIsReady) anyoneReady = true });
        if (!anyoneReady) return;

        var output = new Comm.Out();
        var cancel = plugins.cancel; //these all emit, and emit resets the shared cancel flag, which something else might be mid use of
        room.packAllPlayers(output);
        room.packAllItems(output);
        room.packUpdateRoomParams(output);
        room.packRoundUpdate(output);
        if (Comm.Code.setEggColor) room.clients_by_id.forEach((client) => {
            var color = client?.clientIsReady && client.player?.eggColor;
            if (color) { output.packInt8U(Comm.Code.setEggColor); output.packInt8U(client.id); output.packInt8U(1); output.packInt8U(color[0]); output.packInt8U(color[1]); output.packInt8U(color[2]) };
        });
        plugins.cancel = cancel;

        this.lastKeyframe = this.now();
        this.add(ReplayFormat.Type.keyframe, output.buffer.slice(0, output.idx));
        this.trim();
        if (settings.profile) this.time('keyframe', performance.now() - t0);
    };

    trim() {
        var cut = this.now() - settings.windowMs;
        if (this.hold) cut = Math.min(cut, this.hold.fromMs);
        var keep = -1; //newest keyframe that is still older than the window, everything before it can go
        for (var i = 0; i < this.records.length; i++) {
            if (this.records[i].tMs > cut) break;
            if (this.records[i].type === ReplayFormat.Type.keyframe) keep = i;
        };
        if (keep > 0) this.drop(keep);

        while (this.bytes > (this.hold ? this.hold.maxBytes : settings.maxBytes)) { //over the cap: shrink the window to the next keyframe instead
            var next = this.records.findIndex((r, i) => i > 0 && r.type === ReplayFormat.Type.keyframe);
            if (next < 0) break;
            this.drop(next);
        };
    };

    drop(count) {
        this.records.splice(0, count).forEach((r) => this.bytes -= r.data.length + 9);
    };

    mapInfo() { //the map goes in the file so editing a map later cant break old replays
        var minMap = this.room.minMap;
        if (!minMap) return { map: null, mapHash: "" };
        if (this.mapCache?.source === minMap) return this.mapCache.info;
        var json = JSON.stringify(minMap);
        var info = { map: json.length <= settings.maxMapBytes ? JSON.parse(json) : null, mapHash: crypto.createHash('sha256').update(json).digest('hex') };
        this.mapCache = { source: minMap, info };
        return info;
    };

    //the items players have equipped, so an old replay can still be built if the catalog changes. each is kept once, and only if it is a plain object of a sane size
    equippedItems() {
        var seen = new Map();
        this.room.clients_by_id.forEach((client) => {
            var player = client?.player;
            if (!player) return;
            [player.primaryWeaponItem, player.secondaryWeaponItem, player.hatItem, player.stampItem].forEach((item) => {
                if (!item || !Number.isInteger(item.id) || seen.has(item.id)) return;
                try {
                    var json = JSON.stringify(item);
                    if (json.length <= 4096) seen.set(item.id, JSON.parse(json));
                } catch (e) { }; //something that can't be written as plain data is left out
            });
        });
        return [...seen.values()].slice(0, ReplayFormat.maxItems);
    };

    header(startTMs) {
        var room = this.room;
        var players = [];
        room.clients_by_id.forEach((client) => { if (client) players.push({ id: client.id, name: client.nickname }) });
        return {
            versionEnum: Number(ss?.versionEnum) || 0,
            versionHash: String(ss?.versionHash || ""),
            mapId: Number.isInteger(room.mapId) ? room.mapId : 0,
            mapName: room.minMap?.name ?? "",
            ...this.mapInfo(),
            items: this.equippedItems(),
            gameType: room.gameType,
            syncFrames: FramesBetweenSyncs,
            startTime: this.startTime + startTMs,
            players,
            plugins: Object.keys(plugins.plugins),
        };
    };

    //the last [seconds] as a .lsreplay (bytes), starting from the keyframe at or before that point
    async makeClip(seconds) {
        var cut = this.now() - seconds * 1000;
        var from = -1;
        for (var i = 0; i < this.records.length; i++) {
            if (this.records[i].type !== ReplayFormat.Type.keyframe) continue;
            if (this.records[i].tMs > cut && from >= 0) break;
            from = i;
        };
        if (from < 0) throw new Error("nothing recorded yet");
        return this.makeFrom(from);
    };

    async makeFrom(from) {
        var base = this.records[from].tMs;
        var writer = new ReplayFormat.Writer(this.header(base));
        for (var i = from; i < this.records.length; i++) {
            var r = this.records[i];
            writer.add(r.type, r.tMs - base, r.data, r.toId);
        };
        return ReplayFormat.pack(await this.signed(writer.finish(), writer.lastT), gzip);
    };

    //services signs it, as the last record. if that can't be done (no services, no key) the file is still a good replay, it just says it is unsigned
    async signed(body, tMs) {
        if (!settings.signing) return body;
        try {
            var signature = await settings.sign(crypto.createHash('sha256').update(body).digest('hex'));
            if (!signature) return body;
            return ReplayFormat.concat([body, ReplayFormat.signatureRecord(ReplayFormat.cleanSignature(signature), tMs)]);
        } catch (e) {
            if (!this.warnedSigning) console.log("[legacyreplay] couldn't sign a replay, it is sent unsigned:", e?.message || e);
            this.warnedSigning = true;
            return body;
        };
    };

    //chunks go over the normal game socket as replayChunk messages, client.js puts them back together
    sendFile(client, file) {
        var clipId = this.nextClipId++ & 0xffff;
        var count = Math.ceil(file.length / ReplayShared.chunkSize);
        if (count > 0xffff) throw new Error("clip too big to send");

        for (var idx = 0; idx < count; idx++) {
            var payload = file.subarray(idx * ReplayShared.chunkSize, (idx + 1) * ReplayShared.chunkSize);
            var message = new Uint8Array(ReplayShared.chunkHeaderSize + payload.length);
            var view = new DataView(message.buffer);
            view.setUint8(0, Comm.Code.replayChunk);
            view.setUint16(1, clipId, true);
            view.setUint16(3, idx, true);
            view.setUint16(5, count, true);
            view.setUint16(7, payload.length, true);
            message.set(payload, ReplayShared.chunkHeaderSize);
            client.sendMsgToWs(message);
        };
    };

    //public rooms want an account (so the replay has an owner, and a rank for its limits), private rooms let anyone. an ordinary account has the same rank as a guest, so it is the login that is checked
    needsAccount(player) {
        if (this.room.joinType !== Comm.Code.joinPublicGame || player.client.loggedIn) return false;
        player.client.commandFeedback("Sign in to do that in a public game.");
        return true;
    };

    async clip(player, opts) {
        var client = player.client;
        if (this.needsAccount(player)) return;
        var seconds = parseInt(opts);
        if (!(seconds > 0)) seconds = settings.clipDefault;
        seconds = Math.min(Math.max(seconds, settings.clipMin), ReplayTiers.for(player.adminRoles).clipMax);

        var wait = (this.lastClipBy[client.id] ?? -Infinity) + settings.clipCooldownMs - Date.now();
        if (wait > 0) return client.commandFeedback(`Clip cooldown, try again in ${Math.ceil(wait / 1000)}s.`);
        this.lastClipBy[client.id] = Date.now();

        try {
            var t0 = performance.now();
            var file = await this.makeClip(seconds);
            if (settings.profile) this.time('clip', performance.now() - t0);
            this.sendFile(client, file);
            client.commandFeedback(`Clip of the last ${seconds}s sent (${Math.ceil(file.length / 1024)}KB).`);
        } catch (e) {
            console.log("[legacyreplay] clip failed:", e);
            client.commandFeedback("Couldn't make a clip: " + e.message);
        };
    };

    //tells the client whether it is recording (it shows a badge), and for how long at most
    sendStatus(client, on, maxMs) {
        var message = new Uint8Array(4), view = new DataView(message.buffer);
        view.setUint8(0, Comm.Code.replayStatus);
        view.setUint8(1, on ? 1 : 0);
        view.setUint16(2, Math.min(0xffff, Math.round(maxMs / 1000)), true);
        client.sendMsgToWs(message);
    };

    startHold(player) {
        var client = player.client, tier = ReplayTiers.for(player.adminRoles);
        if (this.needsAccount(player)) return;
        if (this.hold) return client.commandFeedback(this.hold.by === client.id ? "Already recording. /replay stop saves it." : "Someone is already recording this game.");

        this.lastKeyframe = -Infinity; //a new keyframe now, so the recording starts at this moment
        this.keyframe();
        var record = null;
        for (var i = this.records.length - 1; i >= 0 && !record; i--) if (this.records[i].type === ReplayFormat.Type.keyframe) record = this.records[i];
        if (!record) return client.commandFeedback("Not ready yet, try again in a moment.");

        this.hold = { by: client.id, record, fromMs: record.tMs, maxMs: tier.recordMs, maxBytes: tier.recordBytes };
        this.sendStatus(client, true, tier.recordMs);
        client.commandFeedback(`Recording the whole game, up to ${Math.round(tier.recordMs / 60e3)} minutes. /replay stop saves it.`);
    };

    //saves the recording and sends it to whoever started it (nobody to send it to if they have left, it is just dropped)
    async stopHold(note) {
        var hold = this.hold;
        if (!hold) return;
        this.hold = null;
        var client = this.room.clients_by_id?.[hold.by];
        if (!client) return;
        this.sendStatus(client, false, 0);
        try {
            var from = this.records.indexOf(hold.record);
            if (from < 0) throw new Error("it was cut off");
            var file = await this.makeFrom(from);
            if (file.length > ReplayFormat.Limits.maxFile) throw new Error("it got too big to save");
            this.sendFile(client, file);
            client.commandFeedback((note || "Recording saved") + ` (${Math.ceil(file.length / 1024)}KB).`);
        } catch (e) {
            console.log("[legacyreplay] recording failed:", e);
            client.commandFeedback("Couldn't save the recording: " + e.message);
        };
    };

    checkHold() {
        var hold = this.hold;
        if (!this.room.clients_by_id?.[hold.by]) return this.hold = null; //they left
        if (this.now() - hold.fromMs > hold.maxMs) this.stopHold("That is as long as a recording goes, saved");
        else if (this.bytes > hold.maxBytes) this.stopHold("The recording got too big, saved up to here");
    };

    //numbers for bench-recorder.js, so the cost of the recorder can be read off instead of guessed
    statsText(reset) {
        var s = this.stats, ms = (n) => n.toFixed(n < 1 ? 3 : 1), per = (total, n) => n ? ms(total / n) : "-";
        var text = `syncs ${s.syncs} avg ${per(s.syncMs, s.syncs)}ms max ${ms(s.syncMax)}ms | adds ${s.adds} avg ${per(s.addMs, s.adds)}ms max ${ms(s.addMax)}ms | keyframes ${s.keyframes} avg ${per(s.keyframeMs, s.keyframes)}ms max ${ms(s.keyframeMax)}ms | clips ${s.clips} avg ${per(s.clipMs, s.clips)}ms | buffer ${(this.bytes / 1048576).toFixed(2)}MB ${this.records.length} records | loop delay p50 ${(loopDelay.percentile(50) / 1e6).toFixed(1)}ms p99 ${(loopDelay.percentile(99) / 1e6).toFixed(1)}ms max ${(loopDelay.max / 1e6).toFixed(1)}ms | heap ${(process.memoryUsage().heapUsed / 1048576).toFixed(0)}MB`;
        if (reset) this.stats = newStats(), loopDelay.reset();
        return text;
    };
};

export const Recorder = {
    registerListeners: function (pluginManager) {
        this.plugins = pluginManager;

        this.plugins.on('game:roomInitEnd', async (data) => { //the recorder is made here (not lazily mid game) so claiming a type can't happen in the middle of anything else
            await this.plugins.emit('replayRecorderCreated', { this: data.this, recorder: RoomRecorder.get(data.this) });
        });

        //the packet only carries 8 modifiers, in tenths. a replay predicts everyone between syncs, so it needs the rest (physics speed, reload...) and the exact values
        this.plugins.on('game:packModifiers', (data) => {
            if (settings.enabled) Object.assign(data.extra, data.this.player.modifiers);
        });

        this.plugins.on('game:sendToAll', (data) => {
            if (!settings.enabled) return;
            var recorder = RoomRecorder.get(data.this);
            if (data.debug === "sync") { //the room's own sync, as it goes out
                if (!recorder.sources[ReplayFormat.Type.sync]) recorder.addOutput(data.output, ReplayFormat.Type.sync);
            } else {
                recorder.addOutput(data.output);
                if (data.debug === "die") recorder.addKill(data.output);
            };
        });
        this.plugins.on('game:roomSync', (data) => { if (settings.enabled) RoomRecorder.get(data.this).runSources() });
        this.plugins.on('game:sendToOthers', (data) => { if (settings.enabled) RoomRecorder.get(data.this).addOutput(data.output) });
        //sendToOne is left out for now, only pov mode wants it (hitMe, ammo) and that comes later

        this.plugins.on('game:roomUpdate', (data) => {
            var recorder = RoomRecorder.get(data.this);
            if (settings.enabled && recorder.now() - recorder.lastKeyframe >= settings.keyframeMs) recorder.keyframe();
            if (recorder.hold) recorder.checkHold();
        });

        this.plugins.on('game:roomDestroy', (data) => recorders.delete(data.this));

        //the main thread tells the room's worker about a caster that has joined or left (see cast.js)
        this.plugins.on('game:adminCommand', ({ payload }) => {
            var room = settings.roomOf();
            if (!room || payload?.replayCast === undefined && payload?.replayCastStop === undefined) return;
            var recorder = RoomRecorder.get(room);
            if (payload.replayCast !== undefined) recorder.addCaster(payload.replayCast);
            else recorder.removeCaster(payload.replayCastStop);
        });

        ReplayShared.serverClip = (room, player, opts) => RoomRecorder.get(room).clip(player, opts);
        ReplayShared.serverRecord = (room, player) => RoomRecorder.get(room).startHold(player);
        ReplayShared.serverStop = (room, player) => {
            var recorder = RoomRecorder.get(room);
            if (!recorder.hold || recorder.hold.by !== player.client.id) return player.client.commandFeedback("You aren't recording.");
            recorder.stopHold();
        };
    },
};
