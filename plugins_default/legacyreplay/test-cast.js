//legacyshell: casting join test, the main thread side. node plugins_default/legacyreplay/test-cast.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import Comm from '#comm';
import { ReplayCast } from './cast.js';

var passed = 0;
async function test(name, fn) {
    try {
        await fn();
        passed++;
        console.log("ok   ", name);
    } catch (e) {
        console.log("FAIL ", name, "\n", e);
        process.exitCode = 1;
    };
};

const handlers = {};
ReplayCast.registerListeners({ on: (event, fn) => handlers[event] = fn });

const fakeWs = () => { const ws = new EventEmitter(); ws.closed = null; ws.close = (code) => ws.closed = code ?? true; return ws };
const fakeRoom = () => { const posted = []; return { wsIdx: 5, wsMap: new Map(), worker: { postMessage: (m) => posted.push(m) }, posted } };
const join = (extraParams, userLookup, session = "s") => { const room = fakeRoom(), ws = fakeWs(); return { room, ws, data: { msg: { extraParams, session }, ws, room, ip: "1.2.3.4", userLookup, handled: false } } };

await test("a normal join is left alone", async () => {
    const { data, ws } = join({}, Promise.resolve({ userData: { adminRoles: 0 }, sessionData: {} }));
    await handlers['game:beforeJoinRoom'](data);
    assert.equal(data.handled, false);
    assert.equal(ws.closed, null);
    const found = { msg: { extraParams: {} }, skipFull: false };
    handlers['game:joinGameFound'](found);
    assert.equal(found.skipFull, false);
});

await test("a cast join doesn't need a free slot", async () => {
    const found = { msg: { extraParams: { replayCast: true } }, skipFull: false };
    handlers['game:joinGameFound'](found);
    assert.equal(found.skipFull, true);
});

await test("no session, a player's account, or a lookup that found nothing: refused, and never a player join", async () => {
    for (const [name, lookup, session] of [["no session", Promise.resolve({ userData: { adminRoles: 20 }, sessionData: {} }), ""], ["member", Promise.resolve({ userData: { adminRoles: 0 }, sessionData: {} }), "s"], ["no account", Promise.resolve(null), "s"], ["content creator", Promise.resolve({ userData: { adminRoles: 5 }, sessionData: {} }), "s"]]) {
        const { data, ws, room } = join({ replayCast: true }, lookup, session);
        await handlers['game:beforeJoinRoom'](data);
        assert.equal(data.handled, true, name);
        assert.equal(ws.closed, Comm.Close.booted, name);
        assert.equal(room.wsMap.size, 0, name);
        assert.equal(room.posted.length, 0, name);
    };
});

await test("a moderator (or above) is registered like a player's socket and the room's worker is told", async () => {
    for (const adminRoles of [10, 20, 255]) {
        const { data, ws, room } = join({ replayCast: true }, Promise.resolve({ userData: { adminRoles } }));
        await handlers['game:beforeJoinRoom'](data);
        assert.equal(data.handled, true);
        assert.equal(ws.closed, null);
        assert.equal(ws.wsId, 5);
        assert.equal(room.wsIdx, 6);
        assert.equal(room.wsMap.get(5), ws);
        assert.deepEqual(room.posted, [["adminCommand", { replayCast: 5 }]]);
    };
});

await test("what a caster sends is ignored (the join handler would read it as another join), and leaving tells the worker", async () => {
    const { data, ws, room } = join({ replayCast: true }, Promise.resolve({ userData: { adminRoles: 10 }, sessionData: {} }));
    ws.on('message', () => { throw new Error("the old handler must be gone") });
    await handlers['game:beforeJoinRoom'](data);
    ws.emit('message', Buffer.from([1, 2, 3]));
    ws.emit('close');
    assert.equal(room.wsMap.size, 0);
    assert.deepEqual(room.posted.at(-1), ["adminCommand", { replayCastStop: 5 }]);
});

console.log(passed + " passed");
