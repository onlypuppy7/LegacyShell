//node plugins_default/francium/test-features.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import misc from '#misc';
import { Plugin } from './index.js';

const context = vm.createContext({ console, performance, setTimeout, clearTimeout });
vm.runInContext(fs.readFileSync(new URL('../../server-client/src/data/babylon.js', import.meta.url), 'utf8'), context);
for (const file of ['hud.js', 'materials.js', 'particles.js', 'warmup.js', 'map.js', 'client.js']) {
    vm.runInContext(misc.prepareForClient(fs.readFileSync(new URL(file, import.meta.url), 'utf8')), context);
};
const B = context.BABYLON;
const hud = vm.runInContext('FranciumHud', context), materials = vm.runInContext('FranciumMaterials', context);
const particles = vm.runInContext('FranciumParticles', context), warm = vm.runInContext('FranciumWarmup', context);
const plugin = vm.runInContext('FranciumPlugin', context);
const originalMark = B.Material.prototype._markAllSubMeshesAsDirty;
const originalSprites = B.SpriteManager.prototype.render;
const engine = new B.NullEngine();
let passed = 0;
const test = (name, run) => { run(); passed++; console.log('PASS', name); };

test('HUD updates deduplicate numbers and attributes without delaying health', () => {
    let now = 0;
    context.performance = { now: () => now };
    const makeText = initial => {
        let value = initial, writes = 0;
        return { get textContent() { return value; }, set textContent(next) { writes++; value = next; }, get writes() { return writes; } };
    };
    const fps = makeText('165'), health = makeText('100'), attrs = new Map();
    let attrWrites = 0;
    const bar = { getAttribute: name => attrs.get(name) ?? null, setAttribute(name, value) { attrWrites++; attrs.set(name, String(value)); } };
    const classes = new Set(), styles = [];
    context.document = {
        getElementById: id => ({ FPS: fps, healthHp: health, healthBar: bar })[id],
        createElement: () => ({}), head: { appendChild: el => styles.push(el) },
        body: { classList: { add: key => classes.add(key), remove: key => classes.delete(key) } }
    };
    hud.attach();
    fps.innerText = 165; assert.equal(fps.writes, 0);
    now = 100; fps.innerText = 150; assert.equal(fps.textContent, '165');
    now = 250; fps.innerText = 150; assert.equal(fps.textContent, '150');
    health.innerText = 100; assert.equal(health.writes, 0);
    health.innerText = 80; assert.equal(health.textContent, '80');
    health.innerText = 79; assert.equal(health.textContent, '79');
    bar.setAttribute('stroke-dashoffset', 2); bar.setAttribute('stroke-dashoffset', 2);
    assert.equal(attrWrites, 1);
    bar.setAttribute('stroke-dashoffset', 3); assert.equal(attrWrites, 2);
    assert.ok(styles[0].textContent.includes('.upgradedPlayer'));
    assert.ok(classes.has('francium-active'));
    hud.leave(); assert.equal(classes.has('francium-active'), false);
    context.performance = performance;
});

test('reticle ignores subpixel jitter and preserves FOV, readiness and external changes', () => {
    let writes = 0, readyWrites = 0;
    context.me = { weapon: { subClass: { accuracy: 1, readySpread: 2 } }, shotSpread: 0 };
    context.camera = { fov: 1.25 };
    context.Reticle = function () {
        let ready = 'notReady';
        this.readyBrackets = { get className() { return ready; }, set className(value) { readyWrites++; ready = value; } };
        this.crosshairs = Array.from({ length: 4 }, () => {
            let transform = '';
            return { style: { get transform() { return transform; }, set transform(value) { writes++; transform = value; } } };
        });
    };
    const core = fs.readFileSync(new URL('../../server-client/src/client-static/src/shellshock.min.js', import.meta.url), 'utf8');
    vm.runInContext(core.slice(core.indexOf('Reticle.prototype.update ='), core.indexOf('Reticle.prototype.resize =')), context);
    hud.attach();
    const reticle = new context.Reticle();
    reticle.update(); reticle.update(); assert.equal(writes, 4); assert.equal(readyWrites, 1);
    for (let i = 0; i < 50; i++) { context.me.shotSpread = i / 10000; reticle.update(); };
    assert.equal(writes, 4);
    context.me.shotSpread = 8; reticle.update(); assert.equal(writes, 8);
    assert.equal(reticle.readyBrackets.className, 'notReady');
    context.camera.fov = .5; reticle.update(); assert.equal(writes, 12);
    reticle.readyBrackets.className = 'ready'; reticle.update(); assert.equal(writes, 12);
    assert.equal(reticle.readyBrackets.className, 'notReady');
    context.me.shotSpread = 4.000001; reticle.update();
    const before = writes;
    context.me.shotSpread = 3.999999; reticle.update();
    assert.equal(writes, before); assert.equal(reticle.readyBrackets.className, 'ready');
    reticle.crosshairs[0].style.transform = 'replay'; reticle.update();
    assert.equal(writes, before + 2);
    assert.ok(reticle.crosshairs[0].style.transform.startsWith('rotate(0deg)'));
    const spread = context.me.shotSpread + context.me.weapon.subClass.accuracy;
    const expected = .069 * spread * (1.25 / context.camera.fov) + .12;
    const actual = Number(reticle.crosshairs[0].style.transform.match(/translateY\((.*?)em\)/)[1]);
    assert.ok(Math.abs(actual - expected) <= .005);
});

test('improvements default on, are fixed for the page lifetime and off restores the original debug loop', () => {
    const source = misc.prepareForClient(fs.readFileSync(new URL('hud.js', import.meta.url), 'utf8'));
    for (const [saved, expected] of [['{}', true], ['{"franciumImprovements":true}', true], ['{"franciumImprovements":false}', false], ['invalid', true]]) {
        let value = saved;
        const frames = [], ctx = vm.createContext({ localStorage: { getItem: () => value }, requestAnimationFrame: fn => frames.push(fn) });
        vm.runInContext(source, ctx);
        const feature = vm.runInContext('FranciumHud', ctx);
        assert.equal(feature.improvements, expected);
        value = '{"franciumImprovements":false}'; assert.equal(feature.improvements, expected);
        if (!expected) {
            let updates = 0;
            const debug = { shown: false, update() { updates++; } }, original = debug.update;
            feature.watchDebug(debug); assert.equal(debug.update, original); assert.equal(frames.length, 1);
            frames.shift()(); assert.equal(updates, 1); assert.equal(frames.length, 1);
        };
    };
});

test('FPS unlock scopes task scheduling to the game engine and restores refresh pacing live', () => {
    const tasks = [], raf = [], state = { enableDebug: true, franciumUnlockFps: false };
    let calls = 0, now = 0;
    const browser = vm.createContext({ performance: { now: () => ++now }, document: { hidden: false }, inGame: true,
        engine: { _bindedRenderFunction: () => calls++ }, LegacySettings: { get: (key, fallback) => state[key] ?? fallback },
        MessageChannel: class {
            port1 = {};
            port2 = { postMessage: data => tasks.push(() => this.port1.onmessage({ data })) };
        }, BABYLON: { Tools: { QueueNewFrame: (fn, requester) => { raf.push([fn, requester]); return raf.length; } } } });
    vm.runInContext(misc.prepareForClient(fs.readFileSync(new URL('hud.js', import.meta.url), 'utf8')), browser);
    const feature = vm.runInContext('FranciumHud', browser), fn = browser.engine._bindedRenderFunction;
    feature.improvements = false; feature.patchFrames(); const queue = browser.BABYLON.Tools.QueueNewFrame;
    feature.patchFrames(); assert.equal(browser.BABYLON.Tools.QueueNewFrame, queue);
    queue(fn); assert.equal(raf.length, 1); assert.equal(tasks.length, 0);
    state.franciumUnlockFps = true;
    assert.ok(queue(fn) < 0); assert.equal(tasks.length, 1);
    tasks.shift()(); assert.equal(calls, 1); assert.equal(feature.frameCallbacks.size, 0);
    queue(fn, {}); queue(() => {}); browser.inGame = false; queue(fn); browser.inGame = true;
    state.enableDebug = false; queue(fn); state.enableDebug = true;
    assert.equal(tasks.length, 0); assert.equal(raf.length, 5);
    queue(fn); browser.document.hidden = true; tasks.shift()();
    assert.equal(calls, 1); assert.equal(raf.length, 6); assert.equal(feature.frameCallbacks.size, 0);
    queue(fn); assert.equal(raf.length, 7); browser.document.hidden = false;
    state.franciumUnlockFps = false; queue(fn); assert.equal(raf.length, 8);
});

test('hidden F3 has no frame loop and toggling restarts one loop', () => {
    let next = 1, updates = 0;
    const frames = new Map();
    context.requestAnimationFrame = fn => { const id = next++; frames.set(id, fn); return id; };
    context.cancelAnimationFrame = id => frames.delete(id);
    const debug = { shown: false, update() { updates++; } };
    hud.watchDebug(debug); assert.equal(frames.size, 0);
    debug.shown = true; debug.update(true); assert.equal(frames.size, 1);
    debug.update(true); assert.equal(frames.size, 1);
    const [id, fn] = frames.entries().next().value; frames.delete(id); fn();
    assert.equal(frames.size, 1);
    debug.shown = false; debug.update(true); assert.equal(frames.size, 0);
    debug.shown = true; debug.update(true); assert.equal(frames.size, 1);
    debug.shown = false; debug.update(true);
    assert.ok(updates >= 5);
});

test('build hook only changes the known debug loop', () => {
    const handlers = new Map();
    new Plugin({ type: 'client', on: (name, fn) => handlers.set(name, fn) }, '.');
    const before = fs.readFileSync(new URL('../debugf3/client.js', import.meta.url), 'utf8');
    const replacement = { pattern: /LEGACYSHELLPLUGINSBEFORE/g, insertion: before };
    handlers.get('client:replacementsBefore')({ replacementsBefore: [replacement] });
    assert.ok(replacement.insertion.includes('FranciumHud.watchDebug(this)'));
    assert.equal(replacement.insertion.includes('requestAnimationFrame(loop)'), false);
    new vm.Script(misc.prepareForClient(replacement.insertion));
    const untouched = { pattern: /OTHER/g, insertion: before };
    handlers.get('client:replacementsBefore')({ replacementsBefore: [untouched] });
    assert.equal(untouched.insertion, before);
});

test('material index matches the original across assignment, clones and instances', () => {
    const scene = new B.Scene(engine);
    const a = new B.StandardMaterial('a', scene), b = new B.StandardMaterial('b', scene);
    const source = B.MeshBuilder.CreateBox('source', {}, scene); source.material = a;
    for (let i = 0; i < 100; i++) { const mesh = B.MeshBuilder.CreateBox('unused' + i, {}, scene); mesh.material = b; mesh.setEnabled(false); };
    materials.attach(scene);
    const clone = source.clone('clone'), instance = source.createInstance('instance');
    const compare = mat => {
        scene.meshes.forEach(mesh => (mesh.subMeshes || []).forEach(sub => { sub._materialDefines = Object.assign(new B.MaterialDefines(), { hits: 0 }); }));
        originalMark.call(mat, defines => defines.hits++);
        const expected = scene.meshes.map(mesh => (mesh.subMeshes || []).map(sub => sub._materialDefines.hits));
        scene.meshes.forEach(mesh => (mesh.subMeshes || []).forEach(sub => { sub._materialDefines.hits = 0; }));
        mat._markAllSubMeshesAsDirty(defines => defines.hits++);
        assert.deepEqual(scene.meshes.map(mesh => (mesh.subMeshes || []).map(sub => sub._materialDefines.hits)), expected);
    };
    compare(a); compare(b);
    clone.material = b; source.material = b; compare(a); compare(b);
    clone.material = null; compare(scene.defaultMaterial);
    let during = 0;
    source.onMaterialChangedObservable.add(() => a._markAllSubMeshesAsDirty(() => during++));
    source.material = a;
    assert.ok(during >= 2); compare(a);
    instance.dispose(); clone.dispose(); compare(a);
    const unrelated = scene.meshes.find(mesh => mesh.name === 'unused1').subMeshes[0];
    const getMaterial = unrelated.getMaterial;
    unrelated.getMaterial = () => assert.fail('scanned unrelated material');
    a._markAllSubMeshesAsDirty(() => {});
    unrelated.getMaterial = getMaterial;
    scene.dispose(); assert.equal(materials.scenes.has(scene), false);
});

test('multi-material slots, new submeshes and scene removal stay correct', () => {
    const scene = new B.Scene(engine), a = new B.StandardMaterial('a', scene), b = new B.StandardMaterial('b', scene);
    const multi = new B.MultiMaterial('multi', scene); multi.subMaterials.push(a);
    const mesh = B.MeshBuilder.CreateBox('mesh', {}, scene); mesh.material = multi;
    materials.attach(scene);
    let hits = 0;
    const ready = () => mesh.subMeshes.forEach(sub => { sub.getMaterial(); sub._materialDefines = new B.MaterialDefines(); });
    ready();
    a._markAllSubMeshesAsDirty(() => hits++); assert.equal(hits, 1);
    multi.subMaterials[0] = b;
    ready();
    a._markAllSubMeshesAsDirty(() => hits++); assert.equal(hits, 1);
    b._markAllSubMeshesAsDirty(() => hits++); assert.equal(hits, 2);
    mesh.material = a;
    const sub = new B.SubMesh(0, 0, mesh.getTotalVertices(), 0, 3, mesh);
    sub._materialDefines = new B.MaterialDefines();
    ready();
    a._markAllSubMeshesAsDirty(() => hits++); assert.equal(hits, 4);
    scene.removeMesh(mesh); a._markAllSubMeshesAsDirty(() => hits++); assert.equal(hits, 4);
    scene.addMesh(mesh); a._markAllSubMeshesAsDirty(() => hits++); assert.equal(hits, 6);
    scene.dispose();
});

test('unassigned meshes are only visited for the current default material', () => {
    const scene = new B.Scene(engine), material = new B.StandardMaterial('assigned', scene);
    const assigned = B.MeshBuilder.CreateBox('assigned', {}, scene); assigned.material = material;
    const unassigned = Array.from({ length: 1000 }, (_, i) => B.MeshBuilder.CreateBox('default' + i, {}, scene));
    materials.attach(scene);
    let visits = 0;
    for (const mesh of unassigned) {
        const sub = mesh.subMeshes[0], get = sub.getMaterial;
        sub.getMaterial = function () { visits++; return get.apply(this, arguments); };
        sub._materialDefines = new B.MaterialDefines();
    };
    material._markAllSubMeshesAsDirty(() => {}); assert.equal(visits, 0);
    const oldDefault = scene.defaultMaterial;
    let hits = 0;
    oldDefault._markAllSubMeshesAsDirty(() => hits++); assert.equal(hits, 1000);
    scene.defaultMaterial = new B.StandardMaterial('replacement default', scene);
    visits = 0;
    oldDefault._markAllSubMeshesAsDirty(() => hits++); assert.equal(visits, 0);
    scene.defaultMaterial._markAllSubMeshesAsDirty(() => hits++); assert.equal(hits, 2000);
    unassigned[0].material = material;
    hits = 0;
    scene.defaultMaterial._markAllSubMeshesAsDirty(() => hits++); assert.equal(hits, 999);
    unassigned[1].dispose();
    hits = 0;
    scene.defaultMaterial._markAllSubMeshesAsDirty(() => hits++); assert.equal(hits, 998);
    scene.dispose();
});

const fakeSprites = (visible, options = {}) => {
    const calls = [], noop = () => {};
    const effect = new Proxy({ isReady: () => options.ready !== false }, { get: (o, key) => o[key] || noop });
    const fakeEngine = new Proxy({ getDeltaTime: () => 16,
        drawElementsType: (mode, first, count) => calls.push(['draw', count]),
        updateDynamicVertexBuffer: (buffer, data, offset, bytes) => calls.push(['upload', bytes]),
        setAlphaMode: value => calls.push(['alpha', value]) }, { get: (o, key) => o[key] || noop });
    const scene = { getEngine: () => fakeEngine, getViewMatrix: () => null, getProjectionMatrix: () => null, fogEnabled: !!options.fog, fogMode: B.Scene.FOGMODE_EXP, fogColor: {} };
    const data = new Float32Array(16 * 400 * 4);
    const manager = { _scene: scene, _capacity: 400, sprites: Array.from({ length: 400 }, (_, i) => ({ isVisible: i < visible, _animate: () => calls.push(['animate', i]) })),
        _effectBase: effect, _effectFog: effect, _spriteTexture: { isReady: () => true, getBaseSize: () => ({ width: 256, height: 256 }) },
        _buffer: { getBuffer: () => ({}), update: array => calls.push(['upload', array.byteLength]) }, _vertexData: data,
        cellWidth: 128, cellHeight: 128, _appendSpriteVertex: index => calls.push(['vertex', index]), fogEnabled: true,
        blendMode: options.add ? B.Engine.ALPHA_ADD : B.Engine.ALPHA_COMBINE, noAlphaTest: !!options.noAlpha };
    return { scene, manager, calls, data };
};

test('empty sprites skip uploads and draws; live sprites retain blending and animation', () => {
    particles.patch();
    const empty = fakeSprites(0); plugin.scenes.set(empty.scene, {});
    B.SpriteManager.prototype.render.call(empty.manager);
    assert.equal(empty.calls.length, 0);
    plugin.scenes.delete(empty.scene);
    for (const options of [{}, { add: true }, { noAlpha: true }, { fog: true }, { ready: false }]) {
        const vanilla = fakeSprites(2, options), optimized = fakeSprites(2, options);
        originalSprites.call(vanilla.manager);
        plugin.scenes.set(optimized.scene, {});
        B.SpriteManager.prototype.render.call(optimized.manager);
        assert.deepEqual(optimized.calls.filter(call => call[0] !== 'upload'), vanilla.calls.filter(call => call[0] !== 'upload'));
        if (options.ready !== false) assert.deepEqual(optimized.calls.find(call => call[0] === 'upload'), ['upload', 512]);
        assert.equal(optimized.manager._vertexData, optimized.data);
        plugin.scenes.delete(optimized.scene);
    };
    const other = fakeSprites(0);
    B.SpriteManager.prototype.render.call(other.manager);
    assert.ok(other.calls.some(call => call[0] === 'upload'));
});

test('shader preparation deduplicates variants and includes instancing and egg shaders', () => {
    const scene = new B.Scene(engine), mat = new B.ShaderMaterial('standard', scene, 'default', { attributes: ['position'], uniforms: ['worldViewProjection'], defines: [] });
    const calls = [];
    mat.isReady = (mesh, instances) => { calls.push([mesh.name, instances]); return true; };
    const eggMat = new B.ShaderMaterial('eggShell', scene, 'default', { attributes: ['position'], uniforms: [], defines: [] });
    eggMat.isReady = () => { calls.push(['eggShell']); return true; };
    const egg = B.MeshBuilder.CreateBox('egg', {}, scene); egg.material = mat; egg.setEnabled(false);
    for (let i = 0; i < 100; i++) { const mesh = egg.clone('hat' + i); mesh.material = mat; };
    scene.getOutlineRenderer().isReady = () => true;
    const caps = engine.getCaps(), oldInstances = caps.instancedArrays; caps.instancedArrays = true;
    warm.prepare(scene);
    const standard = calls.filter(call => call[0] !== 'eggShell');
    assert.deepEqual(standard.map(call => call[1]), [false, true]);
    assert.ok(scene.getMeshByName(standard[0][0]).isEnabled());
    assert.equal(calls.filter(call => call[0] === 'eggShell').length, 2);
    const count = calls.length; warm.prepare(scene); assert.equal(calls.length, count);
    assert.equal(mat._renderId, -1);
    assert.equal(egg.isEnabled(), false);
    caps.instancedArrays = oldInstances;
    scene.dispose(); assert.equal(warm.scenes.has(scene), false);
});

test('shader retries are bounded and lifecycle hooks preserve return values', () => {
    let calls = 0;
    const job = { mesh: { isDisposed: () => false }, material: { isReady: () => { calls++; return false; } }, sub: {}, tries: 0 };
    for (let i = 0; i < 39; i++) assert.equal(warm.compile(job), false);
    assert.equal(warm.compile(job), true); assert.equal(calls, 40);
    const prepared = [], queued = [];
    const prepare = warm.prepare; warm.prepare = (scene, meshes) => prepared.push([scene, meshes]);
    const queue = warm.queue; warm.queue = (scene, meshes) => queued.push([scene, meshes]);
    context.gameScene = {};
    context.players_by_id = { 1: { actor: { mesh: { getChildMeshes: () => ['gun'] } } } };
    context.startRendering = () => 123;
    context.addPlayer = () => 456;
    warm.patch();
    assert.equal(context.startRendering(), 123);
    assert.equal(context.addPlayer({ id: 1 }), 456);
    assert.equal(prepared.length, 1); assert.equal(queued.length, 1);
    assert.deepEqual(queued[0][1], ['gun']);
    warm.prepare = prepare; warm.queue = queue;
});

test('player joins defer warmup during play and drain at most one shader job per timer', () => {
    const timers = new Map(); let next = 0, calls = 0, matrices = 0;
    context.setTimeout = (fn, delay) => { const id = ++next; timers.set(id, { fn, delay }); return id; };
    context.clearTimeout = id => timers.delete(id);
    context.me = { playing: true };
    const scene = new B.Scene(engine), mat = new B.ShaderMaterial('queued', scene, 'default', { attributes: ['position'], uniforms: [], defines: [] });
    mat.isReady = () => { calls++; return true; };
    const mesh = B.MeshBuilder.CreateBox('queued', {}, scene); mesh.material = mat;
    const compute = mesh.computeWorldMatrix;
    mesh.computeWorldMatrix = function () { matrices++; return compute.apply(this, arguments); };
    const tick = () => {
        const [id, timer] = timers.entries().next().value;
        timers.delete(id);
        const before = calls; timer.fn(); assert.ok(calls - before <= 1);
    };
    warm.queue(scene, [mesh]); warm.queue(scene, [mesh]); warm.prepare(scene);
    assert.equal(timers.size, 1); assert.equal(timers.values().next().value.delay, 250);
    tick(); assert.equal(calls, 0); assert.equal(matrices, 0);
    context.me.playing = false;
    for (let i = 0; timers.size && i < 20; i++) tick();
    assert.ok(calls > 0); assert.ok(matrices > 0); assert.equal(timers.size, 0);
    context.me.playing = true;
    warm.queue(scene, [mesh]); assert.equal(timers.size, 1);
    const queuedTimer = warm.scenes.get(scene).timer;
    scene.dispose(); assert.equal(timers.has(queuedTimer), false);
    assert.equal(warm.scenes.has(scene), false);
    for (const timer of timers.values()) timer.fn();
    timers.clear();
    context.setTimeout = setTimeout; context.clearTimeout = clearTimeout;
});

engine.dispose();
console.log('Francium:', passed, 'feature tests passed.');
