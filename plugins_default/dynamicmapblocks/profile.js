//node plugins_default/dynamicmapblocks/profile.js before 3000
import fs from 'node:fs';
import path from 'node:path';
import inspector from 'node:inspector';
import { performance } from 'node:perf_hooks';
import BABYLON from 'babylonjs';
import Player from '#player';
import ColliderConstructor from '#collider';
import { plugins } from '#plugins';
import { DynamicMapBlocksPlugin } from './shared.js';
import { PlatformMap, PlatformWorld } from './platforms.js';
import { PlatformClock } from './motion.js';
import Comm from '#comm';

const label = (process.argv[2] || 'latest').replace(/[^a-z0-9-]/gi, '');
const iterations = Math.max(120, Number(process.argv[3]) || 3000);
const output = path.resolve('store/dynamicmapblocks-profile');
fs.mkdirSync(output, { recursive: true });
const engine = new BABYLON.NullEngine(), scene = new BABYLON.Scene(engine);
const spinner = await new Promise((resolve, reject) => BABYLON.SceneLoader.ImportMesh('', '',
    'data:' + fs.readFileSync(new URL('./models/map.babylon', import.meta.url), 'utf8'), scene,
    loaded => resolve(loaded.find(mesh => mesh.name === 'dynamic.spinner.mesh')), null, (_, message) => reject(Error(message))));
spinner.colliderMesh = spinner.getChildMeshes()[0]; spinner.colliderType = 'mesh'; spinner.setEnabled(false);
DynamicMapBlocksPlugin.install(plugins);
const collider = new ColliderConstructor(scene), meshes = [null, { colliderType: 'full' }, spinner];
const map = { width: 24, height: 8, depth: 24, data: [] };
for (let x = 0; x < map.width; x++) {
    map.data[x] = [];
    for (let y = 0; y < map.height; y++) map.data[x][y] = Array.from({ length: map.depth }, () => ({}));
    for (let z = 0; z < map.depth; z++) map.data[x][0][z] = { idx: 1, mesh: meshes[1], colliderMesh: collider.fullCollisionMesh,
        colliderMatrix: BABYLON.Matrix.Identity(), rx: 0, ry: 0, rz: 0 };
};
collider.setParams(map, meshes);
const report = { label, node: process.version, iterations, predictions: 2, scenarios: [] };
const session = new inspector.Session(); session.connect();
const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
await post('Profiler.enable'); await post('Profiler.setSamplingInterval', { interval: 500 }); await post('Profiler.start');
const scenarios = ['ordinary floor', 'static triangle disk', 'rotating triangle disk', 'rotating box', 'off disk',
    'static triangle disk at wall', 'rotating triangle disk into wall', 'rotating triangle disk pushed into wall',
    'rotating triangle disk at corner', 'rotating triangle disk into wall delta 6',
    'static triangle disk exactly touching wall', 'rotating triangle disk exactly touching wall',
    'rotating triangle disk overlapping wall', 'rotating triangle disk replay',
    'rotating triangle disk into wall replay', 'rotating triangle disk at corner replay'];
for (const name of scenarios.filter(name => !process.argv[4] || name.includes(process.argv[4]))) {
    const moving = name.startsWith('rotating');
    const wall = name.includes('wall') || name.includes('corner'), corner = name.includes('corner');
    const delta = name.endsWith('delta 6') ? 6 : 1, pushing = name.includes('pushed') || corner;
    const motion = moving ? { type: 'spin', axis: { y: 1 }, speed: wall && !corner ? -30 : 30 } : { type: 'none' };
    const body = { id: 'spinner', position: { x: 10.5, y: 2.5, z: 10.5 }, motion,
        blocks: [{ mesh: spinner.name, x: 10, y: 2, z: 10 }] };
    if (name === 'rotating box') {
        delete body.blocks;
        body.shapes = [{ type: 'box', min: { x: -3, y: -.25, z: -3 }, max: { x: 3, y: 0, z: 3 } }];
    };
    collider.platformWorld = new PlatformWorld(name === 'ordinary floor' ? [] : [body], meshes, new PlatformClock(() => 0));
    collider.platformCells = new Map();
    if (name.startsWith('static triangle disk')) {
        body.static = true;
        map.data[10][2][10] = { idx: 2, mesh: spinner };
        collider.platformCells.set('10,2,10', collider.platformWorld.bodies[0]);
    };
    const walls = [];
    if (wall) for (let offset = 7; offset <= 14; offset++) for (let y = 2; y <= 3; y++) {
        for (const [x, z] of [[13, offset], ...(corner ? [[offset, 11]] : [])]) {
            walls.push([x, y, z]);
            map.data[x][y][z] = { idx: 1, mesh: meshes[1], colliderMesh: collider.fullCollisionMesh,
                colliderMatrix: BABYLON.Matrix.Identity(), rx: 0, ry: 0, rz: 0 };
        };
    };
    const p = Object.assign(Object.create(Player.prototype), {
        x: name.includes('overlapping') ? 12.751 : name.includes('exactly') ? 12.75 : wall ? 12.749999 : name === 'off disk' ? 16 : 12.5,
        y: 2.5, z: corner ? 10.749999 : wall ? 9.5 : 10.5, dx: 0, dy: 0, dz: 0,
        corrected: { dx: 0, dy: 0, dz: 0 }, corrections: 0, scene, Collider: collider, map, mapMeshes: meshes,
        climbing: false, jumping: false, isFalling: false, platformTime: 0, jumps: 0, stateIdx: 0, stateBuffer: [{}],
        modifiers: { scale: 1, speedModifier: 1, gravityModifier: 1 },
    });
    const input = { delta, ddx: pushing ? 1 : 0, ddz: corner ? 1 : 0 };
    const history = [];
    let ticks = 0, replayCalls = 0;
    const step = () => {
        p.simulateMovement(input, true); p.simulateMovement(input, true);
        p.simulateMovement(input);
        if (name.includes('replay')) {
            history.push(p.createSnapshot(true));
            if (history.length > 12) history.shift();
            if (++ticks % 6 === 0 && history.length >= 6) {
                const current = p.createSnapshot(true), state = { ...history[history.length - 6], platformTime: current.platformTime };
                const output = new Comm.Out();
                for (const axis of ['x', 'y', 'z', 'dx', 'dy', 'dz']) output.packFloat(state[axis]);
                const packet = new Comm.In(output.buffer);
                for (const axis of ['x', 'y', 'z', 'dx', 'dy', 'dz']) state[axis] = packet.unPackFloat();
                p.restoreSnapshot(state);
                for (let i = 0; i < 6; i++) { p.simulateMovement(input); replayCalls++; };
                p.restoreSnapshot({ ...current, platformTime: p.platformTime });
            };
        };
    };
    for (let i = 0; i < 240; i++) step();
    replayCalls = 0;
    const counts = { overlap: 0, vertical: 0, poses: 0, mapChecks: 0, blockedCarry: 0 };
    const mapCheck = p.collidesWithMap;
    p.collidesWithMap = function (...args) {
        counts.mapChecks++;
        const hit = mapCheck.apply(this, args);
        if (hit && collider.platformIgnore) counts.blockedCarry++;
        return hit;
    };
    for (const method of ['overlap', 'vertical', 'pose']) {
        const original = collider.platformWorld[method];
        collider.platformWorld[method] = function (...args) {
            if (method !== 'pose' || !args[0].cache.has(args[0].definition.motion.type === 'none' ? 0 : args[1])) counts[method === 'pose' ? 'poses' : method]++;
            return original.apply(this, args);
        };
    };
    const samples = [];
    for (let i = 0; i < iterations; i++) {
        const start = performance.now(); step(); samples.push(performance.now() - start);
    };
    samples.sort((a, b) => a - b);
    const result = { name, msPerTick: samples.reduce((a, b) => a + b, 0) / iterations,
        p50: samples[Math.floor(iterations * .5)], p95: samples[Math.floor(iterations * .95)],
        p99: samples[Math.floor(iterations * .99)], p999: samples[Math.floor(iterations * .999)], worst: samples[samples.length - 1],
        over16ms: samples.filter(ms => ms > 16.67).length, over40ms: samples.filter(ms => ms > 40).length,
        callsPerTick: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, value / iterations])),
        position: { x: p.x, y: p.y, z: p.z } };
    result.callsPerTick.replays = replayCalls / iterations;
    report.scenarios.push(result); console.log(JSON.stringify(result));
    map.data[10][2][10] = {};
    for (const [x, y, z] of walls) map.data[x][y][z] = {};
};
const { profile } = await post('Profiler.stop'); session.disconnect();
fs.writeFileSync(path.join(output, label + '.cpuprofile'), JSON.stringify(profile));
const nodes = new Map(profile.nodes.map(node => [node.id, node])), totals = new Map();
for (let i = 0; i < profile.samples.length; i++) {
    const node = nodes.get(profile.samples[i]), frame = node.callFrame;
    const name = (frame.functionName || '(anonymous)') + ' ' + frame.url.split('/').pop() + ':' + (frame.lineNumber + 1);
    totals.set(name, (totals.get(name) || 0) + profile.timeDeltas[i]);
};
report.hotspots = Array.from(totals, ([name, microseconds]) => ({ name, ms: microseconds / 1000 })).sort((a, b) => b.ms - a.ms).slice(0, 18);
fs.writeFileSync(path.join(output, label + '.json'), JSON.stringify(report, null, 2) + '\n');
console.log('Hotspots:', JSON.stringify(report.hotspots));
scene.dispose(); engine.dispose();
