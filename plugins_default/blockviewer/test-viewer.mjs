import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import BABYLON from 'babylonjs';
import { Plugin, PluginMeta } from './index.js';

var source = fs.readFileSync(new URL('./client/viewer.js', import.meta.url), 'utf8');
var elements = new Map();
var element = (tag = 'div') => ({
    tag, children: [],
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute() {},
    querySelectorAll(tag) { return this.children.flatMap(child => [child, ...child.querySelectorAll(tag)]).filter(child => child.tag === tag); },
});
var context = vm.createContext({
    BABYLON, isMapEditor: true,
    window: { addEventListener() {} },
    document: {
        getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
        createElement(tag) { return element(tag); },
    },
});
vm.runInContext(source.replace("window.addEventListener('DOMContentLoaded', init);", 'globalThis.testViewer = { viewer, buildCollision, disposePreview, copyMesh, bounds, fit, select, updateVisibility, importEntries, zoom, serializeImport, makeGrid };'), context);
var { viewer, buildCollision, disposePreview, copyMesh, bounds, fit, select, updateVisibility, importEntries, zoom, serializeImport, makeGrid } = context.testViewer;
var engine = new BABYLON.NullEngine();
viewer.engine = engine;
viewer.scene = new BABYLON.Scene(engine);
viewer.root = new BABYLON.TransformNode('preview', viewer.scene);
viewer.cmat = new BABYLON.StandardMaterial('collision', viewer.scene);
viewer.camera = new BABYLON.ArcRotateCamera('camera', 0, 1, 3, BABYLON.Vector3.Zero(), viewer.scene);
viewer.grid = makeGrid(viewer.scene);
assert.equal(viewer.grid.getChildMeshes().length, 2, 'minor and major grid lines are present');
assert.ok(viewer.grid.getChildMeshes().every(mesh => !mesh.isPickable && mesh.alwaysSelectAsActiveMesh));
var inputCanvas = { addEventListener() {}, removeEventListener() {} };
globalThis.window = { addEventListener() {}, removeEventListener() {} };
globalThis.window.parent = globalThis.window;
viewer.camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
viewer.camera.attachControl(inputCanvas, true, false, 2);
var pointer = (type, button, x, y) => viewer.scene.onPointerObservable.notifyObservers(new BABYLON.PointerInfo(type, { button, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', target: inputCanvas }, null), type);
pointer(BABYLON.PointerEventTypes.POINTERDOWN, 0, 100, 100);
pointer(BABYLON.PointerEventTypes.POINTERMOVE, 0, 150, 130);
assert.notEqual(viewer.camera.inertialAlphaOffset, 0, 'left drag orbits');
pointer(BABYLON.PointerEventTypes.POINTERUP, 0, 150, 130);
pointer(BABYLON.PointerEventTypes.POINTERDOWN, 2, 100, 100);
pointer(BABYLON.PointerEventTypes.POINTERMOVE, 2, 150, 130);
assert.notEqual(viewer.camera.inertialPanningX, 0, 'right drag pans');
pointer(BABYLON.PointerEventTypes.POINTERUP, 2, 150, 130);
viewer.camera.lowerRadiusLimit = .1;
viewer.camera.upperRadiusLimit = 100;
var oldRadius = viewer.camera.radius;
zoom(-120);
assert.ok(viewer.camera.radius < oldRadius, 'wheel up zooms in');
zoom(240);
assert.ok(viewer.camera.radius > oldRadius, 'wheel down zooms out');
viewer.camera.detachControl(inputCanvas);
delete globalThis.window;

var hooks = {};
new Plugin({ type: 'client', on(name, fn) { hooks[name] = fn; } }, new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
for (var type of ['game', 'services']) new Plugin({ type, on() { assert.fail('plugin registered outside the client server'); } }, '.');
assert.deepEqual(Object.keys(hooks).sort(), ['client:openBeforeDefault', 'client:replacementsAfter']);
assert.match(PluginMeta.author, /\(\+Codex\)/);
var code = { mapEditorJs: '/* editor */', mapEditorHtmlContent: '<head></head>', sourceJs: 'game' };
hooks['client:replacementsAfter']({ code });
assert.match(code.mapEditorJs, /bv-dialog/);
assert.match(code.mapEditorHtmlContent, /blockviewer\/viewer.css/);
assert.equal(code.sourceJs, 'game');

var cube = BABYLON.MeshBuilder.CreateBox('test.cube.full', { size: 1 }, viewer.scene);
cube.material = new BABYLON.StandardMaterial('original', viewer.scene);
cube.material.diffuseColor.set(.2, .6, .8);
cube.setEnabled(false);
var originalVertices = [...cube.getVerticesData(BABYLON.VertexBuffer.PositionKind)];
var colliderSource = fs.readFileSync(new URL('../../src/shell/collider.js', import.meta.url), 'utf8');
vm.runInContext(colliderSource.slice(colliderSource.indexOf('class ColliderConstructor'), colliderSource.lastIndexOf('export default')) + '\nglobalThis.ReferenceCollider = ColliderConstructor;', context);
var referenceScene = new BABYLON.Scene(engine);
var reference = new context.ReferenceCollider(referenceScene);
for (var type of ['full', 'wedge', 'iwedge', 'none']) {
    buildCollision({ name: 'test.block.' + type, mesh: cube });
    assert.equal(viewer.colliders.length, type === 'none' ? 0 : 1, type);
    if (type === 'full') assert.ok(Math.abs(bounds(viewer.colliders).max.x - .5) < .0001);
    if (type === 'wedge') assert.ok(bounds(viewer.colliders).min.y < -1.5);
    if (type === 'iwedge') assert.ok(bounds(viewer.colliders).max.y > 1.5);
    if (type === 'wedge' || type === 'iwedge') {
        var expected = bounds([reference[type + 'CollisionMesh']]), actual = bounds(viewer.colliders);
        assert.ok(Math.abs(expected.min.y - actual.min.y) < .0001, type + ' matches gameplay min Y');
        assert.ok(Math.abs(expected.max.z - actual.max.z) < .0001, type + ' matches gameplay max Z');
    };
    disposePreview();
    assert.ok(!viewer.cmat.isDisposed);
};

var child = BABYLON.MeshBuilder.CreateBox('collision-child', { width: .4, height: 1, depth: .2 }, viewer.scene);
child.parent = cube;
child.rotation.y = Math.PI / 4;
child.computeWorldMatrix(true);
cube.colliderMesh = child;
for (var type of ['aabb', 'obb', 'ladder']) {
    buildCollision({ name: 'test.block.' + type, mesh: cube });
    assert.equal(viewer.colliders.length, 1, type);
    var collisionBounds = bounds(viewer.colliders), childBounds = bounds([child]);
    assert.ok(Math.abs(collisionBounds.min.x - childBounds.min.x) < .0001, type + ' min X');
    assert.ok(Math.abs(collisionBounds.max.z - childBounds.max.z) < .0001, type + ' max Z');
    disposePreview();
};
var materialCount = viewer.scene.materials.length;
for (var i = 0; i < 50; i++) {
    viewer.meshes.push(copyMesh(cube, viewer.root));
    fit(true);
    assert.ok(isFinite(viewer.camera.radius) && viewer.camera.radius > 0);
    disposePreview();
};
assert.deepEqual([...cube.getVerticesData(BABYLON.VertexBuffer.PositionKind)], originalVertices);
assert.equal(cube.isEnabled(), false);
assert.equal(cube.material.diffuseColor.g, .6);
assert.equal(viewer.scene.materials.length, materialCount, 'preview materials are released');
select({ name: 'test.block.full.verysoft', mesh: cube, theme: 'test' });
viewer.camera.alpha = 1.4; viewer.camera.beta = .7; viewer.camera.radius = 4;
viewer.camera.setTarget(new BABYLON.Vector3(.2, .3, .4));
const savedCamera = [viewer.camera.alpha, viewer.camera.beta, viewer.camera.radius, ...viewer.camera.target.asArray()];
select({ name: 'test.other.full', mesh: cube, theme: 'test' });
assert.deepEqual([viewer.camera.alpha, viewer.camera.beta, viewer.camera.radius, ...viewer.camera.target.asArray()], savedCamera, 'switching blocks preserves orbit, zoom and pan');
fit(true);
assert.notEqual(viewer.camera.alpha, savedCamera[0], 'explicit reset still frames the selected block');
select({ name: 'test.block.full.verysoft', mesh: cube, theme: 'test' });

assert.match(elements.get('bv-snote').textContent, /map ray checks continue through/);
assert.match(elements.get('bv-cnote').textContent, /full 1/);
viewer.modelVisible = false;
updateVisibility();
assert.equal(viewer.meshes[0].isVisible, false, 'model can be hidden');
assert.equal(viewer.colliders.length, 1, 'hiding the model preserves collision geometry');
viewer.modelVisible = true;
updateVisibility();
assert.equal(viewer.meshes[0].isVisible, true, 'model visibility is restored');
disposePreview();
viewer.mode = 'imported';
buildCollision({ name: 'test.block.full', mesh: cube });
assert.equal(viewer.colliders.length, 0, 'local imports never acquire gameplay collision');

viewer.importScene = new BABYLON.Scene(engine);
viewer.importRoot = new BABYLON.TransformNode('import-preview', viewer.importScene);
viewer.importGrid = new BABYLON.Mesh('import-grid', viewer.importScene);
var importParent = new BABYLON.TransformNode('import-parent', viewer.importScene);
importParent.position.set(3, 2, 1);
importParent.scaling.set(2, 2, 2);
importParent.rotation.y = .5;
var imported = BABYLON.MeshBuilder.CreateBox('Cube.001', { size: 1 }, viewer.importScene);
imported.parent = importParent;
imported.material = new BABYLON.StandardMaterial('original-import-material', viewer.importScene);
imported.setEnabled(false);
viewer.importMeshes = [imported];
var expectedBounds = bounds([imported]);
select({ name: imported.name, mesh: imported });
var actualBounds = bounds(viewer.meshes);
assert.ok(Math.abs(actualBounds.min.x - expectedBounds.min.x) < .0001, 'single-mesh import preserves ancestor transforms');
assert.ok(Math.abs(actualBounds.max.z - expectedBounds.max.z) < .0001, 'single-mesh import preserves ancestor orientation');
assert.equal(elements.get('bv-name').textContent, 'Cube.001', 'import names remain intact');
viewer.meshes[0].material.wireframe = true;
assert.equal(imported.material.wireframe, false, 'preview material changes never modify imported originals');
disposePreview();
assert.equal(imported.isEnabled(), false, 'import originals stay disabled');
var importMaterials = viewer.importScene.materials.length, importMeshes = viewer.importScene.meshes.length;
for (var i = 0; i < 50; i++) {
    select({ name: imported.name, mesh: imported });
    disposePreview();
};
assert.equal(viewer.importScene.materials.length, importMaterials, 'import material clones are released');
assert.equal(viewer.importScene.meshes.length, importMeshes, 'import mesh clones are released');
imported.name = 'aprilfools.pablo.aabb';
var importedCollider = BABYLON.MeshBuilder.CreateBox('aprilfools.pablo.collider', { size: .5 }, viewer.importScene);
importedCollider.parent = imported;
var branch = BABYLON.MeshBuilder.CreateBox('aprilfools.pablo.branch', { size: .2 }, viewer.importScene);
branch.parent = importedCollider;
branch.position.x = .4;
var entries = importEntries([branch, imported, importedCollider]);
assert.equal(entries.length, 1, 'collision descendants are grouped under their block');
assert.equal(entries[0].helpers.length, 2);
assert.equal(entries[0].collider, importedCollider);
viewer.collision = true;
select(entries[0]);
assert.equal(viewer.meshes.length, 1, 'collision helper geometry is excluded from the visible model');
assert.equal(viewer.colliders.length, 2, 'imported collider and branch produce collision shapes');
assert.equal(viewer.colliders[0].getScene(), viewer.importScene);
assert.equal(viewer.colliders[0].parent, viewer.importRoot);
var helperBounds = bounds([importedCollider]), shownBounds = bounds([viewer.colliders[0]]);
assert.ok(Math.abs(helperBounds.min.x - shownBounds.min.x) < .0001, 'imported collision preserves parent transforms');
viewer.modelVisible = false;
updateVisibility();
assert.equal(viewer.meshes[0].isVisible, false);
assert.equal(viewer.colliders[0].isEnabled(), true, 'collision remains visible without the model');
var triangleRoot = BABYLON.MeshBuilder.CreateBox('test.triangle.mesh', {}, viewer.importScene);
triangleRoot.position.set(3, 2, 1);
var triangleChild = new BABYLON.Mesh('test.triangle.collider', viewer.importScene);
var triangleData = new BABYLON.VertexData();
triangleData.positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
triangleData.indices = [0, 1, 2];
triangleData.normals = [0, 0, 1, 0, 0, 1, 0, 0, 1];
triangleData.applyToMesh(triangleChild);
triangleChild.parent = triangleRoot;
var triangleEntries = importEntries([triangleRoot, triangleChild]);
assert.equal(triangleEntries.length, 1, 'mesh collision helpers stay grouped');
select(triangleEntries[0]);
assert.equal(viewer.colliders.length, 1);
assert.equal(viewer.colliders[0].getTotalVertices(), 3, 'mesh collision preserves actual triangles instead of making a bounding box');
assert.deepEqual(Array.from(viewer.colliders[0].getVerticesData(BABYLON.VertexBuffer.PositionKind)), [3, 2, 1, 4, 2, 1, 3, 3, 1]);
assert.match(elements.get('bv-cnote').textContent, /actual triangles/);
assert.ok(Math.abs(viewer.importGrid.position.x - viewer.camera.target.x) < .0001, 'grid is centered beneath translated imports');
viewer.importNodes = [importParent, imported, importedCollider, branch];
viewer.imported = [{ name: 'map.glb', whole: true }, ...entries];
select(viewer.imported[0]);
assert.equal(viewer.meshes.length, 1, 'whole-model mode excludes collision helpers too');
assert.equal(viewer.colliders.length, 2);
viewer.importEnabled = new Map(viewer.importNodes.map(node => [node.id, true]));
var exported = await serializeImport('all');
assert.equal(exported.meshes.length, 4, 'export includes original visual mesh, both collider children and their ancestor');
assert.equal(exported.meshes.find(mesh => mesh.name === 'import-parent').id, importParent.id, 'transform-only ancestors export as compatible empty meshes');
assert.equal(exported.meshes.find(mesh => mesh.name.endsWith('.branch')).parentId, importedCollider.id);
assert.equal(exported.meshes.find(mesh => mesh.name.endsWith('.collider')).parentId, imported.id);
assert.ok(exported.meshes.every(mesh => mesh.isEnabled && !mesh.name.startsWith('bv-')), 'export excludes preview state');
assert.equal(imported.isEnabled(false), false, 'export leaves original preview-disabled state alone');
viewer.selected = entries[0];
var unrelated = BABYLON.MeshBuilder.CreateBox('unrelated', {}, viewer.importScene);
unrelated.parent = importParent;
viewer.importNodes.push(unrelated);
var selectedExport = await serializeImport('selected');
assert.equal(selectedExport.meshes.length, 4, 'selected block export retains collider descendants and ancestors without siblings');
assert.ok(!selectedExport.meshes.some(mesh => mesh.name === 'unrelated'));
var roundTripScene = new BABYLON.Scene(engine), roundTripMeshes = [];
assert.equal(BABYLON.SceneLoader.GetPluginForExtension('.babylon').importMesh('', roundTripScene, JSON.stringify(selectedExport), '', roundTripMeshes, [], []), true);
var roundTripBlock = roundTripMeshes.find(mesh => mesh.name === imported.name);
assert.equal(roundTripBlock.getChildMeshes().length, 2, 'export reloads with collider hierarchy intact');
var roundTripBounds = bounds([roundTripBlock]);
assert.ok(Math.abs(roundTripBounds.min.x - expectedBounds.min.x) < .0001, 'round trip preserves ancestor transforms');
disposePreview();
engine.dispose();
console.log('Block viewer: client-only hooks, collision parity, visibility, definitions, 100 disposal cycles, imported collider hierarchy and read-only isolation passed.');
