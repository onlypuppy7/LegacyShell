// Tests for geometryStore.js (the on-disk pathfinding cache) and the in-memory caches behind it.
// Offline: synthetic rooms with a counting mock collider, and a temporary store directory.
//
// Run with: node plugins_default/deadinternet/test-geometry-store.js

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    fingerprintMap, loadGeometryCache, saveGeometryCache, geometryStoreStats, clearGeometryStore,
    setStoreDir, setStoreEnabled, setStoreCompression, setSourceSalt, stopGeometryAutosave,
} from './geometryStore.js';
import { isStandable, geometryCacheStats, exportGeometryCaches, importGeometryCaches } from './pathfinding.js';
import { simulateEdgeCached, edgeCacheSize, exportEdgeCache } from './physicsSimulation.js';

let passed = 0, failed = 0;
const assert = (name, ok, detail = '') => { if (ok) { passed++; console.log(`  ok - ${name}`); } else { failed++; console.log(`  FAIL - ${name}${detail ? ` (${detail})` : ''}`); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'di-store-'));
setStoreDir(tmp);
const listStore = () => fs.readdirSync(tmp).sort();

function makeMap(width, height, depth, rotate = 0) {
    const data = [];
    for (let x = 0; x < width; x++) { data[x] = []; for (let y = 0; y < height; y++) { data[x][y] = []; for (let z = 0; z < depth; z++) data[x][y][z] = {}; } }
    for (let x = 0; x < width; x++) for (let z = 0; z < depth; z++) data[x][0][z] = { idx: 1, mesh: { colliderType: 'full' }, rx: 0, ry: 0, rz: 0 };
    for (let x = 3; x < 6; x++) data[x][1][4] = { idx: 2, mesh: { colliderType: 'full' }, rx: 0, ry: rotate, rz: 0 }; // a little wall
    return { data, width, height, depth };
}

// A room whose collider counts how often it is asked, and answers from the map like the real one.
function makeRoom(map, name = 'Test Map') {
    let calls = 0;
    const hit = (pos) => {
        const x = Math.floor(pos.x), y = Math.floor(pos.y), z = Math.floor(pos.z);
        const cell = map.data[x]?.[y]?.[z];
        return cell && cell.idx ? { x, y, z, cell, mesh: {} } : false;
    };
    const Collider = { playerCollidesWithMap: (player, pos) => { calls++; return hit(pos); }, pointCollidesWithMap: (pos) => { calls++; return hit(pos); } };
    return { map, Collider, minMap: { name }, mapMeshes: [], calls: () => calls, resetCalls: () => { calls = 0; } };
}
const playerFor = (room, speed = 1) => ({ Collider: room.Collider, modifiers: { scale: 1, speedModifier: speed } });

// Ask the pathfinder the sort of questions a search asks, so the caches fill.
function exercise(room) {
    const p = playerFor(room);
    const answers = [];
    for (let x = 0; x < room.map.width; x++) for (let y = 1; y < 3; y++) for (let z = 0; z < room.map.depth; z++) answers.push(isStandable(room.map, x, y, z, p));
    return answers;
}

console.log('Test: map fingerprint');
{
    const a = fingerprintMap(makeRoom(makeMap(10, 4, 10)));
    assert('the same map always gives the same fingerprint', a === fingerprintMap(makeRoom(makeMap(10, 4, 10))));
    assert('a rotated block changes it', a !== fingerprintMap(makeRoom(makeMap(10, 4, 10, 1.5))));
    assert('a different size changes it', a !== fingerprintMap(makeRoom(makeMap(11, 4, 10))));
    const edited = makeMap(10, 4, 10); edited.data[7][1][7] = { idx: 2, mesh: { colliderType: 'full' }, rx: 0, ry: 0, rz: 0 };
    assert('an added block changes it', a !== fingerprintMap(makeRoom(edited)));
}

console.log('Test: saving and loading');
{
    setStoreEnabled(true); setStoreCompression(true); setSourceSalt('t1');
    const roomA = makeRoom(makeMap(10, 4, 10));
    const loadA = await loadGeometryCache(roomA, { autosave: false });
    assert('first time: nothing to load', loadA.loaded === false && /no file/.test(loadA.reason), JSON.stringify(loadA));
    const answersA = exercise(roomA);
    assert('the in-memory cache filled while exercising', geometryCacheStats(roomA).probes > 100);
    const saved = await saveGeometryCache(roomA, { force: true });
    assert('saves', saved.saved === true && saved.bytes > 0 && saved.probes > 100, JSON.stringify(saved));
    assert('into one gzipped file named for the map and its fingerprint', listStore().length === 1 && /^test-map-[0-9a-f]{12}\.json\.gz$/.test(listStore()[0]), listStore().join(','));
    assert('the save reports how long the game loop was held up', typeof saved.ms.blocking === 'number' && saved.ms.blocking >= 0);

    const roomB = makeRoom(makeMap(10, 4, 10));
    const loadB = await loadGeometryCache(roomB, { autosave: false });
    assert('a new room on the same map loads it', loadB.loaded === true && loadB.added > 100 && loadB.ms.total >= 0, JSON.stringify(loadB));
    roomB.resetCalls();
    const answersB = exercise(roomB);
    assert('...and then answers the same questions with zero collision calls', roomB.calls() === 0, `calls ${roomB.calls()}`);
    assert('...with the same answers', answersA.length === answersB.length && answersA.every((a, i) => !!a === !!answersB[i]));

    // The cached result refers to THIS room's map cells, not the first room's.
    const probe = exportGeometryCaches(roomB);
    assert('cell references point into the new room\'s own map', (() => {
        const p = playerFor(roomB);
        isStandable(roomB.map, 4, 1, 4, p);
        return true;
    })() && probe.probes.length > 0);

    const again = await saveGeometryCache(roomB, { minNew: 1 });
    assert('nothing new learned: it does not rewrite the file', again.saved === false && again.reason === 'nothing new', JSON.stringify(again));

    roomA.Collider.playerCollidesWithMap = () => { throw new Error('should not be asked'); };
    assert('a room with a loaded cache never needs the collider for the same questions', (() => { try { exercise(roomB); return true; } catch { return false; } })());
}

console.log('Test: stale files are ignored');
{
    const base = listStore()[0];
    const changed = makeRoom(makeMap(10, 4, 10, 2.0));
    const r1 = await loadGeometryCache(changed, { autosave: false });
    assert('a changed map does not use the old file', r1.loaded === false && /no file|map changed/.test(r1.reason), JSON.stringify(r1));

    setSourceSalt('t2'); // as if collider/physics/pathfinding code changed
    const sameMap = makeRoom(makeMap(10, 4, 10));
    const r2 = await loadGeometryCache(sameMap, { autosave: false });
    assert('changed game code does not use the old file', r2.loaded === false && /code changed/.test(r2.reason), JSON.stringify(r2));
    setSourceSalt('t1');

    // corrupt it
    fs.writeFileSync(path.join(tmp, base), Buffer.from('this is not gzip'));
    const r3 = await loadGeometryCache(makeRoom(makeMap(10, 4, 10)), { autosave: false });
    assert('a corrupt file is ignored without throwing', r3.loaded === false && /unreadable/.test(r3.reason), JSON.stringify(r3));

    // wrong format version, correctly gzipped
    const zlib = await import('node:zlib');
    fs.writeFileSync(path.join(tmp, base), zlib.gzipSync(JSON.stringify({ version: 0, mapHash: 'x' })));
    const r4 = await loadGeometryCache(makeRoom(makeMap(10, 4, 10)), { autosave: false });
    assert('an old format is ignored', r4.loaded === false && /old format/.test(r4.reason), JSON.stringify(r4));

    // ...and the next save replaces a bad file with a good one
    const heal = makeRoom(makeMap(10, 4, 10));
    await loadGeometryCache(heal, { autosave: false });
    exercise(heal);
    const healed = await saveGeometryCache(heal, { force: true });
    const check = await loadGeometryCache(makeRoom(makeMap(10, 4, 10)), { autosave: false });
    assert('saving over a bad file repairs it', healed.saved && check.loaded === true, JSON.stringify(check));
}

console.log('Test: two rooms learning the same map');
{
    const one = makeRoom(makeMap(10, 4, 10, 0));
    const two = makeRoom(makeMap(10, 4, 10, 0));
    await loadGeometryCache(one, { autosave: false });
    await loadGeometryCache(two, { autosave: false });
    const p1 = playerFor(one), p2 = playerFor(two);
    for (let x = 0; x < 5; x++) isStandable(one.map, x, 1, 7, p1);        // room one learns row 7
    for (let x = 0; x < 5; x++) isStandable(two.map, x, 1, 8, p2);        // room two learns row 8
    await saveGeometryCache(one, { force: true });
    await new Promise((r) => setTimeout(r, 20)); // make sure the file's mtime moves on
    await saveGeometryCache(two, { force: true });
    const third = makeRoom(makeMap(10, 4, 10, 0));
    const loaded = await loadGeometryCache(third, { autosave: false });
    third.resetCalls();
    for (let x = 0; x < 5; x++) { isStandable(third.map, x, 1, 7, playerFor(third)); isStandable(third.map, x, 1, 8, playerFor(third)); }
    assert('the second room to save keeps what the first one learned', loaded.loaded && third.calls() === 0, `calls ${third.calls()}`);
    assert('...and nothing is left half written', !listStore().some((f) => f.endsWith('.tmp')));
}

console.log('Test: plain vs gzip, and housekeeping');
{
    const room = makeRoom(makeMap(10, 4, 10));
    await loadGeometryCache(room, { autosave: false });
    setStoreCompression(false);
    exercise(room);
    const plain = await saveGeometryCache(room, { force: true });
    assert('with compression off it writes plain json', plain.saved && listStore().some((f) => f.endsWith('.json')) && !listStore().some((f) => f.endsWith('.json.gz')), listStore().join(','));
    assert('...which is larger', plain.bytes === plain.rawBytes);
    const room2 = makeRoom(makeMap(10, 4, 10));
    const l = await loadGeometryCache(room2, { autosave: false });
    assert('a plain file loads', l.loaded === true, JSON.stringify(l));
    setStoreCompression(true);
    const room3 = makeRoom(makeMap(10, 4, 10));
    await loadGeometryCache(room3, { autosave: false });
    const gz = await saveGeometryCache(room3, { force: true });
    assert('switching back converts it and removes the plain file', gz.saved && listStore().every((f) => !f.endsWith('.json')) && listStore().some((f) => f.endsWith('.json.gz')), listStore().join(','));
    assert('gzip is much smaller', gz.bytes < gz.rawBytes / 2, `${gz.bytes} vs ${gz.rawBytes}`);

    // a file for the same map name but another fingerprint is stale and gets pruned
    const stale = path.join(tmp, 'test-map-000000000000.json.gz');
    fs.writeFileSync(stale, 'old');
    const room4 = makeRoom(makeMap(10, 4, 10));
    await loadGeometryCache(room4, { autosave: false });
    exercise(room4);
    await saveGeometryCache(room4, { force: true });
    await new Promise((r) => setTimeout(r, 50));
    assert('older files for the same map are cleaned up', !fs.existsSync(stale));
    const other = path.join(tmp, 'another-map-aaaaaaaaaaaa.json.gz');
    fs.writeFileSync(other, 'x');
    await saveGeometryCache(room4, { force: true });
    await new Promise((r) => setTimeout(r, 50));
    assert('...but other maps\' files are left alone', fs.existsSync(other));

    const stats = geometryStoreStats(room4);
    assert('stats report entries and the file', stats.entries.probes > 0 && /test-map-/.test(stats.file) && stats.lastSave?.bytes > 0, JSON.stringify(stats).slice(0, 200));
    assert('clear deletes the file', (await clearGeometryStore(room4)) === true && !listStore().some((f) => f.startsWith('test-map-')));
}

console.log('Test: switching it off');
{
    setStoreEnabled(false);
    const before = listStore().length;
    const room = makeRoom(makeMap(10, 4, 10), 'Off Map');
    const l = await loadGeometryCache(room, { autosave: false });
    exercise(room);
    const s = await saveGeometryCache(room, { force: true });
    assert('disabled: loads nothing and writes nothing', l.loaded === false && s.saved === false && listStore().length === before);
    setStoreEnabled(true);
}

console.log('Test: autosave only writes when something new was learned');
{
    const room = makeRoom(makeMap(10, 4, 10), 'Auto Map');
    await loadGeometryCache(room, { autosave: true, autosaveMs: 40, minNewEntries: 20 });
    await new Promise((r) => setTimeout(r, 120));
    assert('idle: nothing is written', !listStore().some((f) => f.startsWith('auto-map')));
    exercise(room);
    await new Promise((r) => setTimeout(r, 200));
    assert('after learning enough it saves itself', listStore().some((f) => f.startsWith('auto-map') && f.endsWith('.json.gz')), listStore().join(','));
    stopGeometryAutosave(room);
}

console.log('Test: whether a move works depends on how the bot moves');
{
    const room = makeRoom(makeMap(10, 4, 10));
    let sims = 0;
    const mkPlayer = (speed) => {
        const from = { x: 0.5, y: 1, z: 0.5 };
        return {
            ...from, dx: 0, dy: 0, dz: 0, climbing: false, jumping: false, climbingCell: {}, modifiers: { scale: 1, speedModifier: speed },
            Collider: { playerCollidesWithMap: () => true },
            createSnapshot() { return { ...from, climbing: false }; }, restoreSnapshot(s) { Object.assign(this, s); }, jump() { return false; },
            simulateMovement() { sims++; Object.assign(this, { x: 3.5, y: 1, z: 0.5, dy: 0 }); },
        };
    };
    const edge = (p) => simulateEdgeCached(room, p, 'a', 'b', { x: 0.5, y: 1, z: 0.5 }, { x: 3.5, y: 1, z: 0.5 }, { requireSupport: true, maxTicks: 4 });
    edge(mkPlayer(0.6)); const afterFirst = sims;
    edge(mkPlayer(0.62));
    assert('bots whose speeds round to the same 0.1 share a verdict', sims === afterFirst);
    edge(mkPlayer(1.0));
    assert('a bot with a different speed gets its own', sims > afterFirst);
    const entries = exportEdgeCache(room);
    assert('both are kept, apart', edgeCacheSize(room) === 2 && entries.length === 2);
}

stopGeometryAutosave;
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
