//node plugins_default/lagcompensation/test.js
import assert from 'node:assert/strict';
import BABYLON from 'babylonjs';
import { misc } from '#misc';

misc.instantiateSS(import.meta, ['node', 'test', '--game'], true, true);
const { default: ColliderConstructor } = await import('#collider');
const { default: Comm } = await import('#comm');
const { Bullet } = await import('#bullets');
const { TickStep } = await import('#constants');
const { ss } = await import('#misc');
const lc = await import('./lagcomp.js');

const engine = new BABYLON.NullEngine();
const scene = new BABYLON.Scene(engine);
const mkCollider = () => {
    const collider = new ColliderConstructor(scene);
    const map = { width: 24, height: 8, depth: 24, data: [] };
    const meshes = [null, { colliderType: 'full' }];
    for (let x = 0; x < map.width; x++) {
        map.data[x] = [];
        for (let y = 0; y < map.height; y++) map.data[x][y] = Array.from({ length: map.depth }, () => ({}));
    };
    for (let x = 0; x < map.width; x++) for (let z = 0; z < map.depth; z++) {
        map.data[x][0][z] = { idx: 1, mesh: meshes[1], colliderMesh: collider.fullCollisionMesh, colliderMatrix: BABYLON.Matrix.Identity(), rx: 0, ry: 0, rz: 0 };
    };
    collider.setParams(map, meshes);
    return collider;
};

const collider = mkCollider(), plain = mkCollider();
const bullets = [];
const room = {
    Collider: collider, players_by_id: [], gameOptions: { plugins: {} }, map: null,
    munitionsManager: { bulletPool: { recycle() { } }, update() { for (const b of bullets) if (b.active) b.update(1); } },
};
ss.room = room;
lc.wrapShots();
lc.install(room);

const WC = { velocity: .5, damage: 20, range: 40 };
const hits = [];
const mkPlayer = (id, team, x, y, z, human = true) => ({
    id, team, x, y, z, playing: true, predicted: { x, y, z }, stateIdx: 0, syncStateIdx: 0,
    modifiers: { scale: 1, damageModifier: 1, bulletSpeedModifier: 1 }, client: { isHuman: human, room }, Collider: collider,
    hit(d) { hits.push({ id, d }); },
});
const put = (p, x, y, z) => { p.x = x; p.y = y; p.z = z; p.predicted = { x, y, z }; };
const step = () => room.munitionsManager.update(1);
const shoot = (shooter, from, dir, rewind) => {
    const b = new Bullet({ room });
    bullets.push(b);
    b.fireThis(shooter, new BABYLON.Vector3(...from), new BABYLON.Vector3(...dir), WC);
    b.lcRewind = rewind;
    return b;
};
const clear = () => { bullets.length = 0; hits.length = 0; };
const pings = (client, gaps) => { let t = 1e6; lc.onPing(client, t, room); for (const g of gaps) lc.onPing(client, t += 1000 + g, room); };
const close = (a, b, tol = 1e-4) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
let n = 0;
const test = (name, run) => { run(); n++; console.log('ok - ' + name); };

test('history ring: interpolates, and a wrapped window is missing', () => {
    const h = new lc.History(), p = { playing: true, x: 0, y: 0, z: 0 };
    for (let t = 0; t < 100; t++) { p.x = t * .1; h.record(t, p, 2); };
    close(h.sample(99, 10.5).x, (99 - 10.5) * .1);
    close(h.sample(99, 0).x, 9.9);
    assert.equal(h.sample(99, 70), null);
});

test('respawn: shots dont land on the previous life', () => {
    const h = new lc.History(), p = { playing: true, x: 0, y: 0, z: 0 };
    for (let t = 0; t < 22; t++) {
        p.playing = t < 10 || t >= 12;
        p.x = t < 12 ? 0 : 10;
        h.record(t, p, 2);
    };
    assert.equal(h.sample(21, 15), false);
    assert.equal(h.sample(21, 10), false);
    close(h.sample(21, 5).x, 10);
    close(h.sample(21, 0).x, 10);
});

test('teleport: never the midpoint', () => {
    const h = new lc.History(), p = { playing: true, x: 0, y: 0, z: 0 };
    for (let t = 0; t < 10; t++) { p.x = t < 5 ? 0 : 50; h.record(t, p, 2); };
    assert.equal(h.sample(9, 4.5).x, 50);
    assert.equal(h.sample(9, 4.6).x, 0);
});

test('late join: not enough history falls back', () => {
    const h = new lc.History(), p = { playing: true, x: 0, y: 0, z: 0 };
    for (let t = 0; t < 3; t++) h.record(t, p, 2);
    assert.equal(h.sample(2, 10), null);
});

test('rtt: first ping ignored, smallest recent wins, nonsense rejected', () => {
    const c = { isHuman: true }, shooter = mkPlayer(1, 1, 0, 2, 0);
    shooter.client = c;
    lc.onPing(c, 5000, room);
    assert.equal(lc.rttOf(c), null);
    assert.equal(lc.rewindFor(room, shooter), 0);
    const c2 = { isHuman: true };
    pings(c2, [50, 400, 50, 400]);
    assert.equal(lc.rttOf(c2), 50);
    const c3 = { isHuman: true };
    pings(c3, [1200, 90, 90, 90, 90]);
    assert.equal(lc.rttOf(c3), 90); //the 1200 was thrown out
    const c4 = { isHuman: true };
    pings(c4, [-200, 60, 60, 60, 60]);
    assert.equal(lc.rttOf(c4), 60);
});

test('rewind: ping in ticks, clamped, bots and unknowns get nothing', () => {
    const shooter = mkPlayer(1, 1, 0, 2, 0);
    shooter.client = { isHuman: true };
    pings(shooter.client, [100, 100, 100, 100]);
    close(lc.rewindFor(room, shooter), 100 / TickStep);
    pings(shooter.client = { isHuman: true }, [600, 600, 600, 600]); //over maxRttMs
    close(lc.rewindFor(room, shooter), 100 / TickStep);
    room.gameOptions.plugins.lagcomp = { maxRttMs: 1000, maxRewindMs: 50 };
    close(lc.rewindFor(room, shooter), 50 / TickStep);
    room.gameOptions.plugins.lagcomp = { enabled: false };
    assert.equal(lc.rewindFor(room, shooter), 0);
    assert.equal(lc.rewindFor(room, shooter, true), 0); //off by default
    room.gameOptions.plugins.lagcomp = { rockets: true };
    assert.ok(lc.rewindFor(room, shooter, true) > 0);
    room.gameOptions.plugins.lagcomp = { rockets: false };
    assert.equal(lc.rewindFor(room, shooter, true), 0);
    assert.ok(lc.rewindFor(room, shooter, false) > 0);
    delete room.gameOptions.plugins.lagcomp;
    const bot = mkPlayer(2, 1, 0, 2, 0, false);
    assert.equal(lc.rewindFor(room, bot), 0);
    const unknown = mkPlayer(3, 1, 0, 2, 0);
    assert.equal(lc.rewindFor(room, unknown), 0);
});

test('rewind: unsent ticks of the batch are added, up to a sync', () => {
    const shooter = mkPlayer(1, 1, 0, 2, 0);
    shooter.client = { isHuman: true };
    pings(shooter.client, [100, 100, 100, 100]);
    room.gameOptions.plugins.lagcomp = { maxRewindMs: 1000 };
    shooter.stateIdx = shooter.syncStateIdx = 250;
    const base = lc.rewindFor(room, shooter);
    for (let k = 1; k <= 6; k++) {
        shooter.syncStateIdx = Math.mod(250 + k, 256);
        close(lc.rewindFor(room, shooter), base + k);
    };
    shooter.syncStateIdx = Math.mod(250 + 20, 256);
    close(lc.rewindFor(room, shooter), base + 6);
});

test('ping packets reach the estimate through the plugin event', () => {
    const handlers = {};
    lc.listen({ on: (e, f) => handlers[e] = f });
    const out = new Comm.Out(2);
    out.packInt8U(Comm.Code.ping); out.packInt8U(0);
    const client = { isHuman: true }, now = Date.now;
    let t = 2e6;
    Date.now = () => t;
    try {
        for (const gap of [0, 80, 120, 90, 100]) { t += 1000 + gap; handlers['game:roomWsMessage']({ this: room, client, type: 'wsMessage', content: out.buffer }); };
        handlers['game:roomWsMessage']({ this: room, client, type: 'wsClose', content: out.buffer });
    } finally { Date.now = now; };
    assert.equal(lc.rttOf(client), 80);
});

const clearPlayers = () => { room.players_by_id.length = 0; };
const warm = (target, ticks, move) => { for (let i = 0; i < ticks; i++) { move(i); step(); }; };

test('a moving target is hit where the shooter saw it, and only with the rewind', () => {
    clearPlayers(); clear();
    const shooter = mkPlayer(0, 1, 8, 2, 5), target = mkPlayer(1, 2, 8, 2, 10);
    room.players_by_id.push(shooter, target);
    const X = j => 8 + .1 * j;
    let j = 0;
    const tick = () => { put(target, X(j), 2, 10); j++; step(); };
    for (let i = 0; i < 40; i++) tick();
    let aim;
    const attempt = rewind => {
        clear();
        aim = X(j + 6 - 12); //six updates to arrive; the shooter saw it 12 ticks back
        shoot(shooter, [aim, 2, 5], [0, 0, 1], rewind);
        for (let i = 0; i < 12; i++) tick();
    };
    attempt(0);
    assert.equal(hits.length, 0, 'missed without lag compensation');
    attempt(12);
    assert.equal(hits.length, 1, 'hit with it');
    //same shot at a target that stood still where it was seen
    clearPlayers(); const hitDamage = hits[0].d; clear();
    const still = mkPlayer(1, 2, aim, 2, 10);
    room.players_by_id.push(shooter, still);
    for (let i = 0; i < 70; i++) step();
    shoot(shooter, [aim, 2, 5], [0, 0, 1], 0);
    for (let i = 0; i < 12; i++) step();
    assert.equal(hits.length, 1);
    close(hitDamage, hits[0].d, 1e-3);
});

test('at no lag it behaves exactly as before, rays and all', () => {
    clearPlayers(); clear();
    const shooter = mkPlayer(0, 1, 2, 2, 2);
    const ts = [mkPlayer(1, 2, 12, 2, 12), mkPlayer(2, 2, 6, 2, 14), mkPlayer(3, 0, 16, 2, 6)];
    room.players_by_id.push(shooter, ...ts);
    for (let i = 0; i < 80; i++) step();
    let seed = 7, rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const run = (c, rewind) => {
        const got = [];
        for (let i = 0; i < 500; i++) {
            const t = ts[i % 3]; //aimed near one of them, so plenty hit and plenty graze
            const dir = new BABYLON.Vector3(t.x - 2 + (rnd() - .5) * 1.4, t.y + .32 - 2.3 + (rnd() - .5) * .8, t.z - 2 + (rnd() - .5) * 1.4);
            const o = new BABYLON.Vector3(2, 2.3, 2);
            let r = null;
            const proj = { player: shooter, lcRewind: rewind, collidesWithPlayer(p, pt) { r = { id: p.id, x: pt.x, y: pt.y, z: pt.z }; } };
            c.rayCollidesWithPlayer(o, dir, proj);
            got.push(r);
        };
        return got;
    };
    seed = 7; const a = run(plain, 0);
    seed = 7; const b = run(collider, 0);
    seed = 7; const c = run(collider, 7); //they havent moved, so the rewound ones are the same too
    assert.deepEqual(b, a);
    assert.deepEqual(c.map(r => r && r.id), a.map(r => r && r.id));
    assert.ok(a.filter(Boolean).length > 20, 'the rays do hit things');
});

test('a shot fired on the very first tick of a new target falls back', () => {
    clearPlayers(); clear();
    const shooter = mkPlayer(0, 1, 8, 2, 5);
    room.players_by_id.push(shooter);
    for (let i = 0; i < 80; i++) step();
    const fresh = mkPlayer(1, 2, 8, 2, 10);
    room.players_by_id.push(fresh);
    step(); step();
    shoot(shooter, [8, 2, 5], [0, 0, 1], 12);
    for (let i = 0; i < 12; i++) step();
    assert.equal(hits.length, 1);
});

test('cost', () => {
    clearPlayers(); clear();
    const shooter = mkPlayer(0, 1, 2, 2, 2);
    room.players_by_id.push(shooter);
    for (let i = 1; i < 18; i++) room.players_by_id.push(mkPlayer(i, 2, 4 + i, 2, 4 + i));
    for (let i = 0; i < 80; i++) step();
    const o = new BABYLON.Vector3(2, 2.3, 2), d = new BABYLON.Vector3(.4, 0, .4);
    const time = rewind => {
        const proj = { player: shooter, lcRewind: rewind, collidesWithPlayer() { } };
        const t = performance.now();
        for (let i = 0; i < 600; i++) { step(); for (let k = 0; k < 200; k++) collider.rayCollidesWithPlayer(o, d, proj); };
        return performance.now() - t;
    };
    const off = time(0), on = time(7);
    console.log(`   18 players x 200 bullets x 600 ticks: ${off.toFixed(0)}ms without a rewind, ${on.toFixed(0)}ms with (${(on / 600).toFixed(2)}ms per tick, tick budget ${TickStep.toFixed(1)}ms)`);
    assert.ok(on / 600 < TickStep / 2);
});

console.log(`${n} passed`);
process.exit(0);
