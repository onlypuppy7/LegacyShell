//node plugins_default/legacyshellcore/test-debug.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import misc from '#misc';

class Element {
    children = []; style = {}; className = ''; textContent = '';
    classList = { add: name => { if (!this.classList.contains(name)) this.className += ' ' + name; },
        remove: name => { this.className = this.className.split(' ').filter(value => value !== name).join(' '); },
        contains: name => this.className.split(' ').includes(name) };
    appendChild(node) { node.parent = this; this.children.push(node); return node; }
    append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
    get lastChild() { return this.children.at(-1); }
    querySelectorAll(selector) {
        const nodes = this.children.flatMap(node => [node, ...node.querySelectorAll('*')]);
        return selector === '*' ? nodes : nodes.filter(node => selector[0] === '.' ? node.classList.contains(selector.slice(1)) : node.id === selector.slice(1));
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
const document = () => {
    const body = new Element(), head = new Element();
    return { body, head, createElement: () => new Element(), getElementById: id => [...body.querySelectorAll('*'), ...head.querySelectorAll('*')].find(node => node.id === id) };
};
const fixture = (state = {}) => {
    const doc = document(), options = [], listeners = new Map(), debug = { shown: true, updates: 0,
        setShown(value) { this.shown = value; }, update() { this.updates++; } };
    const settings = { id: 'settingsMenu', state, tabOrder: ['General', 'Graphics'], tabs: { General: {}, Graphics: {} }, root: null,
        tabCache: {}, activeTab: 'General', get(key, fallback) { return this.state[key] ?? fallback; }, set(key, value) { this.state[key] = value; },
        addTab(name) { if (!this.tabs[name]) { this.tabs[name] = {}; this.tabOrder.push(name); }; },
        addOption(tab, option) { options.push({ tab, ...option }); },
        renderTab(name) { Object.values(this.tabCache).forEach(node => node.style.display = 'none'); (this.tabCache[name] ||= new Element()).style.display = 'flex'; } };
    const context = vm.createContext({ document: doc, LegacySettings: settings, DebugF3: debug,
        FranciumBenchmark: { settings() {}, buttons() {} }, plugins: { on: (name, fn) => listeners.set(name, fn) } });
    vm.runInContext(fs.readFileSync(new URL('./debug.js', import.meta.url), 'utf8'), context);
    const feature = vm.runInContext('LegacyShellCoreDebug', context);
    const finalise = () => {
        const root = settings.root = new Element(), tabs = new Element(); tabs.className = 'ssTabs'; root.appendChild(tabs); doc.body.appendChild(root);
        for (const name of settings.tabOrder) { const button = new Element(); button.id = 'settingsMenuTab_' + name; button.className = 'ssTab'; tabs.appendChild(button); };
        return tabs;
    };
    const change = enabled => { settings.set('enableDebug', enabled); options.find(option => option.key === 'enableDebug').onChange(enabled); };
    return { settings, feature, options, doc, debug, finalise, change };
};
let passed = 0;
const test = (name, run) => { run(); passed++; console.log('PASS', name); };

test('debug is opt-in and placeholders only store values', () => {
    const f = fixture(); assert.equal(f.feature.enabled(), false); assert.ok(!f.settings.tabOrder.includes('Debug')); assert.equal(f.debug.shown, false);
    for (const key of ['debugMaps', 'removedGamemodes']) {
        const option = f.options.find(option => option.key === key);
        assert.equal(option.type, 'checkbox'); assert.equal(option.default, false); assert.equal(option.onChange, undefined); assert.equal(option.setValue, undefined);
    };
    assert.equal(f.options.find(option => option.key === 'debugF3HideInfo').tab, 'Debug');
});

test('enabling and disabling the tab is live, repeatable and returns an active debug pane to General', () => {
    const f = fixture(), tabs = f.finalise();
    for (let i = 0; i < 3; i++) {
        f.change(true); assert.equal(tabs.children.filter(node => node.id === 'settingsMenuTab_Debug').length, 1);
        const button = f.doc.getElementById('settingsMenuTab_Debug'); button.onclick(); assert.equal(f.settings.activeTab, 'Debug');
        f.change(false); assert.equal(f.doc.getElementById('settingsMenuTab_Debug'), undefined); assert.equal(f.settings.activeTab, 'General');
        assert.equal(f.settings.tabCache.Debug.style.display, 'none'); assert.ok(!f.settings.tabOrder.includes('Debug'));
    };
});

test('saved debug enablement and existing privacy values survive setup, and the binding uses saved state', () => {
    const f = fixture({ enableDebug: true, debugF3HideInfo: true, debugF3Key: 'F4' });
    f.finalise(); assert.ok(f.doc.getElementById('settingsMenuTab_Debug')); assert.equal(f.settings.get('debugF3HideInfo'), true);
    const binding = f.options.find(option => option.key === 'debugF3Key'); assert.equal(binding.getValue(), 'F4');
    binding.setValue('F6'); assert.equal(f.settings.get('debugF3Key'), 'F6'); assert.ok(f.debug.updates > 0);
});

const f3Fixture = () => {
    const doc = document(), events = new Map(), storage = new Map(), state = { enableDebug: false };
    const settings = { state, root: { style: { display: 'none' } }, get: (key, fallback) => state[key] ?? fallback };
    const player = { x: 1, y: 2, z: 3, dx: 0, dy: 0, dz: 0, yaw: 0, pitch: 0, hp: 100, team: 0, grenadeCount: 2, playing: true, actor: {}, lastTouchedGround: 1 };
    const context = vm.createContext({ document: doc, LegacySettings: settings, isClient: false, inGame: true, me: player, viewingPlayer: null,
        minMap: { name: 'Castle' }, gameType: 0, GameTypes: [{ longNameDisplay: 'FFA' }], servers: [{ nameDisplay: 'local' }], selectedServer: 0,
        munitionsManager: {}, playerLimit: 18, gameCode: 'PRIVATE_ROOM', privateGame: true, iteratePlayers: fn => fn(player),
        gameScene: { meshes: [], getActiveMeshes: () => ({ length: 0 }) }, engine: { getFps: () => 60, getHardwareScalingLevel: () => 1,
            getGlInfo: () => ({ renderer: 'PRIVATE_GPU', vendor: 'PRIVATE_VENDOR', version: 'PRIVATE_GL' }) },
        performance: { now: () => 1000 }, navigator: { userAgent: 'Chrome/148.0', hardwareConcurrency: 16 },
        window: { innerWidth: 800, innerHeight: 600, addEventListener: (name, fn) => events.set(name, fn) },
        localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
        plugins: { emitSync() {} }, requestAnimationFrame() {} });
    vm.runInContext(misc.prepareForClient(fs.readFileSync(new URL('../debugf3/client.js', import.meta.url), 'utf8')), context);
    const overlay = vm.runInContext('DebugF3', context); overlay.managed = true;
    assert.doesNotThrow(() => overlay.update(true));
    overlay.init();
    const key = (value, extra = {}) => events.get('keydown')({ key: value, preventDefault() {}, ...extra });
    return { overlay, settings, state, events, key, storage, context };
};

test('overlay honours enablement, custom keys and repeat/settings/text-input guards', () => {
    const f = f3Fixture(); f.key('F3'); assert.equal(f.overlay.shown, false);
    f.state.enableDebug = true; f.state.debugF3Key = 'F4'; f.key('F3'); assert.equal(f.overlay.shown, false);
    f.key('F4'); assert.equal(f.overlay.shown, true); assert.equal(f.storage.get('debugF3'), '1');
    f.key('F4', { repeat: true }); f.key('F4', { ctrlKey: true }); assert.equal(f.overlay.shown, true);
    f.settings.globalBindingActive = true; f.key('F4'); assert.equal(f.overlay.shown, true); f.settings.globalBindingActive = false;
    f.settings.root.style.display = 'block'; f.key('F4'); assert.equal(f.overlay.shown, true); f.settings.root.style.display = 'none';
    f.key('F4', { target: { closest: () => ({}) } }); assert.equal(f.overlay.shown, true);
    f.key('F4'); assert.equal(f.overlay.shown, false);
});

test('privacy hides existing identifying fields and disabling debug hides an open overlay', () => {
    const f = f3Fixture(); f.state.enableDebug = true; f.key('F3');
    const content = () => [...f.overlay.left.children, ...f.overlay.right.children].map(row => row.textContent).join('\n');
    assert.match(content(), /PRIVATE_GPU/); assert.match(content(), /PRIVATE_ROOM/);
    f.state.debugF3HideInfo = true; f.overlay.update(true);
    assert.doesNotMatch(content(), /PRIVATE_GPU|PRIVATE_ROOM|PRIVATE_VENDOR|PRIVATE_GL|Browser:|CPU:|Display:/);
    f.state.enableDebug = false; f.overlay.setShown(false);
    assert.equal(f.overlay.left.style.display, 'none'); assert.equal(f.overlay.right.style.display, 'none'); assert.equal(f.storage.get('debugF3'), '0');
});

console.log('LegacyShellCore:', passed, 'debug settings tests passed.');
