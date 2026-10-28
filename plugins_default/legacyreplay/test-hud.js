//legacyshell: the hud makes it into the video's pixels, only when it is showing. node plugins_default/legacyreplay/test-hud.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createCanvas, loadImage, DOMMatrix } from '@napi-rs/canvas';

const ids = new Map(), classes = new Set(['replayPov', 'replayHud']);
const style = {
    display: 'block', visibility: 'visible', opacity: '1', transform: 'matrix(1, 0, 0, 1, 0, 0)', boxSizing: 'border-box',
    width: '20px', height: '20px', backgroundColor: 'rgba(0, 0, 0, 0)', borderTopLeftRadius: '0px',
    borderTopWidth: '0px', borderRightWidth: '0px', borderBottomWidth: '0px', borderLeftWidth: '0px',
    color: '#fff', fontStyle: 'normal', fontWeight: '700', fontSize: '12px', fontFamily: 'sans-serif', textShadow: 'none',
};
const element = (tag, x, y, w, h, over = {}) => ({
    tagName: tag.toUpperCase(), children: [], childNodes: [], parentElement: null, offsetWidth: w, offsetHeight: h,
    css: { ...style, width: w + 'px', height: h + 'px', ...over },
    getBoundingClientRect: () => ({ left: x, top: y, width: w, height: h }),
    matches: function (selector) { return selector.split(', ').some((part) => part.startsWith('.') ? (this.className || '').split(' ').includes(part.slice(1)) : part === tag) },
});
const add = (id, el, parent = ids.get('game')) => { ids.set(id, el); if (parent) { parent.children.push(el); el.parentElement = parent }; return el };
const context = vm.createContext({
    document: {
        body: { classList: { contains: (name) => classes.has(name) } }, getElementById: (id) => ids.get(id),
        createRange: () => ({ setStart: function (node) { this.node = node }, setEnd: () => {}, getBoundingClientRect: function () { return this.node.rect } }),
    },
    getComputedStyle: (el) => el.css, DOMMatrix, URL, location: { href: 'https://game.test/', origin: 'https://game.test' },
    ReplayFx: { state: null },
});
for (const [file, name] of [['hud.js', 'ReplayHud'], ['export.js', 'ReplayExport']]) vm.runInContext(fs.readFileSync(new URL('./' + file, import.meta.url), 'utf8').replace('export const ' + name, 'globalThis.' + name), context);
const H = context.ReplayHud, E = context.ReplayExport;
const game = createCanvas(160, 90);
game.getBoundingClientRect = () => ({ left: 0, top: 0, width: 160, height: 90 });
game.getContext('2d').fillStyle = '#123456';
game.getContext('2d').fillRect(0, 0, 160, 90);
const draw = (w = 160, h = 90) => { const out = createCanvas(w, h); E.paint(out.getContext('2d'), game, { w, h, ratio: w / h }); return out };
const pixel = (out, x, y) => Array.from(out.getContext('2d').getImageData(x, y, 1, 1).data);
const reset = () => { ids.clear(); add('game', element('div', 0, 0, 0, 0)); classes.add('replayPov'); classes.add('replayHud'); context.ReplayFx = { state: null }; game.getContext('2d').fillStyle = '#123456'; game.getContext('2d').fillRect(0, 0, game.width, game.height) };
var passed = 0;
function test(name, fn) {
    reset();
    try { fn(); passed++; console.log('ok   ', name) } catch (e) { console.log('FAIL ', name, '\n', e); process.exitCode = 1 };
};

test('only their view with the hud showing captures the hud, and it changes with the frame', () => {
    const health = element('div', 70, 60, 20, 20, { backgroundColor: '#f00' });
    add('health', health);
    assert.deepEqual(pixel(draw(), 80, 70), [255, 0, 0, 255]);
    classes.delete('replayHud');
    assert.deepEqual(pixel(draw(), 80, 70), [18, 52, 86, 255], 'G hides it in the video too');
    classes.add('replayHud'); classes.delete('replayPov');
    assert.deepEqual(pixel(draw(), 80, 70), [18, 52, 86, 255], 'another camera has no hud');
    classes.add('replayPov'); health.css.backgroundColor = '#0f0';
    assert.deepEqual(pixel(draw(), 80, 70), [0, 255, 0, 255], 'the next frame gets the new state');
});

test('the hud follows the picture crop and scales independently of the game canvas resolution', () => {
    add('health', element('div', 70, 60, 20, 20, { backgroundColor: '#f00' }));
    const out = draw(90, 160);
    assert.deepEqual(pixel(out, 45, 125), [255, 0, 0, 255]);
    assert.deepEqual(pixel(out, 45, 20), [18, 52, 86, 255]);
    game.width = 320; game.height = 180;
    assert.deepEqual(pixel(draw(), 80, 70), [255, 0, 0, 255], 'hardware scaling does not move the html');
    game.width = 160; game.height = 90;
});

test('new hud children are found without adding their ids to the recorder', () => {
    const hud = add('newHud', element('div', 10, 10, 20, 20, { backgroundColor: '#f00' }));
    ids.delete('newHud');
    add('newChild', element('div', 15, 15, 10, 10, { backgroundColor: '#0f0' }), hud);
    ids.delete('newChild');
    assert.deepEqual(pixel(draw(), 12, 12), [255, 0, 0, 255]);
    assert.deepEqual(pixel(draw(), 20, 20), [0, 255, 0, 255]);
});

test('the separate corner container is captured once, even when readouts are hidden', () => {
    const corner = element('div', 0, 0, 0, 0, { opacity: '0.5' });
    add('readouts', element('div', 0, 0, 0, 0, { display: 'none' }), corner);
    add('newBalance', element('div', 120, 10, 20, 20, { backgroundColor: '#f00' }), corner);
    ids.delete('newBalance');
    const out = draw(), expected = createCanvas(1, 1), ctx = expected.getContext('2d');
    ctx.fillStyle = '#123456'; ctx.fillRect(0, 0, 1, 1);
    ctx.globalAlpha = 0.5; ctx.fillStyle = '#f00'; ctx.fillRect(0, 0, 1, 1);
    assert.deepEqual(pixel(out, 125, 15), pixel(expected, 0, 0), 'the translucent container is not painted twice');
    corner.css.display = 'none';
    assert.deepEqual(pixel(draw(), 125, 15), [18, 52, 86, 255]);
});

test('menus and form controls do not get into the video when traversing the game container', () => {
    const menu = add('gameMenu', element('div', 0, 0, 160, 90, { display: 'none', backgroundColor: '#f00' }));
    add('menuText', element('div', 0, 0, 160, 90, { backgroundColor: '#0f0' }), menu);
    for (const tag of ['button', 'input', 'select', 'textarea']) add(tag, element(tag, 0, 0, 160, 90, { backgroundColor: '#fff' }));
    assert.deepEqual(pixel(draw(), 80, 45), [18, 52, 86, 255]);
});

test('hidden elements and hidden ancestors stay out, while visible children can extend outside a zero sized reticle container', () => {
    const parent = element('div', 0, 0, 0, 0), child = element('div', 75, 40, 10, 10, { backgroundColor: '#fff' });
    parent.children.push(child); child.parentElement = parent;
    add('reticleContainer', parent);
    assert.deepEqual(pixel(draw(), 80, 45), [255, 255, 255, 255]);
    parent.css.display = 'none';
    assert.notDeepEqual(pixel(draw(), 80, 45), [255, 255, 255, 255]);
    ids.set('game', child);
    assert.notDeepEqual(pixel(draw(), 80, 45), [255, 255, 255, 255], 'a root with a hidden parent is hidden too');
});

test('health rings keep their stroke, gap and rotation', () => {
    const circle = element('circle', 60, 25, 40, 40, { fill: 'none', stroke: '#fff', strokeWidth: '4px', strokeDasharray: '31.4159px', strokeDashoffset: '0px' });
    circle.cx = circle.cy = { baseVal: { value: 0 } }; circle.r = { baseVal: { value: 20 } };
    circle.getScreenCTM = () => ({ a: 0, b: 1, c: -1, d: 0, e: 80, f: 45 });
    add('health', circle);
    assert.deepEqual(pixel(draw(), 67, 60), [255, 255, 255, 255], 'the white quarter starts at the bottom');
    assert.notDeepEqual(pixel(draw(), 93, 60), [255, 255, 255, 255], 'the next quarter is the gap');
    circle.css.strokeDashoffset = '31.4159px';
    assert.notDeepEqual(pixel(draw(), 67, 60), [255, 255, 255, 255], 'the health changes on the next frame');
});

test('reticle bars rotate instead of becoming bounding rectangles', () => {
    const bar = element('div', 70, 40, 20, 4, { width: '4px', height: '20px', backgroundColor: '#fff', transform: 'matrix(0, 1, -1, 0, 0, 0)' });
    add('reticleContainer', bar);
    assert.deepEqual(pixel(draw(), 80, 42), [255, 255, 255, 255]);
    assert.notDeepEqual(pixel(draw(), 80, 50), [255, 255, 255, 255]);
});

test('ammo text is drawn from the current text nodes', () => {
    const ammo = element('h2', 100, 60, 50, 15);
    ammo.childNodes.push({ nodeType: 3, textContent: '12/180', rect: { left: 100, top: 60, width: 50, height: 15 } });
    add('weaponBox', ammo);
    const before = draw().toBuffer('image/png');
    ammo.childNodes[0].textContent = '0/168';
    assert.notDeepEqual(draw().toBuffer('image/png'), before);
});

const iconCanvas = createCanvas(10, 10);
iconCanvas.getContext('2d').fillStyle = '#0f0'; iconCanvas.getContext('2d').fillRect(0, 0, 10, 10);
const icon = await loadImage(iconCanvas.toBuffer('image/png'));
Object.assign(icon, element('img', 100, 60, 10, 10));
for (const [key, value] of Object.entries({ complete: true, naturalWidth: 10, currentSrc: '', crossOrigin: '', src: 'https://game.test/img/grenadeIcon.png' })) Object.defineProperty(icon, key, { value, writable: true });
test('loaded grenade icons are captured, unready and unsafe images do not break the video', () => {
    add('weaponBox', icon);
    assert.deepEqual(pixel(draw(), 105, 65), [0, 255, 0, 255]);
    icon.complete = false;
    assert.notDeepEqual(pixel(draw(), 105, 65), [0, 255, 0, 255]);
    icon.complete = true; icon.src = 'https://elsewhere.test/icon.png';
    assert.notDeepEqual(pixel(draw(), 105, 65), [0, 255, 0, 255]);
});

test('replay panels are excluded, effects cover the hud, and painting restores the canvas state', () => {
    const panel = add('lrPanel', element('div', 0, 0, 160, 90, { backgroundColor: '#0f0' }));
    panel.className = 'lrPanel';
    add('health', element('div', 70, 60, 20, 20, { backgroundColor: '#f00' }));
    assert.deepEqual(pixel(draw(), 10, 10), [18, 52, 86, 255]);
    context.ReplayFx = { flashEl: { css: { opacity: '1' } } };
    assert.deepEqual(pixel(draw(), 80, 70), [255, 255, 255, 255]);
    const out = createCanvas(160, 90), ctx = out.getContext('2d');
    ctx.fillStyle = '#abcdef'; ctx.globalAlpha = 0.4;
    const transform = ctx.getTransform();
    H.paint(ctx, game, { w: 160, h: 90 }, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const reference = createCanvas(1, 1), referenceCtx = reference.getContext('2d');
    referenceCtx.fillStyle = '#abcdef'; referenceCtx.globalAlpha = 0.4; referenceCtx.fillRect(0, 0, 1, 1);
    assert.deepEqual(pixel(out, 0, 0), pixel(reference, 0, 0));
    assert.deepEqual(ctx.getTransform(), transform);
});

console.log(passed + ' passed');
