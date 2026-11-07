//node plugins_default/dynamicmapblocks/test-signs.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createCanvas } from '@napi-rs/canvas';
import BABYLON from 'babylonjs';
import { MapSigns, SignEditorState } from './signs.js';
import { SignRender } from './sign-render.js';
import { PlatformMap, PlatformWorld } from './platforms.js';
import { PlatformRender } from './render.js';
import { PluginManager } from '#plugins';

globalThis.document = { createElement: () => createCanvas(1, 1) };
var engine = new BABYLON.NullEngine(), scene = new BABYLON.Scene(engine);
var asset = fs.readFileSync(new URL('./models/map.babylon', import.meta.url), 'utf8');
await new Promise((resolve, reject) => BABYLON.SceneLoader.ImportMesh('', '', 'data:' + asset, scene, resolve, null, (_, error) => reject(Error(error))));
var sources = scene.meshes.filter(mesh => !mesh.parent);
sources.forEach(mesh => { mesh.setEnabled(false); mesh.colliderMesh = mesh.getChildMeshes()[0]; });
var example = JSON.parse(fs.readFileSync(new URL('./client/signs.json', import.meta.url))), defs = MapSigns.entries(example);
assert.equal(defs.length, 9);
for (var source of sources.filter(mesh => MapSigns.kind(mesh.name))) {
    assert.ok(source.colliderMesh && !MapSigns.helper(source.colliderMesh));
    var block = { mesh: source.name, x: 0, y: 0, z: 0 }, shapes = PlatformMap.blockShapes(block, { position: { x: .5, y: .5, z: .5 } }, sources);
    assert.equal(shapes.length, 1, 'TEXT helpers never enter triangle collision');
    assert.equal(shapes[0].definition.positions.length, source.getVerticesData('position').length);
}
var dirty = structuredClone(example);
dirty.extents.signs.unshift({ block: defs[0].block, text: 'x'.repeat(513) }, { ...defs[0], range: 50 }, { ...defs[0], color: 'url(x)' }, { ...defs[0], align: '<img>' });
dirty.extents.signs.push(defs[0]);
assert.equal(MapSigns.entries(dirty).length, 9, 'bad entries and duplicates are dropped independently');
delete dirty.data[defs[1].block.mesh]; assert.equal(MapSigns.entries(dirty).length, 8, 'stale assignments do not attach to a different block');
var state = new SignEditorState(); state.load(example);
assert.deepEqual(state.save({ x: 18, y: 0, z: 18 }), MapSigns.read(example));
state.translate({ x: 1, y: 2, z: 3 });
assert.deepEqual(state.save({ x: 19, y: 2, z: 21 }), MapSigns.read(example));
var map = { width: 50, height: 50, depth: 50, data: [] };
for (var def of state.signs) {
    var b = def.block; map.data[b.x] ??= []; map.data[b.x][b.y] ??= []; map.data[b.x][b.y][b.z] = { idx: sources.findIndex(mesh => mesh.name === b.mesh) };
}
state.sync(map, sources); assert.equal(state.signs.length, 9);
var b = state.signs[0].block; map.data[b.x][b.y][b.z] = {}; state.sync(map, sources); assert.equal(state.signs.length, 8);
assert.throws(() => state.apply({ block: b, text: 'a', range: NaN }, map));
assert.throws(() => state.apply({ block: b, text: '\n'.repeat(12) }, map));

var authored = BABYLON.MeshBuilder.CreateBox('SIGNSTAND.authored.mesh', {}, scene);
var authoredText = BABYLON.MeshBuilder.CreatePlane('authored-TEXT', { width: .65, height: .25 }, scene); authoredText.parent = authored;
authoredText.position.set(.1, .22, -.6); authoredText.rotation.y = .3; authoredText.scaling.set(.8, 1.1, 1);
var authoredCollision = BABYLON.MeshBuilder.CreateBox('collision', {}, scene); authoredCollision.parent = authored;
var secondCollision = BABYLON.MeshBuilder.CreateBox('post', {}, scene); secondCollision.parent = authored;
authored.colliderMesh = authoredText;
var authoredBlock = { mesh: authored.name, x: 1, y: 1, z: 1 };
assert.equal(PlatformMap.blockShapes(authoredBlock, { position: { x: 1, y: 1, z: 1 } }, [authored]).length, 2, 'all non-TEXT children collide, regardless of child order');
var authoredView = SignRender.create(scene, [{ block: authoredBlock, text: 'Custom', color: '#000000', align: 'left' }], [authored], { editor: true });
var letters = authoredView.entries[0].root.getChildMeshes()[0];
assert.ok(letters.position.equalsWithEpsilon(authoredText.position)); assert.ok(letters.scaling.equalsWithEpsilon(authoredText.scaling));
assert.ok(Math.abs(letters.rotationQuaternion.toEulerAngles().y - .3) < .0001, 'authored text transforms are retained');
authoredView.dispose(); authored.dispose();
var editorMap = { width: 50, height: 50, depth: 50, data: [] }, editorPlugins = new PluginManager('game');
var putCells = (list, offset = {}) => {
    editorMap.data = [];
    for (var def of list) {
        var p = { x: def.block.x + (offset.x || 0), y: def.block.y + (offset.y || 0), z: def.block.z + (offset.z || 0) };
        editorMap.data[p.x] ??= []; editorMap.data[p.x][p.y] ??= [];
        editorMap.data[p.x][p.y][p.z] = { idx: sources.findIndex(mesh => mesh.name === def.block.mesh), rx: 0, ry: 1, rz: 0, x: 99, y: 99, z: 99 };
    };
};
var editorContext = vm.createContext({ BABYLON, MapSigns, PlatformMap, SignRender, SignEditorState, plugins: editorPlugins, scene, map: editorMap, mapMeshes: sources,
    document: { getElementById: () => ({ hidden: true }) }, extents: { x: { min: 19 }, y: { min: 2 }, z: { min: 21 } } });
vm.runInContext(fs.readFileSync(new URL('./editor-signs.js', import.meta.url), 'utf8').replace("window.addEventListener('DOMContentLoaded', init);", 'globalThis.signEditorTest = { state, refresh, view: () => view };'), editorContext);
var editor = editorContext.signEditorTest; editor.state.load(example); putCells(editor.state.signs); editor.refresh();
assert.equal(editor.view().entries.length, 9);
assert.ok(editor.view().entries[0].root.position.equalsWithEpsilon(new BABYLON.Vector3(20, 1, 25)), 'stale debug coordinates in editor cells never override placement');
editorPlugins.emitSync('editorMoveMapBefore', {}); putCells(editor.state.signs, { x: 1, y: 2, z: 3 });
editorPlugins.emitSync('editorMoveMapAfter', { dx: 1, dy: 2, dz: 3 });
assert.ok(editor.view().entries[0].root.position.equalsWithEpsilon(new BABYLON.Vector3(21, 3, 28)));
var serialized = { minMap: { extents: {} } }; editorPlugins.emitSync('editorSaveMap', serialized);
assert.equal(serialized.minMap.extents.signs[0].block.x, 2); assert.equal(serialized.minMap.extents.signs[0].block.y, 1);
editorPlugins.emitSync('editorInitMapBefore', {});

scene.defaultMaterial;
var boards = defs.filter(def => MapSigns.kind(def.block.mesh) !== 'SIGNBUBBLE'), before = { meshes: scene.meshes.length, materials: scene.materials.length, textures: scene.textures.length, observers: scene.onBeforeRenderObservable._observers.length };
for (var i = 0; i < 30; i++) {
    var view = SignRender.create(scene, boards, sources, { editor: true });
    assert.equal(view.entries.length, 4); assert.equal(view.cache.size, 4);
    assert.equal(scene.onBeforeRenderObservable._observers.length, before.observers, 'static signs have no frame callback');
    for (var entry of view.entries) {
        var text = entry.root.getChildMeshes()[0]; assert.ok(text.isVisible && !text.isPickable);
        var helper = entry.source.getChildMeshes().find(MapSigns.helper);
        assert.ok(text.position.equalsWithEpsilon(helper.position));
    };
    view.dispose(); view.dispose();
}
assert.deepEqual({ meshes: scene.meshes.length, materials: scene.materials.length, textures: scene.textures.length, observers: scene.onBeforeRenderObservable._observers.length }, before, 'all meshes, materials, textures and callbacks are released');
var same = boards.map(def => ({ ...def, text: 'Same', color: '#000000', align: 'left' }));
view = SignRender.create(scene, same, sources, { editor: true }); assert.equal(view.cache.size, 1, 'matching messages share their texture'); view.dispose();
var normalized = sources.find(mesh => mesh.name === boards[0].block.mesh), fullName = normalized.name;
normalized.name = 'wood'; normalized.theme = 'SIGNSTAND'; normalized.colliderType = 'mesh';
view = SignRender.create(scene, [boards[0]], sources, { editor: true }); assert.equal(view.entries.length, 1, 'gameplay uses split model names'); view.dispose(); normalized.name = fullName;
var bubble = defs.find(def => def.block.mesh.includes('question-pedestal')), bubbleView = SignRender.create(scene, [bubble], sources, { editor: true });
var entry = bubbleView.entries[0], ray = new BABYLON.Ray(new BABYLON.Vector3(bubble.block.x, bubble.block.y + .18, bubble.block.z - 2), new BABYLON.Vector3(0, 0, 1), 12);
var camera = new BABYLON.FreeCamera('egg-eye', BABYLON.Vector3.Zero(), scene), eye = new BABYLON.TransformNode('eye', scene);
camera.parent = eye; eye.position.copyFrom(ray.origin); eye.computeWorldMatrix(true); camera.getViewMatrix(true);
assert.ok(SignRender.ray(camera).origin.equalsWithEpsilon(ray.origin), 'the reading ray starts at the parented egg camera in world space');
var bubbleElement;
globalThis.document = { getElementById: () => ({}), createElement: () => bubbleElement = { remove() {} }, body: { appendChild() {} } };
var otherCamera = new BABYLON.FreeCamera('hud', new BABYLON.Vector3(100, 100, 100), scene); scene.activeCamera = otherCamera;
eye.position.addInPlace(new BABYLON.Vector3(.5, .5, .5)); eye.computeWorldMatrix(true); camera.getViewMatrix(true);
var live = SignRender.create(scene, [bubble], sources, { camera: () => camera, active: () => true, occluded: () => false });
live.update(); assert.equal(bubbleElement.textContent, bubble.text, 'targeting uses the gameplay camera while the HUD camera is active');
assert.equal(bubbleElement.hidden, false); live.dispose(); otherCamera.dispose();
globalThis.document = { createElement: () => createCanvas(1, 1) };
camera.dispose(); eye.dispose();
assert.ok(SignRender.target(ray, [entry]) === entry);
assert.equal(SignRender.target(ray, [entry], () => true), null, 'a wall occludes the bubble');
ray.origin.z -= 10; assert.equal(SignRender.target(ray, [entry]), null, 'range is enforced'); bubbleView.dispose();
var moving = { id: 'sign', position: { x: boards[0].block.x + .5, y: boards[0].block.y + .5, z: boards[0].block.z + .5 }, blocks: [boards[0].block], motion: { type: 'spin', axis: { y: 1 }, speed: 30 }, shapes: [] };
var world = new PlatformWorld([moving], sources);
view = SignRender.create(scene, [boards[0]], sources, { world, time: () => 1 }); view.update();
assert.ok(Math.abs(BABYLON.Quaternion.Dot(view.entries[0].root.rotationQuaternion, BABYLON.Quaternion.FromRotationMatrix(world.pose(world.bodies[0], 1).matrix.getRotationMatrix()))) > .99999); view.dispose();
var previewText = SignRender.create(scene, [boards[0]], sources, { editor: true });
var platformView = PlatformRender.create(scene, world, sources, () => 1);
assert.equal(previewText.entries[0].root.parent, platformView.blocks.get(MapSigns.key(boards[0].block)), 'starting an editor preview attaches existing lettering to its rendered block');
platformView.dispose(); assert.equal(previewText.entries[0].root.parent, null);
assert.equal(previewText.entries[0].root.isDisposed(), false, 'stopping a preview restores lettering before deleting the platform');
assert.ok(previewText.entries[0].root.position.equalsWithEpsilon(new BABYLON.Vector3(boards[0].block.x, boards[0].block.y, boards[0].block.z)));
previewText.dispose(); assert.equal(SignRender.scenes.has(scene), false);
var ctx = createCanvas(100, 100).getContext('2d'); ctx.font = '20px Arial';
assert.ok(MapSigns.wrap(ctx, 'a'.repeat(200), 100).every(line => ctx.measureText(line).width <= 101));
assert.equal(MapSigns.wrap(ctx, 'one\n\nthree', 100).length, 3);
scene.dispose(); engine.dispose();
console.log('Signs: models, validation, stale blocks, origins, translation, deletion, wrapping, shared textures, 30 disposal cycles, range, occlusion and moving text passed.');
