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

test('opening and disposing a preview preserves the game default scene and releases its engine', async () => {
    const gameEngine = new BABYLON.NullEngine();
    const gameScene = new BABYLON.Scene(gameEngine);
    const before = BABYLON.Engine.Instances.length;
    class PreviewEngine extends BABYLON.NullEngine {
        constructor() { super({ renderWidth: 256, renderHeight: 256, textureSize: 256 }); }
        resize() {}
        runRenderLoop() {}
    };
    class PreviewCamera extends BABYLON.ArcRotateCamera { attachControl() {} };
    class PreviewScene extends BABYLON.Scene { attachControl() { this.inputAttachments = (this.inputAttachments || 0) + 1; } };
    class Observer { observe() {} disconnect() {} };
    const context = vm.createContext({
        BABYLON: { ...BABYLON, Engine: PreviewEngine, Scene: PreviewScene, ArcRotateCamera: PreviewCamera },
        ResizeObserver: Observer, IntersectionObserver: Observer,
        window: { devicePixelRatio: 1 }, document: { hidden: false }, performance, setTimeout, clearTimeout,
    });
    const source = misc.prepareForClient(fs.readFileSync(new URL('preview.js', import.meta.url), 'utf8'));
    vm.runInContext(source + '\nglobalThis.Preview = LegacyProfilePreview;', context);
    context.Preview.prototype.materials = () => {}; //NullEngine has no texture uploads
    context.Preview.prototype.load = async () => {};
    let preview;
    try {
        await new Promise((resolve, reject) => { preview = new context.Preview({ parentElement: {} }, {}, resolve, reject); });
        assert.equal(preview.scene.inputAttachments, 1);
        assert.equal(BABYLON.Engine.LastCreatedScene, gameScene);
        const actor = new BABYLON.TransformNode('new actor');
        assert.equal(actor.getScene(), gameScene);
        assert.equal(BABYLON.Engine.Instances.length, before + 1);
        preview.dispose();
        preview.dispose();
        assert.equal(BABYLON.Engine.Instances.length, before);
        assert.equal(BABYLON.Engine.LastCreatedScene, gameScene);
    } finally { preview?.dispose(); gameEngine.dispose(); };
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
