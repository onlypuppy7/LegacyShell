import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import Database from 'better-sqlite3';
import UglifyJS from 'uglify-js';
import misc from '#misc';
import { AchievementStore } from './storage.js';
import { AchievementService } from './services.js';
import { AchievementDefinitions, AchievementMaxPins } from './definitions.js';
import { Plugin } from './index.js';

function fixture() {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE users (account_id INTEGER PRIMARY KEY, username TEXT UNIQUE, kills INTEGER DEFAULT 0, deaths INTEGER DEFAULT 0,
        currentBalance INTEGER DEFAULT 1000, ownedItemIds TEXT DEFAULT '[200000]',
        upgradeProductId INTEGER DEFAULT 0, upgradeMultiplier INTEGER DEFAULT NULL,
        upgradeAdFree INTEGER DEFAULT 1, upgradeExpiryDate INTEGER DEFAULT 0);
        CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT);
        INSERT INTO users (account_id, username) VALUES (1, 'first_egg'), (2, 'other_egg');
        INSERT INTO items VALUES (200001, 'Eggk47 GOLD');`);
    return { db, store: new AchievementStore(db) };
};

test('unlocking only records rewards; kills come from server totals and survive reconnects', () => {
    const { db, store } = fixture();
    try {
        assert.deepEqual(store.evaluate(1, 100), ['fresh_egg']);
        assert.equal(store.user(1).currentBalance, 1000);
        assert.equal(store.snapshot(1).hasClaimed, false);
        assert.deepEqual(store.evaluate(1, 101), []);
        db.prepare('UPDATE users SET kills = 5 WHERE account_id = 1').run();
        assert.deepEqual(store.evaluate(1, 102), ['kills_5']);
        assert.equal(store.list(store.user(1))[1].progress, 5);
        assert.equal(store.user(1).currentBalance, 1000);
        store.seen(1, 'fresh_egg');
        const reopened = new AchievementStore(db);
        assert.deepEqual(reopened.snapshot(1).pending, ['kills_5']);
        assert.equal(reopened.list(reopened.user(1))[0].unlockedAt, 100);
    } finally { db.close(); };
});

test('showcases preserve order, only accept earned pins, and never grant or consume rewards', () => {
    const { db, store } = fixture();
    try {
        store.evaluate(1, 100);
        assert.throws(() => store.feature(1, ['kills_100']), /earned pins/);
        db.exec('UPDATE users SET kills = 100 WHERE account_id = 1');
        store.evaluate(1, 101);
        const before = store.snapshot(1);
        store.feature(1, ['kills_100', 'fresh_egg', 'kills_5']);
        assert.deepEqual(new AchievementStore(db).publicList('first_egg').featured, ['kills_100', 'fresh_egg', 'kills_5']);
        for (const pins of [['fresh_egg', 'fresh_egg'], ['unknown'], ['fresh_egg', 'kills_5', 'kills_100', 'kills_500'], null, [1]]) assert.throws(() => store.feature(1, pins), /earned pins/);
        assert.deepEqual(store.snapshot(1).pending, before.pending);
        assert.equal(store.user(1).currentBalance, 1000);
        assert.deepEqual(store.publicList('other_egg').featured, []);
        assert.equal(store.list(store.user(1))[0].tier, null);
        assert.deepEqual(store.list(store.user(1)).slice(1).map(entry => entry.tier), [...Array(2).fill([1, 2, 3, 4, 5, 6, 7, 8]).flat(), 1, 2, 3, ...Array(6).fill([1, 2, 3, 4, 5, 6, 7, 8]).flat(), null, 1, null, 1, 2, null, 3, null, null, null, 2, null, 4]); //kills and deaths of eight tiers, the zombies of three, six weapons of eight, then the challenges (easiest first), where Air Mail is two tiers and Hard Boiled four
        store.feature(1, []);
        assert.deepEqual(store.featured(1), []);
    } finally { db.close(); };
});

test('public username lookups are read-only and never disclose account IDs or notification state', () => {
    const { db, store } = fixture();
    try {
        assert.equal(store.publicList(1), null);
        assert.equal(store.publicList('1 OR 1=1'), null);
        assert.equal(store.publicList('missing'), null);
        const result = store.publicList('first_egg');
        assert.deepEqual(Object.keys(result), ['username', 'achievements', 'featured']);
        assert.equal(JSON.stringify(result).includes('account_id'), false);
        assert.equal('pending' in result, false);
        assert.equal(result.achievements[0].unlockedAt, null);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM achievement_unlocks').get().n, 0);
    } finally { db.close(); };
});

test('claims are atomic and repeatable without paying twice, including after store recreation', () => {
    const { db, store } = fixture();
    try {
        store.evaluate(1, 100);
        assert.throws(() => store.claim(1, 'kills_100', 101), /not been unlocked/);
        const first = store.claim(1, 'fresh_egg', 102);
        assert.equal(first.account.currentBalance, 1250);
        assert.equal(first.hasClaimed, true);
        assert.equal(first.alreadyClaimed, false);
        const second = new AchievementStore(db).claim(1, 'fresh_egg', 103);
        assert.equal(second.alreadyClaimed, true);
        assert.equal(second.account.currentBalance, 1250);
        assert.equal(second.achievements[0].claimedAt, 102);
        assert.deepEqual(second.pending, []);
        assert.equal(store.user(2).currentBalance, 1000);
    } finally { db.close(); };
});

test('skin rewards deduplicate and VIP time extends existing expiry without downgrading its tier', () => {
    const { db, store } = fixture();
    try {
        db.exec(`UPDATE users SET kills = 100, ownedItemIds = '[200000,200001]', upgradeProductId = 3,
            upgradeMultiplier = 4, upgradeAdFree = 0, upgradeExpiryDate = 50000 WHERE account_id = 1`);
        store.evaluate(1, 100);
        const result = store.claim(1, 'kills_100', 1000);
        assert.equal(result.account.currentBalance, 2000);
        assert.deepEqual(result.account.ownedItemIds, [200000, 200001]);
        assert.equal(result.account.upgradeExpiryDate, 53600);
        assert.equal(result.account.upgradeProductId, 3);
        assert.equal(result.account.upgradeMultiplier, 4);
        assert.equal(result.account.upgradeAdFree, false);
    } finally { db.close(); };
});

test('new or expired VIP starts now, and missing reward items roll back the whole redemption', () => {
    const { db, store } = fixture();
    try {
        db.exec('UPDATE users SET kills = 100, upgradeProductId = 2, upgradeExpiryDate = 500');
        store.evaluate(1, 1000);
        db.exec('DELETE FROM items');
        assert.throws(() => store.claim(1, 'kills_100', 1000), /unavailable/);
        assert.equal(store.user(1).currentBalance, 1000);
        assert.equal(store.snapshot(1).achievements.at(-1).claimedAt, null);
        db.exec("INSERT INTO items VALUES (200001, 'Eggk47 GOLD')");
        const result = store.claim(1, 'kills_100', 1000);
        assert.equal(result.account.upgradeExpiryDate, 4600);
        assert.equal(result.account.upgradeProductId, 1);
        assert.equal(result.account.upgradeMultiplier, 2);
        assert.equal(result.account.upgradeAdFree, true);
        assert.deepEqual(result.account.ownedItemIds, [200000, 200001]);
    } finally { db.close(); };
});

test('a database failure cannot consume a reward or partially modify the account', () => {
    const { db, store } = fixture();
    try {
        store.evaluate(1, 100);
        db.exec("CREATE TRIGGER stop_claim BEFORE UPDATE OF claimed_at ON achievement_unlocks BEGIN SELECT RAISE(ABORT, 'test failure'); END");
        assert.throws(() => store.claim(1, 'fresh_egg', 101), /test failure/);
        assert.equal(store.user(1).currentBalance, 1000);
        assert.equal(store.snapshot(1).hasClaimed, false);
    } finally { db.close(); };
});

class Socket extends EventEmitter {
    readyState = 1;
    sent = [];
    send(data) { this.sent.push(JSON.parse(data)); };
    close() { this.readyState = 3; this.emit('close'); };
};

test('services authenticate claims, ignore forged recipients/rewards and revoke expired watchers', async () => {
    const { db } = fixture(), events = {};
    const plugins = { on: (name, callback) => { events[name] = callback; } };
    let valid = true;
    const service = new AchievementService(plugins, () => ({ db }), {
        async retrieveSession(token, ip, readOnly) {
            assert.equal(ip, '4test'); assert.equal(readOnly, false);
            return valid && token === 'valid' ? { user_id: 1 } : null;
        },
    });
    const ws = new Socket();
    const invoke = msg => events['services:unhandledCommand']({ msg, ws, ip: '4test' });
    try {
        await invoke({ cmd: 'achievementsClaim', achievement: 'fresh_egg', username: 'first_egg' });
        assert.equal(ws.sent.at(-1).legacyachievements.type, 'error');
        await invoke({ cmd: 'achievementsWatch', session: 'valid' });
        assert.equal(ws.sent.at(-1).legacyachievements.pending[0], 'fresh_egg');
        await invoke({ cmd: 'achievementsFeature', pins: ['fresh_egg'] });
        assert.equal(ws.sent.at(-1).legacyachievements.type, 'error');
        await invoke({ cmd: 'achievementsFeature', session: 'valid', pins: ['kills_100'] });
        assert.equal(ws.sent.at(-1).legacyachievements.type, 'error');
        await invoke({ cmd: 'achievementsFeature', session: 'valid', pins: ['fresh_egg'], account_id: 2, username: 'other_egg' });
        assert.deepEqual(service.store.featured(1), ['fresh_egg']);
        assert.deepEqual(service.store.featured(2), []);
        await invoke({ cmd: 'achievementsClaim', session: 'valid', achievement: 'kills_100', kills: 999999 });
        assert.equal(ws.sent.at(-1).legacyachievements.type, 'error');
        await invoke({ cmd: 'achievementsClaim', session: 'valid', achievement: 'fresh_egg', account_id: 2, username: 'other_egg', reward: { eggs: 999999 } });
        assert.equal(service.store.user(1).currentBalance, 1250);
        assert.equal(service.store.user(2).currentBalance, 1000);
        db.exec('UPDATE users SET kills = 3 WHERE account_id = 1');
        await events['services:addKill']({ userData: { account_id: 1 } });
        assert.equal(ws.sent.at(-1).legacyachievements.kills, 3);
        assert.equal(ws.sent.at(-1).legacyachievements.achievements[1].progress, 3);
        assert.equal(ws.sent.at(-1).legacyachievements.achievements[1].unlockedAt, null);
        db.exec('UPDATE users SET kills = 5 WHERE account_id = 1');
        await events['services:addKill']({ userData: { account_id: 1, kills: 999999 } });
        assert.equal(ws.sent.at(-1).legacyachievements.achievements[1].unlockedAt > 0, true);
        assert.equal(ws.sent.at(-1).legacyachievements.achievements[2].unlockedAt, null);
        valid = false;
        await service.validateWatchers();
        assert.equal(ws.readyState, 3);
        assert.equal(service.watchers.size, 0);
    } finally { service.dispose(); db.close(); };
});

test('zombies unlock reports require a trusted game server and cannot forge rewards or achievements', async () => {
    const { db } = fixture(), events = {};
    const service = new AchievementService({ on: (event, listener) => events[event] = listener }, () => ({ db }), {});
    const ws = new Socket();
    const accs = { getAuthKeyData: async key => key === 'test-game-key' ? { name: 'test server' } : null };
    const invoke = msg => events['services:unhandledCommand']({ msg, ws, accs });
    try {
        for (const auth_key of [undefined, '', 'invalid', {}]) {
            await invoke({ cmd: 'achievementsZombiesWin', username: 'first_egg', session: 'browser', auth_key });
            assert.equal(ws.sent.at(-1).legacyachievements.type, 'error');
            assert.equal(service.store.publicList('first_egg').achievements.find(entry => entry.id === 'zombies_no_primary').unlockedAt, null);
        };
        const msg = { cmd: 'achievementsZombiesWin', username: 'first_egg', auth_key: 'test-game-key', achievement: 'kills_10000', reward: { eggs: 999999 } };
        await invoke(msg);
        const row = service.store.publicList('first_egg').achievements.find(entry => entry.id === 'zombies_no_primary');
        assert.equal(row.id, 'zombies_no_primary');
        assert.equal(row.progress, 1);
        assert.ok(row.unlockedAt);
        assert.equal(row.claimedAt, null);
        assert.deepEqual(row.reward, { eggs: 2500 });
        assert.equal(service.store.publicList('first_egg').achievements.find(entry => entry.id === 'kills_10000').unlockedAt, null);
        await invoke(msg);
        assert.equal(service.store.publicList('first_egg').achievements.find(entry => entry.id === 'zombies_no_primary').unlockedAt, row.unlockedAt);
        assert.equal(service.store.claim(1, 'zombies_no_primary').account.currentBalance, 3500);
        assert.equal(service.store.claim(1, 'zombies_no_primary').account.currentBalance, 3500);
        assert.equal(service.store.user(2).currentBalance, 1000);
    } finally { service.dispose(); db.close(); };
});

test('kill milestones use their thresholds as IDs and unlock only at the authoritative total', () => {
    const { db, store } = fixture();
    try {
        const milestones = [5, 100, 500, 1000, 5000, 10000, 25000, 100000];
        for (const goal of milestones) {
            db.prepare('UPDATE users SET kills = ? WHERE account_id = 1').run(goal - 1);
            store.evaluate(1);
            assert.equal(store.list(store.user(1)).find(entry => entry.id === 'kills_' + goal).unlockedAt, null);
            db.prepare('UPDATE users SET kills = ? WHERE account_id = 1').run(goal);
            assert.deepEqual(store.evaluate(1), ['kills_' + goal]);
        };
        assert.equal(store.list(store.user(1)).at(-1).unlockedAt, null);
    } finally { db.close(); };
});

test('browser code minifies, loads without profiles, and definitions have real existing PNGs', () => {
    const source = misc.prepareForClient(fs.readFileSync(new URL('client.js', import.meta.url), 'utf8'));
    const context = vm.createContext({ isClient: true, plugins: { on() {} } });
    assert.doesNotThrow(() => vm.runInContext(source, context));
    assert.equal(UglifyJS.minify(source).error, undefined);
    const ids = new Set();
    for (const definition of AchievementDefinitions) {
        assert.equal(ids.has(definition.id), false); ids.add(definition.id);
        const image = definition.image?.startsWith('/legacyachievements/') ? new URL('client' + definition.image.slice('/legacyachievements'.length), import.meta.url) : definition.image ? new URL('../../server-client/src/client-imgs' + definition.image, import.meta.url) : new URL('client/img/placeholder.png', import.meta.url);
        assert.equal(fs.existsSync(image), true);
        assert.equal(definition.reward.eggs > 0, true);
    };
    assert.equal(fs.existsSync(new URL('client/img/placeholder.png', import.meta.url)), true);
    const callbacks = {};
    new Plugin({ type: 'client', on: (name, callback) => { callbacks[name] = callback; } }, '/achievements');
    const pluginInsertion = { files: [] };
    callbacks['client:pluginSourceInsertion']({ pluginInsertion });
    assert.deepEqual(pluginInsertion.files.map(file => file.filepath.split(/[\\/]/).at(-1)), ['definitions.js', 'client.js']);
});

test('saving display pins reports an old services server immediately instead of timing out', async () => {
    const sent = [];
    const context = vm.createContext({ isClient: false, setTimeout, clearTimeout, playerAccount: { session: 'test-session' } });
    vm.runInContext(misc.prepareForClient(fs.readFileSync(new URL('client.js', import.meta.url), 'utf8')) + '\nglobalThis.client = LegacyAchievements;', context);
    const client = context.client;
    client.socket = { readyState: 1, send: json => sent.push(JSON.parse(json)) };
    client.state = { achievements: [] };
    await assert.rejects(client.request('achievementsFeature', { pins: [] }), /Restart services/);
    assert.equal(sent.length, 0);
    assert.equal(client.requests.size, 0);
    client.state.featured = [];
    const saving = client.request('achievementsFeature', { pins: [] });
    assert.equal(sent.length, 1);
    const pending = client.requests.get(sent[0].requestId);
    clearTimeout(pending.timer); client.requests.delete(sent[0].requestId);
    pending.resolve({ type: 'snapshot', featured: [] });
    assert.equal((await saving).type, 'snapshot');
});

class Element {
    dataset = {};
    children = []; attributes = {}; isConnected = true;
    style = {}; listeners = new Map();
    appendChild(element) { this.children.push(element); element.parent = this; };
    setAttribute(name, value) { this.attributes[name] = value; };
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.isConnected = false; };
    replaceChildren() { this.children = []; };
    addEventListener(name, callback) { this.listeners.set(name, callback); };
    removeEventListener(name, callback) { if (this.listeners.get(name) === callback) this.listeners.delete(name); };
    contains(element) { while (element) { if (element === this) return true; element = element.parent; }; return false; };
    getBoundingClientRect() { return { left: 20, bottom: 40 }; };
};

test('display pins use category colours and only render a numeral for an explicit tier', () => {
    const context = vm.createContext({ isClient: false, document: { createElement: () => { const el = new Element(); el.dataset = {}; return el; } } });
    vm.runInContext(misc.prepareForClient(fs.readFileSync(new URL('client.js', import.meta.url), 'utf8')) + '\nglobalThis.client = LegacyAchievements;', context);
    const standalone = context.client.pin({ ...AchievementDefinitions[0], unlockedAt: 100 }, new Element());
    const tiered = context.client.pin({ ...AchievementDefinitions[3], unlockedAt: 100 }, new Element());
    assert.equal(standalone.dataset.category, 'account');
    assert.equal(standalone.children.some(child => child.className === 'la-pin-tier'), false);
    assert.equal(tiered.dataset.category, 'combat');
    assert.equal(tiered.children.find(child => child.className === 'la-pin-tier').textContent, 'III');
    assert.equal(tiered.children.find(child => child.className === 'la-pin-tooltip').textContent, AchievementDefinitions[3].name);
    assert.equal(tiered.children.find(child => child.className === 'la-pin-tooltip').children[0].textContent, 'Combat');
    context.client.pinDraft = ['fresh_egg', 'kills_5', 'kills_100'];
    assert.equal(context.client.movePin(0, 2), true);
    assert.deepEqual(Array.from(context.client.pinDraft), ['kills_5', 'kills_100', 'fresh_egg']);
});

test('the pin picker hides redemption controls and redeemed rows show the earned date', () => {
    const context = vm.createContext({ isClient: false, AchievementMaxPins, document: { createElement: () => new Element() } });
    vm.runInContext(misc.prepareForClient(fs.readFileSync(new URL('client.js', import.meta.url), 'utf8')) + '\nglobalThis.client = LegacyAchievements;', context);
    const client = context.client;
    client.rewardIcons = () => {};
    const earned = new Date(2026, 8, 2, 12).getTime() / 1000;
    const achievement = { ...AchievementDefinitions[0], unlockedAt: earned, claimedAt: earned + 86400 * 20 };
    const parent = new Element();
    client.row(achievement, true, parent);
    const actions = parent.children[0].children.at(-1);
    assert.equal(actions.children[0].textContent, '02/09/2026');
    client.pinDraft = [];
    for (const claimedAt of [null, achievement.claimedAt]) {
        const picker = new Element();
        client.row({ ...achievement, claimedAt }, true, picker);
        assert.deepEqual(picker.children[0].children.at(-1).children.map(el => el.textContent), ['Pin']);
    };
});

test('opening a pin clears filters and scrolls to the exact achievement only once', () => {
    const profile = { username: 'first_egg' }, selected = [], calls = [];
    const context = vm.createContext({ isClient: false, LegacyProfiles: { profile, selectTab: id => selected.push(id) }, window: {} });
    vm.runInContext(misc.prepareForClient(fs.readFileSync(new URL('client.js', import.meta.url), 'utf8')) + '\nglobalThis.client = LegacyAchievements;', context);
    const client = context.client;
    client.filters = { username: profile.username, status: 'locked', search: 'unrelated', category: 'Account' };
    client.openAchievement(profile, 'kills_100');
    assert.deepEqual(selected, ['achievements']);
    assert.equal(client.filters.search, ''); assert.equal(client.filters.status, ''); assert.equal(client.filters.category, '');
    const row = { dataset: { achievement: 'kills_100' }, focus: () => calls.push('focus'), scrollIntoView: () => calls.push('scroll'), removeAttribute: name => calls.push('remove ' + name) };
    const view = { profile, list: { querySelectorAll: () => [row] } };
    client.scrollToAchievement(view); client.scrollToAchievement(view);
    assert.deepEqual(calls, ['focus', 'scroll']);
    assert.equal(row.dataset.pinTarget, 'true');
    row.onblur();
    assert.equal(row.dataset.pinTarget, undefined);
    assert.equal(calls.at(-1), 'remove tabindex');
});

test('achievement filters combine category, status and search while the tab keeps the full unlock count', () => {
    const button = new Element(), section = {};
    const context = vm.createContext({ isClient: false, AchievementDefinitions,
        LegacyProfiles: { sections: new Map([['achievements', section]]), tabs: { querySelector: () => button } } });
    vm.runInContext(misc.prepareForClient(fs.readFileSync(new URL('client.js', import.meta.url), 'utf8')) + '\nglobalThis.client = LegacyAchievements;', context);
    const { matches } = context.client;
    const locked = { ...AchievementDefinitions[3], unlockedAt: null, claimedAt: null };
    const ready = { ...AchievementDefinitions[1], unlockedAt: 100, claimedAt: null };
    const claimed = { ...ready, claimedAt: 101 };
    assert.equal(matches(locked, 'Combat', 'locked', 'KILLS III'), true);
    assert.equal(matches(locked, 'Account', '', ''), false);
    assert.equal(matches(ready, 'Combat', 'ready', '5 eggs'), true);
    assert.equal(matches(ready, '', 'claimed', ''), false);
    assert.equal(matches(claimed, '', 'ready', ''), false);
    assert.equal(matches(claimed, '', 'unlocked', ''), true);
    assert.equal(matches(claimed, '', 'claimed', ''), true);
    assert.equal(matches(ready, '', '', 'missing achievement'), false);
    const achievements = AchievementDefinitions.map(entry => ({ ...entry, unlockedAt: null }));
    context.client.updateCount({ achievements });
    assert.equal(button.textContent, 'Achievements 0/81');
    achievements[1].unlockedAt = 100;
    context.client.updateCount({ achievements });
    assert.equal(button.textContent, 'Achievements 1/81');
    assert.equal(section.label, 'Achievements 1/81');
});

test('reward icons reuse ItemToolTips, support focus and clean up tooltips when their list is removed', () => {
    const body = new Element();
    const context = vm.createContext({ isClient: false, document: { body, createElement: () => new Element() },
        window: { scrollX: 0, scrollY: 0 }, catalog: { findItemById: () => ({ name: 'Eggk47 GOLD' }) } });
    vm.runInContext(misc.prepareForClient(fs.readFileSync(new URL('../itemtooltips/client.js', import.meta.url), 'utf8')), context);
    vm.runInContext(misc.prepareForClient(fs.readFileSync(new URL('client.js', import.meta.url), 'utf8')) + '\nglobalThis.client = LegacyAchievements;', context);
    const rewards = context.client.rewardIcons({ eggs: 2500, items: [200001], vipSeconds: 3600 }, body);
    const [eggs, skin, vip] = rewards.children;
    assert.equal(eggs.attributes['aria-label'], '2,500 eggs');
    assert.equal(skin.tooltip.textContent, 'Eggk47 GOLD');
    assert.match(vip.tooltip.textContent, /1 hour VIP/);
    assert.equal(skin.tooltip.style.zIndex, '100300');
    skin.onfocus();
    assert.equal(skin.tooltip.style.visibility, 'visible');
    skin.onblur();
    assert.equal(skin.tooltip.style.visibility, 'hidden');
    const tooltip = skin.tooltip;
    context.client.clearTooltips(rewards);
    assert.equal(tooltip.isConnected, false);
    assert.equal(skin.listeners.size, 0);
    assert.equal(context.client.tooltipIcons.size, 0);
});

test('a claim refreshes account inventory, VIP and the own profile without reloading the page', () => {
    const item = { id: 200001, name: 'Eggk47 GOLD' }, calls = [];
    const context = vm.createContext({ isClient: false, playerAccount: { username: 'first_egg' },
        catalog: { findItemById: id => id === item.id ? item : null }, updateCurrentBalance: () => calls.push('balance'), setupUpgradeUI: () => calls.push('vip'),
        LegacyProfiles: { profile: { username: 'first_egg' }, overlay: {},
            preview: { dispose: () => calls.push('dispose') }, render: () => calls.push('render'), selectTab: tab => calls.push(tab) } });
    vm.runInContext(misc.prepareForClient(fs.readFileSync(new URL('client.js', import.meta.url), 'utf8')) + '\nglobalThis.client = LegacyAchievements;', context);
    context.client.applyReward({ currentBalance: 3500, ownedItemIds: [200001], upgradeProductId: 2,
        upgradeExpiryDate: Math.floor(Date.now() / 1000) + 3600, upgradeMultiplier: 3, upgradeAdFree: true });
    assert.equal(context.playerAccount.currentBalance, 3500);
    assert.equal(context.playerAccount.inventory[0], item);
    assert.equal(context.playerAccount.killMultiplier, 3);
    assert.equal(context.LegacyProfiles.profile.vip.active, true);
    assert.deepEqual(calls, ['balance', 'vip', 'dispose', 'render', 'achievements']);
});

test('popup queue plays one sound per unlock, shows first-redemption help and handles missing images', () => {
    const body = new Element(), sent = [], sounds = [], settings = { volume: 1 };
    class Audio { constructor(src) { this.src = src; sounds.push(this); }; play() { this.played = true; return Promise.resolve(); }; }
    const context = vm.createContext({ isClient: false, playerAccount: { isLoggedIn: true, username: 'first_egg', session: 'token' },
        document: { body, createElement: () => new Element() }, catalog: { findItemById() {} },
        setTimeout: () => 1, clearTimeout() {}, Audio, settings });
    vm.runInContext(misc.prepareForClient(fs.readFileSync(new URL('client.js', import.meta.url), 'utf8')) + '\nglobalThis.client = LegacyAchievements;', context);
    const client = context.client;
    client.key = 'first_egg\ntoken'; client.socket = { readyState: 1, send: data => sent.push(JSON.parse(data)) };
    const achievements = AchievementDefinitions.slice(0, 2).map(entry => ({ ...entry, unlockedAt: 100, claimedAt: null }));
    const snapshot = { username: 'first_egg', pending: achievements.map(entry => entry.id), achievements, hasClaimed: false, type: 'snapshot' };
    client.receive(snapshot); client.receive(snapshot);
    assert.equal(sounds.length, 1);
    assert.equal(sounds[0].src, '/legacyachievements/sfx/achievement.mp3');
    assert.equal(sounds[0].played, true);
    assert.ok(Math.abs(sounds[0].volume - .55) < 1e-9);
    assert.equal(client.queue.length, 1);
    const text = element => [element.textContent || '', ...element.children.map(text)].join(' ');
    assert.match(text(client.popup), /Redeem your reward from your profile/);
    assert.equal(sent[0].cmd, 'achievementsSeen');
    assert.equal(sent[0].achievement, 'fresh_egg');
    client.state.hasClaimed = true;
    client.dismiss();
    assert.equal(sounds.length, 2);
    assert.doesNotMatch(text(client.popup), /Redeem your reward from your profile/);
    settings.volume = 0; client.chime(); //muted in the game settings
    assert.equal(sounds.length, 2);
    settings.volume = .5; client.chime();
    assert.ok(Math.abs(sounds.at(-1).volume - .275) < 1e-9);
    client.chime('redeem.wav');
    assert.equal(sounds.at(-1).src, '/legacyachievements/sfx/redeem.wav');
    for (const file of ['achievement.mp3', 'redeem.wav']) assert.ok(fs.statSync(new URL('client/sfx/' + file, import.meta.url)).size > 1000);
    const image = client.image({ image: '/missing.png' }, body);
    image.onerror();
    assert.equal(image.src, '/legacyachievements/img/placeholder.png');
    assert.equal(image.onerror, null);
    client.dismiss();
});

test('an older public lookup cannot overwrite a different profile tab', async () => {
    const pane = new Element();
    const context = vm.createContext({ isClient: false, document: { createElement: () => new Element() },
        playerAccount: { isLoggedIn: false }, LegacyProfiles: { pane, tileGeneration: 1 } });
    vm.runInContext(misc.prepareForClient(fs.readFileSync(new URL('client.js', import.meta.url), 'utf8')) + '\nglobalThis.client = LegacyAchievements;', context);
    let resolve;
    context.client.publicList = () => new Promise(done => { resolve = done; });
    const render = context.client.render({ username: 'first_egg' }, pane);
    context.LegacyProfiles.tileGeneration++;
    const loadout = new Element(); pane.replaceChildren(); pane.appendChild(loadout);
    resolve({ achievements: [] });
    await render;
    assert.equal(pane.children[0], loadout);
});

test('game challenges are reported by name, only for ids the game server may report, and never pay out directly', async () => {
    const { db } = fixture(), events = {};
    const service = new AchievementService({ on: (event, listener) => events[event] = listener }, () => ({ db }), {});
    const ws = new Socket();
    const accs = { getAuthKeyData: async key => key === 'test-game-key' ? { name: 'test server' } : null };
    const invoke = msg => events['services:unhandledCommand']({ msg, ws, accs });
    const row = id => service.store.publicList('first_egg').achievements.find(entry => entry.id === id);
    try {
        await invoke({ cmd: 'achievementsChallenge', username: 'first_egg', achievement: 'shutdown', auth_key: 'invalid' });
        assert.equal(ws.sent.at(-1).legacyachievements.type, 'error');
        assert.equal(row('shutdown').unlockedAt, null);
        for (const achievement of [undefined, 'nope', 'fresh_egg', 'kills_10000', 5, {}]) {
            await invoke({ cmd: 'achievementsChallenge', username: 'first_egg', achievement, auth_key: 'test-game-key' });
            assert.equal(ws.sent.at(-1).legacyachievements.type, 'error');
        };
        assert.equal(row('kills_10000').unlockedAt, null);
        assert.equal(row('fresh_egg').claimedAt, null);
        const rewards = { shutdown: 1000, revenge_fried: 500, long_shot: 2500, last_gasp: 1500, from_beyond: 2500, omelette: 5000, air_mail: 1000 };
        for (const [achievement, eggs] of Object.entries(rewards)) {
            await invoke({ cmd: 'achievementsChallenge', username: 'first_egg', achievement, auth_key: 'test-game-key', reward: { eggs: 999999 } });
            assert.equal(ws.sent.at(-1).legacyachievements.type, 'recorded');
            assert.ok(row(achievement).unlockedAt);
            assert.equal(row(achievement).claimedAt, null);
            assert.deepEqual(row(achievement).reward, { eggs });
            assert.equal(row(achievement).image, '/legacyachievements/img/placeholder.png');
        };
        const balance = service.store.user(1).currentBalance;
        await invoke({ cmd: 'achievementsChallenge', username: 'first_egg', achievement: 'omelette', auth_key: 'test-game-key' });
        assert.equal(service.store.user(1).currentBalance, balance);
        assert.equal(service.store.claim(1, 'omelette').account.currentBalance, balance + 5000);
        assert.equal(service.store.claim(1, 'omelette').account.currentBalance, balance + 5000);
        assert.equal(service.store.user(2).currentBalance, 1000);
    } finally { service.dispose(); db.close(); };
});

test('death milestones use their thresholds as IDs, unlock only at the authoritative total and do not count towards kills', () => {
    const { db, store } = fixture();
    try {
        for (const goal of [5, 100, 500, 1000, 5000, 10000, 25000, 100000]) {
            db.prepare('UPDATE users SET deaths = ? WHERE account_id = 1').run(goal - 1);
            store.evaluate(1);
            assert.equal(store.list(store.user(1)).find(entry => entry.id === 'deaths_' + goal).unlockedAt, null);
            db.prepare('UPDATE users SET deaths = ? WHERE account_id = 1').run(goal);
            assert.deepEqual(store.evaluate(1), ['deaths_' + goal]);
        };
        const list = store.list(store.user(1));
        assert.equal(list.filter(entry => entry.id.startsWith('kills_') && entry.unlockedAt).length, 0);
        assert.equal(list.find(entry => entry.id === 'deaths_5').name, 'Deaths I');
        assert.equal(list.find(entry => entry.id === 'deaths_100000').name, 'Deaths VIII');
        assert.equal(list.find(entry => entry.id === 'deaths_100000').image, '/legacyachievements/img/deaths-8.svg');
    } finally { db.close(); };
});

test('dying checks the death tiers and tells anyone watching, like a kill does', async () => {
    const { db } = fixture(), events = {};
    const service = new AchievementService({ on: (event, listener) => events[event] = listener }, () => ({ db }), {});
    try {
        assert.equal(typeof events['services:addDeath'], 'function');
        db.prepare('UPDATE users SET deaths = 5 WHERE account_id = 1').run();
        await events['services:addDeath']({ userData: { account_id: 1 } });
        assert.ok(service.store.list(service.store.user(1)).find(entry => entry.id === 'deaths_5').unlockedAt);
        await events['services:addDeath']({ userData: {} });
    } finally { service.dispose(); db.close(); };
});

test('grades order the single challenges easiest first, set their default reward, and every tier line has eight tiers and a badge', () => {
    const challenges = AchievementDefinitions.filter(definition => definition.category === 'Challenges');
    assert.deepEqual(challenges.map(definition => definition.grade), [...challenges.map(definition => definition.grade)].sort((a, b) => a - b));
    for (const definition of AchievementDefinitions.filter(definition => !definition.tier)) assert.ok(Number.isInteger(definition.grade) && definition.grade >= 1 && definition.grade <= 8, definition.id);
    const eggs = id => AchievementDefinitions.find(definition => definition.id === id).reward.eggs;
    assert.deepEqual(['revenge_fried', 'shutdown', 'last_gasp', 'long_shot', 'omelette'].map(eggs), [500, 1000, 1500, 2500, 5000]);
    assert.equal(eggs('zombies_no_primary'), 2500);
    const lines = new Map();
    for (const definition of AchievementDefinitions.filter(definition => definition.tier && definition.icon)) { //(Air Mail's two tiers are challenges with no badge of their own yet)
        lines.set(definition.icon, [...(lines.get(definition.icon) || []), definition]);
        assert.equal(definition.image, '/legacyachievements/img/' + definition.icon + '-' + definition.tier + '.svg');
    };
    assert.deepEqual([...lines.keys()], ['kills', 'deaths', 'zombies', 'eggk47', 'dozen', 'csg1', 'rpegg', 'cluck', 'grenade']);
    for (const line of lines.values()) {
        assert.deepEqual(line.map(definition => definition.tier), line[0].icon === 'zombies' ? [1, 2, 3] : [1, 2, 3, 4, 5, 6, 7, 8]);
        assert.deepEqual(line.map(definition => definition.goal), [...line.map(definition => definition.goal)].sort((a, b) => a - b));
        assert.deepEqual(line.map(definition => definition.reward.eggs), [...line.map(definition => definition.reward.eggs)].sort((a, b) => a - b));
    };
    //the whole kills line stays smaller than what it was, weapon tiers on top of it would be too much otherwise
    assert.ok(AchievementDefinitions.filter(definition => definition.icon === 'kills').reduce((total, definition) => total + definition.reward.eggs, 0) < 200000);
});

test('weapon kills only add up through the store and unlock the weapon tiers at their goals', () => {
    const { db, store } = fixture();
    try {
        for (const bad of [null, [], {}, { nope: 1 }, { eggk47: 0 }, { eggk47: 1.5 }, { eggk47: 1001 }, { eggk47: '5' }]) assert.throws(() => store.addWeaponKills(1, bad), /cannot be recorded/);
        assert.throws(() => store.addWeaponKills(99, { eggk47: 1 }), /not found/);
        store.addWeaponKills(1, { eggk47: 24, grenade: 9 });
        assert.deepEqual(store.evaluate(1), ['fresh_egg']); //one short of both, only the account one
        assert.equal(store.list(store.user(1)).find(entry => entry.id === 'eggk47_25').progress, 24);
        store.addWeaponKills(1, { eggk47: 1, grenade: 1, cluck: 100 });
        assert.deepEqual(store.evaluate(1).sort(), ['cluck_100', 'cluck_25', 'eggk47_25', 'grenade_10']);
        assert.equal(store.publicList('first_egg').achievements.find(entry => entry.id === 'cluck_100').unlockedAt > 0, true);
        assert.equal(store.publicList('other_egg').achievements.find(entry => entry.id === 'eggk47_25').progress, 0);
        assert.deepEqual(store.weapons(2), {});
    } finally { db.close(); };
});

test('weapon kill batches need a trusted game server and only count real weapons', async () => {
    const { db } = fixture(), events = {};
    const service = new AchievementService({ on: (event, listener) => events[event] = listener }, () => ({ db }), {});
    const ws = new Socket();
    const accs = { getAuthKeyData: async key => key === 'test-game-key' ? { name: 'test server' } : null };
    const invoke = msg => events['services:unhandledCommand']({ msg, ws, accs });
    const row = id => service.store.publicList('first_egg').achievements.find(entry => entry.id === id);
    try {
        await invoke({ cmd: 'achievementsWeaponKills', username: 'first_egg', kills: { eggk47: 30 }, auth_key: 'invalid' });
        assert.equal(ws.sent.at(-1).legacyachievements.type, 'error');
        for (const kills of [{ nope: 5 }, { eggk47: -1 }, 'eggk47', null]) {
            await invoke({ cmd: 'achievementsWeaponKills', username: 'first_egg', kills, auth_key: 'test-game-key' });
            assert.equal(ws.sent.at(-1).legacyachievements.type, 'error');
        };
        await invoke({ cmd: 'achievementsWeaponKills', username: 'nobody_here', kills: { eggk47: 30 }, auth_key: 'test-game-key' });
        assert.equal(ws.sent.at(-1).legacyachievements.type, 'error');
        assert.equal(row('eggk47_25').unlockedAt, null);
        await invoke({ cmd: 'achievementsWeaponKills', username: 'first_egg', kills: { eggk47: 20 }, auth_key: 'test-game-key' });
        assert.equal(ws.sent.at(-1).legacyachievements.type, 'recorded');
        assert.equal(row('eggk47_25').progress, 20);
        await invoke({ cmd: 'achievementsWeaponKills', username: 'first_egg', kills: { eggk47: 5, rpegg: 25 }, auth_key: 'test-game-key' });
        assert.ok(row('eggk47_25').unlockedAt);
        assert.ok(row('rpegg_25').unlockedAt);
        assert.deepEqual(row('eggk47_25').reward, { eggs: 100 });
        assert.equal(row('eggk47_25').claimedAt, null);
        assert.equal(service.store.user(2).currentBalance, 1000);
    } finally { service.dispose(); db.close(); };
});

test('Air Mail II counts the weapons a mid-jump kill has been made with, and unlocks on the sixth', () => {
    const { db, store } = fixture();
    try {
        const air = () => store.list(store.user(1)).find(entry => entry.id === 'air_mail_every_weapon');
        assert.equal(air().goal, 6);
        assert.equal(air().tier, 2);
        assert.equal(store.list(store.user(1)).find(entry => entry.id === 'air_mail').tier, 1); //the challenge it follows, under the id it always had
        store.evaluate(1); //(Fresh Egg and the like, out of the way)
        for (const bad of [{ air_whipper: 1 }, { air_zombies: 1 }, { air_eggk47: 0 }, { air_eggk47: 1.5 }]) assert.throws(() => store.addWeaponKills(1, bad), /cannot be recorded/);
        store.addWeaponKills(1, { air_eggk47: 3, air_dozen: 1, air_csg1: 1, air_rpegg: 1, air_cluck: 1, eggk47: 5 });
        assert.deepEqual(store.evaluate(1), []);
        assert.equal(air().progress, 5); //a weapon counts once however many kills it has
        store.addWeaponKills(1, { air_grenade: 1 });
        assert.deepEqual(store.evaluate(1), ['air_mail_every_weapon']);
        assert.equal(air().progress, 6);
        assert.ok(air().unlockedAt);
        assert.equal(air().reward.eggs, 2500);
    } finally { db.close(); };
});
