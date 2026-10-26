import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function setup() {
    const pending = [];
    class Howl {
        constructor(options) {
            this.src = options.src;
            pending.push(() => options.onload?.());
        }
        unload() { this.unloaded = true; }
        state() { return this.unloaded ? 'unloaded' : 'loaded'; }
    }
    const context = vm.createContext({
        Howl, Howler: {}, window: {}, devmode: false, devlog() {}, console: { log() {}, warn() {} },
        setTimeout() { return 1; }, clearTimeout() {}, isMapEditor: true,
        soundsLoaded: false
    });
    const apollo = fs.readFileSync(new URL('../../server-client/src/client-static/src/apollon/Apollo.js', import.meta.url), 'utf8');
    vm.runInContext(apollo.replace(/^import .*;\r?$/gm, ''), context);
    vm.runInContext(fs.readFileSync(new URL('client.js', import.meta.url), 'utf8') + '\nglobalThis.themes = LegacyThemesPlugin;', context);
    const themes = context.themes;
    themes.applyBaseCSS = themes.setupSettings = () => {};
    themes.registerListeners({ on() {} });
    let active = [];
    themes.soundCurrentList = { get: () => active };
    return {
        themes,
        run: code => vm.runInContext(code, context),
        flush: () => { while (pending.length) pending.shift()(); },
        select(list) {
            active = list;
            themes.applySoundsFromList(list);
        },
        ready() { context.soundsLoaded = true; }
    };
}

test('saved cue packs apply on first load and removal restores every original member', () => {
    const app = setup();
    app.themes.soundPacks.push({ identifier: 'minecraft', sounds: { 'death.scream': ['mc1.mp3', 'mc2.mp3'] } });
    app.select(['minecraft']);
    app.themes.loadSounds({ soundsList: [['hit.mp3', 'hit']] });
    app.run('loadCue("death.scream", ["default1.mp3", "default2.mp3", "default3.mp3"])');
    app.flush();
    assert.equal(app.run('sounds[ sounds["death.scream"].sounds[0] ].src'), 'mc1.mp3');
    assert.equal(app.run('sounds["death.scream"].sounds.length'), 2);
    app.ready();
    app.select([]);
    app.flush();
    assert.equal(app.run('sounds["death.scream"].sounds.length'), 3);
    assert.equal(app.run('sounds[ sounds["death.scream"].sounds[2] ].src'), 'default3.mp3');
    assert.equal(app.run('Object.keys(sounds).filter(name => name.startsWith("CUE.")).length'), 3);
});

test('cue packs respect ordering and rapid switches clean up pending loads', () => {
    const app = setup();
    app.themes.soundPacks.push(
        { identifier: 'a', sounds: { thunder: ['a.mp3'] } },
        { identifier: 'b', sounds: { thunder: ['b1.mp3', 'b2.mp3'] } },
        { identifier: 'single', sounds: { thunder: 'single.mp3' } }
    );
    app.run('loadCue("thunder", ["default.mp3"])');
    app.flush();
    app.ready();
    app.select(['a', 'b']);
    app.select(['b', 'a']);
    app.flush();
    assert.equal(app.run('sounds[ sounds.thunder.sounds[0] ].src'), 'b1.mp3');
    assert.equal(app.run('Object.keys(sounds).filter(name => name.startsWith("CUE.")).length'), 2);
    app.select(['single']);
    app.flush();
    assert.equal(app.run('sounds[ sounds.thunder.sounds[0] ].src'), 'single.mp3');
    app.select([]);
    app.flush();
    assert.equal(app.run('sounds[ sounds.thunder.sounds[0] ].src'), 'default.mp3');
});

test('ordinary sound defaults survive initial overrides, and arrays can replace individual sounds', () => {
    const app = setup();
    app.themes.soundPacks.push(
        { identifier: 'single', sounds: { hit: 'mc.mp3' } },
        { identifier: 'random', sounds: { hit: ['random1.mp3', 'random2.mp3'], ammo: ['pickup.mp3'] } }
    );
    app.select(['single']);
    const list = [['hit.mp3', 'hit', { preload: false }], ['ammo.mp3', 'ammo']];
    app.themes.loadSounds({ soundsList: list });
    assert.equal(list[0][0], 'mc.mp3');
    app.run('loadSound("mc.mp3", "hit", () => {}, { preload: false })');
    app.flush();
    app.ready();
    app.select([]);
    app.flush();
    assert.equal(app.run('sounds.hit.src'), 'hit.mp3');
    app.select(['random']);
    app.flush();
    assert.equal(app.run('sounds.hit.sounds.length'), 2);
    app.select([]);
    app.flush();
    assert.equal(app.run('sounds.hit.src'), 'hit.mp3');
    assert.equal(app.run('Object.keys(sounds).filter(name => name.startsWith("CUE.")).length'), 0);

    const initial = setup();
    initial.themes.soundPacks = app.themes.soundPacks;
    initial.select(['random']);
    const initialList = [['hit.mp3', 'hit'], ['ammo.mp3', 'ammo'], ['health.mp3', 'health']];
    initial.themes.loadSounds({ soundsList: initialList });
    initial.flush();
    assert.equal(initialList.length, 1);
    assert.equal(initialList[0][1], 'health');
    assert.equal(initial.run('sounds.hit.sounds.length'), 2);
    assert.equal(initial.run('sounds.ammo.sounds.length'), 1);
});
