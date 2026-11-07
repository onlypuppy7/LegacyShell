//node plugins_default/francium/test-rendering.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import misc from '#misc';

const context = vm.createContext({ console, performance, setTimeout, clearTimeout });
vm.runInContext(fs.readFileSync(new URL('../../server-client/src/data/babylon.js', import.meta.url), 'utf8'), context);
for (const file of ['map.js', 'client.js']) vm.runInContext(misc.prepareForClient(fs.readFileSync(new URL(file, import.meta.url), 'utf8')), context);
const B = context.BABYLON, plugin = vm.runInContext('FranciumPlugin', context), simple = vm.runInContext('FranciumMap', context);
const engine = new B.NullEngine();
let passed = 0;
const test = (name, run) => { run(); passed++; console.log('PASS', name); };
const candidates = scene => Array.from(scene.getActiveMeshCandidates().data);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);

test('two cameras render the same meshes with half the readiness checks', () => {
    const scene = new B.Scene(engine), world = new B.FreeCamera('world', new B.Vector3(0, 0, -5), scene);
    const ui = new B.FreeCamera('ui', new B.Vector3(0, 0, -5), scene);
    world.layerMask = 1; ui.layerMask = 2; scene.activeCameras = [world, ui];
    let checks = 0, matrices = 0, active = {};
    for (let i = 0; i < 68; i++) {
        const mesh = B.MeshBuilder.CreateBox('mesh' + i, { size: .1 }, scene);
        mesh.layerMask = i < 64 ? 1 : 2;
        const ready = mesh.isReady, compute = mesh.computeWorldMatrix;
        mesh.isReady = function () { checks++; return ready.apply(this, arguments); };
        mesh.computeWorldMatrix = function () { matrices++; return compute.apply(this, arguments); };
    };
    scene.onAfterCameraRenderObservable.add(camera => {
        active[camera.name] = Array.from(scene.getActiveMeshes().data).slice(0, scene.getActiveMeshes().length).map(mesh => mesh.uniqueId);
    });
    scene.render(); checks = matrices = 0; scene.render();
    const expected = active, beforeChecks = checks, beforeMatrices = matrices;
    plugin.attachScene(scene); active = {}; checks = matrices = 0; scene.render();
    assert.deepEqual(active, expected);
    assert.equal(beforeChecks, 136); assert.equal(checks, 68);
    assert.equal(beforeMatrices, 136); assert.equal(matrices, 68);
    scene.dispose();
});

test('layers and exceptions remain live, including cross-layer instance sources', () => {
    const scene = new B.Scene(engine), camera = new B.FreeCamera('camera', new B.Vector3(0, 0, -5), scene);
    camera.layerMask = 2;
    const source = B.MeshBuilder.CreateBox('source', {}, scene); source.layerMask = 1; source.isVisible = false;
    const instance = source.createInstance('instance'); instance.layerMask = 2;
    const forced = B.MeshBuilder.CreateBox('forced', {}, scene); forced.layerMask = 1; forced.alwaysSelectAsActiveMesh = true;
    const actions = B.MeshBuilder.CreateBox('actions', {}, scene); actions.layerMask = 1;
    actions.actionManager = new B.ActionManager(scene);
    const lod = B.MeshBuilder.CreateBox('lod', {}, scene); lod.layerMask = 1; lod.onLODLevelSelection = () => {};
    scene.render();
    const expected = Array.from(scene.getActiveMeshes().data).slice(0, scene.getActiveMeshes().length);
    plugin.attachScene(scene);
    const list = candidates(scene);
    assert.ok(list.indexOf(source) < list.indexOf(instance));
    assert.ok(list.includes(forced)); assert.ok(list.includes(actions)); assert.ok(list.includes(lod));
    scene.render(); assert.deepEqual(Array.from(scene.getActiveMeshes().data).slice(0, scene.getActiveMeshes().length), expected);
    instance.layerMask = 1; assert.ok(!candidates(scene).includes(instance));
    forced.alwaysSelectAsActiveMesh = false; assert.ok(!candidates(scene).includes(forced));
    forced.layerMask = 2; assert.ok(candidates(scene).includes(forced));
    forced.setEnabled(false); assert.ok(!candidates(scene).includes(forced));
    camera.layerMask = 1; assert.ok(candidates(scene).includes(instance));
    const data = scene.getActiveMeshCandidates().data;
    assert.equal(scene.getActiveMeshCandidates().data, data);
    scene.dispose();
});

test('simple cubes and ramps have closed outward faces and match the collision slope', () => {
    const scene = new B.Scene(engine); simple.begin(scene);
    for (const type of ['full', 'wedge', 'iwedge']) {
        const source = B.MeshBuilder.CreateBox('test.' + type, {}, scene); source.colliderType = type;
        const visual = simple.visual(source, simple.scenes.get(scene));
        assert.notEqual(visual, source); assert.equal(visual.getTotalIndices() / 3, type === 'full' ? 12 : 8);
        assert.equal(visual.isEnabled(), false); assert.equal(source.isEnabled(), true);
        const data = B.VertexData.ExtractFromMesh(visual), normals = [];
        B.VertexData.ComputeNormals(data.positions, data.indices, normals);
        for (let i = 0; i < normals.length; i++) near(normals[i], data.normals[i]);
        if (type !== 'full') for (const z of [-.25, .25]) {
            const ray = new B.Ray(new B.Vector3(0, type === 'wedge' ? 2 : -2, z), new B.Vector3(0, type === 'wedge' ? -1 : 1, 0), 4);
            const hit = ray.intersectsMesh(visual); assert.ok(hit.hit); near(hit.pickedPoint.y, z);
        };
    };
    scene.dispose(); assert.equal(simple.scenes.has(scene), false);
});

test('AABB visuals use collider bounds in source space without changing that collider', () => {
    const scene = new B.Scene(engine); simple.begin(scene);
    const source = B.MeshBuilder.CreateBox('source', {}, scene); source.colliderType = 'aabb';
    source.position.set(5, 2, 3); source.rotation.y = .7; source.scaling.set(2, 1, 3);
    const collider = B.MeshBuilder.CreateBox('collider', { width: .4, height: .8, depth: .6 }, scene);
    collider.parent = source; collider.position.set(.1, .2, -.1); source.colliderMesh = collider;
    const before = Array.from(collider.getVerticesData(B.VertexBuffer.PositionKind));
    const visual = simple.visual(source, simple.scenes.get(scene)), bounds = visual.getBoundingInfo().boundingBox;
    near(bounds.minimum.x, -.1); near(bounds.maximum.x, .3);
    near(bounds.minimum.y, -.2); near(bounds.maximum.y, .6);
    near(bounds.minimum.z, -.4); near(bounds.maximum.z, .2);
    assert.equal(source.colliderMesh, collider); assert.equal(collider.parent, source);
    assert.deepEqual(Array.from(collider.getVerticesData(B.VertexBuffer.PositionKind)), before);
    const missing = B.MeshBuilder.CreateBox('missing', {}, scene); missing.colliderType = 'aabb';
    assert.equal(simple.visual(missing, simple.scenes.get(scene)), missing);
    source.colliderType = 'obb'; simple.begin(scene);
    assert.equal(simple.visual(source, simple.scenes.get(scene)), source);
    scene.dispose();
});

test('texture sampling preserves a planar UV gradient and finite vertex colors', () => {
    const scene = new B.Scene(engine); simple.begin(scene);
    const source = B.MeshBuilder.CreateBox('gradient', {}, scene); source.colliderType = 'full';
    const p = source.getVerticesData(B.VertexBuffer.PositionKind), uv = [], colors = [];
    for (let i = 0; i < p.length; i += 3) { uv.push(p[i] + .5, p[i + 1] + .5); colors.push(.2, .4, .6, 1); };
    source.setVerticesData(B.VertexBuffer.UVKind, new Float32Array(uv)); source.setVerticesData(B.VertexBuffer.ColorKind, new Float32Array(colors));
    const visual = simple.visual(source, simple.scenes.get(scene)), v = visual.getVerticesData(B.VertexBuffer.PositionKind);
    const actualUV = visual.getVerticesData(B.VertexBuffer.UVKind), actualColors = visual.getVerticesData(B.VertexBuffer.ColorKind);
    for (let i = 0; i < v.length / 3; i++) {
        near(actualUV[i * 2], v[i * 3] + .5); near(actualUV[i * 2 + 1], v[i * 3 + 1] + .5);
        near(actualColors[i * 4], .2); near(actualColors[i * 4 + 3], 1);
    };
    assert.equal(simple.visual(source, simple.scenes.get(scene)), visual);
    scene.dispose();
});

test('untextured colors survive simplification and empty collision-only meshes stay empty', () => {
    const scene = new B.Scene(engine); simple.begin(scene);
    const source = B.MeshBuilder.CreateBox('untextured', {}, scene); source.colliderType = 'full';
    source.geometry.removeVerticesData(B.VertexBuffer.UVKind);
    source.setVerticesData(B.VertexBuffer.ColorKind, new Float32Array(Array.from({ length: source.getTotalVertices() }, () => [.2, .4, .6, 1]).flat()));
    const visual = simple.visual(source, simple.scenes.get(scene));
    const colors = visual.getVerticesData(B.VertexBuffer.ColorKind);
    for (let i = 0; i < colors.length; i += 4) { near(colors[i], .2); near(colors[i + 2], .6); near(colors[i + 3], 1); };
    const empty = new B.Mesh('collision-only', scene); empty.colliderType = 'full';
    assert.equal(simple.visual(empty, simple.scenes.get(scene)), empty);
    scene.dispose();
});

test('Ultra boxes keep rotated, scaled and mirrored collider faces in source space', () => {
    const scene = new B.Scene(engine); simple.begin(scene);
    const state = simple.scenes.get(scene); state.detail = 'ultra';
    const source = B.MeshBuilder.CreateSphere('torch', { segments: 12 }, scene); source.colliderType = 'obb';
    source.position.set(5, 2, 3); source.rotation.y = .7; source.scaling.set(2, 1, 3);
    const collider = B.MeshBuilder.CreateBox('collider', { width: .2, height: .8, depth: .3 }, scene);
    collider.parent = source; collider.position.set(.1, .2, -.1); collider.rotation.x = .25; collider.scaling.set(-1, 2, .5);
    source.colliderMesh = collider;
    const before = JSON.stringify([collider.getVerticesData(B.VertexBuffer.PositionKind), collider.position.asArray(), collider.rotation.asArray(), collider.scaling.asArray()]);
    const visual = simple.visual(source, state), data = B.VertexData.ExtractFromMesh(visual), normals = [];
    assert.equal(visual.getTotalIndices() / 3, 12);
    const inverse = B.Matrix.Invert(collider.getWorldMatrix().multiply(B.Matrix.Invert(source.getWorldMatrix())));
    const bounds = collider.getBoundingInfo().boundingBox;
    for (let i = 0; i < data.positions.length; i += 3) {
        const point = B.Vector3.TransformCoordinates(B.Vector3.FromArray(data.positions, i), inverse);
        for (const axis of ['x', 'y', 'z']) near(Math.min(Math.abs(point[axis] - bounds.minimum[axis]), Math.abs(point[axis] - bounds.maximum[axis])), 0);
    };
    B.VertexData.ComputeNormals(data.positions, data.indices, normals);
    for (let i = 0; i < normals.length; i++) near(normals[i], data.normals[i]);
    assert.equal(JSON.stringify([collider.getVerticesData(B.VertexBuffer.PositionKind), collider.position.asArray(), collider.rotation.asArray(), collider.scaling.asArray()]), before);
    scene.dispose();
});

test('Ultra also boxes decorations, ladders and missing colliders, including flat props', () => {
    const scene = new B.Scene(engine); simple.begin(scene);
    const state = simple.scenes.get(scene); state.detail = 'ultra';
    for (const type of ['none', 'ladder', 'mesh', 'aabb', 'obb']) {
        const source = B.MeshBuilder.CreatePlane('banner.' + type, { width: .4, height: .8 }, scene); source.colliderType = type;
        const before = Array.from(source.getVerticesData(B.VertexBuffer.PositionKind));
        const visual = simple.visual(source, state), bounds = visual.getBoundingInfo().boundingBox;
        assert.notEqual(visual, source); assert.equal(visual.getTotalIndices() / 3, 12);
        near(bounds.minimum.x, -.2); near(bounds.maximum.y, .4);
        near(bounds.maximum.z - bounds.minimum.z, .001);
        assert.ok(Array.from(visual.getVerticesData(B.VertexBuffer.NormalKind)).every(Number.isFinite));
        assert.deepEqual(Array.from(source.getVerticesData(B.VertexBuffer.PositionKind)), before);
    };
    const empty = new B.Mesh('empty', scene); empty.colliderType = 'none';
    assert.equal(simple.visual(empty, state), empty);
    scene.dispose();
});

test('map hook keeps cell transforms, supports disabling, and disposes cached proxies', () => {
    let options = 0;
    const stored = { franciumSimpleMap: true };
    context.LegacySettings = { addTab() {}, addOption(tab, option) {
        options++; assert.equal(option.label, 'Simple Map'); assert.equal(option.type, 'select'); assert.equal(option.default, 'simple');
        assert.deepEqual(Array.from(option.options, item => item.value), ['off', 'simple', 'ultra']); return {};
    }, get: (key, fallback) => stored[key] ?? fallback };
    assert.equal(simple.detail(), 'simple'); stored.franciumSimpleMap = false; assert.equal(simple.detail(), 'off');
    stored.franciumSimpleMap = true;
    const core = fs.readFileSync(new URL('../../server-client/src/client-static/src/shellshock.min.js', import.meta.url), 'utf8');
    vm.runInContext(core.slice(core.indexOf('function addMeshToMapHelper('), core.indexOf('function addMeshToMap(keyIdx)')), context);
    context.rotInc = Math.PI / 2;
    simple.patch();
    const scene = new B.Scene(engine), source = B.MeshBuilder.CreateBox('full', {}, scene); source.colliderType = 'full';
    const cells = [{ x: 2, y: 3, z: 4, rx: 0, ry: 1, rz: 0 }];
    const sps = new B.SolidParticleSystem('map', scene, { updatable: true }); context.SPS = sps;
    simple.begin(scene); context.addMeshToMapHelper(source, cells); const map = sps.buildMesh();
    assert.equal(map.getTotalIndices() / 3, 12);
    near(map.getBoundingInfo().boundingBox.minimum.x, 2); near(map.getBoundingInfo().boundingBox.maximum.y, 4);
    const proxy = simple.scenes.get(scene).meshes.get(source);
    stored.franciumMapDetail = 'ultra';
    assert.equal(simple.scenes.get(scene).detail, 'simple');
    source.colliderType = 'obb'; simple.begin(scene); assert.equal(proxy.isDisposed(), true);
    const captured = []; context.SPS = { addShape: mesh => captured.push(mesh) };
    context.addMeshToMapHelper(source, cells); assert.notEqual(captured.pop(), source);
    assert.equal(simple.scenes.get(scene).detail, 'ultra');
    stored.franciumMapDetail = 'off'; simple.begin(scene);
    context.addMeshToMapHelper(source, cells); assert.equal(captured[0], source); assert.equal(options, 1);
    delete stored.franciumMapDetail; stored.franciumSimpleMap = false; assert.equal(simple.detail(), 'off');
    stored.franciumMapDetail = 'ultra'; assert.equal(simple.detail(), 'ultra');
    stored.franciumMapDetail = 'invalid'; assert.equal(simple.detail(), 'off');
    assert.deepEqual(cells, [{ x: 2, y: 3, z: 4, rx: 0, ry: 1, rz: 0 }]);
    scene.dispose();
});

engine.dispose();
console.log('Francium:', passed, 'rendering tests passed.');
