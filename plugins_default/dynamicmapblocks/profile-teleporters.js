//node plugins_default/dynamicmapblocks/profile-teleporters.js latest 3000
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import BABYLON from 'babylonjs';
import Player from '#player';
import ColliderConstructor from '#collider';
import { plugins } from '#plugins';
import { DynamicMapBlocksPlugin } from './shared.js';
import { PlatformWorld } from './platforms.js';
import { PlatformClock } from './motion.js';
import { PlatformTeleporters } from './teleporters.js';

const label = (process.argv[2] || 'latest').replace(/[^a-z0-9-]/gi, '');
const iterations = Math.max(120, Number(process.argv[3]) || 3000);
const output = path.resolve('store/dynamicmapblocks-profile');
fs.mkdirSync(output, { recursive: true });
const engine = new BABYLON.NullEngine(), scene = new BABYLON.Scene(engine);
DynamicMapBlocksPlugin.install(plugins);
const collider = new ColliderConstructor(scene), meshes = [null, { colliderType: 'full' }];
const map = { width: 40, height: 8, depth: 40, data: [] };
for (let x = 0; x < map.width; x++) {
    map.data[x] = [];
    for (let y = 0; y < map.height; y++) map.data[x][y] = Array.from({ length: map.depth }, () => ({}));
    for (let z = 0; z < map.depth; z++) map.data[x][0][z] = { idx: 1, mesh: meshes[1], colliderMesh: collider.fullCollisionMesh,
        colliderMatrix: BABYLON.Matrix.Identity(), rx: 0, ry: 0, rz: 0 };
};
collider.setParams(map, meshes); collider.platformBounds = { width: map.width, height: map.height, depth: map.depth };
const pad = (id, x, z, extra = {}) => ({ id, block: { mesh: 'test.floor.full', x, y: 0, z }, cooldown: 0, ...extra });
const ring = (count, extra = {}) => Array.from({ length: count }, (_, i) => pad('p' + i, 10 + (i % 8) * 3, 10 + Math.floor(i / 8) * 3, { to: { type: 'link', id: 'p' + ((i + 1) % count) }, ...extra })); //away from where the test player is
const world = list => collider.platformWorld = PlatformTeleporters.attach(new PlatformWorld([], meshes, new PlatformClock(() => 0)), { width: map.width, height: map.height, depth: map.depth, extents: { teleporters: list } });
const player = (x, z, extra = {}) => Object.assign(Object.create(Player.prototype), { x, y: 1, z, dx: 0, dy: 0, dz: 0, corrected: { dx: 0, dy: 0, dz: 0 }, corrections: 0, scene, Collider: collider, map, mapMeshes: meshes,
    climbing: false, jumping: false, isFalling: false, platformTime: 0, jumps: 0, stateIdx: 0, stateBuffer: [{}], playing: true, hp: 100, team: 1,
    modifiers: { scale: 1, speedModifier: 1, gravityModifier: 1 }, ...extra });
const report = { label, node: process.version, iterations, scenarios: [] };
const owner = player(0, 0), bounds = DynamicMapBlocksPlugin.grenadeBounds;

function measure(name, setup, step) { //a tick's cost: the median, the tail, and how many fell outside a frame
    const state = setup();
    for (let i = 0; i < 240; i++) step(state, i);
    const samples = [];
    for (let i = 0; i < iterations; i++) { const start = performance.now(); step(state, i); samples.push(performance.now() - start); };
    samples.sort((a, b) => a - b);
    const result = { name, msPerTick: samples.reduce((a, b) => a + b, 0) / iterations, p50: samples[Math.floor(iterations * .5)], p95: samples[Math.floor(iterations * .95)],
        p99: samples[Math.floor(iterations * .99)], p999: samples[Math.floor(iterations * .999)], worst: samples[samples.length - 1], over16ms: samples.filter(ms => ms > 16.67).length };
    report.scenarios.push(result); console.log(JSON.stringify(result));
};
const tick = p => { p.simulateMovement({ delta: 1 }, true); p.simulateMovement({ delta: 1 }, true); p.simulateMovement({ delta: 1 }); }; //two predictions and the real step, as a client does

measure('player standing, no pads', () => { world([]); return player(5, 5); }, p => tick(p));
measure('player standing, 1 pad', () => { world(ring(2)); return player(5, 5); }, p => tick(p));
measure('player standing, 32 pads far away', () => { world(ring(32)); return player(5, 5); }, p => tick(p));
measure('player standing in a pad zone, charging', () => { world(ring(32, { charge: 10 })); const p = player(10.5, 10.5); p.dmbHopNow = { pad: 'p0', armed: true, held: 0, wait: 0 }; return p; }, p => tick(p));
measure('player walking in a pad zone, 32 pads', () => { world(ring(32, { charge: 10 })); return player(10.5, 10.5); }, (p, i) => { p.simulateMovement({ delta: 1, ddx: i % 40 < 20 ? .5 : -.5 }, true); p.simulateMovement({ delta: 1, ddx: i % 40 < 20 ? .5 : -.5 }, true); p.simulateMovement({ delta: 1, ddx: i % 40 < 20 ? .5 : -.5 }); });
measure('player hopping every tick, 2 pads', () => { world([pad('a', 4, 4, { to: { type: 'link', id: 'b' } }), pad('b', 20, 20, { to: { type: 'link', id: 'a' } })]); return player(3.9, 4.5); },
    p => { p.x = 3.9; p.z = 4.5; p.y = 1; p.dx = .2; p.dz = 0; p.dmbHopNow = PlatformTeleporters.blank; p.simulateMovement({ delta: 1, ddx: 1 }, true); p.simulateMovement({ delta: 1, ddx: 1 }, true); p.simulateMovement({ delta: 1, ddx: 1 }); });

const shots = (count, aimed) => Array.from({ length: count }, (_, i) => ({ x: aimed ? 8 + (i % 8) * .01 : 30, y: 1.3, z: aimed ? 9.5 + (i % 5) * .3 : 30 + (i % 7), dx: .75, dy: 0, dz: 0, range: 20, active: true, player: owner, weaponClass: { range: 20 } }));
const fly = (list, w) => { for (const shot of list) { const start = { x: shot.x, y: shot.y, z: shot.z }; shot.x += shot.dx; if (shot.x > 38) { shot.x = 8; shot.dmbPad = null; shot.dmbCount = 0; }; if (w.teleporterShots?.length) PlatformTeleporters.shot(shot, start, collider, w); } };
measure('100 shots in flight, no pads', () => { const w = world([]); return { list: shots(100, false), w }; }, ({ list, w }) => fly(list, w));
measure('100 shots in flight, 32 shot pads far away', () => { const w = world(ring(32, { bullets: true })); return { list: shots(100, false), w }; }, ({ list, w }) => fly(list, w));
measure('100 shots flying through 32 shot pads', () => { const w = world(ring(32, { bullets: true })); return { list: shots(100, true), w }; }, ({ list, w }) => fly(list, w));
const thrown = (count, near) => Array.from({ length: count }, (_, i) => ({ x: near ? 10.5 + (i % 4) * .02 : 30, y: 1.1, z: near ? 10.5 + (i % 4) * .02 : 30, dx: .02, dy: 0, dz: 0, ttl: 1e9, player: owner, actor: null }));
const lob = (list, collider) => { for (const grenade of list) { const start = { x: grenade.x, y: grenade.y, z: grenade.z }; grenade.x += grenade.dx; if (grenade.x > 38) grenade.x = 5; PlatformTeleporters.item(grenade, start, collider); } };
measure('20 grenades, 32 pads far away', () => { world(ring(32, { items: true })); return thrown(20, false); }, list => lob(list, collider));
measure('20 grenades rolling about 32 pads', () => { world(ring(32, { items: true, charge: 10 })); return thrown(20, true); }, list => lob(list, collider));

fs.writeFileSync(path.join(output, 'teleporters-' + label + '.json'), JSON.stringify(report, null, 2) + '\n');
scene.dispose(); engine.dispose();
