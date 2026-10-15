// Persistent cache for pathfinding's expensive, never-changing answers.
//
// Searching a map means asking the collision system thousands of "would a bot fit here?" questions
// (collision probes) and running the physics simulation on candidate moves ("can a bot actually
// get from A to B?"). Both depend only on the map and on how the bot moves - not on where anybody
// is - so the answers can be reused for the whole life of a room (pathfinding.js and
// physicsSimulation.js already do that). This file carries them across restarts too: everything a
// room has worked out is saved under store/ in this plugin, and loaded again the next time a room
// on that map starts - so a fresh server doesn't start with a cold, slow first minute.
//
// It is a LEARNED cache, not a precomputed one: it contains whatever searches have asked so far, and
// grows as bots explore more of the map (bench-pathfinding.js --warm can fill it in advance offline).
//
// File: store/<map name>-<map hash>.json.gz. A file is only used when ALL of these still match:
//   - the format version of this file,
//   - a fingerprint of the map itself (every block and its rotation, the shape of every collider),
//   - a fingerprint of the code whose behavior the answers encode (collider.js, player.js,
//     physicsSimulation.js, pathfinding.js).
// Anything else is ignored (and replaced the next time it saves) - a stale answer would be worse than
// a slow one, so any doubt means "recompute".
//
// Several rooms (separate worker threads) can learn the same map at once. Saving first merges whatever
// is on disk that this room hasn't seen, then writes to a temporary file and renames it into place, so
// nobody loses another room's learning and nobody ever reads half a file.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { exportGeometryCaches, importGeometryCaches, geometryCacheWrites, geometryCacheStats } from './pathfinding.js';
import { exportEdgeCache, importEdgeCache, edgeCacheWrites, edgeCacheSize } from './physicsSimulation.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export const STORE_VERSION = 1;
const here = path.dirname(fileURLToPath(import.meta.url));

let storeDir = path.join(here, 'store');
let enabled = true;
let sourceSalt = '';
let compress = true;

export function setStoreEnabled(value) { enabled = !!value; }
export function isStoreEnabled() { return enabled; }
// Whether new saves are gzipped (store/<name>.json.gz) or plain (store/<name>.json). Either kind is read.
export function setStoreCompression(value) { compress = !!value; }
export function setStoreDir(dir) { storeDir = dir; }
export function getStoreDir() { return storeDir; }
// Folded into the code fingerprint; lets tests simulate "the physics code changed".
export function setSourceSalt(salt) { sourceSalt = String(salt); cachedSourceHash = null; }

// --- fingerprints --------------------------------------------------------------------------

let cachedSourceHash = null;
function sourceFingerprint() {
    if (cachedSourceHash) return cachedSourceHash;
    const h = crypto.createHash('sha1');
    h.update(`v${STORE_VERSION};${sourceSalt};`);
    const root = path.join(here, '..', '..');
    for (const file of [path.join(root, 'src', 'shell', 'collider.js'), path.join(root, 'src', 'shell', 'player.js'), path.join(here, 'physicsSimulation.js'), path.join(here, 'pathfinding.js')]) {
        try { h.update(fs.readFileSync(file)); } catch { h.update('missing:' + path.basename(file)); };
    };
    return (cachedSourceHash = h.digest('hex'));
}

// A hash of everything about the map that could change a collision answer: its size, every placed
// block (position, mesh and rotation), and, per kind of block, its collider type and the actual
// vertices of its collision mesh.
export function fingerprintMap(room) {
    const map = room.map;
    const h = crypto.createHash('sha1');
    h.update(`dims:${map.width},${map.height},${map.depth};`);

    const ints = [], floats = [];
    const flush = () => {
        if (ints.length) { h.update(Buffer.from(new Int32Array(ints).buffer)); ints.length = 0; };
        if (floats.length) { h.update(Buffer.from(new Float64Array(floats).buffer)); floats.length = 0; };
    };
    const kinds = new Map();
    for (let x = 0; x < map.width; x++) for (let y = 0; y < map.height; y++) for (let z = 0; z < map.depth; z++) {
        const cell = map.data[x]?.[y]?.[z];
        if (!cell || !cell.idx) continue;
        ints.push(x, y, z, cell.idx);
        floats.push(cell.rx || 0, cell.ry || 0, cell.rz || 0);
        if (ints.length >= 40000) flush();
        if (!kinds.has(cell.idx)) kinds.set(cell.idx, cell);
    };
    flush();

    for (const [idx, cell] of [...kinds].sort((a, b) => a[0] - b[0])) {
        const mesh = room.mapMeshes?.[idx];
        h.update(`kind${idx}:${mesh?.colliderType ?? cell.mesh?.colliderType};${cell.colliderPrecise ? 1 : 0};${cell.colliderChildren ? 1 : 0};`);
        const positions = cell.colliderMesh?.getVerticesData?.('position');
        if (positions && positions.length) h.update(Buffer.from(Float64Array.from(positions).buffer));
    };
    return h.digest('hex');
}

// --- per-room state ------------------------------------------------------------------------

const states = new WeakMap();
const safeName = (name) => String(name ?? 'map').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'map';
const writesNow = () => geometryCacheWrites() + edgeCacheWrites();

function newState() {
    return { loading: null, file: null, base: null, readFrom: null, mapName: null, mapHash: null, sourceHash: null, baseline: 0, lastMtime: 0, saving: false, timer: null, lastSave: null, loaded: null };
}

// Reads the room's file (if there is one and it matches) into the in-memory caches.
async function readInto(room, st) {
    const file = st.readFrom && !fs.existsSync(st.file) ? st.readFrom : st.file;
    let stat;
    try { stat = await fs.promises.stat(file); } catch { return { loaded: false, reason: 'no file yet' }; }
    const ms = {};
    let t = performance.now();
    const lap = (name) => { const n = performance.now(); ms[name] = n - t; t = n; };
    let data;
    try {
        const raw = await fs.promises.readFile(file); lap('read');
        const buf = file.endsWith('.gz') ? await gunzip(raw) : raw; lap('unzip');
        const text = buf.toString('utf8'); lap('decode');
        data = JSON.parse(text); lap('parse');
    } catch (error) { return { loaded: false, reason: 'unreadable: ' + error.message }; }

    if (data.version !== STORE_VERSION) return { loaded: false, reason: 'old format' };
    if (data.mapHash !== st.mapHash) return { loaded: false, reason: 'map changed' };
    if (data.sourceHash !== st.sourceHash) return { loaded: false, reason: 'game or pathfinding code changed' };

    const added = importGeometryCaches(room, data.geometry) + importEdgeCache(room, data.edges); lap('import');
    st.lastMtime = stat.mtimeMs;
    ms.total = ms.read + ms.unzip + ms.decode + ms.parse + ms.import;
    // 'blocking' is the part that held up the game loop: unzip and file reads run off-thread.
    ms.blocking = ms.decode + ms.parse + ms.import;
    return { loaded: true, added, bytes: stat.size, ms };
}

// Loads this map's saved answers into the room (once per room), and starts the autosave timer.
// Safe to call from every bot's init(); never throws - a missing or bad file just means starting cold.
export function loadGeometryCache(room, { autosave = true, autosaveMs = 30000, minNewEntries = 25 } = {}) {
    if (!enabled || !room || !room.map || !room.Collider) return Promise.resolve({ loaded: false, reason: 'disabled' });
    let st = states.get(room);
    if (st) return st.loading;
    st = newState();
    states.set(room, st);

    st.loading = (async () => {
        try {
            st.mapName = room.minMap?.name ?? room.mapId ?? 'map';
            st.mapHash = fingerprintMap(room);
            st.sourceHash = sourceFingerprint();
            st.base = path.join(storeDir, `${safeName(st.mapName)}-${st.mapHash.slice(0, 12)}`);
            st.file = st.base + (compress ? '.json.gz' : '.json');
            // Whichever kind already exists is the one to read (and keep writing, until the setting says otherwise).
            if (!fs.existsSync(st.file)) { const other = st.base + (compress ? '.json' : '.json.gz'); if (fs.existsSync(other)) st.readFrom = other; }
            const result = await readInto(room, st);
            st.loaded = result;
            st.baseline = writesNow();
            if (autosave) {
                st.timer = setInterval(() => { saveGeometryCache(room, { minNew: minNewEntries }).catch(() => { }); }, autosaveMs);
                st.timer.unref?.();
            };
            return result;
        } catch (error) {
            return { loaded: false, reason: 'error: ' + error.message };
        };
    })();
    return st.loading;
}

// Writes the room's answers to disk. By default only when at least `minNew` new answers have been learned since
// the last save/load; `force` saves regardless. Returns { saved, bytes, ... } or { saved: false, reason }.
export async function saveGeometryCache(room, { force = false, minNew = 1 } = {}) {
    const st = states.get(room);
    if (!enabled || !st) return { saved: false, reason: 'not loaded' };
    await st.loading;
    if (!st.file) return { saved: false, reason: 'no file' };
    if (st.saving) return { saved: false, reason: 'busy' };
    if (!force && writesNow() - st.baseline < minNew) return { saved: false, reason: 'nothing new' };

    st.saving = true;
    try {
        // Another room (worker) may have saved since we last looked: merge its answers in first.
        try {
            const stat = await fs.promises.stat(st.file);
            if (stat.mtimeMs > st.lastMtime) await readInto(room, st);
        } catch { }

        const ms = {};
        let t = performance.now();
        const lap = (name) => { const n = performance.now(); ms[name] = n - t; t = n; };
        const geometry = exportGeometryCaches(room);
        const edges = exportEdgeCache(room); lap('export');
        const json = JSON.stringify({ version: STORE_VERSION, mapName: st.mapName, mapHash: st.mapHash, sourceHash: st.sourceHash, savedAt: new Date().toISOString(), geometry, edges }); lap('stringify');
        const gz = compress ? await gzip(json, { level: 6 }) : Buffer.from(json, 'utf8'); lap(compress ? 'gzip' : 'encode');

        st.file = st.base + (compress ? '.json.gz' : '.json');
        await fs.promises.mkdir(storeDir, { recursive: true });
        const tmp = `${st.file}.${process.pid}.${Date.now()}.tmp`;
        await fs.promises.writeFile(tmp, gz);
        try { await fs.promises.rename(tmp, st.file); }
        catch { await new Promise((r) => setTimeout(r, 50)); await fs.promises.rename(tmp, st.file); }
        lap('write');
        ms.blocking = ms.export + ms.stringify + (compress ? 0 : ms.encode); // gzip and the write run off-thread
        st.lastMtime = (await fs.promises.stat(st.file)).mtimeMs;
        st.baseline = writesNow();
        // Only one kind of file per map: remove the other one (a plain file left over after switching to gzip, or the reverse).
        await Promise.all([st.base + '.json', st.base + '.json.gz'].filter((alt) => alt !== st.file).map((alt) => fs.promises.unlink(alt).catch(() => { })));
        st.readFrom = null;
        st.lastSave = {
            at: Date.now(), bytes: gz.length, rawBytes: json.length, ms,
            probes: geometry.probes.reduce((n, [, flat]) => n + flat.length / 4, 0), queries: geometry.queries.length, edges: edges.length,
        };
        pruneStale(st).catch(() => { });
        return { saved: true, ...st.lastSave, file: st.file };
    } catch (error) {
        return { saved: false, reason: 'error: ' + error.message };
    } finally {
        st.saving = false;
    };
}

// Other files for the same map name but a different fingerprint belong to an older version of the
// map or code and will never match again.
async function pruneStale(st) {
    const prefix = `${safeName(st.mapName)}-`;
    const keep = [path.basename(st.file), st.base ? path.basename(st.base) + '.json' : '', st.base ? path.basename(st.base) + '.json.gz' : ''];
    for (const name of await fs.promises.readdir(storeDir)) {
        if (keep.includes(name) || !name.startsWith(prefix)) continue;
        if (/^[0-9a-f]{12}\.json(\.gz)?$/.test(name.slice(prefix.length))) await fs.promises.unlink(path.join(storeDir, name)).catch(() => { });
        else if (name.endsWith('.tmp')) {
            const stat = await fs.promises.stat(path.join(storeDir, name)).catch(() => null);
            if (stat && Date.now() - stat.mtimeMs > 3600e3) await fs.promises.unlink(path.join(storeDir, name)).catch(() => { });
        };
    };
}

export function geometryStoreStats(room) {
    const st = states.get(room);
    const counts = geometryCacheStats(room);
    return {
        enabled,
        file: st?.file ?? null,
        loaded: st?.loaded ?? null,
        entries: { probes: counts.probes, queries: counts.queries, edges: edgeCacheSize(room) },
        newSinceSave: st ? writesNow() - st.baseline : 0,
        lastSave: st?.lastSave ?? null,
    };
}

// Deletes the saved file (the in-memory caches stay: they're still correct).
export async function clearGeometryStore(room) {
    const st = states.get(room);
    if (!st || !st.file) return false;
    let removed = false;
    for (const file of new Set([st.file, st.base + '.json', st.base + '.json.gz'])) {
        try { await fs.promises.unlink(file); removed = true; } catch { }
    };
    st.lastMtime = 0;
    st.lastSave = null;
    return removed;
}

export function stopGeometryAutosave(room) {
    const st = states.get(room);
    if (st?.timer) { clearInterval(st.timer); st.timer = null; };
}
