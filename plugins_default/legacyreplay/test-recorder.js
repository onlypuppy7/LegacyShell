//legacyshell: recorder test against a fake room. node plugins_default/legacyreplay/test-recorder.js
import assert from 'node:assert/strict';
import Comm from '#comm';
import { ReplayFormat as F } from './format.js';
import { plugins } from '#plugins';
import { ReplayShared } from './shared.js';
import { sampleHeader } from './test-support.js';
import { RoomRecorder, Recorder, settings, transport } from './recorder.js';

settings.profile = true; //the claim test reads the numbers
var passed = 0;
async function test(name, fn) {
    try {
        await fn();
        passed++;
        console.log("ok   ", name);
    } catch (e) {
        console.log("FAIL ", name, "\n", e);
        process.exitCode = 1;
    };
};

Comm.Code.replayChunk = Comm.Code.replayChunk ?? 55; //normally added by the room's permissions setup
Comm.Code.replayStatus = Comm.Code.replayStatus ?? 56;
Comm.Code.replayLive = Comm.Code.replayLive ?? 57;

const sent = [];
const fakeClient = (id) => ({ id, nickname: "player" + id, clientIsReady: true, commandFeedback: (t) => sent.push(["feedback", t]), sendMsgToWs: (m) => sent.push(["ws", m]) });

function fakeRoom() {
    const room = {
        mapId: 3, gameType: 0, minMap: { name: "Dirt", data: [[[1]]] },
        clients_by_id: [fakeClient(0), fakeClient(1)],
        packAllPlayers: (out) => { out.packInt8U(Comm.Code.addPlayer); out.packString("a") },
        packAllItems: (out) => { out.packInt8U(Comm.Code.spawnItem) },
        packUpdateRoomParams: (out) => { out.packInt8U(Comm.Code.updateRoomParams) },
        packRoundUpdate: (out) => { out.packInt8U(Comm.Code.roundUpdate) },
    };
    return room;
};

const packet = (code) => { const o = new Comm.Out(); o.packInt8U(code); o.packInt16U(1234); return o };

await test("keyframes, packets, and a clip that parses", async () => {
    const rec = new RoomRecorder(fakeRoom());
    rec.startTime = Date.now() - 20e3;
    rec.keyframe();
    for (let i = 0; i < 50; i++) rec.addOutput(packet(Comm.Code.sync));
    rec.addOutput(new Comm.Out()); //empty outputs are skipped
    assert.equal(rec.records.length, 51);

    const file = await rec.makeClip(30);
    const res = F.parse(await F.unpack(file));
    assert.equal(res.error, null);
    assert.equal(res.header.mapName, "Dirt");
    assert.equal(res.header.map.name, "Dirt");
    assert.equal(res.header.mapHash.length, 64);
    assert.deepEqual(res.header.players.map(p => p.name), ["player0", "player1"]);
    assert.equal(res.records[0].type, F.Type.keyframe);
    assert.equal(res.records[0].tMs, 0);
    assert.equal(res.records.length, 51);
    assert.equal(res.records[1].data[0], Comm.Code.sync);
});

await test("the room's own sync is recorded as a sync record, everything else as packets", async () => {
    const room = fakeRoom();
    const handlers = {};
    Recorder.registerListeners({ on: (event, fn) => handlers[event] = fn, emit: async () => { } });
    const out = (code) => { const o = new Comm.Out(); o.packInt8U(code); return o };
    handlers['game:sendToAll']({ this: room, output: out(Comm.Code.sync), debug: "sync" });
    handlers['game:sendToAll']({ this: room, output: out(Comm.Code.die), debug: "die" });
    handlers['game:sendToOthers']({ this: room, output: out(Comm.Code.chat) });
    assert.deepEqual(RoomRecorder.get(room).records.map(r => r.type), [F.Type.sync, F.Type.packets, F.Type.packets]);
});

await test("a kill is recorded as a marker after the die packet", async () => {
    const room = fakeRoom();
    const handlers = {};
    Recorder.registerListeners({ on: (event, fn) => handlers[event] = fn, emit: async () => { } });
    const die = new Comm.Out(); die.packInt8U(Comm.Code.die); die.packInt8U(7); die.packInt8U(52); die.packInt8U(5);
    handlers['game:sendToAll']({ this: room, output: die, debug: "die" });
    const records = RoomRecorder.get(room).records;
    assert.deepEqual(records.map(r => r.type), [F.Type.packets, F.Type.marker]);
    const w = new F.Writer(sampleHeader());
    records.forEach(r => w.add(r.type, 0, r.data));
    const parsed = F.parse(w.finish());
    assert.deepEqual(parsed.records[1].data, { label: "kill", kind: "kill", a: 52, b: 7 }); //52 killed 7
});

await test("claim: a claimed type is packed by the claimer each cycle and the default is skipped", async () => {
    const room = fakeRoom();
    const handlers = {};
    Recorder.registerListeners({ on: (event, fn) => handlers[event] = fn, emit: async () => { } });
    const rec = RoomRecorder.get(room);
    let seen = null;
    rec.claim(F.Type.sync, (r) => { seen = r; return new Uint8Array(47) });
    handlers['game:sendToAll']({ this: room, output: (() => { const o = new Comm.Out(); o.packInt8U(6); return o })(), debug: "sync" }); //default recording is skipped
    assert.equal(rec.records.length, 0);
    handlers['game:roomSync']({ this: room });
    assert.equal(seen, room);
    assert.equal(rec.records.length, 1);
    assert.equal(rec.records[0].type, F.Type.sync);
    assert.equal(rec.records[0].data.length, 47);
    assert.equal(rec.stats.syncs, 1);
    rec.claim(F.Type.sync, () => null); //nothing returned = nothing recorded this cycle
    handlers['game:roomSync']({ this: room });
    assert.equal(rec.records.length, 1);
});

await test("roomInitEnd tells other plugins the recorder exists", async () => {
    const room = fakeRoom();
    const handlers = {}, emitted = [];
    Recorder.registerListeners({ on: (event, fn) => handlers[event] = fn, emit: async (event, data) => emitted.push([event, data]) });
    await handlers['game:roomInitEnd']({ this: room });
    assert.equal(emitted[0][0], 'replayRecorderCreated');
    assert.equal(emitted[0][1].recorder, RoomRecorder.get(room));
});

await test("keyframe leaves the shared plugins.cancel flag as it found it", async () => {
    const room = fakeRoom();
    room.packAllPlayers = (out) => { plugins.cancel = false; out.packInt8U(1) }; //what emit does at the top
    const rec = new RoomRecorder(room);
    plugins.cancel = true; //say another plugin has just cancelled the default sync
    rec.keyframe();
    assert.equal(plugins.cancel, true);
    plugins.cancel = false;
    rec.keyframe();
    assert.equal(plugins.cancel, false);
});

await test("no keyframe yet = no clip", async () => {
    const rec = new RoomRecorder(fakeRoom());
    rec.addOutput(packet(Comm.Code.sync));
    await assert.rejects(() => rec.makeClip(30), /nothing recorded/);
});

await test("keyframe waits for a ready client", async () => {
    const room = fakeRoom();
    room.clients_by_id.forEach(c => c.clientIsReady = false);
    const rec = new RoomRecorder(room);
    rec.keyframe();
    assert.equal(rec.records.length, 0);
});

await test("clip starts at the keyframe at or before the cut, not after", async () => {
    const rec = new RoomRecorder(fakeRoom());
    rec.startTime = Date.now() - 60e3;
    //keyframes at 0s, 10s, 20s, 30s, 40s, 50s with a packet 1s after each
    for (let t = 0; t <= 50; t += 10) {
        rec.records.push({ type: F.Type.keyframe, tMs: t * 1e3, data: new Uint8Array([1]) });
        rec.records.push({ type: F.Type.packets, tMs: t * 1e3 + 1e3, data: new Uint8Array([2]) });
    };
    const res = F.parse(await F.unpack(await rec.makeClip(25))); //cut is at ~35s, so it should start at the 30s keyframe
    assert.equal(res.records.length, 6);
    assert.equal(res.records[0].type, F.Type.keyframe);
    assert.equal(res.records[0].tMs, 0);
    const wide = F.parse(await F.unpack(await rec.makeClip(600))); //asking for more than exists gives everything
    assert.equal(wide.records.length, 12);
});

await test("trim keeps a keyframe at the front and drops the rest", async () => {
    const rec = new RoomRecorder(fakeRoom());
    rec.startTime = Date.now() - 10 * 60e3;
    for (let t = 0; t <= 600; t += 5) {
        rec.records.push({ type: F.Type.keyframe, tMs: t * 1e3, data: new Uint8Array(10) });
        rec.records.push({ type: F.Type.packets, tMs: t * 1e3 + 100, data: new Uint8Array(10) });
    };
    rec.bytes = rec.records.length * 19;
    rec.trim();
    assert.equal(rec.records[0].type, F.Type.keyframe);
    assert.ok(rec.now() - rec.records[0].tMs >= settings.windowMs);
    assert.ok(rec.now() - rec.records[0].tMs < settings.windowMs + 10e3);
    assert.equal(rec.bytes, rec.records.reduce((n, r) => n + r.data.length + 9, 0));
});

await test("byte cap shrinks the window", async () => {
    const rec = new RoomRecorder(fakeRoom());
    rec.startTime = Date.now() - 60e3;
    for (let t = 0; t <= 60; t += 5) rec.records.push({ type: F.Type.keyframe, tMs: t * 1e3, data: new Uint8Array(1024 * 1024) }), rec.bytes += 1024 * 1024 + 9;
    rec.trim();
    assert.ok(rec.bytes <= settings.maxBytes);
    assert.equal(rec.records[0].type, F.Type.keyframe);
});

await test("sendFile chunks reassemble to the same bytes", async () => {
    const rec = new RoomRecorder(fakeRoom());
    const file = new Uint8Array(100_000).map((_, i) => i * 7);
    sent.length = 0;
    rec.sendFile(rec.room.clients_by_id[0], file);
    const parts = [];
    for (const [kind, msg] of sent) {
        assert.equal(kind, "ws");
        const view = new DataView(msg.buffer);
        assert.equal(view.getUint8(0), Comm.Code.replayChunk);
        const idx = view.getUint16(3, true), count = view.getUint16(5, true), len = view.getUint16(7, true);
        assert.equal(count, Math.ceil(100_000 / ReplayShared.chunkSize));
        assert.equal(msg.length, ReplayShared.chunkHeaderSize + len);
        parts[idx] = msg.subarray(ReplayShared.chunkHeaderSize);
    };
    assert.deepEqual(F.concat(parts), file);
});

await test("/clip: default length, clamping, cooldown", async () => {
    const rec = new RoomRecorder(fakeRoom());
    rec.records.push({ type: F.Type.keyframe, tMs: 0, data: new Uint8Array([1]) });
    const player = { client: rec.room.clients_by_id[0] };
    sent.length = 0;
    await rec.clip(player, "");
    assert.ok(sent.some(([k, t]) => k === "feedback" && /last 30s/.test(t)));
    sent.length = 0;
    await rec.clip(player, "5000"); //still on cooldown
    assert.ok(sent.some(([k, t]) => k === "feedback" && /cooldown/.test(t)));
    rec.lastClipBy = {};
    sent.length = 0;
    await rec.clip(player, "5000");
    assert.ok(sent.some(([k, t]) => k === "feedback" && /last 60s/.test(t)));
    rec.lastClipBy = {};
    sent.length = 0;
    await rec.clip(player, "1");
    assert.ok(sent.some(([k, t]) => k === "feedback" && /last 5s/.test(t)));
});

await test("huge map is left out of the header", async () => {
    const room = fakeRoom();
    room.minMap = { name: "big", data: "x".repeat(settings.maxMapBytes + 10) };
    const rec = new RoomRecorder(room);
    rec.records.push({ type: F.Type.keyframe, tMs: 0, data: new Uint8Array([1]) });
    const res = F.parse(await F.unpack(await rec.makeClip(30)));
    assert.equal(res.header.map, null);
    assert.equal(res.header.mapHash.length, 64);
});


await test("/clip: the longest a clip goes depends on the rank", async () => {
    const rec = new RoomRecorder(fakeRoom());
    rec.records.push({ type: F.Type.keyframe, tMs: 0, data: new Uint8Array([1]) });
    for (const [adminRoles, longest] of [[0, 60], [10, 120], [20, 300]]) {
        rec.lastClipBy = {};
        sent.length = 0;
        await rec.clip({ client: rec.room.clients_by_id[0], adminRoles }, "100000");
        assert.ok(sent.some(([k, t]) => k === "feedback" && t.includes("last " + longest + "s")), adminRoles + " " + JSON.stringify(sent.filter((x) => x[0] === "feedback")));
    };
});

const status = () => sent.filter(([k, m]) => k === "ws" && m[0] === Comm.Code.replayStatus).map(([k, m]) => [m[1], m[2] | (m[3] << 8)]);

await test("whole game: starts at a fresh keyframe, keeps everything past the window, and stop sends it all", async () => {
    const rec = new RoomRecorder(fakeRoom());
    rec.startTime = Date.now() - 60e3;
    const player = { client: rec.room.clients_by_id[0], adminRoles: 0 };
    sent.length = 0;
    rec.startHold(player);
    assert.ok(rec.hold && rec.hold.record.type === F.Type.keyframe);
    assert.deepEqual(status(), [[1, 600]]); //ten minutes for a member
    const first = rec.hold.fromMs;
    for (let i = 0; i < 20; i++) { rec.addOutput(packet(Comm.Code.sync)); rec.startTime -= 30e3; rec.keyframe() }; //ten minutes on, far past the rolling window
    rec.trim();
    assert.ok(rec.records.includes(rec.hold.record), "the start is still there");
    assert.equal(rec.records[0].tMs <= first, true);
    sent.length = 0;
    await rec.stopHold();
    assert.deepEqual(status(), [[0, 0]]);
    const chunks = sent.filter(([k, m]) => k === "ws" && m[0] === Comm.Code.replayChunk).map(([k, m]) => m);
    assert.ok(chunks.length >= 1);
    assert.equal(rec.hold, null);
    //without the hold the next trim goes back to the window
    rec.trim();
    assert.ok(rec.records[0].tMs >= rec.now() - settings.windowMs - settings.keyframeMs - 40e3 || rec.records.length < 30);
});

await test("whole game: only the one who started it can stop it, and a second start is refused", async () => {
    const rec = new RoomRecorder(fakeRoom());
    rec.startTime = Date.now() - 5e3;
    const a = { client: rec.room.clients_by_id[0], adminRoles: 0 }, b = { client: rec.room.clients_by_id[1], adminRoles: 0 };
    rec.startHold(a);
    sent.length = 0;
    rec.startHold(b);
    assert.ok(sent.some(([k, t]) => k === "feedback" && /already recording/i.test(t)));
    sent.length = 0;
    rec.startHold(a);
    assert.ok(sent.some(([k, t]) => k === "feedback" && /Already recording/.test(t)));
});

await test("whole game: the limit for the rank stops it and saves what there is", async () => {
    const rec = new RoomRecorder(fakeRoom());
    rec.startTime = Date.now() - 5e3;
    rec.startHold({ client: rec.room.clients_by_id[0], adminRoles: 0 });
    rec.hold.maxMs = 1000;
    rec.startTime -= 5000; //past it
    sent.length = 0;
    rec.checkHold();
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(rec.hold, null);
    assert.ok(sent.some(([k, t]) => k === "feedback" && /as long as a recording goes/.test(t)));

    rec.startHold({ client: rec.room.clients_by_id[0], adminRoles: 0 });
    rec.hold.maxBytes = 10;
    rec.addOutput(packet(Comm.Code.sync));
    sent.length = 0;
    rec.checkHold();
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(sent.some(([k, t]) => k === "feedback" && /too big/.test(t)));
});

await test("whole game: leaving drops it, nothing is sent", async () => {
    const room = fakeRoom();
    const rec = new RoomRecorder(room);
    rec.startTime = Date.now() - 5e3;
    rec.startHold({ client: room.clients_by_id[0], adminRoles: 0 });
    room.clients_by_id = [null, room.clients_by_id[1]];
    sent.length = 0;
    rec.checkHold();
    assert.equal(rec.hold, null);
    assert.equal(sent.length, 0);
});

await test("whole game: the rank sets how long (ten minutes, forty five, three hours)", async () => {
    for (const [adminRoles, seconds] of [[0, 600], [10, 2700], [20, 10800]]) {
        const rec = new RoomRecorder(fakeRoom());
        rec.startTime = Date.now() - 5e3;
        sent.length = 0;
        rec.startHold({ client: rec.room.clients_by_id[0], adminRoles });
        assert.deepEqual(status(), [[1, seconds]]);
    };
});

await test("the header carries what players have equipped, once each, and skips what can't be plain data", async () => {
    const room = fakeRoom();
    const loop = { id: 7 }; loop.self = loop;
    room.clients_by_id[0].player = { primaryWeaponItem: { id: 1, name: "gun" }, secondaryWeaponItem: { id: 2 }, hatItem: null, stampItem: loop };
    room.clients_by_id[1].player = { primaryWeaponItem: { id: 1, name: "gun" }, secondaryWeaponItem: { id: 3, big: "x".repeat(5000) }, hatItem: { id: 4 } };
    const rec = new RoomRecorder(room);
    rec.records.push({ type: F.Type.keyframe, tMs: 0, data: new Uint8Array([1]) });
    const res = F.parse(await F.unpack(await rec.makeClip(30)));
    assert.deepEqual(res.header.items.map((i) => i.id).sort(), [1, 2, 4]);
    assert.equal(res.header.items.find((i) => i.id === 1).name, "gun");
});

await test("clips are signed through services, and still come out whole if signing can't be done", async () => {
    const original = settings.sign;
    try {
        const makeRec = () => { const rec = new RoomRecorder(fakeRoom()); rec.records.push({ type: F.Type.keyframe, tMs: 0, data: new Uint8Array([1]) }); rec.records.push({ type: F.Type.packets, tMs: 500, data: new Uint8Array([2]) }); return rec };
        let asked = null;
        settings.sign = async (digest) => { asked = digest; return { keyId: "k1", signature: "c2ln", signedAt: 5, serverName: "srv" } };
        let res = F.parse(await F.unpack(await makeRec().makeClip(30)));
        assert.equal(res.error, null);
        assert.equal(res.signature.keyId, "k1");
        assert.match(asked, /^[a-f0-9]{64}$/);
        assert.equal(res.records.length, 2);

        settings.sign = async () => { throw new Error("services is down") };
        res = F.parse(await F.unpack(await makeRec().makeClip(30)));
        assert.equal(res.error, null);
        assert.equal(res.signature, null);
        assert.equal(res.records.length, 2);

        settings.sign = async () => null; //no key / no services configured
        assert.equal(F.parse(await F.unpack(await makeRec().makeClip(30))).signature, null);

        settings.signing = false;
        settings.sign = async () => { throw new Error("must not be asked") };
        assert.equal(F.parse(await F.unpack(await makeRec().makeClip(30))).signature, null);
    } finally {
        settings.sign = original;
        settings.signing = true;
    };
});

const live = [];
transport.send = (wsId, bytes) => live.push([wsId, bytes]);
const readLive = (m) => m[1] === 0 ? { kind: "header", header: JSON.parse(new TextDecoder().decode(m.subarray(2))) } : { kind: "record", type: m[2], tMs: new DataView(m.buffer, m.byteOffset).getUint32(3, true), data: m.subarray(7) };

await test("live: a caster gets the header, a fresh keyframe, then every record as it is recorded", async () => {
    const rec = new RoomRecorder(fakeRoom());
    rec.startTime = Date.now() - 30e3;
    rec.keyframe();
    rec.addOutput(packet(Comm.Code.sync)); //before the caster, after an older keyframe
    live.length = 0;
    rec.addCaster(7);
    const first = live.map(([id, m]) => readLive(m));
    assert.ok(live.every(([id]) => id === 7));
    assert.equal(first[0].kind, "header");
    assert.equal(first[0].header.mapName, "Dirt");
    assert.equal(F.cleanHeader(first[0].header).mapName, "Dirt"); //the reader takes it as it is (it needs the version)
    assert.equal(first[1].type, F.Type.keyframe);
    assert.equal(first[1].tMs, 0); //their copy starts at the keyframe
    assert.equal(live[0][1][0], Comm.Code.replayLive);

    live.length = 0;
    rec.addOutput(packet(Comm.Code.sync));
    rec.add(F.Type.marker, F.markerBytes({ label: "kill", kind: "kill", a: 1, b: 2 }));
    rec.add(F.Type.playerPackets, new Uint8Array([3, 4]));
    const more = live.map(([id, m]) => readLive(m));
    assert.deepEqual(more.map((r) => r.type), [F.Type.packets, F.Type.marker]); //the one for a single player isn't sent
    assert.ok(more[0].tMs >= 0 && more[0].tMs < 5000);
    assert.equal(more[0].data[0], Comm.Code.sync);
});

await test("live: what a caster is sent is a replay the viewer can play", async () => {
    const rec = new RoomRecorder(fakeRoom());
    rec.startTime = Date.now() - 10e3;
    rec.keyframe();
    live.length = 0;
    rec.addCaster(1);
    for (let i = 0; i < 5; i++) rec.addOutput(packet(Comm.Code.sync));
    const messages = live.map(([id, m]) => readLive(m));
    const writer = new F.Writer(messages[0].header);
    messages.slice(1).forEach((r) => writer.add(r.type, r.tMs, r.data));
    const res = F.parse(await F.unpack(await F.pack(writer.finish())));
    assert.equal(res.error, null);
    assert.equal(res.records.length, 6);
    assert.equal(res.records[0].type, F.Type.keyframe);
});

await test("live: casters can leave, are capped, and are told apart by socket", async () => {
    const rec = new RoomRecorder(fakeRoom());
    rec.startTime = Date.now() - 10e3;
    rec.keyframe();
    for (let id = 1; id <= 9; id++) rec.addCaster(id);
    assert.equal(rec.casters.size, 6);
    rec.addCaster(1); //already there
    assert.equal(rec.casters.size, 6);
    rec.removeCaster(1);
    live.length = 0;
    rec.addOutput(packet(Comm.Code.sync));
    assert.deepEqual(live.map(([id]) => id).sort(), [2, 3, 4, 5, 6]);
});

await test("live: the main thread's messages reach the recorder (cast.js posts adminCommand)", async () => {
    const room = fakeRoom();
    const handlers = {};
    Recorder.registerListeners({ on: (event, fn) => handlers[event] = fn, emit: async () => { } });
    settings.roomOf = () => room;
    const rec = RoomRecorder.get(room);
    rec.startTime = Date.now() - 5e3;
    handlers['game:adminCommand']({ payload: { replayCast: 4 } });
    assert.ok(rec.casters.has(4));
    handlers['game:adminCommand']({ payload: { somethingElse: true } }); //another plugin's command is left alone
    handlers['game:adminCommand']({ payload: { replayCastStop: 4 } });
    assert.equal(rec.casters.size, 0);
});

await test("public rooms want a signed in account for a clip or a recording, private rooms don't", async () => {
    const make = (joinType, loggedIn) => { const room = fakeRoom(); room.joinType = joinType; room.clients_by_id[0].loggedIn = loggedIn; const rec = new RoomRecorder(room); rec.startTime = Date.now() - 5e3; rec.keyframe(); return rec };
    for (const [joinType, loggedIn, allowed] of [[Comm.Code.joinPublicGame, false, false], [Comm.Code.joinPublicGame, true, true], [Comm.Code.joinPrivateGame, false, true], [Comm.Code.createPrivateGame, false, true]]) {
        const rec = make(joinType, loggedIn), player = { client: rec.room.clients_by_id[0], adminRoles: 0 };
        sent.length = 0;
        await rec.clip(player, "");
        assert.equal(!sent.some(([k, text]) => k === "feedback" && /Sign in/.test(text)), allowed, "clip " + joinType + loggedIn);
        sent.length = 0;
        rec.startHold(player);
        assert.equal(!sent.some(([k, text]) => k === "feedback" && /Sign in/.test(text)), allowed, "record " + joinType + loggedIn);
        assert.equal(!!rec.hold, allowed);
    };
});

console.log(passed + " passed");
