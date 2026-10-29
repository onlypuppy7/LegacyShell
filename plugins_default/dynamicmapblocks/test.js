//node plugins_default/dynamicmapblocks/test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import BABYLON from 'babylonjs';
import Player from '#player';
import ColliderConstructor from '#collider';
import { SpinDisk } from './disk.js';
import { SpinDiskRender, PlatformRender, PlatformRenderClock } from './render.js';
import { plugins } from '#plugins';
import { DynamicMapBlocksPlugin } from './shared.js';
import { PlatformMap, PlatformWorld } from './platforms.js';
import { PlatformClock, PlatformMotion } from './motion.js';
import { PlatformShapes } from './geometry.js';
import { PlatformProtocol } from './protocol.js';
import { PlatformAssets } from './assets.js';
import { PlatformEditorState } from './editor-state.js';
import { PluginManager } from '#plugins';
import Comm from '#comm';
import { Grenade } from '#bullets';
import { PlatformGuides } from './guides.js';
import { PlatformLighting } from './lighting.js';
import { patchPlatformShader } from './lighting-shader.js';

const engine = new BABYLON.NullEngine();
const scene = new BABYLON.Scene(engine);
const spinner = await new Promise((resolve, reject) => BABYLON.SceneLoader.ImportMesh('', '',
    'data:' + fs.readFileSync(new URL('./models/map.babylon', import.meta.url), 'utf8'), scene,
    loaded => resolve(loaded.find(mesh => mesh.name === 'dynamic.spinner.mesh')), null, (_, message) => reject(Error(message))));
spinner.colliderMesh = spinner.getChildMeshes()[0];
spinner.colliderType = 'mesh';
spinner.setEnabled(false);
const collider = new ColliderConstructor(scene);
const map = { width: 24, height: 8, depth: 24, data: [] };
const meshes = [null, { colliderType: 'full' }];
for (let x = 0; x < map.width; x++) {
    map.data[x] = [];
    for (let y = 0; y < map.height; y++) {
        map.data[x][y] = Array.from({ length: map.depth }, () => ({}));
    };
};
function block(x, y, z) {
    map.data[x][y][z] = { idx: 1, mesh: meshes[1], colliderMesh: collider.fullCollisionMesh,
        colliderMatrix: BABYLON.Matrix.Identity(), rx: 0, ry: 0, rz: 0 };
};
for (let x = 0; x < map.width; x++) for (let z = 0; z < map.depth; z++) block(x, 0, z);
collider.setParams(map, meshes);
const originalSimulate = Player.prototype.simulateMovementDefault;
DynamicMapBlocksPlugin.install(plugins);
collider.setParams(map, meshes);
const disk = { x: 10, y: 2, z: 10, radius: 3, speed: 90 };
function diskWorld() {
    collider.platformWorld = new PlatformWorld([PlatformMap.fromDisk(disk)], [], new PlatformClock(() => 0));
};
diskWorld();

function player(overrides = {}) {
    return Object.assign(Object.create(Player.prototype), {
        x: 12, y: 2, z: 10, dx: 0, dy: 0, dz: 0, corrected: { dx: 0, dy: 0, dz: 0 }, corrections: 0,
        scene, Collider: collider, map, mapMeshes: meshes, climbing: false, jumping: false, isFalling: false,
        platformTime: 0, jumps: 0, stateIdx: 0, stateBuffer: [{}], modifiers: { scale: 1, speedModifier: 1, gravityModifier: 1 },
    }, overrides);
};
const close = (value, expected, tolerance = 1e-5) => assert.ok(Math.abs(value - expected) < tolerance, `${value} != ${expected}`);
let checks = 0, pendingChecks = [];
function test(name, run) {
    const result = run(), done = () => { checks++; console.log('ok - ' + name); };
    if (result?.then) pendingChecks.push(result.then(done)); else done();
};

test('rides a quarter turn without drifting or sinking', () => {
    const p = player();
    for (let i = 0; i < 60; i++) p.simulateMovement({ delta: 1 });
    close(p.x, 10); close(p.z, 8); close(p.y, 2);
    assert.equal(p.jumping, false);
    assert.equal(p.dy, 0);
});
test('reverse and zero speed', () => {
    disk.speed = -90;
    diskWorld();
    const p = player();
    for (let i = 0; i < 60; i++) p.simulateMovement({ delta: 1 });
    close(p.z, 12);
    disk.speed = 0;
    diskWorld();
    p.simulateMovement({ delta: 1 });
    close(p.x, 10); close(p.z, 12);
    disk.speed = 90;
    diskWorld();
});
test('split render deltas produce the same orbit', () => {
    const a = player(), b = player();
    for (let i = 0; i < 60; i++) a.simulateMovement({ delta: 1 });
    for (let i = 0; i < 120; i++) b.simulateMovement({ delta: .5 });
    close(a.x, b.x); close(a.z, b.z); close(a.y, b.y);
});
test('prediction uses its supplied position and leaves the live position alone', () => {
    const p = player();
    let predicted = { x: 10, y: 2, z: 12, dx: 0, dy: 0, dz: 0, delta: 1 };
    for (let i = 0; i < 60; i++) predicted = p.simulateMovement(predicted, true);
    close(predicted.x, 12); close(predicted.z, 10);
    close(p.x, 12); close(p.z, 10);
});
test('replaying the same inputs gives the same result', () => {
    const p = player();
    const start = { x: 12, y: 2, z: 10, dx: 0, dy: 0, dz: 0, delta: 1 };
    function replay() {
        let state = { ...start };
        for (let i = 0; i < 80; i++) state = p.simulateMovement({ ...state, ddx: i < 8 ? .1 : 0 }, true);
        return state;
    };
    assert.deepEqual(replay(), replay());
});
test('jumping detaches and falling lands on the exact top', () => {
    const p = player({ dy: .06, jumping: true });
    p.simulateMovement({ delta: 1 });
    close(p.x, 12); close(p.z, 10);
    assert.ok(p.y > 2);
    for (let i = 0; i < 50; i++) p.simulateMovement({ delta: 1 });
    close(p.y, 2); assert.equal(p.jumping, false);
});
test('walking off falls to the ordinary floor', () => {
    const p = player({ x: 12.8, dx: .08 });
    for (let i = 0; i < 60; i++) p.simulateMovement({ delta: 1 });
    assert.ok(p.y < 1.2);
});
test('the pivot stays still and scaled players can ride', () => {
    const p = player({ x: 10 });
    p.modifiers.scale = 2;
    for (let i = 0; i < 10; i++) p.simulateMovement({ delta: 1 });
    close(p.x, 10); close(p.z, 10); close(p.y, 2);
});
test('noclip ignores platform carrying', () => {
    const p = player(); p.modifiers.noclip = true;
    p.simulateMovement({ delta: 1 });
    close(p.x, 12); close(p.z, 10);
});
test('carry stops at a wall instead of passing through it', () => {
    block(11, 2, 8); block(11, 3, 8);
    const p = player();
    for (let i = 0; i < 100; i++) {
        p.simulateMovement({ delta: 1 });
        assert.equal(p.collidesWithMap(), false);
    };
    assert.ok(p.z > 9.2);
    map.data[11][2][8] = {}; map.data[11][3][8] = {};
});
test('disk sides and underside are solid, corners outside the circle are empty', () => {
    const p = player();
    assert.ok(p.collidesWithMap({ x: 12.8, y: 1.8, z: 10 }));
    assert.ok(p.collidesWithMap({ x: 10, y: 1.3, z: 10 }));
    assert.equal(p.collidesWithMap({ x: 12.8, y: 1.8, z: 12.8 }), false);
});
test('bullets hit the top and grenades receive a bounce normal', () => {
    const origin = new BABYLON.Vector3(10, 4, 10), direction = new BABYLON.Vector3(0, -4, 0);
    const hit = collider.rayCollidesWithMap(origin, direction, collider.projectileCollidesWithCell.bind(collider));
    close(hit.pick.pickedPoint.y, 2);
    close(hit.normal.y, 1);
    close(hit.dot, -4);
    const side = collider.platformWorld.ray(new BABYLON.Vector3(14, 1.9, 10), new BABYLON.Vector3(-2, 0, 0), 0)[0];
    close(side.t, .5); close(side.normal.x, 1);
    assert.equal(collider.platformWorld.ray(new BABYLON.Vector3(14, 3, 10), new BABYLON.Vector3(-2, 0, 0), 0).length, 0);
});
test('a nearer static wall wins over the disk', () => {
    block(10, 3, 10);
    const hit = collider.rayCollidesWithMap(new BABYLON.Vector3(10.5, 5, 10.5),
        new BABYLON.Vector3(0, -5, 0), collider.projectileCollidesWithCell.bind(collider));
    assert.ok(!hit.platform); close(hit.pick.pickedPoint.y, 4);
    map.data[10][3][10] = {};
});
test('ray callbacks can decorate or reject disk hits', () => {
    const origin = new BABYLON.Vector3(10, 4, 10), direction = new BABYLON.Vector3(0, -2.5, 0);
    const hit = collider.rayCollidesWithMap(origin, direction, (origin, direction, voxel) => {
        const hit = collider.projectileCollidesWithCell(origin, direction, voxel);
        if (hit) hit.voxel = voxel;
        return hit;
    });
    assert.ok(hit.voxel);
    assert.equal(hit.voxel.y, 2);
    assert.ok(!collider.rayCollidesWithMap(origin, direction, () => false));
});
test('ordinary maps retain the existing movement result', () => {
    collider.platformWorld = new PlatformWorld();
    const a = player({ y: 3 }), b = player({ y: 3 });
    const input = { delta: 1, ddx: .5, ddz: .5 };
    assert.deepEqual(a.simulateMovement(input, true), originalSimulate.call(b, input, true));
    diskWorld();
});
test('invalid metadata is ignored and valid example data loads', () => {
    const example = JSON.parse(fs.readFileSync(new URL('./client/example.json', import.meta.url)));
    assert.equal(SpinDisk.read(example).length, 1);
    for (const bad of [{ speed: Infinity }, { radius: -1 }, { x: -5 }, { y: 100 }, { radius: '3' }]) {
        example.extents.spinningDisks = [{ ...disk, ...bad }];
        assert.equal(SpinDisk.read(example).length, 0);
    };
    assert.deepEqual(SpinDisk.read(null), []);
});
test('render meshes and callbacks are cleaned up', () => {
    const before = scene.meshes.length;
    const preview = SpinDiskRender.create(scene, [disk]);
    assert.equal(preview.nodes.length, 1);
    assert.ok(scene.meshes.length > before);
    preview.dispose();
    assert.equal(scene.meshes.length, before);
});
test('editor metadata survives save/open with a non-zero map origin', () => {
    const context = vm.createContext({ PlatformEditorState, PlatformMap, PlatformWorld, mapMeshes: [], plugins: new PluginManager('game'),
        document: { getElementById: () => null, readyState: 'loading', addEventListener() {} },
        scene: null, extern: {}, map: {}, minMap: {}, extents: {},
    });
    vm.runInContext(`
        var initMap = function () { plugins.emitSync('editorInitMapBefore', {}); plugins.emitSync('editorInitMapAfter', {}); };
        var maximizeMap = function (json) { plugins.emitSync('editorLoadMapBefore', { json }); plugins.emitSync('editorLoadMapAfter', { json }); return true; };
        var generateExtents = function () {
            plugins.emitSync('editorExtentsBefore', {});
            extents = {x:{min:18,max:31},y:{min:0,max:5},z:{min:18,max:31}};
            plugins.emitSync('editorExtentsAfter', { extents });
        };
        var minimizeMap = function () {
            generateExtents();
            var minMap = {width:extents.width,height:extents.height,depth:extents.depth,extents};
            plugins.emitSync('editorSaveMap', { minMap, extents });
            return minMap;
        };
    `, context);
    vm.runInContext(fs.readFileSync(new URL('./editor.js', import.meta.url), 'utf8'), context);
    const example = fs.readFileSync(new URL('./client/example.json', import.meta.url), 'utf8');
    context.json = example;
    vm.runInContext('maximizeMap(json); var saved = minimizeMap();', context);
    const saved = JSON.parse(JSON.stringify(context.saved));
    assert.equal(saved.extents.spinningDisks, undefined);
    assert.deepEqual(saved.extents.platforms, PlatformMap.read(JSON.parse(example)));
    const general = JSON.parse(example);
    general.extents.platforms = [{ id: 'lift', position: { x: 7, y: 1.5, z: 7 },
        shapes: [{ type: 'box', min: { x: -1, y: -.5, z: -1 }, max: { x: 1, y: .5, z: 1 } }],
        motion: { type: 'path', points: [{}, { x: 2 }], duration: 4, loop: 'pingpong' } }];
    context.json = JSON.stringify(general);
    vm.runInContext('maximizeMap(json); saved = minimizeMap();', context);
    const platform = JSON.parse(JSON.stringify(context.saved.extents.platforms[0]));
    assert.deepEqual(platform.position, general.extents.platforms[0].position);
    assert.deepEqual(platform.motion, general.extents.platforms[0].motion);
    assert.deepEqual(platform.shapes, general.extents.platforms[0].shapes);
    vm.runInContext('initMap(); var cleared = minimizeMap();', context);
    assert.equal(context.cleared.extents.platforms.length, 0);
});

test('physics editing turns a placed block into a platform and back without changing the block', () => {
    const state = new PlatformEditorState(), block = { mesh: spinner.name, x: 10, y: 2, z: 10, ry: 1 };
    const draft = state.draft(block);
    assert.equal(draft.motion.type, 'none'); assert.equal(state.bodies.length, 0);
    draft.motion = { type: 'spin', axis: { y: 1 }, pivot: state.pivot(draft, [spinner]), speed: -30 };
    state.apply(draft, map);
    assert.equal(state.bodies.length, 1); assert.deepEqual(state.bodies[0].blocks, [block]);
    const editing = state.draft(block); editing.motion.speed = 60;
    assert.equal(state.bodies[0].motion.speed, -30);
    state.apply(editing, map); assert.equal(state.bodies.length, 1);
    const staticBlock = state.draft(block); staticBlock.motion = { type: 'none' };
    state.apply(staticBlock, map); assert.equal(state.bodies.length, 0);
    assert.deepEqual(block, { mesh: spinner.name, x: 10, y: 2, z: 10, ry: 1 });
});
test('editor centre and corner pivots follow full, aabb, obb and triangle collision geometry', () => {
    for (const type of ['full', 'aabb', 'obb', 'mesh']) {
        const root = BABYLON.MeshBuilder.CreateBox('test.pivot.' + type, {}, scene);
        root.colliderType = type;
        const child = BABYLON.MeshBuilder.CreateBox('collider', { width: 4, height: 2, depth: 6 }, scene);
        child.parent = root; root.colliderMesh = child;
        const state = new PlatformEditorState(), body = state.draft({ mesh: root.name, x: 10, y: 2, z: 10, ry: 1 });
        const centre = state.pivot(body, [root]), corner = state.pivot(body, [root], '---');
        close(centre.x, 0); close(centre.y, 0); close(centre.z, 0);
        close(corner.x, type === 'full' ? -.5 : -3); close(corner.y, type === 'full' ? -.5 : -1); close(corner.z, type === 'full' ? -.5 : -2);
        root.dispose();
    };
});
test('editor motion survives origin changes, map translation, rotation and deletion', () => {
    const state = new PlatformEditorState(), grid = { width: 50, height: 50, depth: 50, data: [] };
    const block = { mesh: spinner.name, x: 25, y: 3, z: 25 }, draft = state.draft(block);
    draft.motion = { type: 'path', points: [{}, { x: 4 }, { x: 4, y: 2 }], duration: 8, loop: 'loop' };
    state.apply(draft, grid);
    const saved = { width: 20, height: 10, depth: 20, data: {}, extents: { x: { min: 18 }, y: { min: 2 }, z: { min: 18 }, platforms: state.save({ x: 18, y: 2, z: 18 }) } };
    const loaded = new PlatformEditorState(); loaded.load(saved);
    assert.deepEqual(loaded.bodies[0].position, { x: 25.5, y: 1.5, z: 25.5 });
    assert.deepEqual(loaded.save({ x: 18, y: 0, z: 18 }), saved.extents.platforms);
    state.translate({ x: 1, y: 2, z: -1 });
    grid.data[26] = []; grid.data[26][5] = []; grid.data[26][5][24] = { idx: 1, ry: 2 };
    state.sync(grid, [null, spinner]);
    assert.equal(state.bodies[0].blocks[0].ry, 2); assert.equal(state.bodies[0].position.x, 26.5);
    delete grid.data[26][5][24]; state.sync(grid, [null, spinner]); assert.equal(state.bodies.length, 0);
});

test('movement copying preserves destination blocks and rebinds centre and corner spin pivots', () => {
    const state = new PlatformEditorState(), source = state.draft({ mesh: spinner.name, x: 10, y: 2, z: 10 });
    const target = state.draft({ mesh: 'test.copy.full', x: 14, y: 3, z: 12, ry: 1 });
    const full = BABYLON.MeshBuilder.CreateBox('test.copy.full', {}, scene); full.colliderType = 'full';
    source.motion = { type: 'path', points: [{ x: 1, y: -1 }, { z: 3 }], duration: 7, loop: 'loop',
        orient: true, turnDuration: .8, headingOffset: 90, phase: 2 };
    const config = state.copyMovement(source), original = JSON.stringify(target);
    const pasted = state.pasteMovement(target, JSON.parse(JSON.stringify(config)), [full]);
    assert.deepEqual(pasted.motion, source.motion); assert.equal(pasted.id, target.id);
    assert.deepEqual(pasted.position, target.position); assert.deepEqual(pasted.blocks, target.blocks);
    pasted.motion.points[0].x = 99; assert.equal(config.motion.points[0].x, 1); assert.equal(source.motion.points[0].x, 1);
    assert.equal(JSON.stringify(target), original); assert.equal(state.bodies.length, 0);
    for (const mode of ['centre', 'corner', 'custom']) {
        source.motion = { type: 'spin', axis: { y: 1 }, pivot: { x: 2, z: 3 }, speed: -20, phase: 1 };
        const copy = state.copyMovement(source, mode, '+-+'), result = state.pasteMovement(target, copy, [full]);
        assert.deepEqual(result.motion.pivot, mode === 'custom' ? source.motion.pivot : state.pivot(target, [full], mode === 'corner' ? '+-+' : null));
        assert.equal(result.motion.speed, -20); assert.equal(result.motion.phase, 1);
    };
    assert.throws(() => state.pasteMovement(target, {}, [full]), /Copy a movement/);
    full.dispose();
});

test('offset model centres follow their path guides and stay centred through travel turns', () => {
    for (const type of ['full', 'aabb', 'obb', 'mesh', 'visual']) {
        const root = BABYLON.MeshBuilder.CreateBox('test.centred.' + type, { width: .8, height: .3, depth: .35 }, scene);
        root.position.set(-.02, -.3, .28); root.bakeCurrentTransformIntoVertices(); root.position.set(0, 0, 0);
        root.colliderType = type === 'visual' ? 'aabb' : type;
        if (type !== 'visual') {
            const child = root.clone('offset-collider'); child.parent = root; root.colliderMesh = child;
        };
        const state = new PlatformEditorState(), draft = state.draft({ mesh: root.name, x: 10, y: 2, z: 10, ry: 1 });
        draft.rotation = { y: .4 };
        const centre = PlatformMotion.vector(state.pivot(draft, [root]));
        for (const type of ['path', 'circle']) for (const orient of [false, true]) {
            draft.motion = type === 'path' ? { type, points: [{}, { x: 3 }, { x: 3, z: 2 }], duration: 8, loop: 'loop', orient, turnDuration: .4 } :
                { type, radius: 2, duration: 8, plane: 'xz', orient };
            const world = new PlatformWorld([draft], [root]), body = world.bodies[0], envelope = world.sweptBounds(body);
            const base = PlatformMotion.sample({ ...draft, motion: { type: 'none' } }, 0);
            assert.equal(draft.motion.pivot, undefined);
            const guides = PlatformGuides.create(scene, [draft], {}, [root]);
            const start = guides.nodes.find(node => node.name === 'physics-waypoint-1').position;
            const anchor = new BABYLON.Vector3(0, centre.y, 0);
            const expectedStart = BABYLON.Vector3.TransformCoordinates(anchor, base);
            close(BABYLON.Vector3.Distance(start, expectedStart), 0);
            for (let time = 0; time <= 8; time += .125) {
                const movement = type === 'path' ? PlatformMotion.pathAt(draft.motion, time) : PlatformMotion.circle(draft.motion, time);
                const expected = BABYLON.Vector3.TransformCoordinates(anchor.add(movement.position), base);
                const pose = world.pose(body, time), actual = BABYLON.Vector3.TransformCoordinates(centre, pose.matrix);
                close(BABYLON.Vector3.Distance(actual, expected), 0);
                for (const axis of ['x', 'y', 'z']) {
                    assert.ok(pose.bounds.min[axis] >= envelope.min[axis] - 1e-5);
                    assert.ok(pose.bounds.max[axis] <= envelope.max[axis] + 1e-5);
                };
            };
            guides.dispose();
        };
        root.dispose();
    };
});
test('physics editing rejects invalid movement and leaves saved settings intact', () => {
    const state = new PlatformEditorState(), body = state.draft({ mesh: spinner.name, x: 10, y: 2, z: 10 });
    body.motion = { type: 'spin', axis: { y: 1 }, speed: 30 }; state.apply(body, map);
    const invalid = state.draft(body.blocks[0]); invalid.motion.axis = {};
    assert.throws(() => state.apply(invalid, map)); assert.equal(state.bodies[0].motion.axis.y, 1);
    invalid.motion = { type: 'path', points: [{}, { x: 100 }], duration: 1, loop: 'loop' };
    assert.throws(() => state.apply(invalid, map)); assert.equal(state.bodies[0].motion.type, 'spin');
    assert.throws(() => state.draft({ mesh: 'invalid', x: 1, y: 1, z: 1 }));
});
test('editor previews align imported blocks with editor cells and restore all render resources', () => {
    const before = scene.meshes.length, materials = scene.materials.length;
    const definition = { id: 'preview', position: { x: 10.5, y: 2.5, z: 10.5 },
        blocks: [{ mesh: spinner.name, x: 10, y: 2, z: 10 }],
        motion: { type: 'path', points: [{}, { x: 4 }], duration: 8, loop: 'pingpong' } };
    let time = 0;
    const render = PlatformRender.create(scene, new PlatformWorld([definition], [spinner]), [spinner], () => time, { x: .5, y: .5, z: .5 });
    const root = render.nodes[0];
    close(root.position.x, 10); close(root.position.y, 2); close(root.position.z, 10);
    time = 2; scene.onBeforeRenderObservable.notifyObservers(scene);
    close(root.position.x, 12); close(root.position.y, 2);
    scene.onBeforeRenderObservable.notifyObservers(scene); close(root.position.x, 12);
    render.dispose(); assert.equal(scene.meshes.length, before); assert.equal(scene.materials.length, materials);
    assert.equal(spinner.isEnabled(), false); close(spinner.position.x, 0);
});

const boxBody = (motion = { type: 'none' }) => ({ id: 'box', position: { x: 10, y: 1.5, z: 10 },
    shapes: [{ type: 'box', min: { x: -2, y: -.5, z: -.5 }, max: { x: 2, y: .5, z: .5 } }], motion });
function useBody(body) { collider.platformWorld = new PlatformWorld([body], [], new PlatformClock(() => 0)); return collider.platformWorld; };
test('a rotating box changes occupied space and projectile hits', () => {
    const world = useBody(boxBody({ type: 'spin', axis: { y: 1 }, speed: 90 }));
    const p = player({ x: 11.5, y: 1.8 });
    const bounds = DynamicMapBlocksPlugin.playerBounds(p);
    assert.ok(world.overlap(p, bounds, 0));
    assert.equal(world.overlap(p, bounds, 1), false);
    const origin = new BABYLON.Vector3(10, 4, 11.5), direction = new BABYLON.Vector3(0, -3, 0);
    assert.equal(world.ray(origin, direction, 0).length, 0);
    close(world.ray(origin, direction, 1)[0].point.y, 2);
});
test('a corner pivot moves the geometry and its passenger together', () => {
    const body = boxBody({ type: 'spin', axis: { y: 1 }, pivot: { x: -2, z: -.5 }, speed: 90 });
    const world = useBody(body), p = player({ x: 10, z: 10 });
    for (let i = 0; i < 60; i++) p.simulateMovement({ delta: 1 });
    const expected = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(0, .5, 0), world.pose(world.bodies[0], 1).matrix);
    close(p.x, expected.x); close(p.z, expected.z); close(p.y, expected.y);
});
test('linear movement carries passengers without walking velocity', () => {
    useBody(boxBody({ type: 'path', points: [{}, { x: 2 }], duration: 4, loop: 'pingpong' }));
    const p = player({ x: 10.5 });
    for (let i = 0; i < 60; i++) p.simulateMovement({ delta: 1 });
    close(p.x, 11.5, .0001); close(p.y, 2); close(p.dx, 0);
});
test('elevators carry up and down using the same contact solver', () => {
    useBody(boxBody({ type: 'path', points: [{}, { y: 2 }], duration: 4, loop: 'pingpong' }));
    const p = player({ x: 10 });
    for (let i = 0; i < 60; i++) p.simulateMovement({ delta: 1 });
    close(p.y, 3, .0001);
    for (let i = 0; i < 180; i++) p.simulateMovement({ delta: 1 });
    close(p.y, 2, .0001); assert.equal(p.jumping, false);
});
test('path loops are continuous, constant speed, and independent of call order', () => {
    const body = boxBody({ type: 'path', points: [{}, { x: 2 }, { x: 2, z: 2 }, { z: 2 }], duration: 8, loop: 'loop' });
    const point = t => BABYLON.Vector3.TransformCoordinates(BABYLON.Vector3.Zero(), PlatformMotion.sample(body, t));
    close(point(1).x, 11); close(point(3).z, 11);
    assert.ok(BABYLON.Vector3.Distance(point(8 - 1e-5), point(8 + 1e-5)) < .0001);
    assert.deepEqual(point(3), point(11));
});
test('arbitrary rotation axes work for box collision and ray normals', () => {
    const world = useBody(boxBody({ type: 'spin', axis: { x: 1 }, speed: 90 }));
    const hits = world.ray(new BABYLON.Vector3(10, 4, 10), new BABYLON.Vector3(0, -3, 0), .5);
    assert.ok(hits.length);
    close(hits[0].normal.length(), 1);
    assert.ok(Math.abs(hits[0].normal.z) > .5);
});
test('full, aabb and obb block adapters use collision definitions without mutating templates', () => {
    for (const type of ['full', 'aabb', 'obb']) {
        const source = BABYLON.MeshBuilder.CreateBox('test.block.' + type, { size: 1 }, scene);
        source.colliderType = type;
        const child = BABYLON.MeshBuilder.CreateBox('collision', { width: .5, height: .5, depth: .5 }, scene);
        child.parent = source; child.rotation.y = Math.PI / 4; source.colliderMesh = child;
        const original = child.computeWorldMatrix(true).clone();
        const body = { id: type, position: { x: 10.5, y: 2.5, z: 10.5 },
            blocks: [{ mesh: source.name, x: 10, y: 2, z: 10 }], motion: { type: 'path', points: [{}, { x: 2 }], duration: 4, loop: 'pingpong' } };
        const world = new PlatformWorld([body], [source]);
        const origin = new BABYLON.Vector3(11.5, 4, 10.5), direction = new BABYLON.Vector3(0, -3, 0);
        assert.ok(world.ray(origin, direction, 1).length);
        assert.equal(world.ray(origin, direction, 0).length, 0);
        assert.ok(original.equals(child.computeWorldMatrix(true)));
        source.dispose();
    };
});
test('assigned map blocks leave static geometry and map preparation is idempotent', () => {
    const body = { id: 'group', position: { x: 10.5, y: 2.5, z: 10.5 }, motion: { type: 'none' },
        blocks: [{ mesh: 'test.block.full', x: 10, y: 2, z: 10 }] };
    const original = { width: 24, height: 8, depth: 24, extents: { platforms: [body] },
        data: { 'test.block.full': [{ x: 10, y: 2, z: 10 }, { x: 11, y: 2, z: 10 }] } };
    const prepared = PlatformMap.prepare(original);
    assert.equal(prepared.data['test.block.full'].length, 1);
    assert.equal(original.data['test.block.full'].length, 2);
    assert.deepEqual(PlatformMap.prepare(prepared), prepared);
});
test('snapshot restore and extrapolation retain platform time', () => {
    useBody(boxBody({ type: 'path', points: [{}, { x: 2 }], duration: 4, loop: 'pingpong' }));
    const p = player({ x: 10.5 }), snapshot = p.createSnapshot();
    p.simulateMovement({ delta: 1 }); const expected = p.createSnapshot(true);
    p.restoreSnapshot(snapshot); p.simulateMovement({ delta: 1 });
    assert.deepEqual(p.createSnapshot(true), expected);
    const before = p.platformTime;
    const predicted = p.simulateMovement({ ...p.createSnapshot(true), delta: 1 }, true);
    close(p.platformTime, before); close(predicted.platformTime, before + 1 / 60);
});
test('a delayed replay samples historical geometry even when the render clock changes', () => {
    const world = useBody(boxBody({ type: 'path', points: [{}, { x: 2 }], duration: 4, loop: 'pingpong' }));
    const p = player({ x: 10.5 }), start = p.createSnapshot(true);
    const a = p.simulateMovement({ ...start, delta: 1 }, true);
    world.clock.observe(1000);
    const b = p.simulateMovement({ ...start, delta: 1 }, true);
    assert.deepEqual(a, b);
});
test('scoped collision times are restored after an exception', () => {
    const world = collider.platformWorld;
    assert.throws(() => world.at(4, () => { throw Error('test'); }));
    assert.equal(world.time, null);
});
test('server state packets carry the authoritative clock and each player simulation time', async () => {
    const roomCollider = { platformWorld: collider.platformWorld };
    const manager = new PluginManager('game');
    PlatformProtocol.register(manager);
    await manager.emit('roomInitEnd', {});
    const output = new Comm.Out();
    let sent;
    await manager.emit('clientSync', { output, this: { Collider: roomCollider, players_by_id: [{ id: 2, platformTime: 3.25 }],
        sendToAll(packet, from, name) { sent = packet; assert.equal(name, 'platformState'); } } });
    assert.equal(output.idx, 0);
    const input = new Comm.In(sent.buffer);
    assert.equal(input.unPackInt8U(), Comm.Code.platformState);
    const state = JSON.parse(input.unPackLongString());
    close(state.time, 1000); assert.deepEqual(state.players, [{ id: 2, time: 3.25 }]);
});
test('client clock decoding restores player time before the standard sync payload is read', async () => {
    const manager = new PluginManager('game');
    const world = new PlatformWorld([], [], new PlatformClock(() => 0));
    const players = []; players[2] = { platformTime: 0 };
    const context = vm.createContext({ Comm, isClient: true, Collider: { platformWorld: world }, players_by_id: players, ping: 0 });
    const source = fs.readFileSync(new URL('./protocol.js', import.meta.url), 'utf8')
        .replace(/^import .*;\r?$/gm, '').replace(/^export /gm, '');
    vm.runInContext(source + '\nglobalThis.protocol = PlatformProtocol;', context);
    context.protocol.register(manager);
    await manager.emit('onResourcesLoadedEnd', {});
    const output = new Comm.Out(); output.packLongString(JSON.stringify({ time: 4, players: [{ id: 2, time: 3.25 }] }));
    await manager.emit('LegacyShellOnMessage', { cmd: Comm.Code.platformState, input: new Comm.In(output.buffer) });
    assert.equal(manager.cancel, true); close(world.now(), 4);
    const sync = new Comm.Out(); sync.packInt8U(2); sync.packInt8U(7);
    const input = new Comm.In(sync.buffer);
    await manager.emit('LegacyShellOnMessage', { cmd: Comm.Code.sync, input });
    close(players[2].platformTime, 3.25);
    assert.equal(input.idx, 0); assert.equal(input.unPackInt8U(), 2); assert.equal(input.unPackInt8U(), 7);
});
test('complete loops still sweep the passenger path instead of checking only the endpoint', () => {
    const world = useBody(boxBody({ type: 'path', points: [{}, { x: 2 }, { x: 2, z: 2 }, { z: 2 }], duration: 8, loop: 'loop' }));
    const p = player({ x: 10.5 }), bounds = DynamicMapBlocksPlugin.playerBounds(p);
    let checked = 0;
    world.carry(p, bounds, 0, 8, () => { checked++; return false; });
    assert.ok(checked > 100);
});
test('swept bounds include path travel and off-centre rotations', () => {
    for (const motion of [
        { type: 'spin', axis: { y: 1 }, pivot: { x: -2 }, speed: 90 },
        { type: 'path', points: [{}, { x: 4 }, { z: 4 }], duration: 8, loop: 'loop' },
    ]) {
        const world = useBody(boxBody(motion)), body = world.bodies[0], bounds = world.sweptBounds(body);
        for (let i = 0; i < 40; i++) for (const part of world.pose(body, i * .2).parts) {
            for (const axis of ['x', 'y', 'z']) {
                assert.ok(part.bounds.min[axis] >= bounds.min[axis] - .00001);
                assert.ok(part.bounds.max[axis] <= bounds.max[axis] + .00001);
            };
        };
    };
});
test('imported spinner uses its hidden child triangles, including the rim outside its anchor cell', () => {
    const asset = JSON.parse(fs.readFileSync(new URL('./models/map.babylon', import.meta.url)));
    assert.ok(asset.meshes.every(mesh => mesh.positions.length && mesh.indices.length && !mesh.geometryId));
    const staticMap = { width: 24, height: 8, depth: 24, data: { 'dynamic.spinner.mesh': [{ x: 10, y: 1, z: 10 }] } };
    collider.setParams(map, [...meshes, spinner]);
    map.data[10][1][10] = { idx: 2, mesh: spinner };
    DynamicMapBlocksPlugin.configure(collider, staticMap, [spinner]);
    const bounds = DynamicMapBlocksPlugin.playerBounds(player());
    assert.ok(collider.meshCollidesWithCell(collider.playerCollisionMesh, { x: 10.5, y: 1.4, z: 10.5 }, 10, 1, 10));
    assert.ok(collider.platformWorld.overlap({ x: 13.2, y: 1.4, z: 10.5 }, bounds));
    assert.equal(collider.platformWorld.overlap({ x: 13.1, y: 1.4, z: 13.1 }, bounds), false);
    assert.ok(collider.meshCollidesWithMap(collider.playerCollisionMesh, { x: 13.2, y: 1.4, z: 10.5 }));
    const p = player({ x: 13, y: 2.5, z: 10.5 });
    for (let i = 0; i < 90; i++) p.simulateMovement({ delta: 1 });
    close(p.y, 1.5); close(p.x, 13); close(p.z, 10.5);
    assert.equal(spinner.colliderMesh.isVisible, false);
    map.data[10][1][10] = {};
    collider.setParams(map, meshes);
});
test('triangle mesh rays hit the top, side and underside with outward bounce normals', () => {
    const body = { id: 'spinner', position: { x: 10.5, y: 2, z: 10.5 },
        blocks: [{ mesh: 'dynamic.spinner.mesh', x: 10, y: 1, z: 10 }], motion: { type: 'none' } };
    body.position.y = 1.5;
    const world = new PlatformWorld([body], [spinner]);
    for (const [origin, direction, expected] of [
        [[12.5, 3, 10.5], [0, -3, 0], [0, 1, 0]],
        [[12.5, 1, 10.5], [0, 1, 0], [0, -1, 0]],
        [[14, 1.4, 10.5], [-2, 0, 0], [1, 0, 0]],
    ]) {
        const hit = world.ray(BABYLON.Vector3.FromArray(origin), BABYLON.Vector3.FromArray(direction))[0];
        assert.ok(hit); assert.ok(BABYLON.Vector3.Dot(hit.normal, BABYLON.Vector3.FromArray(expected)) > .99);
    };
    assert.equal(world.ray(new BABYLON.Vector3(13.2, 3, 13.2), new BABYLON.Vector3(0, -3, 0)).length, 0);
});
test('static mesh bullets and grenades use triangles beyond the anchor and retain nearest wall ordering', () => {
    const staticMap = { width: 24, height: 8, depth: 24, data: { 'dynamic.spinner.mesh': [{ x: 10, y: 1, z: 10 }] } };
    collider.setParams(map, [...meshes, spinner]);
    map.data[10][1][10] = { idx: 2, mesh: spinner };
    DynamicMapBlocksPlugin.configure(collider, staticMap, [spinner]);
    const origin = new BABYLON.Vector3(12.5, 4, 10.5), direction = new BABYLON.Vector3(0, -4, 0);
    const hit = collider.rayCollidesWithMap(origin, direction, collider.grenadeCollidesWithCell.bind(collider));
    close(hit.pick.pickedPoint.y, 1.5); close(hit.normal.y, 1); assert.ok(hit.dot < 0);
    block(12, 2, 10);
    const nearer = collider.rayCollidesWithMap(origin, direction, collider.projectileCollidesWithCell.bind(collider));
    close(nearer.pick.pickedPoint.y, 3);
    map.data[12][2][10] = {}; map.data[10][1][10] = {};
    collider.setParams(map, meshes);
});
test('the imported triangle spinner carries through rotation and linear paths', () => {
    for (const motion of [{ type: 'spin', axis: { y: 1 }, speed: 90 },
        { type: 'path', points: [{}, { x: 2 }], duration: 4, loop: 'pingpong' }]) {
        const body = { id: 'spinner', position: { x: 10.5, y: 2.5, z: 10.5 },
            blocks: [{ mesh: 'dynamic.spinner.mesh', x: 10, y: 2, z: 10 }], motion };
        const metadata = { width: 24, height: 8, depth: 24, extents: { platforms: [body] }, data: { 'dynamic.spinner.mesh': body.blocks } };
        assert.equal(PlatformMap.read(metadata).length, 1);
        const prepared = PlatformMap.prepare(metadata);
        assert.equal(prepared.data['dynamic.spinner.mesh'].length, 0);
        collider.platformWorld = new PlatformWorld(PlatformMap.read(prepared), [spinner], new PlatformClock(() => 0));
        const p = player({ x: 12.5, y: 2.5, z: 10.5 });
        for (let i = 0; i < 60; i++) p.simulateMovement({ delta: 1 });
        close(p.y, 2.5);
        close(p.x, motion.type === 'spin' ? 10.5 : 13.5, .0001);
        close(p.z, motion.type === 'spin' ? 8.5 : 10.5, .0001);
    };
});
test('concave child collision geometry preserves holes and closed solids contain embedded boxes', () => {
    const torus = BABYLON.MeshBuilder.CreateTorus('ring', { diameter: 4, thickness: .8, tessellation: 32 }, scene);
    const geometry = PlatformShapes.create({ type: 'mesh', positions: torus.getVerticesData('position'), indices: torus.getIndices() });
    const box = (x, y, z, size = .1) => ({ min: new BABYLON.Vector3(x - size, y - size, z - size), max: new BABYLON.Vector3(x + size, y + size, z + size) });
    assert.equal(geometry.overlap(BABYLON.Matrix.Identity(), box(0, 0, 0)), false);
    assert.ok(geometry.overlap(BABYLON.Matrix.Identity(), box(2, 0, 0)));
    assert.equal(geometry.ray(new BABYLON.Vector3(0, 2, 0), new BABYLON.Vector3(0, -4, 0)), false);
    assert.ok(geometry.ray(new BABYLON.Vector3(2, 2, 0), new BABYLON.Vector3(0, -4, 0)));
    torus.dispose();
});
test('nested collider transforms, scale and quarter turns retain triangle accuracy without template mutations', () => {
    const root = BABYLON.MeshBuilder.CreateBox('test.nested.mesh', {}, scene);
    root.position.set(3, 2, 4); root.rotation.y = .2;
    const parent = new BABYLON.Mesh('collider-root', scene); parent.parent = root; parent.position.x = 1;
    const child = BABYLON.MeshBuilder.CreateBox('nested-collider', { size: 1 }, scene);
    child.parent = parent; child.position.x = 1; child.scaling.set(2, .5, .5); child.rotation.y = .4;
    root.colliderMesh = parent;
    root.computeWorldMatrix(true); parent.computeWorldMatrix(true);
    const before = child.computeWorldMatrix(true).clone();
    const body = { id: 'nested', position: { x: 10.5, y: 2.5, z: 10.5 },
        blocks: [{ mesh: root.name, x: 10, y: 2, z: 10, ry: 1 }], motion: { type: 'none' } };
    const world = new PlatformWorld([body], [root]);
    const hit = world.ray(new BABYLON.Vector3(10.5, 4, 8.5), new BABYLON.Vector3(0, -3, 0))[0];
    assert.ok(hit); close(hit.point.y, 2.75); close(hit.normal.y, 1);
    assert.ok(before.equals(child.computeWorldMatrix(true)));
    assert.equal(world.ray(new BABYLON.Vector3(10.5, 4, 10.5), new BABYLON.Vector3(0, -3, 0)).length, 0);
    root.dispose();
});
test('model lookup works after the game loader splits the qualified model name', () => {
    spinner.name = 'spinner'; spinner.theme = 'dynamic';
    const world = new PlatformWorld(PlatformMap.staticMeshes({ data: { 'dynamic.spinner.mesh': [{ x: 10, y: 1, z: 10 }] } }), [spinner]);
    assert.ok(world.ray(new BABYLON.Vector3(12, 3, 10.5), new BABYLON.Vector3(0, -3, 0)).length);
    spinner.name = 'dynamic.spinner.mesh';
});
test('open triangle surfaces collide from both sides without filling their bounding box', () => {
    const geometry = PlatformShapes.create({ type: 'mesh', positions: [0, 0, 0, 2, 0, 0, 0, 0, 2], indices: [0, 1, 2] });
    const box = (x, y, z) => ({ min: new BABYLON.Vector3(x - .05, y - .05, z - .05), max: new BABYLON.Vector3(x + .05, y + .05, z + .05) });
    assert.ok(geometry.overlap(BABYLON.Matrix.Identity(), box(.5, 0, .5)));
    assert.equal(geometry.overlap(BABYLON.Matrix.Identity(), box(1.5, 0, 1.5)), false);
    assert.equal(geometry.overlap(BABYLON.Matrix.Identity(), box(.5, -.2, .5)), false);
    for (const side of [-1, 1]) assert.ok(geometry.ray(new BABYLON.Vector3(.5, side, .5), new BABYLON.Vector3(0, -side * 2, 0)));
});
test('soft triangle colliders retain point-query ignoreSoft behavior', () => {
    spinner.softness = 'soft';
    DynamicMapBlocksPlugin.configure(collider, { data: { 'dynamic.spinner.mesh': [{ x: 10, y: 1, z: 10 }] } }, [spinner]);
    const point = new BABYLON.Vector3(13.2, 1.4, 10.5);
    assert.ok(collider.pointCollidesWithMap(point, false));
    assert.equal(collider.pointCollidesWithMap(point, true), false);
    delete spinner.softness;
});
test('vertical triangle sweeps stop fast falls and head bumps at thin two-sided surfaces', () => {
    const world = new PlatformWorld([{ id: 'surface', position: { x: 10, y: 2, z: 10 },
        shapes: [{ type: 'mesh', positions: [-2, 0, -2, 2, 0, -2, 0, 0, 2], indices: [0, 1, 2] }], motion: { type: 'none' } }]);
    const bounds = DynamicMapBlocksPlugin.playerBounds(player());
    close(world.vertical({ x: 10, y: 10, z: 10 }, -20, bounds, 0).y, 2);
    close(world.vertical({ x: 10, y: 0, z: 10 }, 20, bounds, 0).y, 1.4);
    assert.equal(world.vertical({ x: 12, y: 10, z: 12 }, -20, bounds, 0), false);
});
test('direct sweeps match sampled contacts for tilted triangle, box and cylinder geometry', () => {
    const bounds = DynamicMapBlocksPlugin.playerBounds(player());
    const shapes = [
        { type: 'mesh', positions: Array.from(spinner.colliderMesh.getVerticesData('position')), indices: Array.from(spinner.colliderMesh.getIndices()) },
        { type: 'box', min: { x: -2, y: -.2, z: -1 }, max: { x: 2, y: .2, z: 1 } },
        { type: 'cylinder', radius: 2, height: .4 },
    ];
    for (let i = 0; i < 36; i++) {
        const world = new PlatformWorld([{ id: 'tilted', position: { x: 10, y: 2.5, z: 10 },
            rotation: { x: .17 + i * .019, y: i * .731, z: -.21 }, shapes: [shapes[i % shapes.length]], motion: { type: 'none' } }]);
        const pos = { x: 10 + Math.cos(i * 2.1) * 1.7, y: 6, z: 10 + Math.sin(i * 2.1) * 1.7 };
        const distance = -5, hit = world.vertical(pos, distance, bounds, 0);
        let low = 0, high, expected = false;
        for (let j = 1; j <= 500; j++) {
            high = j / 500;
            if (world.overlap({ ...pos, y: pos.y + distance * high }, bounds, 0)) {
                for (let k = 0; k < 25; k++) {
                    const mid = (low + high) / 2;
                    if (world.overlap({ ...pos, y: pos.y + distance * mid }, bounds, 0)) high = mid; else low = mid;
                };
                expected = pos.y + distance * low; break;
            };
            low = high;
        };
        if (expected === false) assert.equal(hit, false); else { assert.ok(hit); close(hit.y, expected, 1e-5); };
    };
});
test('transformed collision caches update when a matrix changes in place', () => {
    const box = { min: new BABYLON.Vector3(-.1, -.1, -.1), max: new BABYLON.Vector3(.1, .1, .1) };
    for (const definition of [
        { type: 'box', min: { x: -.5, y: -.5, z: -.5 }, max: { x: .5, y: .5, z: .5 } },
        { type: 'mesh', positions: [0, 0, 0, 1, 0, 0, 0, 0, 1], indices: [0, 1, 2] },
    ]) {
        const geometry = PlatformShapes.create(definition), matrix = BABYLON.Matrix.Identity();
        assert.ok(PlatformShapes.overlap(geometry, matrix, box));
        matrix.setTranslation(new BABYLON.Vector3(4, 0, 0));
        assert.equal(PlatformShapes.overlap(geometry, matrix, box), false);
        matrix.setTranslation(BABYLON.Vector3.Zero());
        assert.ok(PlatformShapes.overlap(geometry, matrix, box));
    };
});
test('coincident supports retain their map order when choosing a passenger platform', () => {
    const shape = { type: 'box', min: { x: -1, y: -.5, z: -1 }, max: { x: 1, y: .5, z: 1 } };
    const world = new PlatformWorld(['first', 'second'].map(id => ({ id, position: { x: 10, y: 1.5, z: 10 },
        shapes: [shape], motion: { type: 'spin', axis: { y: 1 }, speed: id === 'first' ? 30 : -30 } })));
    assert.equal(world.vertical({ x: 10, y: 3, z: 10 }, -2, DynamicMapBlocksPlugin.playerBounds(player()), 0).body.definition.id, 'first');
});
test('standing on static and rotating meshes needs a bounded number of overlap queries', () => {
    for (const type of ['none', 'spin']) {
        const body = { id: 'spinner', position: { x: 10.5, y: 2.5, z: 10.5 },
            blocks: [{ mesh: spinner.name, x: 10, y: 2, z: 10 }], motion: { type, axis: { y: 1 }, speed: 30 } };
        const world = new PlatformWorld([body], [spinner], new PlatformClock(() => 0));
        collider.platformWorld = world;
        const p = player({ x: 12.5, y: 2.5, z: 10.5 });
        for (let i = 0; i < 10; i++) p.simulateMovement({ delta: 1 });
        let calls = 0;
        const overlap = world.overlap;
        world.overlap = function (...args) { calls++; return overlap.apply(this, args); };
        for (let i = 0; i < 60; i++) p.simulateMovement({ delta: 1 });
        assert.ok(calls <= 60 * 6, 'standing overlap queries: ' + calls);
        close(p.y, 2.5);
        assert.ok(world.bodies[0].cache.size <= 8);
    };
});
test('custom overlap-only shapes retain the sampled vertical fallback', () => {
    const box = PlatformShapes.create({ type: 'box', min: { x: -1, y: -.5, z: -1 }, max: { x: 1, y: .5, z: 1 } });
    PlatformShapes.register('overlap-only-test', () => ({ vertices: box.vertices,
        overlap: (matrix, bounds) => PlatformShapes.overlap(box, matrix, bounds), ray: box.ray }));
    const world = new PlatformWorld([{ id: 'custom', position: { x: 10, y: 2.5, z: 10 },
        shapes: [{ type: 'overlap-only-test' }], motion: { type: 'none' } }]);
    close(world.vertical({ x: 10, y: 4, z: 10 }, -2, DynamicMapBlocksPlugin.playerBounds(player()), 0).y, 3);
    PlatformShapes.types.delete('overlap-only-test');
});
test('full-block side contact keeps triangle passengers stable without growing collision work', () => {
    const wall = [];
    for (let z = 7; z <= 14; z++) for (let y = 2; y <= 3; y++) { block(13, y, z); wall.push([13, y, z]); };
    try {
        for (const type of ['none', 'spin']) for (const delta of [1, 6]) {
            const body = { id: 'wall-contact', position: { x: 10.5, y: 2.5, z: 10.5 },
                blocks: [{ mesh: spinner.name, x: 10, y: 2, z: 10 }], motion: { type, axis: { y: 1 }, speed: -30 } };
            const world = new PlatformWorld([body], [spinner], new PlatformClock(() => 0));
            collider.platformWorld = world;
            const p = player({ x: 12.749999, y: 2.5, z: 9.5 });
            let queries = 0;
            const overlap = world.overlap;
            world.overlap = function (...args) { queries++; return overlap.apply(this, args); };
            for (let i = 0; i < 240; i++) {
                const input = { delta, ddx: 1 }, before = p.createSnapshot(true);
                const a = p.simulateMovement(input, true), b = p.simulateMovement(input, true);
                assert.deepEqual(a, b); assert.deepEqual(p.createSnapshot(true), before);
                p.simulateMovement(input);
                assert.ok(p.x <= 12.75); close(p.y, 2.5); close(p.z, 9.5);
            };
            assert.ok(queries <= 240 * 18, 'wall contact overlap queries: ' + queries);
            assert.ok(world.bodies[0].cache.size <= 8);
        };
    } finally {
        for (const [x, y, z] of wall) map.data[x][y][z] = {};
    };
});
test('circular paths close in every plane, reverse and stay within swept bounds while facing travel', () => {
    for (const plane of ['xz', 'xy', 'yz']) for (const orient of [false, true]) {
        const definition = boxBody({ type: 'circle', radius: 2, duration: 8, plane, orient });
        const world = new PlatformWorld([definition]), body = world.bodies[0], bounds = world.sweptBounds(body);
        const start = world.pose(body, 0).matrix, end = world.pose(body, 8).matrix;
        for (const axis of ['x', 'y', 'z']) close(start.getTranslation()[axis], end.getTranslation()[axis]);
        const reversed = { ...definition, motion: { ...definition.motion, reverse: true } };
        const a = PlatformMotion.sample(definition, 2).getTranslation(), b = PlatformMotion.sample(reversed, 6).getTranslation();
        for (const axis of ['x', 'y', 'z']) close(a[axis], b[axis]);
        for (let i = 0; i <= 120; i++) {
            const pose = world.pose(body, i / 15);
            for (const axis of ['x', 'y', 'z']) {
                assert.ok(pose.bounds.min[axis] >= bounds.min[axis] - 1e-5);
                assert.ok(pose.bounds.max[axis] <= bounds.max[axis] + 1e-5);
            };
        };
    };
});
test('path facing snaps or smoothly turns at corners and remains deterministic across the loop seam', () => {
    const motion = { type: 'path', points: [{}, { x: 2 }, { x: 2, z: 2 }, { z: 2 }], duration: 8, loop: 'loop', orient: true, turnDuration: 0 };
    const body = boxBody(motion), facing = t => BABYLON.Vector3.TransformNormal(BABYLON.Axis.Z, PlatformMotion.sample(body, t));
    close(facing(1).x, 1); close(facing(2).z, 1);
    body.motion = { ...motion, turnDuration: .5 };
    close(facing(2).x, 1); close(facing(2.25).x, Math.SQRT1_2); close(facing(2.25).z, Math.SQRT1_2); close(facing(2.5).z, 1);
    assert.ok(BABYLON.Vector3.Distance(facing(8 - 1e-5), facing(8 + 1e-5)) < .001);
    assert.deepEqual(facing(3), facing(11));
    close(PlatformMotion.angularTravel(body.motion, 1.9, 2.6), Math.PI / 2);
    close(PlatformMotion.angularTravel(body.motion, 0, 80), Math.PI * 20);
    const vertical = boxBody({ type: 'path', points: [{}, { y: 4 }], duration: 8, loop: 'pingpong', orient: true, headingOffset: -90 });
    const modelFront = BABYLON.Vector3.TransformNormal(BABYLON.Axis.X, PlatformMotion.sample(vertical, 1));
    close(modelFront.x, 0); close(modelFront.y, 1); close(modelFront.z, 0);
});
test('circular and turning paths carry passengers around a complete cycle without drift', () => {
    for (const motion of [{ type: 'circle', radius: 2, duration: 8, plane: 'xz', orient: true },
        { type: 'path', points: [{}, { x: 2 }, { x: 2, z: 2 }, { z: 2 }], duration: 8, loop: 'loop', orient: true, turnDuration: .5 }]) {
        const world = useBody({ id: 'turning-ride', position: { x: 10, y: 2.5, z: 10 }, motion,
            shapes: [{ type: 'box', min: { x: -2, y: -.5, z: -2 }, max: { x: 2, y: 0, z: 2 } }] });
        const p = player({ x: 10.75, y: 2.5, z: 10 });
        for (let i = 0; i < 480; i++) p.simulateMovement({ delta: 1 });
        close(p.x, 10.75, .0001); close(p.y, 2.5); close(p.z, 10, .0001);
        assert.equal(!!world.overlap(p, DynamicMapBlocksPlugin.playerBounds(p), p.platformTime), false);
    };
});
test('moving blocks push stationary players and prediction reproduces the same displacement', () => {
    const body = { id: 'pusher', position: { x: 10, y: 1.5, z: 10 },
        shapes: [{ type: 'box', min: { x: -.5, y: -.5, z: -.5 }, max: { x: .5, y: .5, z: .5 } }],
        motion: { type: 'path', points: [{}, { x: 4 }], duration: 8, loop: 'pingpong' } };
    const world = useBody(body), p = player({ x: 12, y: 1.0015 });
    for (let i = 0; i < 180; i++) {
        const before = p.createSnapshot(true), a = p.simulateMovement({ delta: 1 }, true), b = p.simulateMovement({ delta: 1 }, true);
        assert.deepEqual(a, b); assert.deepEqual(p.createSnapshot(true), before);
        p.simulateMovement({ delta: 1 }); close(p.x, a.x);
    };
    assert.ok(p.x >= 13.75); assert.equal(!!world.overlap(p, DynamicMapBlocksPlugin.playerBounds(p), p.platformTime), false);
});
test('fast thin movers and rotating blades displace actors instead of passing through them', () => {
    const body = { id: 'thin', position: { x: 8, y: 1.5, z: 10 },
        shapes: [{ type: 'box', min: { x: -.01, y: -.5, z: -1 }, max: { x: .01, y: .5, z: 1 } }],
        motion: { type: 'path', points: [{}, { x: 8 }], duration: 1, loop: 'pingpong' } };
    let world = useBody(body), bounds = DynamicMapBlocksPlugin.playerBounds(player());
    let pos = world.transport({ x: 8.8, y: 1.1, z: 10 }, bounds, 0, .1, () => false, false);
    assert.ok(pos.x > 9.85); assert.equal(!!world.overlap(pos, bounds, .1), false);
    body.shapes = [{ type: 'box', min: { x: -2, y: -.5, z: -.1 }, max: { x: 2, y: .5, z: .1 } }];
    body.position.x = 10; body.motion = { type: 'spin', axis: { y: 1 }, speed: 90 };
    world = useBody(body); pos = { x: 11.1, y: 1.1, z: 8.9 };
    for (let i = 0; i < 60; i++) pos = world.transport(pos, bounds, i / 60, (i + 1) / 60, () => false, false);
    assert.ok(Math.hypot(pos.x - 11.1, pos.z - 8.9) > .3); assert.equal(!!world.overlap(pos, bounds, 1), false);
});
test('moving triangle collision surfaces push actors while concave holes stay empty', () => {
    const root = BABYLON.MeshBuilder.CreateBox('test.pusher.mesh', {}, scene);
    const collision = BABYLON.MeshBuilder.CreateBox('collision', { width: .04, height: 1, depth: 2 }, scene);
    collision.parent = root; root.colliderMesh = collision; root.colliderType = 'mesh';
    const definition = { id: 'triangle-pusher', position: { x: 10.5, y: 1.5, z: 10.5 }, blocks: [{ mesh: root.name, x: 10, y: 1, z: 10 }],
        motion: { type: 'path', points: [{}, { x: 4 }], duration: 8, loop: 'pingpong' } };
    const world = new PlatformWorld([definition], [root]), bounds = DynamicMapBlocksPlugin.playerBounds(player());
    let pos = { x: 11.3, y: 1.1, z: 10.5 };
    for (let i = 0; i < 120; i++) pos = world.transport(pos, bounds, i / 60, (i + 1) / 60, () => false, false);
    assert.ok(pos.x >= 12.77); assert.equal(!!world.overlap(pos, bounds, 2), false);
    root.dispose();
    const ring = new BABYLON.Mesh('test.ring.mesh', scene);
    const torus = BABYLON.MeshBuilder.CreateTorus('ring-collider', { diameter: 4, thickness: .8, tessellation: 24 }, scene);
    torus.parent = ring; ring.colliderMesh = torus; ring.colliderType = 'mesh';
    const holeWorld = new PlatformWorld([{ id: 'hole', position: { x: 10.5, y: 1.5, z: 10.5 },
        blocks: [{ mesh: ring.name, x: 10, y: 1, z: 10 }], motion: { type: 'path', points: [{}, { x: .2 }], duration: 2, loop: 'pingpong' } }], [ring]);
    pos = { x: 10.5, y: 1.1, z: 10.5 };
    for (let i = 0; i < 120; i++) pos = holeWorld.transport(pos, bounds, i / 60, (i + 1) / 60, () => false, false);
    close(pos.x, 10.5); close(pos.y, 1.1); close(pos.z, 10.5); ring.dispose();
});
test('platform pushes stop at solid walls', () => {
    block(13, 1, 10); block(13, 2, 10);
    try {
        const body = { id: 'wall-pusher', position: { x: 10, y: 1.5, z: 10 },
            shapes: [{ type: 'box', min: { x: -.5, y: -.5, z: -.5 }, max: { x: .5, y: .5, z: .5 } }],
            motion: { type: 'path', points: [{}, { x: 4 }], duration: 8, loop: 'pingpong' } };
        useBody(body); const p = player({ x: 12.7, y: 1.0015 });
        for (let i = 0; i < 210; i++) { p.simulateMovement({ delta: 1 }); assert.ok(p.x <= 12.75); };
    } finally { map.data[13][1][10] = {}; map.data[13][2][10] = {}; };
});
test('the same moving contact solver pushes thrown grenades', () => {
    useBody({ id: 'grenade-pusher', position: { x: 10, y: 1.5, z: 10 },
        shapes: [{ type: 'box', min: { x: -.5, y: -.5, z: -.5 }, max: { x: .5, y: .5, z: .5 } }],
        motion: { type: 'path', points: [{}, { x: 4 }], duration: 8, loop: 'pingpong' } });
    const oldRoom = scene.room; scene.room = { Collider: collider };
    const grenade = new Grenade(scene), owner = player();
    owner.modifiers.grenadeTimerModifier = 1; owner.modifiers.grenadeBounceModifier = 1;
    grenade.throw(owner, { x: 11.4, y: 1.07, z: 10 }, { x: 0, y: 0, z: 0 });
    for (let i = 0; i < 120; i++) grenade.update(1);
    assert.ok(grenade.x >= 12.57, JSON.stringify({ x: grenade.x, y: grenade.y, z: grenade.z, time: grenade.platformTime })); assert.ok(grenade.ttl > 0);
    scene.room = oldRoom;
});
test('missing colliders stay visual-only and render clones hide collision descendants', () => {
    const cart = BABYLON.MeshBuilder.CreateBox('castle.track-cart.aabb', {}, scene);
    cart.colliderType = 'aabb';
    const state = new PlatformEditorState(), draft = state.draft({ mesh: cart.name, x: 10, y: 2, z: 10 });
    draft.motion = { type: 'circle', radius: 1, duration: 8, plane: 'xz' }; state.apply(draft, map);
    const world = new PlatformWorld(state.bodies, [cart]);
    assert.ok(world.bodies[0].parts.every(part => part.visualOnly));
    assert.equal(world.overlap({ x: 10.5, y: 2.5, z: 10.5 }, DynamicMapBlocksPlugin.playerBounds(player()), 0), false);
    assert.equal(world.ray(new BABYLON.Vector3(10.5, 4, 10.5), new BABYLON.Vector3(0, -4, 0), 0).length, 0);
    collider.setParams(map, [...meshes, cart]); collider.platformWorld = new PlatformWorld();
    map.data[10][2][10] = { idx: 2, mesh: cart };
    assert.equal(collider.pointCollidesWithMap(new BABYLON.Vector3(10.5, 2.5, 10.5)), false);
    map.data[10][2][10] = {}; collider.setParams(map, meshes);
    const child = BABYLON.MeshBuilder.CreateBox('collision', {}, scene); child.parent = cart; cart.colliderMesh = child;
    const nested = BABYLON.MeshBuilder.CreateBox('nested-collision', {}, scene); nested.parent = child;
    const decoration = BABYLON.MeshBuilder.CreateBox('decoration', {}, scene); decoration.parent = cart;
    const render = PlatformRender.create(scene, new PlatformWorld(state.bodies, [cart]), [cart], () => 0);
    const children = render.nodes[0].getChildMeshes()[0].getChildMeshes();
    assert.equal(children[0].isVisible, false); assert.equal(children[1].isVisible, false); assert.equal(children[2].isVisible, true);
    assert.equal(child.isVisible, true); render.dispose(); cart.dispose();
});
test('coloured path guides include travel arrows and release their meshes and materials', () => {
    const count = scene.meshes.length, materials = scene.materials.length;
    const definitions = [boxBody({ type: 'path', points: [{}, { x: 2 }, { z: 2 }], duration: 8, loop: 'loop' }),
        { ...boxBody({ type: 'circle', radius: 2, duration: 8, plane: 'xz' }), id: 'circle' }];
    const guides = PlatformGuides.create(scene, definitions, { x: .5, y: .5, z: .5 });
    assert.ok(guides.nodes.some(node => node.name === 'physics-direction')); assert.ok(guides.nodes.every(node => !node.isPickable));
    guides.dispose(); assert.equal(scene.meshes.length, count); assert.equal(scene.materials.length, materials);
});

test('moving lighting samples a compact atlas smoothly without leaking adjacent slices', () => {
    const grid = Array.from({ length: 4 }, (_, x) => Array.from({ length: 3 }, (_, y) =>
        Array.from({ length: 5 }, (_, z) => x === 0 ? .2 : x === 3 ? 1.5 : .3 + y * .15 + z * .08)));
    const field = PlatformLighting.pack(grid, 4, 3, 5, 16);
    assert.ok(field.textureWidth <= 16 && field.textureHeight <= 16);
    for (let x = 0; x < 4; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 5; z++) {
        close(PlatformLighting.sample(field, { x, y, z }), Math.max(.5, Math.min(1, grid[x][y][z])), .003);
    };
    const values = Array.from({ length: 21 }, (_, i) => PlatformLighting.sample(field, { x: i * .15, y: .5, z: 2.5 }));
    assert.equal(values[0], .5); assert.equal(values.at(-1), 1);
    assert.ok(values.every((value, i) => !i || value >= values[i - 1] - 1e-8));
    assert.equal(PlatformLighting.sample(field, { x: -1, y: 1, z: 1 }), 1);
    assert.equal(PlatformLighting.pack(grid, 4, 3, 5, 3), null);
});

test('lighting switches immediately, keeps source materials intact and frees its textures and materials', () => {
    const caps = engine.getCaps(), units = caps.maxVertexTextureImageUnits;
    const allocate = BABYLON.RawTexture.CreateLuminanceTexture;
    let allocated = 0, disposed = 0;
    BABYLON.RawTexture.CreateLuminanceTexture = (bytes, width, height, scene, mipmaps) => {
        assert.equal(bytes.length, width * height); assert.equal(mipmaps, false); allocated++;
        return { dispose() { disposed++; } };
    };
    for (const gpu of [false, true]) {
        caps.maxVertexTextureImageUnits = gpu ? 1 : 0;
        const material = new BABYLON.ShaderMaterial('lighting-source', scene, 'standard', { attributes: ['position', 'normal', 'color'],
            uniforms: ['worldViewProjection'], defines: ['#define COLORMULT'] });
        let binds = 0; material.onBind = () => binds++;
        const root = new BABYLON.AbstractMesh('lighting-test', scene), mesh = BABYLON.MeshBuilder.CreateBox('lit-block', {}, scene);
        mesh.parent = root; mesh.position.set(1, 1, 1); mesh.material = material;
        const counts = [scene.materials.length, scene.textures.length], options = JSON.stringify(material._options);
        PlatformLighting.setEnabled(false);
        const handle = PlatformLighting.create(scene, [root]), state = PlatformLighting.states.get(scene);
        assert.equal(mesh.material.name, 'moving-block-surface'); assert.equal(state.texture, null);
        const rest = state.bindings.values().next().value.meshes.get(mesh).rest.clone();
        const grid = Array.from({ length: 4 }, (_, x) => Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => x < 2 ? .2 : 1.5)));
        PlatformLighting.capture(scene, grid, 4, 3, 3); assert.equal(state.texture, null);
        PlatformLighting.setEnabled(true); assert.equal(mesh.material.name, 'moving-block-environment'); assert.equal(!!state.texture, gpu);
        mesh.position.x = 3; handle.update(1);
        const entry = state.bindings.values().next().value.meshes.get(mesh);
        assert.deepEqual(entry.rest.m, rest.m);
        if (!gpu) { close(entry.shade, 1); mesh.position.x = 0; handle.update(1.2); close(entry.shade, .5); };
        const originalEffect = mesh.material.getEffect;
        let boundRest;
        mesh.material.getEffect = () => ({ setMatrix(name, matrix) { boundRest = matrix; }, setFloat() {} });
        mesh.material.onBindObservable.notifyObservers(mesh);
        assert.equal(binds, 1); assert.equal(boundRest, entry.rest); mesh.material.getEffect = originalEffect;
        PlatformLighting.setEnabled(false); assert.equal(mesh.material.name, 'moving-block-surface'); assert.equal(state.texture, null);
        assert.equal(JSON.stringify(material._options), options);
        handle.dispose(); assert.equal(mesh.material, material); assert.equal(PlatformLighting.states.has(scene), false);
        assert.deepEqual([scene.materials.length, scene.textures.length], counts);
        root.dispose(); material.dispose();
    };
    caps.maxVertexTextureImageUnits = units;
    BABYLON.RawTexture.CreateLuminanceTexture = allocate;
    assert.equal(allocated, 1); assert.equal(disposed, 1);
});

test('platform shader hooks leave static surfaces alone and capture the existing map field once', () => {
    const original = { vertex: fs.readFileSync('src/shaders/standardVertexShader.glsl', 'utf8'), pixel: fs.readFileSync('src/shaders/standardPixelShader.glsl', 'utf8') };
    const patched = { ...original }; patchPlatformShader(patched);
    assert.equal(patched.pixel, original.pixel);
    assert.ok(patched.vertex.includes('#ifdef DMB_SURFACE')); assert.ok(patched.vertex.includes('#ifdef DMB_ENVIRONMENT'));
    assert.ok(patched.vertex.includes('dmbRestWorld * vec4(position, 1.0)'));
    assert.ok(patched.vertex.includes('//@vertexDeclarations (plugins insert GLSL here, see the shaderSources event)'));
    const core = fs.readFileSync('server-client/src/client-static/src/shellshock.min.js', 'utf8');
    assert.equal(core.split('plugins.emitSync("lightmapReady", { gameScene, lightMap, w, h, d });').length, 2);
});

test('lighting settings default off and the Local Test checkbox saves and applies immediately', () => {
    const elements = new Map(), values = {}, options = [];
    elements.set('autoDetail', { parentNode: { after(row) { for (const element of row.children) if (element.id) elements.set(element.id, element); } } });
    const settings = { finalised: false, addTab() {}, addOption(tab, option) { options.push(option); return option; },
        get(key, fallback) { return values[key] ?? fallback; }, set(key, value) { values[key] = value; } };
    const context = vm.createContext({ BABYLON, playOffline: true, LegacySettings: settings,
        document: { getElementById: id => elements.get(id), createElement() { return { children: [], append(...children) { this.children.push(...children); } }; } } });
    const source = fs.readFileSync(new URL('./lighting.js', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '').replace(/^export /gm, '');
    vm.runInContext(source, context);
    vm.runInContext('PlatformLighting.registerSettings(); PlatformLighting.registerSettings();', context);
    assert.equal(options.length, 1); assert.equal(options[0].default, false);
    const checkbox = elements.get('dmb-environment-setting'); assert.equal(checkbox.checked, false);
    checkbox.checked = true; checkbox.onchange();
    assert.equal(values.movingBlockLighting, true); assert.equal(vm.runInContext('PlatformLighting.enabled', context), true);
    options[0].onChange(false); assert.equal(vm.runInContext('PlatformLighting.enabled', context), false);
});

test('disposing a scene releases moving lighting without requiring an explicit renderer dispose', () => {
    const testScene = new BABYLON.Scene(engine), root = new BABYLON.AbstractMesh('lighting-root', testScene);
    const mesh = BABYLON.MeshBuilder.CreateBox('lighting-mesh', {}, testScene); mesh.parent = root;
    mesh.material = new BABYLON.ShaderMaterial('scene-lighting', testScene, 'standard', { attributes: ['position'], uniforms: ['world'] });
    const handle = PlatformLighting.create(testScene, [root]), state = PlatformLighting.states.get(testScene);
    assert.ok(PlatformLighting.active.has(state)); testScene.dispose();
    assert.equal(PlatformLighting.active.has(state), false); assert.equal(PlatformLighting.states.has(testScene), false);
    handle.dispose();
});
test('a cached map model set missing the spinner is repaired without reloading existing templates', async () => {
    const templates = [BABYLON.MeshBuilder.CreateBox('test.existing.full', {}, scene)];
    const definition = { width: 24, height: 8, depth: 24, data: { 'dynamic.spinner.mesh': [{ x: 10, y: 1, z: 10 }] } };
    let requests = 0;
    const request = async url => {
        assert.equal(url, 'models/map.babylon'); requests++;
        return { ok: true, text: async () => fs.readFileSync(new URL('./models/map.babylon', import.meta.url), 'utf8') };
    };
    await PlatformAssets.ensure(definition, templates, scene, request);
    assert.equal(templates.length, 2); assert.equal(requests, 1);
    const imported = templates[1];
    assert.equal(imported.name, 'dynamic.spinner.mesh');
    assert.ok(imported.colliderMesh.getIndices().length);
    assert.equal(imported.isEnabled(), false); assert.equal(imported.colliderMesh.isVisible, false);
    await PlatformAssets.ensure(definition, templates, scene, request);
    assert.equal(requests, 1);
    templates.forEach(mesh => mesh.dispose());
});
test('client map loading initializes triangle queries without the server-only setParams call', async () => {
    const manager = new PluginManager('game'), clientCollider = new ColliderConstructor(scene);
    const clientMeshes = [null, meshes[1], spinner];
    const definition = { width: 24, height: 8, depth: 24, data: { 'dynamic.spinner.mesh': [{ x: 10, y: 1, z: 10 }] } };
    map.data[10][1][10] = { idx: 2, mesh: spinner };
    const context = vm.createContext({ BABYLON, Player, ColliderConstructor, isClient: true, plugins: manager,
        PlatformMap, PlatformWorld, PlatformShapes, PlatformAssets, PlatformLighting, PlatformProtocol: { register() {} },
        Collider: clientCollider, map, mapMeshes: clientMeshes, gameScene: scene, PlatformRender: { create() {} } });
    const source = fs.readFileSync(new URL('./shared.js', import.meta.url), 'utf8').replace(/^import .*;\r?$/gm, '').replace(/^export /gm, '');
    vm.runInContext(source, context);
    await manager.emit('createMapCellsMapLoaded', { minMap: definition, gameScene: scene });
    assert.equal(clientCollider.platformMap, map);
    assert.ok(clientCollider.pointCollidesWithMap(new BABYLON.Vector3(10.5, 1.4, 10.5)));
    assert.equal(clientCollider.platformSources, clientMeshes);
    map.data[10][1][10] = {};
});
test('synchronous hooks run all listeners before returning and retain cancellation', () => {
    const manager = new PluginManager('game'), calls = [], data = {};
    manager.on('game:check', event => { calls.push(1); event.result = 42; manager.cancel = true; });
    manager.on('game:check', () => { calls.push(2); });
    manager.emitSync('check', data);
    assert.deepEqual(calls, [1, 2]); assert.equal(data.result, 42); assert.equal(manager.cancel, true);
    manager.emitSync('empty', {}); assert.equal(manager.cancel, false);
});

test('core physics hooks leave prototypes intact and can cancel default movement', () => {
    const before = Player.prototype.simulateMovement;
    DynamicMapBlocksPlugin.install(plugins);
    assert.equal(Player.prototype.simulateMovement, before);
    const key = plugins.type + ':playerMovement', listeners = plugins.listeners[key];
    let defaults = 0;
    try {
        plugins.listeners[key] = [data => { data.result = { x: 99 }; plugins.cancel = true; }];
        const fake = { simulateMovementDefault() { defaults++; } };
        assert.deepEqual(before.call(fake, {}, true), { x: 99 }); assert.equal(defaults, 0);
        plugins.listeners[key] = [];
        before.call(fake, {}, true); assert.equal(defaults, 1);
    } finally { plugins.listeners[key] = listeners; }
});

test('passenger turning defaults off and follows spin only while supported', () => {
    const bounds = DynamicMapBlocksPlugin.playerBounds(player());
    const definition = PlatformMap.fromDisk(disk);
    let world = new PlatformWorld([definition], [], new PlatformClock(() => 0));
    world.vertical = () => { throw Error('disabled passenger turning queried collision'); };
    assert.equal(world.passengerTurn({ x: 11, y: 2, z: 10 }, bounds, 0, 1), 0);
    definition.motion.rotatePlayers = true;
    world = new PlatformWorld([definition], [], new PlatformClock(() => 0));
    close(world.passengerTurn({ x: 11, y: 2, z: 10 }, bounds, 0, 1), Math.PI / 2);
    assert.equal(world.passengerTurn({ x: 11, y: 2.1, z: 10 }, bounds, 0, 1), 0);
    definition.motion.speed = -90;
    world = new PlatformWorld([definition], [], new PlatformClock(() => 0));
    close(world.passengerTurn({ x: 11, y: 2, z: 10 }, bounds, 0, 1), -Math.PI / 2);
});

test('travel-facing passenger turning follows circular and smooth corner orientations', () => {
    const bounds = DynamicMapBlocksPlugin.playerBounds(player());
    for (const motion of [
        { type: 'circle', radius: 2, duration: 8, plane: 'xz', orient: true, rotatePlayers: true },
        { type: 'path', points: [{}, { x: 2 }, { x: 2, z: 2 }, { z: 2 }], duration: 8, loop: 'loop', orient: true, turnDuration: .5, rotatePlayers: true },
    ]) {
        const definition = PlatformMap.fromDisk(disk); definition.motion = motion;
        const world = new PlatformWorld([definition]); const body = world.bodies[0];
        for (const [from, to] of [[0, .1], [1.9, 2.1], [7.9, 8.1]]) {
            const pos = BABYLON.Vector3.TransformCoordinates(BABYLON.Vector3.Zero(), world.pose(body, from).matrix);
            const a = BABYLON.Vector3.TransformNormal(BABYLON.Axis.Z, world.pose(body, from).matrix);
            const b = BABYLON.Vector3.TransformNormal(BABYLON.Axis.Z, world.pose(body, to).matrix);
            const expected = Math.atan2(Math.sin(Math.atan2(b.x, b.z) - Math.atan2(a.x, a.z)), Math.cos(Math.atan2(b.x, b.z) - Math.atan2(a.x, a.z)));
            close(world.passengerTurn(pos, bounds, from, to), expected);
        }
    }
});

test('player yaw turns before input recording and skips replay, humans on server and takeoff', () => {
    const definition = PlatformMap.fromDisk(disk); definition.motion.rotatePlayers = true;
    const world = new PlatformWorld([definition], [], new PlatformClock(() => 0));
    const p = player({ x: 11, y: 2, z: 10, yaw: .3, dy: 0, platformTime: 0 }); p.Collider = { platformWorld: world };
    DynamicMapBlocksPlugin.turnPlayer({ player: p, delta: 1, resim: false });
    close(p.yaw, .3 + Math.PI / 120);
    const yaw = p.yaw;
    DynamicMapBlocksPlugin.turnPlayer({ player: p, delta: 1, resim: true }); close(p.yaw, yaw);
    p.client = { isHuman: true };
    DynamicMapBlocksPlugin.turnPlayer({ player: p, delta: 1 }); close(p.yaw, yaw);
    p.client = undefined; p.dy = .1;
    DynamicMapBlocksPlugin.turnPlayer({ player: p, delta: 1 }); close(p.yaw, yaw);
    const minMap = { width: 24, height: 8, depth: 24, extents: { platforms: [definition] } };
    assert.equal(PlatformMap.read(minMap)[0].motion.rotatePlayers, true);
    definition.motion.rotatePlayers = 'yes'; assert.equal(PlatformMap.read(minMap).length, 0);
});

test('editor preview survives edits, invalid drafts and selection changes until explicitly stopped', () => {
    const fields = new Map(), api = {}, created = [];
    let valid = true, time = 100;
    const element = id => {
        if (!fields.has(id)) fields.set(id, { value: '', checked: false, disabled: false, children: [], classList: { toggle() {} },
            querySelectorAll() { return []; }, checkValidity() { return valid; }, reportValidity() { return valid; } });
        return fields.get(id);
    };
    for (const [id, value] of Object.entries({ movement: 'spin', axis: 'y', pivot: 'custom', speed: '30', direction: '1', phase: '0' })) element(id).value = value;
    for (const axis of ['x', 'y', 'z']) element('pivot-' + axis).value = '0';
    const body = PlatformMap.fromDisk(disk); body.id = 'preview-test';
    const context = vm.createContext({ editorAPI: api, PlatformMap, PlatformEditorState, PlatformWorld,
        PlatformGuides: { create() { return { dispose() {} }; } }, plugins: new PluginManager('game'),
        performance: { now: () => time * 1000 }, scene: {}, map, mapMeshes: [],
        mapContainer: { getChildMeshes() { return []; } },
        document: { getElementById: id => element(id.slice(4)), readyState: 'loading', addEventListener() {} },
        PlatformRender: { create(scene, world, sources, sampleTime) {
            const view = { nodes: [], sampleTime, world, disposed: false, dispose() { this.disposed = true; } };
            created.push(view); return view;
        } },
    });
    let source = fs.readFileSync(new URL('./editor.js', import.meta.url), 'utf8');
    source = source.replace(/\}\)\(\);\s*$/, 'showSelection = selection => { selected = selection; return true; }; Object.assign(editorAPI, { startPreview, fieldsChanged, clearSelection, stopPreview, select(value) { selected = value; }, choose, load(...bodies) { state.bodies = bodies; }, active() { return previewMode; } });})();');
    vm.runInContext(source, context); api.load(body); api.select({ id: body.id });
    api.startPreview(false); assert.equal(api.active(), 'selected'); assert.equal(created.length, 1);
    time = 103; close(created[0].sampleTime(), 3);
    element('speed').value = '45'; api.fieldsChanged();
    assert.equal(created.length, 2); assert.equal(created[0].disposed, true); close(created[1].sampleTime(), 3);
    assert.equal(created[1].world.bodies[0].definition.motion.speed, 45);
    valid = false; element('speed').value = ''; api.fieldsChanged();
    assert.equal(created.length, 2); assert.equal(created[1].disposed, false); assert.equal(api.active(), 'selected');
    api.clearSelection(); assert.equal(created[1].disposed, false); assert.equal(element('preview').disabled, false);
    valid = true; api.select({ block: { mesh: 'test.block.full', x: 0, y: 1, z: 0 } }); api.fieldsChanged();
    assert.equal(created.length, 2); assert.equal(api.active(), 'selected');
    api.stopPreview(); assert.equal(created[1].disposed, true); assert.equal(api.active(), null);
    element('movement').value = 'spin'; element('speed').value = '45'; api.select({ id: body.id }); api.startPreview(true);
    api.select({ block: { mesh: 'test.block.full', x: 0, y: 1, z: 0 } }); element('movement').value = 'none'; api.fieldsChanged();
    assert.equal(api.active(), 'all');
    assert.equal(created.at(-1).world.bodies.find(item => item.definition.id === body.id).definition.motion.speed, 45);
    api.stopPreview();
    const other = PlatformMap.fromDisk({ ...disk, x: 16 }); other.id = 'other-preview';
    api.load(body, other); element('movement').value = 'spin'; element('speed').value = '45';
    api.select({ id: body.id }); api.startPreview(false);
    const playing = created.at(-1), count = created.length;
    api.choose({ id: body.id }); assert.equal(created.length, count, 'picking the same block leaves its preview alone');
    api.choose({ id: other.id });
    assert.equal(playing.disposed, true, 'the old block stops'); assert.equal(api.active(), 'selected');
    assert.ok(created.at(-1).world.bodies.some(item => item.definition.id === other.id) && !created.at(-1).world.bodies.some(item => item.definition.id === body.id), 'the new block plays');
    const following = created.at(-1); element('movement').value = 'none';
    api.choose({ id: body.id }); assert.equal(following.disposed, true); assert.equal(api.active(), null, 'a still block has nothing to play');
    api.choose({ id: other.id }); assert.equal(api.active(), null, 'nothing was playing, so nothing starts');
});

test('render time ignores transient replay rewinds and converges without backward frames', () => {
    let time = 0, target = 10;
    const clock = new PlatformRenderClock(() => target, () => time);
    close(clock.now(), 10);
    for (let i = 0; i < 120; i++) {
        time += 1 / 120; target = 10 + Math.floor(time * 60) / 60;
        if (i % 12 === 0) target -= .08;
        const before = clock.time, next = clock.now();
        assert.ok(next >= before); assert.ok(next - before <= 1 / 120 * 1.25 + 1e-8);
        assert.ok(Math.abs(next - (10 + time)) < .03);
    };
    target = 20; close(clock.now(), 20);
    time += 2; target = 22; close(clock.now(), 22);
});

test('the real castle bench centre follows every side of a path and its guide', async () => {
    const imported = await new Promise((resolve, reject) => BABYLON.SceneLoader.ImportMesh('', '',
        'data:' + fs.readFileSync('plugins_default/modernmapblocks/models/map.babylon', 'utf8'), scene, resolve, null, (_, message) => reject(Error(message))));
    const bench = imported.find(mesh => mesh.name === 'castle.bench.aabb');
    bench.colliderType = 'aabb'; bench.colliderMesh = bench.getChildMeshes()[0]; bench.setEnabled(false);
    try {
        for (const ry of [0, 1, 2, 3]) {
            const draft = new PlatformEditorState().draft({ mesh: bench.name, x: 10, y: 5, z: 10, ry });
            const centre = PlatformMotion.vector(new PlatformEditorState().pivot(draft, [bench]));
            assert.ok(Math.hypot(centre.x, centre.z) > .28);
            draft.motion = { type: 'path', points: [{ y: -1, z: 1 }, { x: -3, y: -1, z: 1 }, { x: -3, y: -1, z: -1 }, { y: -1, z: -1 }],
                duration: 8, loop: 'loop', orient: true, turnDuration: .4 };
            const world = new PlatformWorld([draft], [bench]), body = world.bodies[0], bounds = world.sweptBounds(body);
            const guide = PlatformGuides.create(scene, [draft], {}, [bench]);
            const render = PlatformRender.create(scene, world, [bench], () => 0);
            for (let time = 0; time < 8; time += .025) {
                const at = PlatformMotion.pathAt(draft.motion, time).position;
                const expected = new BABYLON.Vector3(draft.position.x + at.x, draft.position.y + centre.y + at.y, draft.position.z + at.z);
                const pose = world.pose(body, time), actual = BABYLON.Vector3.TransformCoordinates(centre, pose.matrix);
                close(BABYLON.Vector3.Distance(actual, expected), 0);
                for (const axis of ['x', 'y', 'z']) assert.ok(pose.bounds.min[axis] >= bounds.min[axis] - 1e-5 && pose.bounds.max[axis] <= bounds.max[axis] + 1e-5);
            };
            const start = guide.nodes.find(mesh => mesh.name === 'physics-waypoint-1').position;
            close(start.x, draft.position.x); close(start.z, draft.position.z + 1);
            render.dispose(); guide.dispose();
        };
    } finally { imported.forEach(mesh => mesh.dispose()); }
});

function dropGrenade(motion, pos, ticks, owner = player()) {
    useBody(boxBody(motion));
    const oldRoom = scene.room; scene.room = { Collider: collider };
    owner.modifiers.grenadeTimerModifier = 1; owner.modifiers.grenadeBounceModifier = 1;
    const grenade = new Grenade(scene); grenade.throw(owner, pos, { x: 0, y: 0, z: 0 }); grenade.ttl = 1e9;
    for (let i = 0; i < ticks; i++) grenade.update(1);
    scene.room = oldRoom;
    return grenade;
};
const localTo = (grenade) => BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(grenade.x, grenade.y, grenade.z), collider.platformWorld.pose(collider.platformWorld.bodies[0], grenade.platformTime).inverse);
test('a bouncing grenade keeps riding a path platform instead of sliding off and dropping through', () => {
    const grenade = dropGrenade({ type: 'path', points: [{}, { x: 4 }], duration: 8, loop: 'pingpong' }, { x: 9.5, y: 2.5, z: 10 }, 360);
    const local = localTo(grenade);
    assert.ok(grenade.y > 2.02 && Math.abs(local.x) < 2 && Math.abs(local.z) < .5, 'still on the deck, carried along: ' + JSON.stringify([grenade.x, grenade.y, local.x]));
    assert.ok(grenade.x > 10, 'moved with the platform: ' + grenade.x);
});
test('items can ignore a block turning under them while players still ride it', () => {
    const turning = rotateItems => ({ type: 'spin', axis: { y: 1 }, speed: 45, rotateItems });
    const turned = dropGrenade(turning(true), { x: 10.3, y: 2.5, z: 10 }, 200);
    const still = dropGrenade(turning(false), { x: 10.3, y: 2.5, z: 10 }, 200);
    assert.ok(turned.y > 2.02 && still.y > 2.02, 'both stay on the deck');
    assert.ok(Math.abs(Math.atan2(turned.z - 10, turned.x - 10)) > .7, 'rotates round with the block: ' + JSON.stringify([turned.x, turned.z]));
    assert.ok(Math.abs(Math.atan2(still.z - 10, still.x - 10)) < .1, 'stays where it landed: ' + JSON.stringify([still.x, still.z]));
});
test('collision can be switched off separately for players and items', () => {
    for (const [flags, playerBlocked, itemBlocked] of [[{}, true, true], [{ collidePlayers: false }, false, true], [{ collideItems: false }, true, false]]) {
        const motion = { type: 'path', points: [{}, { z: .001 }], duration: 8, loop: 'pingpong', ...flags };
        const world = useBody(boxBody(motion)), bounds = DynamicMapBlocksPlugin.playerBounds(player());
        const inside = { x: 10, y: 1.6, z: 10 };
        assert.equal(!!world.as('players', () => world.overlap(inside, bounds, 0)), playerBlocked);
        assert.equal(!!world.as('items', () => world.overlap(inside, bounds, 0)), itemBlocked);
        assert.ok(world.overlap(inside, bounds, 0), 'bullets and anything else still hit a block either group collides with');
        const owner = player({ x: 10, y: 3, z: 10 });
        const grenade = dropGrenade(motion, { x: 10, y: 3, z: 10 }, 200, owner);
        assert.equal(grenade.y > 2, itemBlocked);
    };
    const ghost = useBody(boxBody({ type: 'path', points: [{}, { z: .001 }], duration: 8, loop: 'pingpong', collidePlayers: false, collideItems: false }));
    assert.equal(ghost.overlap({ x: 10, y: 1.6, z: 10 }, DynamicMapBlocksPlugin.playerBounds(player()), 0), false);
    assert.equal(PlatformMap.read({ extents: { platforms: [{ ...boxBody({ type: 'spin', speed: 10, collideItems: 'no' }) }] }, width: 24, height: 8, depth: 24 }).length, 0);
});
test('a player passes through a block that does not collide with players', () => {
    useBody(boxBody({ type: 'path', points: [{}, { z: .001 }], duration: 8, loop: 'pingpong', collidePlayers: false }));
    const p = player({ x: 10, y: 3, z: 10 });
    for (let i = 0; i < 60; i++) p.simulateMovement({ delta: 1 });
    assert.ok(p.y < 1.9, 'fell through the top: ' + p.y);
    useBody(boxBody({ type: 'path', points: [{}, { z: .001 }], duration: 8, loop: 'pingpong' }));
    const q = player({ x: 10, y: 3, z: 10 });
    for (let i = 0; i < 60; i++) q.simulateMovement({ delta: 1 });
    close(q.y, 2, .02);
    diskWorld();
});

test('grenades settle on a moving deck at resting height and then stay put on it', () => {
    for (const motion of [{ type: 'path', points: [{}, { x: 4 }], duration: 8, loop: 'pingpong' }, { type: 'spin', axis: { y: 1 }, speed: 45 }]) {
        const grenade = dropGrenade(motion, { x: 10.3, y: 2.8, z: 10 }, 240), before = localTo(grenade);
        close(grenade.y, 2.07, .006);
        const again = (() => { const g = dropGrenade(motion, { x: 10.3, y: 2.8, z: 10 }, 360); return localTo(g); })();
        close(again.x, before.x, .03); close(again.z, before.z, .03);
    };
});
test('a grenade thrown at a block coming towards it bounces off the side without overlapping it', () => {
    useBody(boxBody({ type: 'path', points: [{}, { z: 4 }], duration: 8, loop: 'pingpong' }));
    const oldRoom = scene.room; scene.room = { Collider: collider };
    const owner = player(); owner.modifiers.grenadeTimerModifier = 1; owner.modifiers.grenadeBounceModifier = 1;
    const grenade = new Grenade(scene), bounds = { min: { x: -.07, y: -.07, z: -.07 }, max: { x: .07, y: .07, z: .07 } };
    grenade.throw(owner, { x: 10, y: 1.5, z: 12 }, { x: 0, y: 0, z: -.05 }); grenade.ttl = 1e9;
    let bounced = false, gap = 0;
    for (let i = 0; i < 140; i++) {
        grenade.update(1);
        assert.equal(!!collider.platformWorld.overlap(grenade, bounds, grenade.platformTime), false, 'inside the block at tick ' + i + ' ' + JSON.stringify([grenade.x, grenade.y, grenade.z, grenade.dx, grenade.dy, grenade.dz, grenade.platformTime]));
        bounced = bounced || grenade.dz > 0;
        if (bounced) gap = Math.max(gap, grenade.z - .07 - collider.platformWorld.pose(collider.platformWorld.bodies[0], grenade.platformTime).bounds.max.z);
    };
    scene.room = oldRoom;
    assert.ok(bounced, 'turned back from the side');
    assert.ok(gap > .2, 'knocked clear of the oncoming face, not shoved along on it: ' + gap);
});

test('a block that catches up with a slow grenade knocks it away instead of carrying it on its face', () => {
    const world = useBody({ id: 'catcher', position: { x: 10, y: 1.5, z: 10 }, shapes: [{ type: 'box', min: { x: -.5, y: -.5, z: -.5 }, max: { x: .5, y: .5, z: .5 } }],
        motion: { type: 'path', points: [{}, { x: 3 }], duration: 4, loop: 'pingpong' } });
    const oldRoom = scene.room; scene.room = { Collider: collider };
    const owner = player(); owner.modifiers.grenadeTimerModifier = 1; owner.modifiers.grenadeBounceModifier = 1;
    const grenade = new Grenade(scene); grenade.throw(owner, { x: 11.2, y: 1.07, z: 10 }, { x: 0, y: 0, z: 0 }); grenade.ttl = 1e9;
    let gap = 0;
    for (let i = 0; i < 90; i++) {
        grenade.update(1);
        gap = Math.max(gap, grenade.x - .07 - world.pose(world.bodies[0], grenade.platformTime).bounds.max.x);
        if (i > 40) assert.ok(grenade.x > 11.2, 'it was hit');
    };
    scene.room = oldRoom;
    assert.ok(gap > .2, 'knocked clear ahead of the face: ' + gap);
});
test('moving blocks shove resting grenades the way they shove players, never overlapping them', () => {
    const bounds = { min: { x: -.07, y: -.07, z: -.07 }, max: { x: .07, y: .07, z: .07 } };
    const cases = [
        [{ shapes: [{ type: 'box', min: { x: -.5, y: -.5, z: -.5 }, max: { x: .5, y: .5, z: .5 } }], motion: { type: 'path', points: [{}, { x: 4 }], duration: 8, loop: 'pingpong' } }, { x: 11.4, y: 1.07, z: 10 }, 400, 3],
        [{ shapes: [{ type: 'box', min: { x: -.5, y: -.5, z: -.5 }, max: { x: .5, y: .5, z: .5 } }], motion: { type: 'path', points: [{}, { x: 6 }], duration: 2, loop: 'pingpong' } }, { x: 11.4, y: 1.07, z: 10 }, 120, 5],
        [{ shapes: [{ type: 'box', min: { x: -2, y: -.5, z: -.25 }, max: { x: 2, y: .5, z: .25 } }], motion: { type: 'spin', axis: { y: 1 }, speed: 90 } }, { x: 11.5, y: 1.07, z: 9.4 }, 240, 2],
    ];
    const oldRoom = scene.room; scene.room = { Collider: collider };
    for (const [shape, start, ticks, moved] of cases) {
        const world = useBody({ id: 'shover', position: { x: 10, y: 1.5, z: 10 }, ...shape });
        const owner = player(); owner.modifiers.grenadeTimerModifier = 1; owner.modifiers.grenadeBounceModifier = 1;
        const grenade = new Grenade(scene); grenade.throw(owner, start, { x: 0, y: 0, z: 0 }); grenade.ttl = 1e9;
        let furthest = 0;
        for (let i = 0; i < ticks; i++) {
            grenade.update(1);
            assert.equal(!!world.overlap(grenade, bounds, grenade.platformTime), false, 'inside the block at tick ' + i);
            furthest = Math.max(furthest, Math.hypot(grenade.x - start.x, grenade.z - start.z));
        };
        assert.ok(furthest > moved, 'pushed along: ' + furthest);
    };
    scene.room = oldRoom;
});

test('snap repeat runs start to end once, then jumps back to the start', () => {
    const motion = { type: 'path', points: [{}, { x: 4 }], duration: 8, loop: 'snap', orient: true, turnDuration: .5 };
    close(PlatformMotion.pathAt(motion, 0).position.x, 0);
    close(PlatformMotion.pathAt(motion, 4).position.x, 2);
    assert.ok(PlatformMotion.pathAt(motion, 7.999).position.x > 3.99, 'nearly at the end just before the cycle finishes');
    close(PlatformMotion.pathAt(motion, 8).position.x, 0);
    close(PlatformMotion.pathAt(motion, 12).position.x, 2);
    const first = PlatformMotion.pathAt(motion, 8.001).rotation, last = PlatformMotion.pathAt(motion, 7.999).rotation;
    close(Math.abs(BABYLON.Quaternion.Dot(first, last)), 1, 1e-3);
    assert.equal(PlatformMotion.angularTravel(motion, 0, 16), 0, 'a straight run has nothing to turn through, even over the jump');
    const minMap = { width: 24, height: 8, depth: 24, extents: { platforms: [{ ...boxBody(motion), motion }] } };
    assert.equal(PlatformMap.read(minMap).length, 1);
    minMap.extents.platforms[0].motion = { ...motion, points: [{}, { x: 20 }], duration: 1.2 };
    assert.equal(PlatformMap.read(minMap).length, 0, 'still limited to 16 blocks per second');
    minMap.extents.platforms[0].motion = { ...motion, points: [{}, { x: 20 }], duration: 2.4, loop: 'pingpong' };
    assert.equal(PlatformMap.read(minMap).length, 0, 'back and forth covers the distance twice');
});

test('grenades thrown into a moving hollow crate never pass through its walls; only the open end or a snap back lets one out', () => {
    const wall = (min, max) => ({ type: 'box', min, max }), t = .08;
    const world = useBody({ id: 'crate', position: { x: 10.5, y: 5.5, z: 10.5 }, motion: { type: 'path', points: [{ y: -1 }, {}, { z: -4 }, { y: -4, z: -4 }], duration: 5, loop: 'snap' }, shapes: [
        wall({ x: -.5, y: -.5, z: -.5 }, { x: .5, y: -.5 + t, z: .5 }), wall({ x: -.5, y: .5 - t, z: -.5 }, { x: .5, y: .5, z: .5 }), wall({ x: -.5, y: -.5, z: -.5 }, { x: -.5 + t, y: .5, z: .5 }),
        wall({ x: -.5, y: -.5, z: -.5 }, { x: .5, y: .5, z: -.5 + t }), wall({ x: -.5, y: -.5, z: .5 - t }, { x: .5, y: .5, z: .5 })] });
    const oldRoom = scene.room; scene.room = { Collider: collider };
    let seed = 7, entered = 0, stayed = 0; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let run = 0; run < 40; run++) {
        const owner = player(); owner.modifiers.grenadeTimerModifier = 1; owner.modifiers.grenadeBounceModifier = 1;
        const grenade = new Grenade(scene), start = rnd() * 5, mouth = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(1.6, 0, 0), world.pose(world.bodies[0], start).matrix);
        grenade.throw(owner, { x: mouth.x, y: mouth.y + (rnd() - .5) * .3, z: mouth.z + (rnd() - .5) * .3 }, { x: -(.05 + rnd() * .1), y: rnd() * .03, z: (rnd() - .5) * .02 });
        grenade.ttl = 1e9; grenade.platformTime = start;
        let inside = false, went = false;
        for (let i = 0; i < 600; i++) {
            const before = grenade.platformTime;
            grenade.update(1);
            const snapped = Math.floor(before / 5) !== Math.floor(grenade.platformTime / 5); //the crate jumped away; nothing was crossed
            const local = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(grenade.x, grenade.y, grenade.z), world.pose(world.bodies[0], grenade.platformTime).inverse);
            const within = ['x', 'y', 'z'].every(axis => Math.abs(local[axis]) < .5);
            if (within) { inside = went = true; continue; };
            if (!inside) continue;
            if (snapped) { inside = false; break; };
            assert.ok(local.x >= .4 && Math.abs(local.y) < .45 && Math.abs(local.z) < .45, 'went through a wall on run ' + run + ' at tick ' + i + ' ' + JSON.stringify(local));
            inside = false; break; //bounced back out of the open end, as it would from a still crate
        };
        entered += went ? 1 : 0; stayed += inside ? 1 : 0;
    };
    assert.ok(entered > 10, 'enough throws went in to mean something: ' + entered);
    scene.room = oldRoom;
});

test('a snap back leaves players and grenades where they were instead of taking them along', () => {
    const world = useBody({ id: 'snapper', position: { x: 10, y: 1.5, z: 10 }, shapes: [{ type: 'box', min: { x: -1, y: -.5, z: -1 }, max: { x: 1, y: .5, z: 1 } }],
        motion: { type: 'path', points: [{}, { x: 4 }], duration: 4, loop: 'snap' } });
    const bounds = DynamicMapBlocksPlugin.playerBounds(player());
    const rode = world.transport({ x: 13, y: 2, z: 10 }, bounds, 3.99, 4.01, () => false, true);
    close(rode.x, 13); close(rode.y, 2);
    const normal = world.transport({ x: 11, y: 2, z: 10 }, bounds, 1, 1.02, () => false, true);
    assert.ok(normal.x > 11, 'ordinary travel still carries: ' + normal.x);
});

test('a block pushing something into the map either stops at the map or pushes through it, by setting', () => {
    for (const [pushThroughMap, moved] of [[false, false], [true, true]]) {
        const world = useBody({ id: 'pusher', position: { x: 10, y: 1.5, z: 10 }, shapes: [{ type: 'box', min: { x: -.5, y: -.5, z: -.5 }, max: { x: .5, y: .5, z: .5 } }],
            motion: { type: 'path', points: [{}, { x: 4 }], duration: 4, loop: 'pingpong', pushThroughMap } });
        const bounds = DynamicMapBlocksPlugin.playerBounds(player()), start = { x: 10.6, y: 1.1, z: 10 };
        let pos = start;
        for (let i = 0; i < 30; i++) pos = DynamicMapBlocksPlugin.ride('players', collider, pos, bounds, i / 60, (i + 1) / 60, () => true, false);
        assert.equal(pos.x > start.x + .05, moved, 'pushThroughMap ' + pushThroughMap + ': ' + pos.x);
    };
    diskWorld();
});

test('F3 lines report the platforms, what the player rides and the targeted platform', () => {
    useBody(boxBody({ type: 'spin', axis: { y: 1 }, speed: 45 }));
    const on = { left: [], right: [] };
    DynamicMapBlocksPlugin.debugLines({ ...on, player: player({ x: 10, y: 2, z: 10 }), target: { platform: 'box' } });
    assert.ok(on.left.includes('Platforms: 1 (1 moving) T: 0.000'));
    assert.ok(on.left.includes('Riding: box (spin 45°/s)'));
    assert.ok(on.right.includes('Targeted Platform') && on.right.includes('box (spin 45°/s)'));
    assert.ok(on.right.some(line => line.startsWith('Centre: 10.000 / 1.500 / 10.000')));
    const off = { left: [], right: [] };
    DynamicMapBlocksPlugin.debugLines({ ...off, player: player({ x: 20, y: 2, z: 20 }), target: null });
    assert.ok(off.left.includes('Riding: none')); assert.deepEqual(off.right, []);
    collider.platformWorld = new PlatformWorld([], [], new PlatformClock(() => 0));
    const none = { left: [], right: [] };
    DynamicMapBlocksPlugin.debugLines({ ...none, player: player(), target: null });
    assert.deepEqual(none, { left: [], right: [] });
    diskWorld();
});

await Promise.all(pendingChecks);
scene.dispose();
engine.dispose();
console.log(checks + ' moving platform checks passed');

