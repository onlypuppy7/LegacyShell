//legacyshell: the video dialogs open and do what they say, on a stand-in page (no browser needed). node plugins_default/legacyreplay/test-export.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class Node {
    constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.className = ''; this.removed = false; this.clicked = 0 };
    get ownerDocument() { return doc };
    appendChild(child) { this.children.push(child); return child };
    append(...kids) { kids.forEach((kid) => this.appendChild(kid)) };
    remove() { this.removed = true };
    click() { this.clicked++ };
    find(match) { return match(this) ? this : this.children.map((child) => child.find && child.find(match)).find(Boolean) };
};
const doc = { head: new Node('head'), body: new Node('body'), createElement: (tag) => new Node(tag), getElementById: () => null };
const hosted = [];
const revoked = [], created = [];
const context = vm.createContext({
    document: doc, innerWidth: 1600, innerHeight: 900, localStorage: { getItem: () => null, setItem: () => { } },
    MediaRecorder: { isTypeSupported: () => true },
    URL: { createObjectURL: (blob) => { created.push(blob); return 'blob:' + created.length }, revokeObjectURL: (url) => revoked.push(url) },
    Blob, File, navigator: {}, setTimeout: () => 0, window: { open: () => { } },
    ReplayViewer: {
        host: () => ({ ownerDocument: doc, appendChild: (node) => hosted.push(node) }),
        toast: () => { },
        el: (tag, props, children) => {
            const node = new Node(tag);
            Object.keys(props || {}).forEach((key) => key === 'text' ? node.textContent = props[key] : key === 'class' ? node.className = props[key] : node[key] = props[key]);
            (children || []).forEach((child) => node.appendChild(child));
            return node;
        },
    },
    ReplayEditor: { reel: { name: 'r', shots: [{ start: 0, end: 3000, speed: [[0, 1]] }] } },
    ReplayDirector: { rate: () => 1 },
    BABYLON: { Tools: { QueueNewFrame: function original() { return 0 } } },
    engine: { renderEvenInBackground: false, _frameHandler: 7, _bindedRenderFunction: function loop() { context.started++ } },
    started: 0,
    cancelAnimationFrame: (id) => { context.called = id },
    ReplaySession: { sleep: function original() { } },
    Worker: class {
        constructor() { this.timers = []; this.dead = false };
        postMessage(m) {
            if (m.every) { clearInterval(this.every); this.every = setInterval(() => this.onmessage && !this.dead && this.onmessage({ data: { tick: 1 } }), m.every) };
            if (m.after !== undefined) setTimeout(() => this.onmessage && !this.dead && this.onmessage({ data: { done: m.id } }), m.after);
        };
        terminate() { this.dead = true; clearInterval(this.every) };
    },
});
vm.runInContext(fs.readFileSync(new URL('./export.js', import.meta.url), 'utf8').replace('export const ReplayExport', 'globalThis.ReplayExport'), context);
const E = context.ReplayExport;

var passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log('ok   ', name) } catch (e) { console.log('FAIL ', name, '\n', e); process.exitCode = 1 };
};

test('the make a video dialog opens', () => {
    E.open();
    assert.equal(hosted.length, 1, 'it was put on the page');
    assert.ok(hosted[0].find((n) => n.tag === 'button' && n.textContent === 'Start'), 'with a Start button');
});

test('the finished dialog shows the video, saves nothing until Download, and lets the video go on close', () => {
    hosted.length = 0;
    var saved = [], blob = new Blob(['x'], { type: 'video/webm' });
    E.save = (b, name) => saved.push(name);
    E.finished(blob, 'reel.webm', '1920 x 1080, 1.0MB');
    assert.equal(saved.length, 0, 'nothing saved by itself');
    var dialog = hosted[0];
    var video = dialog.find((n) => n.tag === 'video');
    assert.ok(video && video.src === 'blob:' + created.length && video.controls, 'the video is there to play');
    var download = dialog.find((n) => n.tag === 'button' && n.textContent === 'Download');
    download.onclick();
    assert.deepEqual(saved, ['reel.webm'], 'Download saves it');
    dialog.find((n) => n.tag === 'button' && n.textContent === 'Close').onclick();
    assert.ok(dialog.removed && revoked.includes(video.src), 'closing takes the dialog away and lets the video go');
});

await (async () => {
    var name = 'the pacer keeps the game drawing in the background, answers waits and frames, and puts everything back';
    try {
        const original = context.BABYLON.Tools.QueueNewFrame, sleep = context.ReplaySession.sleep;
        const pace = E.pace();
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.equal(context.called, 7, 'the frame the page was waiting for is called off');
        assert.ok(context.started > 0, 'and the loop is started by the worker, without waiting for it');
        assert.equal(context.engine.renderEvenInBackground, true, 'draws when the window is not the one in use');
        assert.notEqual(context.BABYLON.Tools.QueueNewFrame, original, 'the frames come from the worker now');
        const timeout = (ms) => new Promise((resolve) => setTimeout(() => resolve('timed out'), ms));
        assert.notEqual(await Promise.race([pace.after(5), timeout(500)]), 'timed out', 'a wait is answered');
        let frames = 0;
        context.BABYLON.Tools.QueueNewFrame(function again() { frames++; context.BABYLON.Tools.QueueNewFrame(again) });
        assert.notEqual(await Promise.race([new Promise((resolve) => pace.next(resolve)), timeout(500)]), 'timed out', 'a called back frame comes');
        await timeout(40);
        assert.ok(frames > 2, 'the engine own frames keep coming: ' + frames);
        pace.gate = () => false; //held back for the encoder
        await timeout(30);
        const held = frames;
        await timeout(40);
        assert.equal(frames, held, 'no frames while held back');
        pace.gate = null;
        await timeout(40);
        assert.ok(frames > held, 'and they carry on after');
        pace.stop();
        assert.equal(context.BABYLON.Tools.QueueNewFrame, original);
        assert.equal(context.engine.renderEvenInBackground, false);
        assert.equal(context.ReplaySession.sleep, sleep);
        passed++;
        console.log('ok   ', name);
    } catch (e) { console.log('FAIL ', name, String.fromCharCode(10), e); process.exitCode = 1 };
})();

console.log(passed + ' passed');
