import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import Database from 'better-sqlite3';
import { getPublicProfile, profileRank } from './profiles.js';
import { Plugin } from './index.js';
import misc from '#misc';
import UglifyJS from 'uglify-js';
import BABYLON from 'babylonjs';

function fixture() {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE users (account_id INTEGER, username TEXT, password TEXT, authToken TEXT,
        kills INTEGER, deaths INTEGER, streak INTEGER, currentBalance INTEGER, eggsSpent INTEGER,
        ownedItemIds TEXT, loadout TEXT, adminRoles INTEGER, dateCreated INTEGER,
        upgradeProductId INTEGER, upgradeExpiryDate INTEGER, upgradeMultiplier INTEGER)`);
    db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        7, 'test_egg', 'never public', 'also never public', 100, 25, 12, 1234, 500,
        '[50001,50001,200000]', '{"classIdx":0,"primaryId":[200000],"secondaryId":[150000],"colorIdx":2,"hatId":50001}',
        10, 1700000000, 1, 2000000000, 2);
    return { db, config: { distributed_permissions: { ranks: { 0: 'Guest', 1: 'Signed In', 255: 'Superuser' } } },
        getOne(sql, args) { return db.prepare(sql).get(...args); } };
};

test('public profile is an explicit projection and never changes the account', async () => {
    const context = fixture();
    try {
        const before = context.db.prepare('SELECT * FROM users').get();
        const profile = await getPublicProfile(context, 7, 1800000000000);
        assert.deepEqual(Object.keys(profile).sort(), ['account_id', 'username', 'kills', 'deaths', 'streak', 'eggs', 'eggsSpent', 'joined', 'rank', 'inventory', 'loadout', 'vip'].sort());
        assert.equal(JSON.stringify(profile).includes('never public'), false);
        assert.deepEqual(profile.inventory, [50001, 200000]);
        assert.deepEqual(profile.rank, { value: 10, name: 'Moderator' });
        assert.equal(profile.vip.active, true);
        assert.equal(profile.joined, 1700000000);
        assert.deepEqual(context.db.prepare('SELECT * FROM users').get(), before);
    } finally { context.db.close(); };
});

test('bad identifiers do not query the database and missing accounts return null', async () => {
    const context = fixture();
    try {
        const never = { getOne() { throw new Error('should not query'); } };
        for (const id of [null, undefined, 0, -1, 1.5, '7 OR 1=1', {}, '7e0', '007', 2 ** 40]) assert.equal(await getPublicProfile(never, id), null);
        assert.equal(await getPublicProfile(context, 8), null);
        assert.equal((await getPublicProfile(context, '7')).account_id, 7);
    } finally { context.db.close(); };
});

test('expired VIP and malformed old JSON are handled without leaking other fields', async () => {
    const context = fixture();
    try {
        context.db.exec(`UPDATE users SET ownedItemIds = 'null', loadout = 'broken', kills = -4`);
        const profile = await getPublicProfile(context, 7, 2100000000000);
        assert.deepEqual(profile.inventory, []);
        assert.deepEqual(profile.loadout.primaryId, []);
        assert.equal(profile.kills, 0);
        assert.deepEqual(profile.vip, { active: false, expires: null, multiplier: 1 });
        assert.equal(profileRank(1).name, 'Player');
        assert.equal(profileRank(255, context.config.distributed_permissions.ranks).name, 'Owner');
        assert.equal(profileRank(15, { 15: 'Helper' }).name, 'Helper');
    } finally { context.db.close(); };
});

test('the build hook replaces the old player popup once and browser files minify', () => {
    const listeners = {};
    new Plugin({ on(name, callback) { listeners[name] = callback; } }, import.meta.dirname);
    const original = fs.readFileSync(new URL('../../server-client/src/client-static/src/shellshock.min.js', import.meta.url), 'utf8');
    const code = { sourceJs: original };
    listeners['client:doReplacements']({ code });
    listeners['client:doReplacements']({ code });
    assert.equal(code.sourceJs.split('return LegacyProfiles.openPlayer(playerId, uniqueId)').length, 2);
    assert.equal(code.sourceJs.includes('list[i].onclick = function (playerId, uniqueId, username)'), true);
    assert.equal(code.sourceJs.includes('}(player.id, player.uniqueId, player.username), false);'), false);
    const minifiedPass = { ...code, sourceJs: 'minified second build pass' };
    assert.doesNotThrow(() => listeners['client:doReplacements']({ code: minifiedPass }));
    assert.throws(() => listeners['client:doReplacements']({ code: { sourceJs: 'changed core' } }), /insertion point/);
    const source = ['preview.js', 'client.js'].map(file => misc.prepareForClient(fs.readFileSync(new URL(file, import.meta.url), 'utf8'))).join('\n');
    new vm.Script(source);
    const result = UglifyJS.minify(source);
    assert.equal(result.error, undefined, result.error?.message);
});

test('preview reuses the game engine, restores rendering state and only removes its own callback', async () => {
    const gameEngine = new BABYLON.NullEngine();
    const gameScene = new BABYLON.Scene(gameEngine);
    const before = BABYLON.Engine.Instances.length;
    const loops = new Set([() => {}]);
    const originalLoop = [...loops][0];
    const events = [];
    gameEngine.runRenderLoop = callback => loops.add(callback);
    gameEngine.stopRenderLoop = callback => { assert.ok(callback); loops.delete(callback); };
    gameEngine.bindFramebuffer = () => events.push('bind');
    gameEngine.unBindFramebuffer = () => events.push('unbind');
    const viewport = new BABYLON.Viewport(.1, .2, .7, .8);
    gameEngine.setViewport(viewport);
    class Target {
        constructor(name, size, scene) { scene.onDisposeObservable.add(() => { this.disposed = true; }); }
        resize(size) { this.size = size; }
        getInternalTexture() { return this; }
        readPixels(face, level, buffer) { buffer.fill(8); }
    };
    class Observer { observe() {} disconnect() {} };
    let clock = 40;
    const listeners = new Map();
    let captured;
    const canvas = {
        parentElement: {},
        getBoundingClientRect: () => ({ width: 250, height: 210 }),
        getContext: () => ({ createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }), putImageData() {} }),
        addEventListener: (name, callback) => listeners.set(name, callback),
        removeEventListener: name => listeners.delete(name),
        setPointerCapture: id => { captured = id; },
        hasPointerCapture: id => captured === id,
        releasePointerCapture: () => { captured = null; },
    };
    const context = vm.createContext({
        BABYLON: { ...BABYLON, RenderTargetTexture: Target }, engine: gameEngine,
        Customizer: { skyColor: new BABYLON.Color3(.35, .65, .8), diffuseColor: new BABYLON.Color3(.35, .5, .6) },
        ResizeObserver: Observer, IntersectionObserver: Observer,
        window: { devicePixelRatio: 1 }, document: { hidden: false }, performance: { now: () => clock }, setTimeout, clearTimeout,
    });
    const source = misc.prepareForClient(fs.readFileSync(new URL('preview.js', import.meta.url), 'utf8'));
    vm.runInContext(source + '\nglobalThis.Preview = LegacyProfilePreview;', context);
    context.Preview.prototype.materials = () => {};
    context.Preview.prototype.load = async function () { this.root = new BABYLON.TransformNode('test avatar', this.scene); };
    let preview;
    try {
        await new Promise((resolve, reject) => { preview = new context.Preview(canvas, {}, resolve, reject); });
        assert.equal(preview.engine, gameEngine);
        assert.equal(BABYLON.Engine.Instances.length, before);
        assert.equal(BABYLON.Engine.LastCreatedScene, gameScene);
        assert.equal(new BABYLON.TransformNode('new actor').getScene(), gameScene);
        assert.equal(preview.camera.inertia, 0);
        assert.equal(preview.scene.renderTargetsEnabled, false);
        assert.equal(preview.scene.clearColor, context.Customizer.skyColor);
        assert.equal(preview.scene.fogColor, context.Customizer.skyColor);
        assert.equal(preview.scene.fogDensity, .06);
        assert.equal(preview.scene.getMeshByName('profileGround').material.diffuseColor, context.Customizer.diffuseColor);
        assert.equal(preview.scene.getMeshByName('profileGround').receiveShadows, true);
        assert.equal(preview.shadow.useBlurExponentialShadowMap, true);
        assert.equal(preview.shadow.blurScale, 2);
        preview.shadow.getShadowMap().render = () => events.push('shadow');
        let frames = 0;
        preview.scene.render = () => { events.push('render'); frames++; };
        preview.renderFrame();
        assert.deepEqual(events, ['shadow', 'bind', 'render', 'unbind']);
        assert.equal(gameEngine.currentViewport, viewport);
        clock += 8;
        preview.renderFrame();
        assert.equal(frames, 1);
        const alpha = preview.camera.alpha;
        const beta = preview.camera.beta;
        listeners.get('pointerdown')({ button: 0, pointerId: 1, clientX: 10, clientY: 10, preventDefault() {} });
        listeners.get('pointermove')({ pointerId: 1, clientX: 110, clientY: 90 });
        preview.renderFrame();
        assert.equal(frames, 2); //dragging bypasses idle throttling
        assert.equal(preview.yaw, -1);
        assert.equal(preview.pitch, 80 / 150);
        const rotation = preview.root.rotationQuaternion.clone();
        assert.equal(preview.camera.alpha, alpha);
        assert.equal(preview.camera.beta, beta);
        preview.camera._checkInputs();
        assert.equal(preview.root.rotationQuaternion.equals(rotation), true);
        assert.equal(preview.camera.alpha, alpha);
        assert.equal(preview.camera.beta, beta);
        listeners.get('pointermove')({ pointerId: 1, clientX: 10, clientY: 10 });
        assert.equal(preview.yaw, 0);
        assert.equal(preview.pitch, 0);
        assert.equal(preview.root.rotationQuaternion.equals(BABYLON.Quaternion.Identity()), true);
        listeners.get('pointermove')({ pointerId: 1, clientX: 10, clientY: 1000 });
        assert.equal(preview.pitch, Math.PI / 3);
        assert.equal(preview.camera.alpha, alpha);
        assert.equal(preview.camera.beta, beta);
        preview.scene.render = () => { throw new Error('failed frame'); };
        assert.throws(() => preview.render(), /failed frame/);
        assert.equal(events.at(-1), 'unbind');
        assert.equal(gameEngine.currentViewport, viewport);
        clock += 40;
        assert.doesNotThrow(() => preview.renderFrame());
        assert.equal(preview.dead, true); //a failed preview must not stop the game's frame loop
        preview.dispose();
        preview.dispose();
        assert.equal(captured, null);
        assert.equal(listeners.size, 0);
        assert.equal(preview.target.disposed, true);
        assert.equal(preview.scene.isDisposed, true);
        assert.equal(loops.size, 1);
        assert.equal(loops.has(originalLoop), true);
        assert.equal(BABYLON.Engine.Instances.length, before);
        assert.equal(BABYLON.Engine.LastCreatedScene, gameScene);
    } finally { preview?.dispose(); gameEngine.stopRenderLoop = BABYLON.Engine.prototype.stopRenderLoop; gameEngine.dispose(); };
});

test('inventory supports broad categories and individual weapons with name search', () => {
    const context = vm.createContext({ isClient: false, ItemType: { Primary: 3, Secondary: 4 } });
    const source = misc.prepareForClient(fs.readFileSync(new URL('client.js', import.meta.url), 'utf8'));
    vm.runInContext(source + '\nglobalThis.viewer = LegacyProfiles;', context);
    const rifle = { name: 'Gold Rifle', item_type_id: 3, item_data: { class: 'Eggk47' } };
    const shotgun = { name: 'Eggk47 Fan Skin', item_type_id: 3, item_data: { class: 'DozenGauge' } };
    const pistol = { name: 'Sidearm', item_type_id: 4, item_data: { class: 'Cluck9mm' } };
    const matches = context.viewer.matchesInventory;
    assert.equal(matches(rifle, '3', ''), true);
    assert.equal(matches(shotgun, '3', ''), true);
    assert.equal(matches(pistol, '3', ''), false);
    assert.equal(matches(rifle, 'weapon:Eggk47', 'gold'), true);
    assert.equal(matches(shotgun, 'weapon:Eggk47', ''), false);
    assert.equal(matches(shotgun, 'weapon:DozenGauge', ''), true);
    assert.equal(matches(pistol, 'weapon:Cluck9mm', ''), true);
    assert.equal(matches(rifle, 'weapon:Eggk47', 'missing'), false);
});

test('loadout arrows skip missing weapons, wrap and leave actual equipment unchanged', () => {
    const context = vm.createContext({ isClient: false, ItemType: { Primary: 3 }, catalog: { findItemById: id => [10, 11, 13].includes(id) ? { item_type_id: 3 } : null } });
    const source = misc.prepareForClient(fs.readFileSync(new URL('client.js', import.meta.url), 'utf8'));
    vm.runInContext(source + '\nglobalThis.viewer = LegacyProfiles;', context);
    const viewer = context.viewer;
    viewer.profile = { loadout: { classIdx: 1, primaryId: [10, 11, 999, 13], secondaryId: [20, 21, 22, 23], hatId: 30, stampId: 40 } };
    const original = JSON.stringify(viewer.profile);
    viewer.viewClassIdx = 1;
    viewer.tileGeneration = 0;
    const shown = [];
    viewer.renderLoadout = () => {};
    viewer.showPreviewClass = index => shown.push(index);
    const container = { replaceChildren() {}, querySelector() { return { focus() {} }; } };
    viewer.cycleLoadout(1, container);
    viewer.cycleLoadout(1, container);
    viewer.cycleLoadout(-1, container);
    assert.deepEqual(shown, [3, 0, 3]);
    assert.deepEqual(Array.from(viewer.equippedIds(3)), [13, 23, 30, 40]);
    assert.deepEqual(Array.from(viewer.equippedIds()), [11, 21, 30, 40]);
    assert.equal(JSON.stringify(viewer.profile), original);
    viewer.profile.loadout.primaryId = [null, 11];
    viewer.cycleLoadout(1, container);
    assert.equal(shown.length, 3);
});
