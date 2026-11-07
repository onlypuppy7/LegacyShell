//node plugins_default/francium/test-benchmark.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import misc from '#misc';

class Element {
    style = {}; children = []; textContent = ''; disabled = false;
    append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
    appendChild(node) { node.parent = this; this.children.push(node); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
    setAttribute() {}
    querySelector() { return this.button; }
    after(node) { this.sibling = node; }
}
const fixture = () => {
    let now = 0;
    const options = [], listeners = new Map(), timers = new Set(), queued = [], play = new Element(), body = new Element();
    body.classList = { add() {}, remove() {} };
    const document = { body, head: new Element(), hidden: false, createElement: () => new Element(),
        querySelector: () => play, getElementById: () => new Element(),
        addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
    const settings = { root: { style: { display: 'none' } }, get: (key, fallback) => fallback, addTab() {}, addOption(tab, option) {
        const el = new Element(); el.button = new Element(); const value = { opt: option, el }; options.push(value); return value;
    }, close() {}, open() {} };
    const context = vm.createContext({ console, document, window: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) },
        LegacySettings: settings, settings: { autoDetail: true }, performance: { now: () => now, mark() {}, measure() {} },
        setTimeout(fn) { queued.push(fn); }, clearInterval: timer => timers.delete(timer), setInterval(fn) { timers.add(fn); return fn; },
        LegacyShellCoreDebug: { enabled: () => true }, FranciumHud: { improvements: true },
        minMap: null, minMaps: [{ name: 'Castle', id: 9, data: {} }], mapIdx: 4, gameType: 2, gameId: 3, gameKey: 7, myTeam: 1, meId: 4,
        playerLimit: 16, isGameOwner: false, playOffline: false, ws: null, inGame: false, catalog: { isSetup: true },
        servers: [], selectedServer: 0, startGame() { context.starts = (context.starts || 0) + 1; }, joinGame() { context.joins = (context.joins || 0) + 1; },
        showMainMenu() { context.inGame = false; context.leaves = (context.leaves || 0) + 1; }, onMapComplete() {},
        me: {}, viewingPlayer: {}, kills: 10, deaths: 9, bestOverallStreak: 8, gameStartTime: 123 });
    for (const file of ['scenario.js', 'benchmark.js']) vm.runInContext(misc.prepareForClient(fs.readFileSync(new URL(file, import.meta.url), 'utf8')), context);
    return { benchmark: vm.runInContext('FranciumBenchmark', context), scenario: vm.runInContext('FranciumScenario', context), context, options,
        listeners, timers, queued, clock: value => { now = value; } };
};
let passed = 0;
const test = (name, run) => { run(); passed++; console.log('PASS', name); };

test('debug-menu buttons are disabled in a game and guarded against direct invocation', () => {
    const f = fixture(); f.benchmark.settings(); f.benchmark.settings(); assert.equal(f.options.length, 4);
    const toggle = f.options.find(option => option.opt.key === 'franciumImprovements');
    assert.equal(toggle.opt.default, true); assert.equal(toggle.opt.type, 'checkbox');
    f.options.splice(f.options.indexOf(toggle), 1);
    const unlock = f.options.find(option => option.opt.key === 'franciumUnlockFps');
    assert.equal(unlock.opt.default, false); assert.equal(unlock.opt.type, 'checkbox');
    f.options.splice(f.options.indexOf(unlock), 1);
    for (const state of ['debug disabled', 'game', 'connecting', 'connected', 'benchmark']) {
        f.context.LegacyShellCoreDebug.enabled = () => state !== 'debug disabled';
        f.context.inGame = state === 'game'; f.context.ws = state === 'connecting' ? { readyState: 0 } : state === 'connected' ? { readyState: 1 } : null;
        f.benchmark.session = state === 'benchmark' ? {} : null;
        f.benchmark.buttons();
        assert.ok(f.options.every(option => option.el.button.disabled), state);
        f.benchmark.prompt(); f.benchmark.open(); f.benchmark.showLast(); f.options.forEach(option => option.opt.onClick());
        assert.equal(f.context.starts, undefined, state); assert.equal(f.benchmark.dialogElement, undefined, state);
    };
    f.context.inGame = false; f.context.ws = null; f.benchmark.session = null; f.benchmark.buttons();
    assert.ok(f.options.every(option => !option.el.button.disabled));
});

test('confirmation rechecks the home-screen guard and a local launch never opens a socket', () => {
    const f = fixture(); f.benchmark.settings(); f.benchmark.prompt();
    f.context.inGame = true; f.benchmark.open(); assert.equal(f.context.starts, undefined);
    f.context.inGame = false; f.benchmark.open(); assert.equal(f.context.starts, 1); assert.equal(f.context.inGame, true);
    assert.equal(f.context.minMap.name, 'Castle'); assert.equal(f.context.settings.autoDetail, false);
    assert.equal(f.context.ws.readyState, 3); assert.equal(f.context.ws.send(), undefined);
    f.context.joinGame(); assert.equal(f.context.joins, undefined);
    f.benchmark.open(); assert.equal(f.context.starts, 1);
});

test('exit restores state and input handlers, clears resources and excludes account bookkeeping', () => {
    const f = fixture(); const originalFocus = () => {}, originalPointer = () => {};
    f.context.window.onfocus = originalFocus; f.context.document.onpointerlockchange = originalPointer;
    f.benchmark.settings(); f.benchmark.open(); f.benchmark.exit();
    assert.equal(f.context.leaves, 1); assert.equal(f.context.me, null); assert.equal(f.context.kills, 0); assert.equal(f.context.deaths, 0);
    assert.equal(f.context.minMap, null); assert.equal(f.context.mapIdx, 4); assert.equal(f.context.gameType, 2); assert.equal(f.context.gameId, 3);
    assert.equal(f.context.ws, null); assert.equal(f.context.settings.autoDetail, true);
    assert.equal(f.context.window.onfocus, originalFocus); assert.equal(f.context.document.onpointerlockchange, originalPointer);
    assert.equal(f.listeners.size, 0); assert.equal(f.benchmark.session, null); assert.ok(f.options.every(option => !option.el.button.disabled));
});

test('cancellation during loading waits for the safe map-complete boundary', async () => {
    const f = fixture(); f.benchmark.open();
    f.listeners.get('keydown')({ key: 'Escape', preventDefault() {}, stopImmediatePropagation() {} });
    assert.equal(f.benchmark.session.cancelled, true); assert.equal(f.context.leaves, undefined);
    f.context.gameScene = {}; await f.benchmark.ready(); assert.equal(f.context.leaves, 1); assert.equal(f.benchmark.session, null);
});

test('exiting from a frame defers scene disposal until the render stack has returned', () => {
    const f = fixture(); f.benchmark.open(); const session = f.benchmark.session; session.inFrame = true;
    f.benchmark.exit('cancel'); f.benchmark.exit('cancel'); assert.equal(f.context.leaves, undefined); assert.equal(f.queued.length, 1);
    session.inFrame = false; f.queued.shift()(); assert.equal(f.context.leaves, 1);
});

test('camera tracks, player poses and event schedules are stable and finite', () => {
    const f = fixture(), definition = JSON.parse(fs.readFileSync(new URL('../../server-game/store/maps.json', import.meta.url), 'utf8')).find(map => map.name === 'Castle');
    const tracks = f.scenario.tracks(definition); assert.equal(tracks.length, 6);
    const run = () => {
        const counts = {}, checkpoints = [];
        for (let tick = 0; tick < 2700; tick++) {
            for (const event of f.scenario.events(tick)) counts[event.kind] = (counts[event.kind] || 0) + 1;
            if (tick % 60 === 0) checkpoints.push([f.scenario.cameraAt(tick / 60), tracks.map((track, index) => f.scenario.pose(track, index, tick))]);
        };
        return JSON.stringify({ counts, checkpoints });
    };
    assert.equal(run(), run());
    for (let seconds = 0; seconds <= 45; seconds += .25) assert.ok(f.scenario.cameraAt(seconds).every(Number.isFinite));
    const counts = JSON.parse(run()).counts; for (const name of ['fire', 'reload', 'grenade', 'death', 'respawn']) assert.ok(counts[name] > 0);
    assert.equal(counts.death, counts.respawn);
    assert.deepEqual(f.scenario.cameraAt(0), f.scenario.cameraAt(45));
});

test('seeded work restores both random sources even when a scripted action throws', () => {
    const f = fixture(), math = vm.runInContext('Math', f.context), original = math.random; math.seed = 37;
    const a = f.scenario.random(123, () => [math.random(), math.random()]);
    const b = f.scenario.random(123, () => [math.random(), math.random()]); assert.deepEqual(a, b);
    assert.equal(math.random, original); assert.equal(math.seed, 37);
    assert.throws(() => f.scenario.random(123, () => { throw Error('test'); }));
    assert.equal(math.random, original); assert.equal(math.seed, 37);
});

test('actor animation and visibility work runs per rendered frame, excluding dead actors', () => {
    const f = fixture(), calls = [];
    const actor = { handsToWeaponSkeleton: () => calls.push('hands'), update: delta => calls.push(delta) };
    const weapon = { update: delta => calls.push('weapon:' + delta) };
    f.scenario.render({ actors: [{ playing: true, actor, weapon }, { playing: false, actor, weapon }] }, .5);
    assert.deepEqual(calls, ['hands', .5, 'weapon:0.5']);
});

test('slow rendering preserves all ticks and ignores cancelled or foreign sessions', () => {
    const f = fixture(); f.benchmark.open(); const session = f.benchmark.session;
    session.state = { tick: 0, counts: {} }; session.phase = 'running'; session.startAt = 0; session.width = 800; session.height = 600;
    session.hud = new Element(); f.context.engine = { getRenderWidth: () => 800, getRenderHeight: () => 600, getDeltaTime: () => 16 };
    f.context.gameScene = { onAfterRenderObservable: { addOnce(fn) { f.afterRender = fn; } } };
    f.context.FranciumMap = { scenes: new WeakMap() }; f.context.updateListener = () => {};
    f.context.BABYLON = { Vector3: { Forward() {} } }; f.context.camera = { getDirection() {} };
    f.scenario.step = state => state.tick++; f.scenario.camera = () => {}; f.scenario.render = () => {};
    f.clock(45000); for (let frame = 0; frame < 23; frame++) f.benchmark.frame();
    assert.equal(session.state.tick, 2700); assert.equal(session.phase, 'finished'); assert.equal(f.context.leaves, undefined);
    assert.equal(f.benchmark.results.length, 0); f.afterRender(); f.queued.shift()();
    assert.equal(f.benchmark.results[0].ticks, 2700); assert.equal(f.context.leaves, 1);
});

console.log('Francium:', passed, 'scripted benchmark tests passed.');
