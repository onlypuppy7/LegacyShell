//node plugins_default/francium/test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import UglifyJS from 'uglify-js';
import misc from '#misc';
import { Plugin, PluginMeta } from './index.js';

const context = vm.createContext({ console, setTimeout, clearTimeout, performance });
vm.runInContext(fs.readFileSync(new URL('../../server-client/src/data/babylon.js', import.meta.url), 'utf8'), context);
const source = fs.readFileSync(new URL('./client.js', import.meta.url), 'utf8');
const prepared = misc.prepareForClient(source);
const runtime = ['hud.js', 'materials.js', 'particles.js', 'warmup.js', 'map.js', 'scenario.js', 'benchmark.js', 'client.js']
    .map(file => misc.prepareForClient(fs.readFileSync(new URL(file, import.meta.url), 'utf8'))).join('\n');
vm.runInContext(runtime, context);
const plugin = vm.runInContext('FranciumPlugin', context);
const B = context.BABYLON;
const engine = new B.NullEngine();
let passed = 0;
const test = (name, run) => { run(); passed++; console.log('PASS', name); };
const makeScene = () => new B.Scene(engine);
const list = scene => Array.from(scene.getActiveMeshCandidates().data).slice(0, scene.getActiveMeshCandidates().length);
const expected = scene => Array.from(scene.meshes).filter(mesh => mesh.isEnabled());
const check = scene => assert.deepEqual(list(scene), expected(scene));

test('client-only insertion and browser listener registration', () => {
    const listeners = new Map();
    const pm = { type: 'client', on: (name, fn) => listeners.set(name, fn) };
    new Plugin(pm, fileURLToPath(new URL('.', import.meta.url)));
    const data = { pluginInsertion: { files: [] } };
    listeners.get('client:pluginSourceInsertion')(data);
    assert.equal(data.pluginInsertion.files.length, 8);
    assert.equal(data.pluginInsertion.files[0].position, 'beforebefore');
    assert.equal(fs.readFileSync(data.pluginInsertion.files.at(-1).filepath, 'utf8'), source);
    const minified = UglifyJS.minify(runtime);
    assert.ifError(minified.error);
    new vm.Script(minified.code);
    assert.equal(PluginMeta.identifier, 'francium');
    new Plugin({ type: 'game', on: () => assert.fail('server listener') }, '.');
    const browser = vm.createContext({ isClient: true, plugins: { on: (name, fn) => listeners.set(name, fn) },
        FranciumMaterials: { attach() {} }, FranciumParticles: { patch() {} }, FranciumHud: { improvements: true, attach() {} }, FranciumBenchmark: { attach() {} } });
    vm.runInContext(prepared, browser);
    const scene = makeScene();
    let attached;
    vm.runInContext('FranciumPlugin', browser).attachScene = scene => { attached = scene; };
    listeners.get('game:onMapCompleteBeforeSetup')({ gameScene: scene });
    assert.equal(attached, scene);
    scene.dispose();
});

test('disabled improvements skip every optimization hook while retaining the benchmark', () => {
    const listeners = new Map(), calls = [];
    const browser = vm.createContext({ isClient: true, plugins: { on: (name, fn) => listeners.set(name, fn) },
        FranciumHud: { improvements: false, patchFrames() {}, attach() { assert.fail('HUD patched'); } },
        FranciumMaterials: { attach() { assert.fail('materials patched'); } },
        FranciumParticles: { patch() { assert.fail('sprites patched'); } },
        FranciumWarmup: { patch() { assert.fail('warmup patched'); } },
        FranciumMap: { patch() { assert.fail('map patched'); }, begin() { assert.fail('map simplified'); } },
        FranciumBenchmark: { attach() { calls.push('attach'); }, patch() { calls.push('patch'); } } });
    vm.runInContext(prepared, browser);
    vm.runInContext('FranciumPlugin', browser).attachScene = () => assert.fail('candidates filtered');
    listeners.get('game:reachedEnd')();
    listeners.get('game:createMapCells')({ gameScene: {} });
    listeners.get('game:onMapCompleteBeforeSetup')({ gameScene: {} });
    assert.deepEqual(calls, ['patch', 'attach']);
});

test('templates remain searchable and collidable while skipped by rendering', () => {
    const scene = makeScene();
    new B.FreeCamera('camera', new B.Vector3(0, 0, -5), scene);
    const visible = B.MeshBuilder.CreateBox('visible', {}, scene);
    const template = B.MeshBuilder.CreateBox('hat-template', {}, scene);
    template.setEnabled(false);
    template.computeWorldMatrix(true);
    scene.render();
    const before = Array.from(scene.getActiveMeshes().data).slice(0, scene.getActiveMeshes().length);
    const original = scene.getActiveMeshCandidates;
    plugin.attachScene(scene);
    plugin.attachScene(scene);
    assert.equal(scene.getMeshByName('hat-template'), template);
    assert.ok(template.intersectsMesh(visible, true));
    assert.ok(scene.meshes.includes(template));
    assert.deepEqual(list(scene), [visible]);
    template.getTotalVertices = () => assert.fail('disabled template evaluated');
    scene.render();
    assert.deepEqual(Array.from(scene.getActiveMeshes().data).slice(0, scene.getActiveMeshes().length), before);
    plugin.detachScene(scene);
    assert.equal(scene.getActiveMeshCandidates, original);
    scene.dispose();
});

test('enabled state follows parents, grandparents and reparenting', () => {
    const scene = makeScene();
    const root = new B.TransformNode('root', scene);
    const parent = new B.TransformNode('parent', scene);
    parent.parent = root;
    const child = B.MeshBuilder.CreateBox('hat', {}, scene);
    child.parent = parent;
    const other = B.MeshBuilder.CreateBox('other', {}, scene);
    plugin.attachScene(scene);
    root.setEnabled(false); check(scene);
    child.setEnabled(false);
    root.setEnabled(true); check(scene);
    child.setEnabled(true); check(scene);
    parent.setEnabled(false);
    child.parent = null; check(scene);
    child.parent = parent; check(scene);
    parent.parent = other;
    parent.setEnabled(true);
    other.setEnabled(false); check(scene);
    other.setEnabled(true); check(scene);
    scene.dispose();
});

test('late imports, equipped clones and pooled instances enter and leave the list', () => {
    const scene = makeScene();
    new B.FreeCamera('camera', new B.Vector3(0, 0, -5), scene);
    plugin.attachScene(scene);
    const source = B.MeshBuilder.CreateBox('gun-template', {}, scene);
    source.setEnabled(false);
    const clone = scene.cloneMesh('gun-template');
    assert.ok(clone.isEnabled());
    const bullet = source.createInstance('bullet');
    bullet.setEnabled(false); check(scene);
    bullet.setEnabled(true); check(scene);
    scene.render();
    assert.ok(scene.getActiveMeshes().data.includes(bullet));
    clone.setEnabled(false); check(scene);
    clone.setEnabled(true); check(scene);
    bullet.dispose(); check(scene);
    clone.dispose(); check(scene);
    scene.removeMesh(source);
    source.setEnabled(true); check(scene);
    scene.addMesh(source); check(scene);
    scene.dispose();
});

test('scene order survives repeated state changes and source/instance rendering', () => {
    const scene = makeScene();
    new B.FreeCamera('camera', new B.Vector3(0, 0, -5), scene);
    const first = B.MeshBuilder.CreateBox('first', {}, scene);
    const second = B.MeshBuilder.CreateBox('second', {}, scene);
    const instance = first.createInstance('instance');
    plugin.attachScene(scene);
    first.setEnabled(false);
    second.setEnabled(false);
    second.setEnabled(true);
    first.setEnabled(true);
    check(scene);
    assert.ok(list(scene).indexOf(first) < list(scene).indexOf(instance));
    scene.render();
    assert.ok(scene.getActiveMeshes().data.includes(instance));
    scene.dispose();
});

test('unchanged frames reuse the small list without checking disabled meshes', () => {
    const scene = makeScene();
    const live = B.MeshBuilder.CreateBox('live', {}, scene);
    const templates = Array.from({ length: 3000 }, (_, i) => {
        const mesh = new B.Mesh('template-' + i, scene);
        mesh.setEnabled(false);
        return mesh;
    });
    plugin.attachScene(scene);
    const cached = scene.getActiveMeshCandidates().data;
    assert.deepEqual(list(scene), [live]);
    const saved = templates[0].isEnabled;
    templates[0].isEnabled = () => assert.fail('rescanned the catalogue');
    for (let i = 0; i < 100; i++) assert.equal(scene.getActiveMeshCandidates().data, cached);
    templates[0].isEnabled = saved;
    templates[0].setEnabled(true);
    check(scene);
    scene.dispose();
});

test('custom providers and unrelated scenes are left alone', () => {
    const scene = makeScene(), other = makeScene();
    const custom = () => ({ data: [], length: 0 });
    scene.getActiveMeshCandidates = custom;
    plugin.attachScene(scene);
    assert.equal(scene.getActiveMeshCandidates, custom);
    assert.equal(plugin.scenes.has(scene), false);
    const original = other.getActiveMeshCandidates;
    const mesh = new B.Mesh('other', other);
    mesh.setEnabled(false);
    assert.equal(other.getActiveMeshCandidates, original);
    assert.ok(list(other).includes(mesh));
    scene.dispose(); other.dispose();
});

test('disposal clears tracking and detach respects a replacement provider', () => {
    const scene = makeScene();
    const mesh = new B.Mesh('mesh', scene);
    plugin.attachScene(scene);
    const state = plugin.scenes.get(scene);
    const custom = () => ({ data: [], length: 0 });
    scene.getActiveMeshCandidates = custom;
    plugin.detachScene(scene);
    assert.equal(scene.getActiveMeshCandidates, custom);
    assert.equal(state.meshes.size, 0);
    assert.equal(state.enabled.size, 0);
    assert.equal(plugin.scenes.has(scene), false);
    scene.dispose();
    const next = makeScene();
    new B.Mesh('next', next);
    plugin.attachScene(next);
    const nextState = plugin.scenes.get(next);
    next.dispose();
    assert.equal(plugin.scenes.has(next), false);
    assert.equal(nextState.meshes.size, 0);
    assert.equal(nextState.candidates.length, 0);
    assert.ok(mesh.isDisposed());
});

engine.dispose();
console.log('Francium:', passed, 'tests passed.');
