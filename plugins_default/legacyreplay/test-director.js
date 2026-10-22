//legacyshell: replay director tests. node plugins_default/legacyreplay/test-director.js
import assert from 'node:assert/strict';
import Comm from '#comm';
import { ReplayFormat as F } from './format.js';
import { ReplayDirector as D } from './director.js';
import { sampleHeader } from './test-support.js';

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

const i16 = (v) => { const n = Math.round(v * 300) & 0xffff; return [n & 255, n >> 8] };

//a sync record: one entry per player, [id, x, y, z, dy]
const syncRecord = (players) => {
    const entry = F.syncEntrySize(6);
    const out = new Uint8Array(entry * players.length);
    players.forEach(([id, x, y, z, dy = 0], n) => {
        const base = n * entry;
        out[base] = Comm.Code.sync; out[base + 1] = id;
        [x, y, z, 0, dy, 0].forEach((v, k) => out.set(i16(v), base + 3 + k * 2));
    });
    return out;
};
const fire = (id, pos, dir) => new Uint8Array([Comm.Code.fire, id, ...pos.flatMap(i16), ...dir.flatMap(i16), 7]);
const die = (victim, killer) => new Uint8Array([Comm.Code.die, victim, killer, 5]);
const hit = (id, hp) => new Uint8Array([Comm.Code.hitThem, id, hp, ...i16(0), ...i16(0), 1, 0]);

//players: 0 and 3 are shooters, 1 and 2 are victims, all standing still
function recording(build) {
    const w = new F.Writer({ ...sampleHeader(), players: [0, 1, 2, 3].map((id) => ({ id, name: "p" + id })) });
    w.add(F.Type.keyframe, 0, new Uint8Array([1]));
    const events = [];
    build({
        at: (t, type, data) => events.push([t, type, data]),
        marker: (t, a, b) => events.push([t, F.Type.marker, F.markerBytes({ label: "kill", kind: "kill", a, b })]),
    });
    for (let t = 0; t <= 40000; t += 100) events.push([t, F.Type.sync, syncRecord([[0, 10, 3, 10], [1, 40, 3, 10], [2, 14, 3, 10], [3, 10, 3, 40]])]);
    events.sort((x, y) => x[0] - y[0]).forEach(([t, type, data]) => w.add(type, t, data));
    const parsed = F.parse(w.finish());
    assert.equal(parsed.error, null);
    return parsed;
}

await test("index finds fires, kills, hits and positions", async () => {
    const { records, header } = recording(({ at, marker }) => {
        at(5000, F.Type.packets, fire(0, [10, 3.4, 10], [1, 0, 0]));
        at(5100, F.Type.packets, hit(1, 60));
        at(5700, F.Type.packets, die(1, 0));
        marker(5700, 0, 1);
    });
    const index = D.index(records, header);
    assert.equal(index.fires.length, 1);
    assert.equal(index.fires[0].shooter, 0);
    assert.ok(Math.abs(index.fires[0].pos[0] - 10) < 0.01 && Math.abs(index.fires[0].dir[0] - 1) < 0.01);
    assert.deepEqual(index.hits.map(h => [h.id, h.hp]), [[1, 60]]);
    assert.deepEqual(index.kills.map(k => [k.killer, k.victim]), [[0, 1]]);
    const p = D.at(index, 1, 5700);
    assert.ok(Math.abs(p.x - 40) < 0.01 && Math.abs(p.z - 10) < 0.01);
    assert.equal(D.at(index, 99, 100), null);
});

await test("walk stops at a command it doesnt know the length of, and at a cut off one", async () => {
    const seen = [];
    const data = new Uint8Array([...fire(0, [1, 1, 1], [1, 0, 0]), 250, 1, 2, 3, ...die(1, 0)]);
    D.walk(data, (op) => seen.push(op));
    assert.deepEqual(seen, [Comm.Code.fire]); //250 is unknown, so the die after it is never guessed at
    const cut = [];
    D.walk(fire(0, [1, 1, 1], [1, 0, 0]).subarray(0, 10), (op) => cut.push(op));
    assert.deepEqual(cut, []);
});

await test("the fatal fire is the one that was on its way: right line, right flight time", async () => {
    const { records, header } = recording(({ at, marker }) => {
        at(1000, F.Type.packets, fire(0, [10, 3.4, 10], [0, 0, 1])); //wrong direction
        at(5000, F.Type.packets, fire(0, [10, 3.4, 10], [1, 0, 0])); //30 blocks at 45/s = 0.67s before the kill
        at(5300, F.Type.packets, fire(0, [10, 3.4, 10], [1, 0, 0])); //right line but only 0.4s of flight
        marker(5700, 0, 1);
    });
    const index = D.index(records, header);
    const fatal = D.fatalFire(index, index.kills[0]);
    assert.equal(fatal.fire.tMs, 5000);
    assert.ok(Math.abs(fatal.distance - 30) < 0.5);
});

await test("a kill with nothing on its line has no fatal fire", async () => {
    const { records, header } = recording(({ at, marker }) => {
        at(5000, F.Type.packets, fire(0, [10, 3.4, 10], [0, 0, -1]));
        marker(5700, 0, 1);
    });
    const index = D.index(records, header);
    assert.equal(D.fatalFire(index, index.kills[0]), null);
});

await test("scoring: long range, low health, revenge", async () => {
    const { records, header } = recording(({ at, marker }) => {
        at(1000, F.Type.packets, hit(0, 20)); //killer 0 is low
        marker(2000, 0, 1); //long range (30 blocks), low health
        marker(20000, 1, 0); //1 gets back at 0
        marker(20500, 0, 1); //and 0 gets it straight back: revenge
    });
    const kills = D.analyse(D.index(records, header));
    assert.ok(kills[0].why.some(w => /long range/.test(w)));
    assert.ok(kills[0].why.includes("low health"));
    assert.ok(kills[0].score > D.scoring.kill + 10);
    assert.ok(kills[2].why.includes("revenge"));
});

await test("scoring: streaks and ending someone else's", async () => {
    const { records, header } = recording(({ marker }) => {
        [1000, 2000, 3000, 4000, 5000].forEach((t) => marker(t, 0, 1)); //five in a row
        marker(9000, 1, 0); //1 never got a streak, but 0 had one
    });
    const kills = D.analyse(D.index(records, header));
    assert.ok(kills[4].why.includes("5 in a row"));
    assert.ok(kills[5].why.includes("ended a 5 streak"));
});

await test("posthumous: the shooter died with the bullet in the air", async () => {
    const { records, header } = recording(({ at, marker }) => {
        at(5000, F.Type.packets, fire(0, [10, 3.4, 10], [1, 0, 0]));
        marker(5300, 3, 0); //0 is killed by 3 while the bullet flies
        marker(5700, 0, 1); //and the bullet still lands
    });
    const kills = D.analyse(D.index(records, header));
    const landed = kills.find((k) => k.killer === 0);
    assert.ok(landed.posthumous);
    assert.ok(landed.why.includes("killed from beyond"));
    assert.ok(landed.score >= D.scoring.kill + D.scoring.posthumous);
});

await test("moments: kills inside the window join into one multikill, further apart stay separate", async () => {
    const { records, header } = recording(({ marker }) => {
        marker(5000, 0, 1);
        marker(7000, 0, 2);
        marker(20000, 0, 1);
        marker(30000, 3, 2);
    });
    const moments = D.moments(D.index(records, header));
    assert.equal(moments.length, 3);
    assert.equal(moments[0].kills.length, 2);
    assert.ok(moments[0].why.includes("multikill x2"));
    assert.ok(moments[0].score > moments[1].score); //two kills plus the bonus
    assert.equal(moments[0].start, 5000 - D.leadInMs);
    assert.equal(moments[0].end, 7000 + D.tailMs);
});

await test("a self kill is not a moment, a marker is", async () => {
    const { records, header } = recording(({ at, marker }) => {
        marker(5000, 1, 1);
        marker(6000, 255, 2);
        at(9000, F.Type.marker, F.markerBytes({ label: "sick" }));
    });
    const moments = D.moments(D.index(records, header));
    assert.equal(moments.length, 1);
    assert.ok(moments[0].marked);
    assert.equal(moments[0].score, D.scoring.marker);
});

await test("pick: best first, within the length, no overlaps, in time order", async () => {
    const mk = (start, end, score, killer = 0) => ({ killer, kills: [{ victim: 1 }], start, end, score, why: [] });
    const moments = [mk(0, 6000, 30), mk(5000, 9000, 50), mk(10000, 16000, 20), mk(20000, 26000, 40)];
    const picked = D.pick(moments, { who: "all", lengthMs: 16000 });
    assert.ok(picked.reduce((n, m) => n + m.end - m.start, 0) <= 16000);
    for (let i = 1; i < picked.length; i++) assert.ok(picked[i].start >= picked[i - 1].end);
    assert.ok(picked.some(m => m.score === 50)); //the best one is in
    assert.ok(!(picked.some(m => m.score === 30) && picked.some(m => m.score === 50))); //these two overlap
});

await test("pick: who filters to that player's kills and deaths, and repeats are penalised", async () => {
    const mk = (start, killer, victim, score) => ({ killer, kills: [{ victim }], start, end: start + 3000, score, why: [] });
    const moments = [mk(0, 0, 1, 40), mk(5000, 3, 2, 99), mk(10000, 0, 1, 40), mk(15000, 0, 1, 40), mk(20000, 3, 0, 30)];
    const mine = D.pick(moments, { who: 0, lengthMs: 60000 });
    assert.ok(mine.every(m => m.killer === 0 || m.kills[0].victim === 0));
    assert.ok(!mine.some(m => m.start === 5000));
    const tight = D.pick([mk(0, 0, 1, 40), mk(5000, 0, 1, 40), mk(10000, 3, 1, 30)], { who: "all", lengthMs: 6000 });
    assert.ok(tight.some(m => m.killer === 3)); //a second one for 0 loses points for being a repeat, so 3 gets in
});

await test("reel: a long range kill gets the bullet shot, with the bullet's real flight time", async () => {
    const { records, header } = recording(({ at, marker }) => {
        at(5000, F.Type.packets, fire(0, [10, 3.4, 10], [1, 0, 0]));
        marker(5700, 0, 1);
    });
    const reel = D.reel(records, header, { who: "all", lengthMs: 60000, style: "hype" });
    assert.equal(reel.shots[0].preset, "bullet follow");
    assert.deepEqual(reel.shots.map(s => s.view), ["chase", "bullet", "orbit"]);
    const bullet = reel.shots[1];
    assert.equal(bullet.bullet.tFire, 5000);
    assert.equal(bullet.bullet.tHit, 5700);
    assert.equal(bullet.bullet.shooter, 0);
    assert.equal(bullet.bullet.victim, 1);
    assert.ok(reel.shots[0].cut && !reel.shots[1].cut);
    for (let i = 1; i < reel.shots.length; i++) assert.ok(reel.shots[i].start >= reel.shots[i - 1].end); //shots join up, never overlap
});

await test("reel: chill doesnt use the bullet shot back to back, and a multikill is one chase", async () => {
    const { records, header } = recording(({ at, marker }) => {
        at(5000, F.Type.packets, fire(0, [10, 3.4, 10], [1, 0, 0])); marker(5700, 0, 1);
        at(15000, F.Type.packets, fire(0, [10, 3.4, 10], [1, 0, 0])); marker(15700, 0, 1);
        marker(25000, 3, 2);
        marker(25500, 3, 1);
    });
    const chill = D.reel(records, header, { who: "all", lengthMs: 120000, style: "chill" });
    const presets = [...new Set(chill.shots.map(s => s.moment))].map(m => chill.shots.find(s => s.moment === m).preset);
    for (let i = 1; i < presets.length; i++) if (presets[i] === "bullet follow") assert.notEqual(presets[i - 1], "bullet follow");
    const multi = chill.shots.filter(s => s.preset === "multikill");
    assert.equal(multi.length, 1);
    assert.equal(multi[0].view, "chase");
    assert.ok(multi[0].speed.length >= 7); //a slow down on each of the two kills
});

await test("reel: nothing worth showing is an empty reel, not a crash", async () => {
    const { records, header } = recording(() => { });
    const reel = D.reel(records, header, { who: "all", lengthMs: 60000, style: "hype" });
    assert.deepEqual(reel.shots, []);
    assert.equal(reel.found, 0);
});

await test("rate: eased between points, flat outside them", async () => {
    const curve = [[1000, 1], [2000, 0.1], [3000, 1]];
    assert.equal(D.rate(curve, 0), 1);
    assert.equal(D.rate(curve, 1000), 1);
    assert.ok(Math.abs(D.rate(curve, 2000) - 0.1) < 1e-9);
    assert.equal(D.rate(curve, 9999), 1);
    const mid = D.rate(curve, 1500);
    assert.ok(mid < 1 && mid > 0.1);
    assert.ok(Math.abs(mid - 0.55) < 1e-9); //smoothstep's middle is the middle
    let last = 1;
    for (let t = 1000; t <= 2000; t += 50) { const r = D.rate(curve, t); assert.ok(r <= last + 1e-9); last = r }; //a smooth ramp down, no bumps
});

console.log(passed + " passed");

await test("reel: a multikill whose last kill was a long shot ends on the bullet", async () => {
    const { records, header } = recording(({ at, marker }) => {
        marker(5000, 0, 2); //close, no shot found
        at(6000, F.Type.packets, fire(0, [10, 3.4, 10], [1, 0, 0]));
        marker(6700, 0, 1); //30 blocks, on its way for 0.7s
    });
    const reel = D.reel(records, header, { who: "all", lengthMs: 60000, style: "hype" });
    assert.deepEqual(reel.shots.map(s => s.view), ["chase", "bullet", "orbit"]);
    assert.equal(reel.shots[0].preset, "multikill, then the bullet");
    assert.equal(reel.shots[1].bullet.victim, 1);
    assert.equal(reel.shots[1].bullet.tFire, 6000);
    for (let i = 1; i < reel.shots.length; i++) assert.ok(reel.shots[i].start >= reel.shots[i - 1].end);
});

await test("bulletReason says why a moment had no bullet shot", async () => {
    const { records, header } = recording(({ at, marker }) => {
        marker(5000, 0, 2); //no fire recorded at all
        at(20000, F.Type.packets, fire(0, [10, 3.4, 10], [1, 0, 0]));
        marker(20100, 0, 2); //14 blocks away... 4 blocks is closer than the threshold
    });
    const moments = D.moments(D.index(records, header));
    assert.match(D.bulletReason(moments[0], "hype"), /wasn't found/);
    const near = { kills: [{ fatal: { distance: 3 } }] };
    assert.match(D.bulletReason(near, "hype"), /only 3 blocks, it needs 5/);
    assert.match(D.bulletReason(near, "chill"), /it needs 8/);
    assert.equal(D.bulletReason({ kills: [{ fatal: { distance: 12 } }] }, "chill"), "");
    assert.equal(D.bulletReason({ marked: true, kills: [] }, "hype"), "");
});

console.log("director extras done");

await test("bulletTime: a crawl through the flight and a quick way back up, never a step", async () => {
    const curve = D.bulletTime(5000, 5170, true);
    assert.equal(D.rate(curve, 4000), 1);
    assert.ok(Math.abs(D.rate(curve, 5100) - 0.08) < 1e-9);
    assert.ok(Math.abs(D.rate(curve, 5200) - 0.08) < 1e-9);
    assert.equal(D.rate(curve, 5700), 1);
    for (let i = 1; i < curve.length; i++) assert.ok(curve[i][0] >= curve[i - 1][0]); //times only go forward, even for a very short flight
    const short = D.bulletTime(5000, 5020, false);
    for (let i = 1; i < short.length; i++) assert.ok(short[i][0] >= short[i - 1][0]);
    assert.ok(D.rate(D.bulletTime(5000, 5170, false), 5100) > D.rate(curve, 5100)); //chill is not as slow as hype
});
console.log("bulletTime done");

//---- editing and saving
const sampleReel = () => {
    const { records, header } = recording(({ at, marker }) => {
        at(5000, F.Type.packets, fire(0, [10, 3.4, 10], [1, 0, 0]));
        marker(5700, 0, 1);
    });
    const generated = D.reel(records, header, { who: "all", lengthMs: 60000, style: "hype" });
    return { header, reel: D.toReel(generated, { who: "all", lengthMs: 60000, style: "hype" }, "mine") };
};

await test("a saved reel comes back the same through cleanReel", async () => {
    const { header, reel } = sampleReel();
    const back = D.cleanReel(JSON.parse(JSON.stringify(reel)), header);
    assert.equal(back.name, "mine");
    assert.equal(back.shots.length, reel.shots.length);
    assert.deepEqual(back.shots.map(s => [s.view, s.target, Math.round(s.start), Math.round(s.end)]), reel.shots.map(s => [s.view, s.target, Math.round(s.start), Math.round(s.end)]));
    assert.deepEqual(back.shots[1].bullet.from, reel.shots[1].bullet.from);
    assert.equal(back.shots[1].bullet.tFire, 5000);
    assert.ok(back.shots[0].cut && !back.shots[1].cut);
});

await test("cleanReel refuses anything that isnt a reel and clamps what it keeps", async () => {
    const { header, reel } = sampleReel();
    const bad = (mutate, pattern) => { const r = JSON.parse(JSON.stringify(reel)); mutate(r); assert.throws(() => D.cleanReel(r, header), pattern) };
    assert.throws(() => D.cleanReel(null, header), /not a reel/);
    assert.throws(() => D.cleanReel({ v: 2, shots: [] }, header), /not a reel/);
    bad((r) => r.shots = "x", /bad shot list/);
    bad((r) => r.shots = new Array(201).fill(r.shots[0]), /bad shot list/);
    bad((r) => r.shots[0].view = "hax", /bad view/);
    bad((r) => r.shots[0].end = r.shots[0].start, /no length/);
    bad((r) => r.shots[1].bullet = null, /bad bullet/);
    bad((r) => r.shots[1].bullet.from = [1, 2], /bad bullet/);
    bad((r) => r.shots[1].bullet.tHit = r.shots[1].bullet.tFire - 1, /bad bullet/);
    const wild = JSON.parse(JSON.stringify(reel));
    wild.shots[0].start = -5000; wild.shots[0].end = 1e12; wild.shots[0].speed = [[0, 99], [1, -3], ["x", 1], null]; wild.shots[0].fx = "<img>"; wild.shots[0].why = "<b>" + "x".repeat(300); wild.name = "n".repeat(500);
    const ok = D.cleanReel(wild, header);
    assert.equal(ok.shots[0].start, 0);
    assert.ok(ok.shots[0].end <= header.duration);
    assert.ok(ok.shots[0].speed.every(p => p[1] >= 0.05 && p[1] <= 8));
    assert.equal(ok.shots[0].fx, "");
    assert.ok(ok.shots[0].why.length <= 80 && ok.name.length <= 60);
});

await test("editing: fitSpeed keeps the curve inside the shot, relink marks the cuts, makeShot gets a new id", async () => {
    const shot = { id: 1, start: 1000, end: 5000, speed: [[1000, 1], [2000, 0.2], [4000, 0.2], [5000, 1]] };
    shot.start = 1500; shot.end = 3000;
    D.fitSpeed(shot);
    assert.equal(shot.speed[0][0], 1500);
    assert.equal(shot.speed[shot.speed.length - 1][0], 3000);
    assert.ok(shot.speed.every(p => p[0] >= 1500 && p[0] <= 3000));
    assert.ok(shot.speed[0][1] < 1 && shot.speed[0][1] > 0.2); //it was part way down at 1500
    const shots = [{ start: 0, end: 3000 }, { start: 3100, end: 4000 }, { start: 9000, end: 10000 }];
    D.relink(shots);
    assert.deepEqual(shots.map(s => s.cut), [true, false, true]);
    const made = D.makeShot([{ id: 4 }, { id: 9 }], 100, 2000, "chase", 3);
    assert.equal(made.id, 10);
    assert.equal(made.view, "chase");
});

await test("speed names: presets are recognised again, anything else is as made", async () => {
    const shot = { start: 1000, end: 4000, speed: [] };
    for (const name of Object.keys(D.speedPresets)) { shot.speed = D.speedPresets[name](shot); assert.equal(D.speedName(shot), name) };
    shot.speed = [[1000, 1], [1500, 0.5], [4000, 1]];
    assert.equal(D.speedName(shot), "as made");
});
await test("bullet shots: a long shot gets one steady rate from its flight, a short one the crawl; fx and the fast orbit come with it", async () => {
    const steady = D.bulletRate(8491, 8724, true, 12.6); //233ms, 13 blocks
    assert.equal(steady.length, 2);
    assert.equal(steady[0][1], steady[1][1]);
    assert.ok(steady[0][1] >= 0.2 && steady[0][1] <= 0.5);
    assert.equal(steady[0][0], 8491 - 250);
    assert.equal(steady[1][0], 8724 + 1300);
    assert.equal(D.bulletRate(13460, 13560, true, 5.7).length, 6); //100ms, 6 blocks: the crawl
    //recorded times that are too short for the distance: the distance decides
    const far = D.bulletRate(1000, 1050, true, 30);
    assert.equal(far.length, 2);
    assert.ok(D.isSnipe(0, 200, 0) && D.isSnipe(0, 50, 12) && !D.isSnipe(0, 100, 6));
});

console.log("editing done");
