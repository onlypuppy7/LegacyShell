//legacyshell: recorder overhead. node plugins_default/legacyreplay/bench-recorder.js
//fake room, but real packet sizes: 18 players, a sync broadcast at 10Hz (~51 bytes a player), plus fire/hit/chat style small packets
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import Comm from '#comm';
import { ReplayFormat as F } from './format.js';
import { RoomRecorder, settings } from './recorder.js';
settings.profile = true;

Comm.Code.replayChunk = Comm.Code.replayChunk ?? 55;

const players = 18, secondsSimulated = 180;
const room = {
    mapId: 3, gameType: 0, minMap: { name: "Dirt", data: new Array(60000).fill(1) },
    clients_by_id: Array.from({ length: players }, (_, id) => ({ id, nickname: "player" + id, clientIsReady: true, sendMsgToWs() { }, commandFeedback() { } })),
    packAllPlayers: (out) => { for (let i = 0; i < players; i++) for (let b = 0; b < 70; b++) out.packInt8U(b) },
    packAllItems: (out) => { for (let b = 0; b < 300; b++) out.packInt8U(b) },
    packUpdateRoomParams: (out) => { out.packLongString("{}") },
    packRoundUpdate: (out) => { out.packInt8U(1) },
};

const syncPacket = () => { const o = new Comm.Out(); for (let i = 0; i < players * 51; i++) o.packInt8U(i); return o };
const smallPacket = () => { const o = new Comm.Out(); for (let i = 0; i < 20; i++) o.packInt8U(i); return o };

function time(fn, n) {
    const start = performance.now();
    for (let i = 0; i < n; i++) fn(i);
    return (performance.now() - start) / n;
};

//what the recorder adds per call on the room's hot path (the packet is already built, so only the copy + push count)
const sync = syncPacket(), small = smallPacket();
const rec = new RoomRecorder(room);
console.log("addOutput, 918 byte sync packet :", (time(() => rec.addOutput(sync), 20000) * 1000).toFixed(2), "us/call");
console.log("addOutput, 20 byte small packet :", (time(() => rec.addOutput(small), 50000) * 1000).toFixed(2), "us/call");

//a whole room for 3 minutes: per second 10 syncs, ~40 small packets. fake the clock so it runs instantly
const sim = new RoomRecorder(room);
let fakeNow = 0, realNow = Date.now;
Date.now = () => realNow() + fakeNow;
sim.startTime = Date.now();
const cost = { add: 0, keyframe: 0, trim: 0 }, trimTimes = [];
for (let tick = 0; tick < secondsSimulated * 100; tick++) { //100 steps a second
    fakeNow += 10;
    let t0 = performance.now();
    if (tick % 10 === 0) sim.addOutput(sync);
    if (tick % 3 === 0) { sim.addOutput(small); sim.addOutput(small) };
    cost.add += performance.now() - t0;
    if (sim.now() - sim.lastKeyframe >= settings.keyframeMs) {
        t0 = performance.now();
        sim.keyframe();
        cost.keyframe += performance.now() - t0;
    };
};
Date.now = realNow;
const keyframes = sim.records.filter(r => r.type === F.Type.keyframe).length;
console.log("\n3 min of a full 18 player room:");
console.log("  buffer:", sim.records.length, "records,", (sim.bytes / 1024 / 1024).toFixed(2), "MB in memory");
console.log("  add total:", cost.add.toFixed(1), "ms over 180s =", (cost.add / secondsSimulated).toFixed(3), "ms per second of game");
console.log("  keyframe+trim (fake pack functions, no logging):", (cost.keyframe / keyframes * 1000).toFixed(0), "us each,", keyframes, "kept");

//trim on its own, worst case (full window)
console.log("  trim, full buffer:", (time(() => sim.trim(), 200) * 1000).toFixed(0), "us");

//making a clip: how long the event loop is actually blocked (gzip itself runs off thread)
for (const seconds of [30, 60]) {
    const hist = monitorEventLoopDelay({ resolution: 1 });
    hist.enable();
    const t0 = performance.now();
    const file = await sim.makeClip(seconds);
    const total = performance.now() - t0;
    await new Promise(r => setTimeout(r, 20));
    hist.disable();
    console.log(`  /clip ${seconds}s: ${total.toFixed(0)}ms wall, ${(file.length / 1024).toFixed(0)}KB file, worst event loop stall ${(hist.max / 1e6).toFixed(1)}ms`);
};

//and the per tick budget for scale: a room tick is 16.7ms
console.log("\nroom tick budget is 16.7ms (60Hz), recorder adds", (cost.add / secondsSimulated / 60 * 1000).toFixed(1), "us per tick on average");
