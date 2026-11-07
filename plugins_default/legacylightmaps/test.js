//run from the repo root: node plugins_default/legacylightmaps/test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import BABYLON from 'babylonjs';
import { LightmapData } from './lightmaps.js';
import { Plugin } from './index.js';
import { patchLightmapShader } from './shader.js';
import { patchStandardShader } from '../legacyweather/weatherShader.js';
import { patchPlatformShader } from '../dynamicmapblocks/lighting-shader.js';
import { PlatformMap } from '../dynamicmapblocks/platforms.js';

var root = new URL('../../', import.meta.url), read = file => fs.readFileSync(new URL(file, root), 'utf8');
var copy = value => JSON.parse(JSON.stringify(value));
var origin = { x: 21, y: 3, z: 17 };
var map = { width: 4, height: 3, depth: 4, name: 'Light test', sun: { direction: { x: .2, y: 1, z: .1 }, color: '#bbaa99' }, data: {}, extents: {} };
var editorContext = vm.createContext({ console, setTimeout, clearTimeout, performance });
vm.runInContext(read('server-client/src/client-static/editor/js/babylon.4.1.max.js'), editorContext);
var editorBabylon = editorContext.BABYLON, editorParse = vm.runInContext('JSON.parse', editorContext);
var assets = JSON.parse(read('src/base-babylons/map.babylon')).meshes.filter(mesh => mesh.positions?.length && mesh.normals?.length && mesh.colors?.length && !mesh.parentId && !mesh.name.startsWith('SPECIAL'));
var chosen = [assets.find(mesh => mesh.name.endsWith('.full')), assets.find(mesh => mesh.name.includes('.wedge')), assets.find(mesh => mesh.name.includes('.aabb')), assets.find(mesh => mesh.name === 'castle.blue-banner.none')];
assert.ok(chosen.every(Boolean));
chosen.forEach((mesh, index) => { map.data[mesh.name] = [{ x: index, y: index % 2, z: 0, rx: .25 * index, ry: index + .125, rz: .1 * index }]; });

function build(B, cells, editor, reverse = false) {
    var scene = new B.Scene(new B.NullEngine()), sps = new B.SolidParticleSystem('SPS', scene, { updatable: true }), sources = [];
    sps.computeParticleColor = false; sps.computeParticleTexture = false; sps.computeParticleRotation = false; sps.recomputeNormals = false;
    var entries = Object.entries(cells); if (reverse) entries.reverse();
    for (var [name, placements] of entries) {
        var source = assets.find(mesh => mesh.name === name), mesh = new B.Mesh(name, scene), data = new B.VertexData();
        if (editor) source = editorParse(JSON.stringify(source));
        for (var key of ['positions', 'normals', 'colors', 'indices', 'uvs']) data[key] = source[key];
        data.applyToMesh(mesh); sources.push(mesh);
        var index = 0;
        sps.addShape(mesh, placements.length, { positionFunction(particle) {
            var cell = placements[index++];
            for (var axis of ['x', 'y', 'z']) {
                particle.position[axis] = cell[axis] + (editor ? origin[axis] : .5);
                particle.rotation[axis] = (cell['r' + axis] || 0) * Math.PI / 2;
            };
        } });
    };
    return { mesh: sps.buildMesh(), scene, sources };
};

//run the actual, unchanged export helper against an editor Babylon 4 mesh
var editor = build(editorBabylon, map.data, true), expected = editor.mesh.getVerticesData('color').slice();
var editorPositions = editor.mesh.getVerticesData('position');
for (var c = 0, p = 0; c < expected.length; c += 4, p += 3) {
    expected[c] *= .2 + .3 * Math.sin(editorPositions[p] - origin.x) ** 2; expected[c + 1] *= .6; expected[c + 2] *= .8;
};
editor.mesh.updateVerticesData('color', expected);
var exportContext = vm.createContext({ BABYLON: editorBabylon, GI: { mesh: editor.mesh } });
var editorSource = read('server-client/src/client-static/editor/js/mapEdit.js');
var exportHelper = editorSource.match(/function minimizeLightmap\(\) \{[\s\S]*?\n\}/)[0];
var raw = vm.runInContext(exportHelper + '\nminimizeLightmap();', exportContext);
var vertices = editor.mesh.getTotalVertices(), rawBytes = Uint8Array.from(raw), json = JSON.stringify(Array.from(raw));
assert.deepEqual(LightmapData.decode(rawBytes.buffer, vertices), rawBytes);
assert.deepEqual(LightmapData.decode(json, vertices), rawBytes);
assert.deepEqual(LightmapData.decode(new TextEncoder().encode(json), vertices), rawBytes);
for (var broken of ['', '{}', '[1,2]', '[0,0,999]', '[0,0,1.5]', '[0,0,-1]', null, new Uint8Array(1)]) assert.equal(LightmapData.decode(broken, vertices), null);
assert.equal(LightmapData.decode(rawBytes, 1000001), null);

//rebuild that order with game Babylon 3, then apply it to a differently ordered game mesh
var game = build(BABYLON, map.data, false, true), sceneMeshes = game.scene.meshes.length;
var reference = LightmapData.reference(BABYLON, game.scene, LightmapData.cells(map), game.sources);
assert.equal(game.scene.meshes.length, sceneMeshes, 'temporary reference mesh is disposed');
assert.equal(reference.positions.length, rawBytes.length);
var samples = LightmapData.samples(reference, rawBytes);
var baseColors = game.mesh.getVerticesData('color').slice();
var matched = LightmapData.apply(game.mesh, samples);
assert.equal(matched, game.mesh.getTotalVertices(), 'rotated vertices match even when the game builds block types in reverse order');
var actual = game.mesh.getVerticesData('color');
var gamePositions = game.mesh.getVerticesData('position');
for (var c = 0, p = 0; c < actual.length; c += 4, p += 3) {
    assert.equal(actual[c + 3], -1);
    assert.ok(Math.abs(actual[c] - baseColors[c] * (.2 + .3 * Math.sin(gamePositions[p] - .5) ** 2)) < 1 / 255 + 1e-5, 'the baked gradient stays on the same painted surface');
    assert.ok(Math.abs(actual[c + 1] - baseColors[c + 1] * .6) < 1 / 255 + 1e-5);
    assert.ok(Math.abs(actual[c + 2] - baseColors[c + 2] * .8) < 1 / 255 + 1e-5);
};
assert.equal(LightmapData.reference(BABYLON, game.scene, map.data, []), null);
assert.equal(game.scene.meshes.length, sceneMeshes);
assert.equal(LightmapData.reference(BABYLON, game.scene, {}, []), null);
assert.deepEqual(LightmapData.cells({ ...map, data: Object.fromEntries(Object.entries(map.data).reverse()) }), map.data, 'database key order does not override the editor export scan order');

var moving = copy(map), movingCell = { mesh: chosen[0].name, ...Object.values(moving.data)[0][0] };
moving.extents.platforms = [{ id: 'moving', position: { x: 0, y: 0, z: 0 }, motion: { type: 'spin', speed: 1 }, blocks: [movingCell] }];
assert.deepEqual(LightmapData.cells(PlatformMap.prepare(moving)), map.data, 'a server-prepared map can restore the original editor order');
var special = copy(map.data); special['SPECIAL.spawn-blue.none'] = [{ x: 0, y: 1, z: 0 }]; special['DYNAMIC.disk.none'] = [{ x: 1, y: 1, z: 0 }];
assert.equal(LightmapData.reference(BABYLON, game.scene, special, game.sources).positions.length, rawBytes.length, 'special and dynamic blocks are excluded just as in the editor');

var changedMesh = build(BABYLON, map.data, false), unknown = changedMesh.mesh.getVerticesData('position').slice();
unknown[0] += 100; changedMesh.mesh.updateVerticesData('position', unknown);
var fallback = changedMesh.mesh.getVerticesData('color').slice();
for (var c = 0; c < fallback.length; c += 4) for (var axis = 0; axis < 3; axis++) fallback[c + axis] *= .5;
assert.equal(LightmapData.apply(changedMesh.mesh, samples, fallback), matched - 1);
assert.deepEqual(changedMesh.mesh.getVerticesData('color').slice(0, 4), fallback.slice(0, 4), 'unmatched vertices keep the computed lighting, not the unshaded paint');

//the build hook changes the game bundle only, with no editor source, export or UI changes
var listeners = {}, manager = { type: 'client', on(name, listener) { listeners[name] = listener; } };
new Plugin(manager, fileURLToPath(new URL('.', import.meta.url)));
var code = { sourceJs: read('server-client/src/client-static/src/shellshock.min.js'), mapEditorJs: editorSource,
    mapEditorHtmlContent: read('server-client/src/client-static/editor/index.html') };
var editorHtml = code.mapEditorHtmlContent;
listeners['client:replacementsBefore']({ code });
assert.equal(code.mapEditorJs, editorSource);
assert.equal(code.mapEditorHtmlContent, editorHtml);
assert.ok(code.sourceJs.includes('LegacyLightmaps.apply(mapMesh, minMap, m.data.colors)'));
var insertions = { files: [] }; listeners['client:pluginSourceInsertion']({ pluginInsertion: insertions });
assert.equal(insertions.files.length, 2);
assert.ok(insertions.files.every(file => file.position === 'after'));
assert.ok(!editorSource.includes('LEGACYSHELLPLUGINSAFTER'), 'the insertion point is game-only');
var browserCode = insertions.files.map(file => fs.readFileSync(file.filepath, 'utf8').replace(/^export /gm, '')).join('\n');
new vm.Script(code.sourceJs.replace('LEGACYSHELLPLUGINSAFTER', () => browserCode));
assert.throws(() => listeners['client:replacementsBefore']({ code: { sourceJs: '' } }), /source anchor changed/);

//offline storage, hosted raw/JSON files, a missing sidecar and malformed data
var gameEvents = {}, francium = { scenes: new WeakMap() }, state = { enabled: true }, requested;
game.mesh.updateVerticesData('color', baseColors);
francium.scenes.set(game.scene, state);
for (var name of ['map', 'mapNoShadow']) new BABYLON.ShaderMaterial(name, game.scene, 'standard', { attributes: ['position', 'normal', 'color'], uniforms: ['worldViewProjection'] });
var clientContext = vm.createContext({ LightmapData, BABYLON, FranciumMap: francium, console, AbortController, setTimeout, clearTimeout,
    gameScene: game.scene, mapMeshes: game.sources, playOffline: true, localStorage: { getItem(key) { assert.equal(key, 'lightmap'); return json; } },
    plugins: { on(name, listener) { gameEvents[name] = listener; } } });
vm.runInContext(read('plugins_default/legacylightmaps/client.js').replace(/^export /gm, ''), clientContext);
gameEvents['game:loadMaterials']({ scene: game.scene });
await gameEvents['game:modifyMinMap']({ minMap: map });
gameEvents['game:createMapCells']({ gameScene: game.scene, minMap: map });
assert.equal(state.enabled, false);
assert.ok(game.scene.getMaterialByName('map')._options.uniforms.includes('legacyBakedSun'));
clientContext.mesh = game.mesh; clientContext.map = map;
assert.equal(vm.runInContext('LegacyLightmaps.apply(mesh, map)', clientContext), matched);
clientContext.playOffline = false;
for (var body of [rawBytes.buffer, new TextEncoder().encode(json).buffer, new Uint8Array(2).buffer, null]) {
    state.enabled = true;
    clientContext.fetch = async (url, options) => { requested = url; assert.equal(options.cache, 'no-cache'); return { ok: !!body, arrayBuffer: async () => body }; };
    await gameEvents['game:modifyMinMap']({ minMap: { ...map, name: 'Map #1' } });
    gameEvents['game:createMapCells']({ gameScene: game.scene, minMap: map });
    assert.equal(requested, 'maps/Map%20%231.lightmap');
    assert.equal(state.enabled, body === null || body.byteLength === 2);
};

for (var patches of [[patchPlatformShader, patchLightmapShader, patchStandardShader], [patchStandardShader, patchLightmapShader, patchPlatformShader]]) {
    var shaders = { vertex: read('src/shaders/standardVertexShader.glsl'), pixel: read('src/shaders/standardPixelShader.glsl') };
    for (var patch of patches) patch(shaders);
    assert.ok(shaders.vertex.includes('vColor.a = abs(color.a)'));
    assert.ok(!shaders.vertex.includes('vLegacyBaked; (plugins'));
    assert.ok(shaders.pixel.includes('sunColor / max(legacyBakedSun'));
    assert.ok(shaders.pixel.includes('//@pixelPreFog'));
};
for (var item of [editor, game, changedMesh]) item.scene.getEngine().dispose();
console.log('legacylightmaps: all good; editor unchanged');
