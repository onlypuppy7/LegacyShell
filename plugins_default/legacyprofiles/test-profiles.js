import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import Database from 'better-sqlite3';
import { getPublicProfile, profileRank } from './profiles.js';
import { saveProfilePreferences, initProfilePreferences } from './preferences.js';
import { CharClass, itemIdOffsets, ItemType } from '#constants';
import { Plugin } from './index.js';
import misc from '#misc';
import UglifyJS from 'uglify-js';
import BABYLON from 'babylonjs';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

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
        const profile = await getPublicProfile(context, 'test_egg', 1800000000000);
        assert.deepEqual(Object.keys(profile).sort(), ['username', 'kills', 'deaths', 'streak', 'eggs', 'eggsSpent', 'joined', 'rank', 'inventory', 'loadout', 'vip', 'preferences'].sort());
        assert.equal(JSON.stringify(profile).includes('never public'), false);
        assert.deepEqual(profile.inventory, [50001, 200000]);
        assert.deepEqual(profile.rank, { value: 10, name: 'Moderator' });
        assert.equal(profile.vip.active, true);
        assert.equal(profile.joined, 1700000000);
        assert.deepEqual(context.db.prepare('SELECT * FROM users').get(), before);
    } finally { context.db.close(); };
});

test('profile preferences persist separately and reject unowned items, duplicate slots and invalid classes/angles', async () => {
    const context = fixture();
    try {
        const before = context.db.prepare('SELECT * FROM users').get();
        const value = { yaw: 7, pitch: .3, classIdx: 0, featuredItems: [200000, 50001] };
        assert.equal(saveProfilePreferences(context.db, 7, value), 'test_egg');
        const profile = await getPublicProfile(context, 'test_egg');
        assert.deepEqual(profile.preferences.featuredItems, [200000, 50001]);
        assert.equal(profile.preferences.classIdx, 0);
        assert.ok(Math.abs(profile.preferences.yaw - (7 - 2 * Math.PI)) < 1e-9);
        for (const changes of [{ featuredItems: [9999] }, { featuredItems: [50001, 50001] }, { featuredItems: Array(7).fill(50001) }, { classIdx: 99 }, { classIdx: '0' }, { pitch: 2 }, { yaw: Infinity }]) {
            assert.throws(() => saveProfilePreferences(context.db, 7, { ...value, ...changes }));
            assert.deepEqual((await getPublicProfile(context, 'test_egg')).preferences, profile.preferences);
        };
        assert.deepEqual(context.db.prepare('SELECT * FROM users').get(), before);
        context.db.exec("UPDATE users SET ownedItemIds = '[50001]'");
        assert.deepEqual((await getPublicProfile(context, 'test_egg')).preferences.featuredItems, [50001]);
    } finally { context.db.close(); };
});

test('profile saves require the live session and ignore a forged username or account ID', async () => {
    const db = fixture(), replies = [];
    initProfilePreferences(db.db);
    const context = vm.createContext({ ss: db, getPublicProfile, saveProfilePreferences, console: { error() {} }, sess: {
        retrieveSession: async (token, ip) => token === 'valid' && ip === 'test-ip' ? { user_id: 7 } : null,
    } });
    vm.runInContext(misc.prepareForClient(fs.readFileSync(new URL('index.js', import.meta.url), 'utf8')) + '\nglobalThis.handle = Plugin.prototype.unhandledCommand;', context);
    const plugin = { plugins: { cancel: false } }, ws = { send: data => replies.push(JSON.parse(data)) };
    const msg = { cmd: 'legacyprofilesSave', username: 'victim', account_id: 999, preferences: { yaw: .5, pitch: 0, classIdx: 0, featuredItems: [50001] } };
    try {
        for (const session of [undefined, 'expired']) await context.handle.call(plugin, { msg: { ...msg, session }, ws, ip: 'test-ip' });
        assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM profile_preferences').get().n, 0);
        assert.ok(replies.every(reply => reply.error));
        await context.handle.call(plugin, { msg: { ...msg, session: 'valid' }, ws, ip: 'test-ip' });
        assert.equal(replies.at(-1).legacyprofiles.username, 'test_egg');
        assert.deepEqual(replies.at(-1).legacyprofiles.preferences.featuredItems, [50001]);
    } finally { db.db.close(); };
});

test('lookups require literal usernames and never fall back to incremental IDs', async () => {
    const context = fixture();
    try {
        const never = { getOne() { throw new Error('should not query'); } };
        for (const name of [null, undefined, 7, 0, -1, 1.5, '7 OR 1=1', {}, [], '', 'ab', ' test_egg', 'test_egg ', 'test_egg\n', 'test%egg', 2 ** 40]) assert.equal(await getPublicProfile(never, name), null);
        assert.equal(await getPublicProfile(context, 'missing_egg'), null);
        assert.equal(await getPublicProfile(context, 'TEST_EGG'), null); //same exact matching as login
        assert.equal(await getPublicProfile(context, '007'), null);
        assert.equal((await getPublicProfile(context, 'test_egg')).username, 'test_egg');
        context.db.exec("UPDATE users SET username = '007'");
        assert.equal((await getPublicProfile(context, '007')).username, '007'); //numeric usernames are still usernames
        assert.equal(await getPublicProfile(context, 7), null);
    } finally { context.db.close(); };
});

test('public profiles and saved preferences preserve a plugin class beyond the original four', async () => {
    const context = fixture();
    try {
        const loadout = { classIdx: 4, primaryId: [200000, null, null, null, 450000], secondaryId: [150000, null, null, null, 150000] };
        context.db.prepare('UPDATE users SET loadout = ?').run(JSON.stringify(loadout));
        saveProfilePreferences(context.db, 7, { yaw: 0, pitch: 0, classIdx: 4, featuredItems: [] });
        const profile = await getPublicProfile(context, 'test_egg');
        assert.equal(profile.loadout.classIdx, 4);
        assert.equal(profile.loadout.primaryId[4], 450000);
        assert.equal(profile.preferences.classIdx, 4);
    } finally { context.db.close(); };
});

test('old four-slot accounts can view and feature a registered Crackshot default without rewriting equipment', async () => {
    const context = fixture(), length = CharClass.length;
    const previous = itemIdOffsets[ItemType.Primary][4];
    CharClass.length = 5;
    itemIdOffsets[ItemType.Primary][4] = 450000 - itemIdOffsets[ItemType.Primary].base;
    try {
        const before = context.db.prepare('SELECT loadout FROM users').get().loadout;
        const profile = await getPublicProfile(context, 'test_egg');
        assert.equal(profile.loadout.primaryId[4], 450000);
        assert.equal(profile.loadout.secondaryId[4], 150000);
        saveProfilePreferences(context.db, 7, { yaw: 0, pitch: 0, classIdx: 4, featuredItems: [] });
        assert.equal((await getPublicProfile(context, 'test_egg')).preferences.classIdx, 4);
        assert.equal(context.db.prepare('SELECT loadout FROM users').get().loadout, before);
    } finally {
        CharClass.length = length;
        if (previous === undefined) delete itemIdOffsets[ItemType.Primary][4];
        else itemIdOffsets[ItemType.Primary][4] = previous;
        context.db.close();
    };
});

test('class names and loadout cycling include registered plugin classes such as Crackshot', () => {
    const context = vm.createContext({ isClient: false, classes: [{ name: 'Soldier' }, {}, {}, {}, { name: 'Crackshot' }], ItemType: { Primary: 3 },
        catalog: { findItemById: id => [200000, 450000].includes(id) ? { item_type_id: 3 } : null } });
    vm.runInContext(misc.prepareForClient(fs.readFileSync(new URL('client.js', import.meta.url), 'utf8')) + '\nglobalThis.viewer = LegacyProfiles;', context);
    const viewer = context.viewer;
    viewer.profile = { loadout: { classIdx: 4, primaryId: [200000, null, null, null, 450000] }, preferences: { classIdx: 4 } };
    assert.equal(viewer.className(4), 'Crackshot');
    assert.deepEqual(Array.from(viewer.loadoutClasses()), [0, 4]);
    assert.equal(viewer.initialClass(), 4);
    viewer.viewClassIdx = 0;
    viewer.renderLoadout = () => {};
    let shown;
    viewer.showPreviewClass = index => { shown = index; };
    viewer.cycleLoadout(1, { replaceChildren() {}, querySelector() {} });
    assert.equal(shown, 4);
});

test('favourites can be reordered in the draft without changing saved order or accepting invalid moves', () => {
    const context = vm.createContext({ isClient: false });
    vm.runInContext(misc.prepareForClient(fs.readFileSync(new URL('client.js', import.meta.url), 'utf8')) + '\nglobalThis.viewer = LegacyProfiles;', context);
    const viewer = context.viewer;
    const saved = [10, 20, 30];
    viewer.featuredDraft = [...saved];
    assert.equal(viewer.moveFavourite(0, 2), true);
    assert.deepEqual(viewer.featuredDraft, [20, 30, 10]);
    assert.equal(viewer.moveFavourite(2, 1), true);
    assert.deepEqual(viewer.featuredDraft, [20, 10, 30]);
    for (const [from, to] of [[-1, 0], [0, 3], [1, 1], [0, .5]]) assert.equal(viewer.moveFavourite(from, to), false);
    viewer.savingPreferences = true;
    assert.equal(viewer.moveFavourite(0, 1), false);
    assert.deepEqual(saved, [10, 20, 30]);
    assert.deepEqual(viewer.featuredDraft, [20, 10, 30]);
});

test('expired VIP and malformed old JSON are handled without leaking other fields', async () => {
    const context = fixture();
    try {
        context.db.exec(`UPDATE users SET ownedItemIds = 'null', loadout = 'broken', kills = -4`);
        const profile = await getPublicProfile(context, 'test_egg', 2100000000000);
        assert.deepEqual(profile.inventory, []);
        assert.deepEqual(profile.loadout.primaryId, [200000, 300000, 250000, 350000]);
        assert.equal(profile.kills, 0);
        assert.deepEqual(profile.vip, { active: false, expires: null, multiplier: 1 });
        assert.equal(profileRank(1).name, 'Player');
        assert.equal(profileRank(255, context.config.distributed_permissions.ranks).name, 'Owner');
        assert.equal(profileRank(15, { 15: 'Helper' }).name, 'Helper');
    } finally { context.db.close(); };
});

test('the services handler accepts username requests and rejects the old account_id request', async () => {
    const db = fixture();
    const context = vm.createContext({ ss: db, getPublicProfile, console });
    vm.runInContext(misc.prepareForClient(fs.readFileSync(new URL('index.js', import.meta.url), 'utf8')) + '\nglobalThis.handle = Plugin.prototype.unhandledCommand;', context);
    const plugin = { plugins: { cancel: false } }, replies = [];
    const ws = { send: data => replies.push(JSON.parse(data)) };
    try {
        await context.handle.call(plugin, { msg: { cmd: 'legacyprofilesGet', account_id: 7 }, ws });
        assert.equal(replies[0].legacyprofiles, null);
        assert.equal(plugin.plugins.cancel, true);
        await context.handle.call(plugin, { msg: { cmd: 'legacyprofilesGet', username: 'test_egg', account_id: 999 }, ws });
        assert.equal(replies[1].legacyprofiles.username, 'test_egg');
        assert.equal('account_id' in replies[1].legacyprofiles, false);
    } finally { db.db.close(); };
});

test('own and in-game profile callers send usernames while retaining stale-player guards', async () => {
    const sockets = [], calls = [];
    class Socket {
        constructor() { sockets.push(this); };
        send(data) { this.sent = JSON.parse(data); };
        close() { this.onclose?.(); };
    };
    const context = vm.createContext({ isClient: false, WebSocket: Socket, servicesServer: 'ws://profile.test', setTimeout, clearTimeout,
        playerAccount: { isLoggedIn: true, username: 'own_egg', account_id: 9 },
        players_by_id: [{ id: 0, uniqueId: 7, username: 'other_egg' }, { id: 1, uniqueId: 0, username: 'Guest' }] });
    vm.runInContext(misc.prepareForClient(fs.readFileSync(new URL('client.js', import.meta.url), 'utf8')) + '\nglobalThis.viewer = LegacyProfiles;', context);
    context.viewer.open = (...args) => calls.push(args);
    context.viewer.openOwn();
    context.viewer.openPlayer(0, 7);
    context.viewer.openPlayer(0, 8);
    context.viewer.openPlayer(1, 0);
    assert.deepEqual(calls.map(call => call[0]), ['own_egg', 'other_egg', null]);
    assert.equal(calls[1][1].player, context.players_by_id[0]);
    assert.equal(calls[1][1].uniqueId, 7);
    const response = context.viewer.request('other_egg');
    sockets[0].onopen();
    assert.deepEqual(sockets[0].sent, { cmd: 'legacyprofilesGet', username: 'other_egg' });
    sockets[0].onmessage({ data: JSON.stringify({ legacyprofiles: { username: 'other_egg' } }) });
    assert.equal((await response).username, 'other_egg');
    context.playerAccount.session = 'owner-session';
    const preferences = { yaw: .3, pitch: -.2, classIdx: 1, featuredItems: [123] };
    const saving = context.viewer.request('forged-recipient', preferences);
    sockets[1].onopen();
    assert.deepEqual(sockets[1].sent, { cmd: 'legacyprofilesSave', session: 'owner-session', preferences });
    sockets[1].onmessage({ data: JSON.stringify({ legacyprofiles: { username: 'own_egg', preferences } }) });
    assert.equal((await saving).username, 'own_egg');
});

test('featured class is presentation only and delayed saves cannot change a subsequently opened profile', async () => {
    const context = vm.createContext({ isClient: false, playerAccount: { isLoggedIn: true, username: 'own_egg' }, ItemType: { Primary: 3 },
        catalog: { findItemById: id => id === 5 || id === 6 ? { item_type_id: 3 } : null } });
    vm.runInContext(misc.prepareForClient(fs.readFileSync(new URL('client.js', import.meta.url), 'utf8')) + '\nglobalThis.viewer = LegacyProfiles;', context);
    const viewer = context.viewer;
    const profile = viewer.profile = { username: 'own_egg', loadout: { classIdx: 0, primaryId: [5, 6] }, preferences: { classIdx: 1 } };
    assert.equal(viewer.initialClass(), 1);
    assert.equal(profile.loadout.classIdx, 0);
    profile.preferences.classIdx = 9;
    assert.equal(viewer.initialClass(), 0);
    let resolve;
    viewer.request = () => new Promise(done => { resolve = done; });
    const saving = viewer.savePreferences({ yaw: .5 }, { isConnected: true });
    viewer.profile = { username: 'another_egg' };
    viewer.generation++;
    resolve({ preferences: { yaw: .5 } });
    assert.equal(await saving, false);
    assert.equal(viewer.profile.preferences, undefined);
    assert.equal(viewer.savingPreferences, false);
    assert.equal(viewer.isOwn(), false);
});

const coreSource = fs.readFileSync(new URL('../../server-client/src/client-static/src/shellshock.min.js', import.meta.url), 'utf8');
const coreTree = acorn.parse(coreSource, { ecmaVersion: 'latest' });
function assignment(source, tree, name) {
    let result;
    walk.simple(tree, { AssignmentExpression(node) {
        if (source.slice(node.left.start, node.left.end) === name) result = source.slice(node.right.start, node.right.end);
    } });
    assert.ok(result, 'missing browser helper: ' + name);
    return result;
};

function coreMethod(name, context) {
    return vm.runInContext('(' + assignment(coreSource, coreTree, name) + ')', context);
};

test('browser files minify without a profile source replacement hook', () => {
    const listeners = {};
    new Plugin({ on(name, callback) { listeners[name] = callback; } }, import.meta.dirname);
    assert.equal(listeners['client:doReplacements'], undefined);
    const insertion = { files: [] };
    listeners['client:pluginSourceInsertion']({ pluginInsertion: insertion });
    assert.deepEqual(insertion.files.map(file => file.filepath.split(/[\\/]/).at(-1)), ['ranks.js', 'preview.js', 'client.js']);
    const source = ['ranks.js', 'preview.js', 'client.js'].map(file => misc.prepareForClient(fs.readFileSync(new URL(file, import.meta.url), 'utf8'))).join('\n');
    new vm.Script(source);
    const result = UglifyJS.minify(source);
    assert.equal(result.error, undefined, result.error?.message);
});

test('player clicks support async interception, default menus and reused player slots', async () => {
    const player = { id: 0, uniqueId: 7, username: 'test_egg', name: 'An egg' };
    let clicked = 0, menus = 0;
    const listeners = {};
    const context = vm.createContext({
        isClient: true, player, meId: 0, players_by_id: [player],
        plugins: {
            on(name, callback) { listeners[name] = callback; },
            async emit(name, event) { clicked++; if (listeners['game:' + name]) await listeners['game:' + name](event); },
        },
        openAlertDialog() { menus++; }, closeAlertDialog() {},
        document: { createElement: () => ({ style: {}, appendChild() {} }), getElementById: () => ({ appendChild() {} }) },
    });
    const handler = vm.runInContext('(' + assignment(coreSource, coreTree, 'list[i].onclick') + ')', context);
    await handler({ type: 'click' });
    assert.equal(menus, 1);
    assert.equal(clicked, 1);
    listeners['game:playerClicked'] = async event => { await Promise.resolve(); event.handled = true; };
    await handler({});
    assert.equal(menus, 1);
    listeners['game:playerClicked'] = async () => { context.players_by_id[0] = { ...player }; };
    await handler({});
    assert.equal(menus, 1);
    context.players_by_id[0] = { ...player, uniqueId: 8 };
    await handler({});
    assert.equal(clicked, 3);
    const source = misc.prepareForClient(fs.readFileSync(new URL('client.js', import.meta.url), 'utf8'));
    vm.runInContext(source + '\nglobalThis.viewer = LegacyProfiles;', context);
    context.players_by_id[0] = player;
    const opened = [];
    context.viewer.openPlayer = (id, uniqueId) => opened.push([id, uniqueId]);
    await handler({});
    assert.deepEqual(opened, [[0, 7]]);
    assert.equal(menus, 1);
    const consumed = { handled: true, playerId: 0, uniqueId: 7 };
    listeners['game:playerClicked'](consumed);
    assert.equal(opened.length, 1);
});

test('preview reuses Customizer and actor helpers without touching live account or stamp state', async () => {
    const engine = new BABYLON.NullEngine();
    class PreviewScene extends BABYLON.Scene {};
    const scene = new PreviewScene(engine);
    const weapon = { id: 10, item_data: { meshName: 'gun_test', class: 'Test' } };
    const hat = { id: 20, item_data: { meshName: 'testHat' } };
    const stamp = { id: 30, item_data: { x: 1, y: 0 } };
    const account = Object.freeze({ colorIdx: 0, hatItem: null });
    const liveStamp = {}, liveShadow = {};
    class StampTexture {
        constructor(url, scene, mipmaps, invertY, sampling, loaded) { this.url = url; this.invertY = invertY; StampTexture.last = this; queueMicrotask(loaded); }
        getSize() { return { width: 512 }; }
    };
    const context = vm.createContext({
        BABYLON: { ...BABYLON, Scene: PreviewScene, Texture: StampTexture },
        Customizer: { prototype: {} }, PlayerActor: { prototype: {} },
        playerAccount: account, stampTexture: liveStamp, shadowGen: liveShadow,
        shellColors: ['#ffffff', '#e2bc8b'], stampSize: 256,
        catalog: { findItemById: id => ({ 10: weapon, 20: hat, 30: stamp })[id] },
        gunFile: () => 'gun_test', item_classes: { Test: { standardMeshName: 'test' } }, console,
        isClient: true, LegacyShellCorePlugin: { eggColors: { 0: [1, 2, 3] } },
    });
    for (const name of ['poseWithHat', 'poseWithStamp']) context.Customizer.prototype[name] = coreMethod('Customizer.prototype.' + name, context);
    for (const name of ['wearHat', 'removeHat', 'setShellColor', 'setWeaponSkeleton', 'handsToWeaponSkeleton']) context.PlayerActor.prototype[name] = coreMethod('PlayerActor.prototype.' + name, context);
    const pluginSource = fs.readFileSync(new URL('../legacyshellcore/shared.js', import.meta.url), 'utf8');
    let patch;
    walk.simple(acorn.parse(pluginSource, { ecmaVersion: 'latest', sourceType: 'module' }), { Property(node) {
        if (node.key.name === 'onPageLoadedEnd') patch = pluginSource.slice(node.value.body.start, node.value.body.end);
    } });
    assert.ok(patch);
    vm.runInContext('(function () ' + patch + ')', context).call({});
    const babylonSource = fs.readFileSync(new URL('../../server-client/src/data/babylon.js', import.meta.url), 'utf8');
    const start = babylonSource.indexOf('BABYLON.Scene.prototype.cloneMesh =');
    const end = babylonSource.indexOf('BABYLON.DynamicTexture.prototype.clearRect =', start);
    vm.runInContext(babylonSource.slice(start, end), context);
    for (const name of ['egg', 'testHat', 'hands']) BABYLON.Mesh.CreateBox(name, 1, scene).setEnabled(false);
    const skeleton = name => {
        const result = new BABYLON.Skeleton(name, name, scene);
        for (const bone of ['gripHand', 'foreHand']) new BABYLON.Bone(bone, result, null, BABYLON.Matrix.Identity());
        return result;
    };
    const hands = skeleton('hands_skeleton');
    const wrongGun = BABYLON.Mesh.CreateBox('gun_test', .1, scene);
    wrongGun.skeleton = hands;
    wrongGun.setEnabled(false);
    const rightGun = BABYLON.Mesh.CreateBox('gun_test', .2, scene);
    rightGun.skeleton = skeleton('gun_test_skeleton');
    rightGun.setEnabled(false);
    const source = misc.prepareForClient(fs.readFileSync(new URL('preview.js', import.meta.url), 'utf8'));
    vm.runInContext(source + '\nglobalThis.Preview = LegacyProfilePreview;', context);
    const preview = Object.create(context.Preview.prototype);
    preview.scene = scene;
    preview.standard = new BABYLON.StandardMaterial('standard', scene);
    preview.eggMaterial = new BABYLON.ShaderMaterial('profileEgg', scene, 'standard', { attributes: [], uniforms: [] });
    const shadowList = [];
    preview.shadow = { getShadowMap: () => ({ renderList: shadowList }) };
    preview.importFile = async () => {};
    try {
        await preview.load({ loadout: { classIdx: 0, colorIdx: 1, primaryId: [10], hatId: 20, stampId: 30 } });
        assert.equal(preview.actor.hat.parent, preview.actor.bodyMesh);
        assert.equal(preview.actor.hat.isEnabled(), true);
        assert.equal(preview.actor.hat.material, preview.standard);
        assert.equal(preview.actor.bodyMesh.colorMult.toHexString(), '#E2BC8B');
        assert.equal(preview.actor.hands.colorMult.toHexString(), '#E2BC8B');
        assert.equal(preview.stampU, .5);
        assert.equal(preview.stampV, 1);
        assert.equal(StampTexture.last.invertY, true);
        assert.equal(shadowList[0], preview.actor.bodyMesh);
        assert.equal(scene.getMeshByName('profile.gun_test').geometry, rightGun.geometry);
        const oldSkeleton = preview.actor.skeleton;
        await preview.setWeapon(weapon);
        assert.notEqual(preview.actor.skeleton, oldSkeleton);
        assert.equal(scene.skeletons.includes(oldSkeleton), false);
        assert.equal(context.playerAccount, account);
        assert.equal(context.stampTexture, liveStamp);
        assert.equal(context.shadowGen, liveShadow);
        assert.deepEqual(context.LegacyShellCorePlugin.eggColors, { 0: [1, 2, 3] });
        assert.equal(preview.actor.player.id, -2);
        assert.equal(scene.getSkeletonByName('gun_test_skeleton'), rightGun.skeleton);
    } finally { engine.dispose(); };
});

test('preview reuses the game engine, switches backdrops and preserves game rendering', async () => {
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
    class Observer {
        constructor(callback) { this.callback = callback; }
        observe() {}
        disconnect() { this.disconnected = true; }
    };
    let backdrop = '';
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
        ResizeObserver: Observer, IntersectionObserver: Observer, MutationObserver: Observer,
        getComputedStyle: () => ({ getPropertyValue: () => backdrop }),
        window: { devicePixelRatio: 1 }, document: { hidden: false, head: {} }, performance: { now: () => clock }, setTimeout, clearTimeout,
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
        const pose = preview.root.rotationQuaternion.clone();
        backdrop = 'blue';
        preview.themeObserver.callback();
        assert.equal(preview.ground.isEnabled(), false);
        assert.equal(preview.scene.clearColor.a, 0);
        assert.equal(preview.root.rotationQuaternion.equals(pose), true);
        events.length = 0;
        clock += 40;
        preview.renderFrame();
        assert.deepEqual(events, ['bind', 'render', 'unbind']);
        backdrop = '';
        preview.themeObserver.callback();
        assert.equal(preview.ground.isEnabled(), true);
        assert.equal(preview.scene.clearColor, context.Customizer.skyColor);
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
        assert.equal(preview.themeObserver.disconnected, true);
        assert.equal(preview.scene.isDisposed, true);
        assert.equal(loops.size, 1);
        assert.equal(loops.has(originalLoop), true);
        assert.equal(BABYLON.Engine.Instances.length, before);
        assert.equal(BABYLON.Engine.LastCreatedScene, gameScene);
    } finally { preview?.dispose(); gameEngine.stopRenderLoop = BABYLON.Engine.prototype.stopRenderLoop; gameEngine.dispose(); };
});

test('the alternate profile style pack registers only when LegacyThemes is available', () => {
    const source = misc.prepareForClient(fs.readFileSync(new URL('client.js', import.meta.url), 'utf8'));
    for (const themes of [undefined, { stylePacks: [] }]) {
        const context = vm.createContext({ isClient: true, plugins: { on() {} } });
        if (themes) context.LegacyThemesPlugin = themes;
        assert.doesNotThrow(() => vm.runInContext(source, context));
        if (themes) {
            assert.equal(themes.stylePacks.length, 1);
            const pack = themes.stylePacks[0];
            assert.equal(pack.identifier, 'legacyprofilesblue');
            assert.equal(pack.name, 'Player Profiles (Alt)');
            assert.equal(pack.cssFile, '/legacyprofiles/themes/blue/profiles.css');
            assert.equal(fs.existsSync(new URL('client/themes/blue/profiles.css', import.meta.url)), true);
        };
    };
});

test('role icons distinguish guests, signed-in players and permission ranks', () => {
    const context = vm.createContext({ isClient: false });
    const source = misc.prepareForClient(fs.readFileSync(new URL('client.js', import.meta.url), 'utf8'));
    vm.runInContext(source + '\nglobalThis.viewer = LegacyProfiles;', context);
    const cases = [
        [{ guest: true, rank: { value: 0 } }, 'guest'],
        [{ rank: { value: 0, name: 'Player' } }, 'player'],
        [{ rank: { value: 1, name: 'Player' } }, 'player'],
        [{ rank: { value: 5, name: 'Content Creator' } }, 'creator'],
        [{ rank: { value: 10, name: 'Moderator' } }, 'mod'],
        [{ rank: { value: 20, name: 'Admin' } }, 'admin'],
        [{ rank: { value: 255, name: 'Owner' } }, 'owner'],
        [{ rank: { value: 5, name: 'Developer' } }, 'developer'],
        [{ rank: { value: 5, name: 'Twitch Creator' } }, 'twitch'],
        [{ rank: { value: 5, name: 'TikTok Creator' } }, 'tiktok'],
    ];
    for (const [profile, expected] of cases) {
        assert.equal(context.viewer.rankIcon(profile), expected);
        assert.equal(fs.existsSync(new URL('client/icons/roles/' + expected + '.svg', import.meta.url)), true);
    };
});

test('leaderboard badges follow actual core row sorting without overwriting names, scores or ping icons', () => {
    class Element {
        constructor(tag) {
            this.tag = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.className = '';
            this.style = { setProperty(name, value) { this[name] = value; } };
            this.classList = {
                add: name => { if (!this.className.split(' ').includes(name)) this.className += ' ' + name; },
                remove: name => { this.className = this.className.split(' ').filter(n => n !== name).join(' '); },
            };
        };
        appendChild(child) { this.children.push(child); child.parent = this; return child; };
        remove() { this.parent.children = this.parent.children.filter(child => child !== this); };
        setAttribute(name, value) { this.attributes[name] = value; };
        querySelector(selector) {
            return this.children.find(child => selector.startsWith('.') ? child.className.split(' ').includes(selector.slice(1)) :
                child.tag === selector.split('.')[0] && (!selector.includes('.') || child.className.split(' ').includes(selector.split('.')[1])));
        };
    };
    const list = new Element('ul'), logout = new Element('div');
    for (let i = 0; i < 4; i++) {
        const row = list.appendChild(new Element('li'));
        row.appendChild(new Element('span')); row.appendChild(new Element('span'));
    };
    const players = [
        { id: 0, uniqueId: 0, name: 'Same nickname', score: 5, team: 1, adminRoles: 0 },
        { id: 1, uniqueId: 7, name: 'Same nickname', score: 10, team: 2, adminRoles: 10 },
        { id: 2, uniqueId: 8, name: 'Owner egg', score: 1, team: 1, adminRoles: 255 },
    ];
    const context = vm.createContext({
        isClient: false, extern: {}, players_by_id: players, meId: 0, playerLimit: 4,
        permissions: { ranks: { 0: 'Guest', 1: 'Signed In', 255: 'Superuser' } },
        gameOptions: { teamsEnabled: false }, lastLeadingTeam: 1,
        iteratePlayers(callback) { players.forEach((player, i) => { if (player) callback(player, i); }); },
        getTeamScores() {
            const score = [0, 0, 0];
            players.forEach(player => { if (player) score[player.team] += player.score; });
            return { score, leader: score[1] > score[2] ? 1 : score[2] > score[1] ? 2 : 0 };
        },
        teamColors: { meBackground: [], themBackground: [], text: [] },
        document: { createElement: tag => new Element(tag), head: new Element('head'),
            getElementById: id => ({ playerList: list, logout })[id] },
    });
    let rebuild;
    walk.simple(coreTree, { FunctionDeclaration(node) { if (node.id.name === 'rebuildPlayerList') rebuild = coreSource.slice(node.start, node.end); } });
    vm.runInContext(rebuild, context);
    vm.runInContext(['ranks.js', 'client.js'].map(file => misc.prepareForClient(fs.readFileSync(new URL(file, import.meta.url), 'utf8'))).join('\n') + '\nglobalThis.viewer = LegacyProfiles;', context);
    context.viewer.setup();
    const wrapped = context.rebuildPlayerList;
    context.viewer.setup();
    assert.equal(context.rebuildPlayerList, wrapped);
    const check = expected => {
        context.rebuildPlayerList();
        expected.forEach((player, i) => {
            const row = list.children[i], badge = row.querySelector('.lp-rank-badge');
            assert.equal(row.children[0].innerText, player.name);
            assert.equal(row.children[1].innerText, player.score);
            assert.equal(row.querySelector('img').src, '/img/ping1.png');
            assert.equal(badge.title, !player.uniqueId ? 'Guest' : profileRank(player.adminRoles, context.permissions.ranks).name);
            assert.equal(badge.style['--lp-role-icon'], 'url("/legacyprofiles/icons/roles/' + context.viewer.rankIcon({ guest: !player.uniqueId, rank: profileRank(player.adminRoles) }) + '.svg")');
            assert.equal(row.children.filter(child => child.className.includes('lp-rank-badge')).length, 1);
        });
        for (let i = expected.length; i < list.children.length; i++) assert.equal(list.children[i].querySelector('.lp-rank-badge'), undefined);
    };
    check([players[1], players[0], players[2]]);
    const badge = list.children[0].querySelector('.lp-rank-badge');
    check([players[1], players[0], players[2]]);
    assert.equal(list.children[0].querySelector('.lp-rank-badge'), badge);
    context.gameOptions.teamsEnabled = true;
    check([players[1], players[0], players[2]]);
    players[0].score = 25;
    check([players[0], players[2], players[1]]);
    players[0].uniqueId = 9; players[0].adminRoles = 1;
    check([players[0], players[2], players[1]]);
    players[0] = null;
    check([players[1], players[2]]);
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
