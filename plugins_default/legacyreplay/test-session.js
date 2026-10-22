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

scene.dispose();
engine.dispose();
console.log('ok    repeated seeks preserve the rendering camera');
