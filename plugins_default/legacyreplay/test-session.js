//legacyshell: seeking must keep the game's camera alive. node plugins_default/legacyreplay/test-session.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import BABYLON from 'babylonjs';

var engine = new BABYLON.NullEngine();
var scene = new BABYLON.Scene(engine);
var oldEye = new BABYLON.Mesh('oldEye', scene);
var oldCamera = new BABYLON.FreeCamera('oldCamera', BABYLON.Vector3.Zero(), scene);
oldCamera.parent = oldEye;
scene.activeCameras.push(oldCamera);
oldEye.dispose();
assert.ok(!scene.cameras.includes(oldCamera));
assert.ok(!scene.activeCameras.includes(oldCamera));

var camera = new BABYLON.FreeCamera('camera', BABYLON.Vector3.Zero(), scene);
scene.activeCameras.push(camera);
var players = [];
var context = vm.createContext({
    TextEncoder, TextDecoder, camera, me: {}, meId: 254, viewingPlayer: null, viewingPlayerId: null,
    plugins: { on: function () {} },
    ReplayCamera: { releaseFirstPerson: function () {} },
    iteratePlayers: (fn) => players.slice().forEach(fn),
    removePlayer: (id) => players.find((p) => p.id === id).actor.mesh.dispose(),
    itemManager: { recycleAllItems: function () {} },
    munitionsManager: Object.fromEntries(['bulletPool', 'rocketPool', 'grenadePool'].map((name) => [name, { forEachActive: function () {} }])),
});
vm.runInContext(fs.readFileSync(new URL('./format.js', import.meta.url), 'utf8').replace('export const ReplayFormat', 'globalThis.ReplayFormat'), context);
vm.runInContext(fs.readFileSync(new URL('./session.js', import.meta.url), 'utf8').replace('export const ReplaySession', 'globalThis.ReplaySession'), context);

//the real disposal path: the watched eye is a descendant of the player's mesh
for (var i = 0; i < 5; i++) {
    var mesh = new BABYLON.Mesh('player', scene);
    var eye = new BABYLON.Mesh('eye', scene);
    eye.parent = mesh;
    camera.parent = eye;
    camera.lockedTarget = mesh;
    players = [{ id: 1, actor: { mesh, eye } }];
    context.ReplaySession.resetWorld();
    assert.equal(camera.parent, null);
    assert.equal(camera.lockedTarget, null);
    assert.ok(scene.cameras.includes(camera), 'seek disposed the game camera');
    assert.ok(scene.activeCameras.includes(camera), 'seek removed the game camera from rendering');
    assert.ok(!scene.meshes.includes(mesh));
    assert.ok(!scene.meshes.includes(eye));
    scene.render();
};
//items a replay's players have that the game lost: added while it is open, then taken out again
var fakeCatalog = { Items: [{ id: 1 }], setups: 0, findItemById: function (id) { return this.Items.find((i) => i.id === id) || null }, setupCatalog: function () { this.setups++ } };
context.catalog = fakeCatalog;
context.ReplaySession.header = { items: [{ id: 1 }, { id: 99, name: 'gone' }, { id: 'x' }, { name: 'no id' }] };
context.ReplaySession.mergeItems();
assert.deepEqual(fakeCatalog.Items.map((i) => i.id), [1, 99]);
assert.equal(fakeCatalog.setups, 1);
context.ReplaySession.mergeItems(); //already there now
assert.deepEqual(fakeCatalog.Items.map((i) => i.id), [1, 99]);
context.ReplaySession.unmergeItems();
assert.deepEqual(fakeCatalog.Items.map((i) => i.id), [1]);
assert.equal(fakeCatalog.setups, 2);
console.log('ok    items the game lost are added for the replay and taken out after');

//hiding names: made up at the moment players are built, the dummy for me is left alone
var built = [];
context.addPlayer = (data) => built.push(data);
context.LegacySettings = { get: () => true };
context.ReplaySession.wrapAddPlayer();
context.addPlayer({ id: 3, name: 'real', username: 'someone', x: 1 });
context.addPlayer({ id: 254, name: '', username: '' });
assert.deepEqual([built[0].name, built[0].username, built[0].x], ['Player 3', '', 1]);
assert.equal(built[1].name, '');
context.LegacySettings = { get: () => false };
context.addPlayer({ id: 4, name: 'kept' });
assert.equal(built[2].name, 'kept');
context.ReplaySession.unwrapAddPlayer();
assert.equal(context.addPlayer.toString().includes('built.push'), true);
console.log('ok    names can be hidden, and only when the setting is on');

//watching live: records are added to the end as they arrive, and what doesn't fit is left out
var S = context.ReplaySession, T = context.ReplayFormat.Type, plain = (x) => JSON.parse(JSON.stringify(x)); //what the vm made has its own prototypes
S.active = true; S.live = true; S.records = []; S.markers = []; S.kills = []; S.duration = 0; S.header = { syncFrames: 6 };
var entry = context.ReplayFormat.syncEntrySize(6);
S.liveRecord(T.packets, 100, new Uint8Array([1]));
S.liveRecord(T.sync, 200, new Uint8Array(entry));
S.liveRecord(T.sync, 250, new Uint8Array(entry - 1)); //not a whole entry
S.liveRecord(T.marker, 300, new TextEncoder().encode(JSON.stringify({ label: 'kill', kind: 'kill', a: 3, b: 4 })));
S.liveRecord(T.marker, 310, new TextEncoder().encode('not json'));
S.liveRecord(T.packets, 50, new Uint8Array([2])); //late: never backwards
assert.deepEqual(plain(S.records.map((r) => [r.type, r.tMs])), [[T.packets, 100], [T.sync, 200], [T.marker, 300], [T.packets, 300]]);
assert.deepEqual(plain(S.kills), [{ tMs: 300, by: 3, victim: 4 }]);
assert.equal(S.duration, 300);
assert.deepEqual(plain(S.records[2].data), { label: 'kill', kind: 'kill', a: 3, b: 4 });
S.live = false;
S.liveRecord(T.packets, 400, new Uint8Array([9])); //once it has ended nothing more is added
assert.equal(S.records.length, 4);
S.active = false;
console.log('ok    live records go on the end as they arrive');

//a player drawn from the recorded syncs: smooth between them, held across a teleport, and the shortest way round when the aim wraps
context.ReplayCamera.angleDiff = (to, from) => { var d = (to - from) % (2 * Math.PI); return d > Math.PI ? d - 2 * Math.PI : d < -Math.PI ? d + 2 * Math.PI : d };
var frames = (yaw) => Array.from({ length: 6 }, (_, i) => yaw + i * 0.01);
var path = { t: [0, 100, 200, 300, 400], x: [0, 1, 2, 50, 51], y: [0, 0, 0, 0, 0], z: [0, 0, 0, 0, 0], yaw: [frames(6.2), frames(6.2), frames(6.2), frames(0.1), frames(0.1)], pitch: [frames(0), frames(0), frames(0), frames(0), frames(0)] };
var S2 = context.ReplaySession;
assert.ok(Math.abs(S2.pathAt(path, 50).x - 0.5) < 1e-9, 'halfway between two syncs on a straight line');
assert.ok(Math.abs(S2.pathAt(path, 150).x - 1.5) < 1e-9);
assert.equal(S2.pathAt(path, 250).x, 2, 'a teleport is held at where they were until the sync it happens at');
assert.ok(Math.abs(S2.pathAt(path, 350).x - 50.5) < 0.2, 'and on from there');
assert.equal(S2.pathAt(path, -5), null, 'before the first sync there is nothing');
var steps = [], last = null;
for (var tm = 0; tm <= 190; tm += 5) { var p = S2.pathAt(path, tm).x; if (last !== null) steps.push(p - last); last = p };
assert.ok(Math.max(...steps) - Math.min(...steps) < 1e-6, 'even steps along a straight line, no wobble every sync');
var wrap = S2.pathAt(path, 299.9).yaw;
assert.ok(wrap > 6.2 - 0.001, 'aim at the end of the gap before the wrap is where it was');
var across = S2.pathAt({ ...path, t: [0, 100], x: [0, 0], y: [0, 0], z: [0, 0], yaw: [[6.2, 6.2, 6.2, 6.2, 6.2, 6.2], [0.1, 0.1, 0.1, 0.1, 0.1, 0.1]], pitch: [frames(0), frames(0)] }, 99.9).yaw;
assert.ok(across > 6.2 || across < 0.2, 'turns through 0, not all the way back: ' + across);
console.log('ok    paths from the syncs are smooth, held across teleports, and wrap the aim the short way');

//bytes taken for commands: the rest of the record is dropped instead of run as commands, and it is said once where
context.Comm = { Code: { gameJoined: 0, keyUp: 5, controlKeys: 4, chat: 3, sync: 6 } };
var S3 = context.ReplaySession, said = [], realLog = context.console;
context.console = { log: (...args) => said.push(args.join(' ')) };
S3.plugins = { cancel: false };
S3.current = { type: 5, tMs: 7118, data: new Uint8Array([6, 0, 90, 203, 2]) };
S3.warned = false; S3.recent = [];
var lostInput = { buffer: new Uint8Array(47), idx: 3 };
S3.sanitize({ cmd: 6, cmdName: 'sync', input: lostInput });
assert.equal(lostInput.idx, 3, 'a command the game knows is left alone');
S3.sanitize({ cmd: 90, cmdName: 'unknownCode', input: lostInput });
assert.equal(lostInput.idx, 47, 'an unknown command drops the rest');
assert.equal(S3.plugins.cancel, true);
var again = { buffer: new Uint8Array(47), idx: 5 };
S3.sanitize({ cmd: 5, cmdName: 'keyUp', input: again });
assert.equal(again.idx, 47, 'so does one that is never in a recording');
assert.equal(said.length, 1, 'said once: ' + said.length);
assert.ok(/7118 ms/.test(said[0]) && /command 90/.test(said[0]), said[0]);
context.console = realLog;
console.log('ok    bytes mistaken for commands are dropped, and said once');

scene.dispose();
engine.dispose();
console.log('ok    repeated seeks preserve the rendering camera');

//moving blocks run on the replay's time, whatever the real clock does
var clock = { seconds: 12, anchor: 5, source: () => 5, now() { return this.seconds + this.source() - this.anchor } };
context.Collider = { platformWorld: { clock } };
var S4 = context.ReplaySession;
S4.active = true; S4.seeking = false; S4.feeding = false; S4.time = 1000;
S4.bindPlatforms();
assert.equal(clock.now(), 12, 'binding does not move the blocks');
S4.time = 3500;
assert.equal(clock.now(), 14.5, 'they follow the replay');
S4.time = 3500;
assert.equal(clock.now(), 14.5, 'and stand still when it does');
clock.observe = undefined; S4.bindPlatforms();
assert.equal(clock.replay, true);
console.log('ok    moving blocks follow the replay clock');
