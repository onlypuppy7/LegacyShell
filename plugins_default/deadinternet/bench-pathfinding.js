// Real-geometry pathfinding benchmark: boots an actual room offline (real map meshes, real
// Collider, a real bot Player - the same objects a live room worker uses) and times findPath()
// between spawn points. No services/game server needed, and nothing is sent anywhere.
//
// Deliberately does NOT call plugins.loadPlugins() - that `git pull`s every plugin folder.
// The room is built with core code only, which is all findPath() touches.
//
// Usage (from the repo root):
//   node plugins_default/deadinternet/bench-pathfinding.js [mapName|mapId ...] [--pairs N] [--profile] [--repeat N] [--seed N]
// e.g.
//   node plugins_default/deadinternet/bench-pathfinding.js Castle "Two Towers" --pairs 40 --profile
//
// --repeat N  runs the same pair list N times (shows warm-cache behavior; the edge cache persists
//             per room, the geometry cache does not).
// --profile   CPU-profiles the timed searches and prints the top self-time functions.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

if (isMainThread) {
    const args = process.argv.slice(2);
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { args }, stdout: false, stderr: false });
    worker.on('message', (msg) => { if (msg && msg.__bench) console.log(msg.line); });
    worker.on('error', (e) => { console.error('bench worker error:', e); process.exitCode = 1; });
    worker.on('exit', (code) => { process.exit(code); });
} else {
    const say = (line) => parentPort.postMessage({ __bench: true, line });
    const quiet = { log: console.log, info: console.info, warn: console.warn };
    const mute = () => { console.log = () => {}; console.info = () => {}; console.warn = () => {}; };
    const unmute = () => Object.assign(console, quiet);

    const args = workerData.args;
    const flag = (name, fallback) => { const i = args.indexOf(name); if (i < 0) return fallback; const v = args[i + 1]; args.splice(i, 2); return v; };
    const has = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
    const pairsWanted = parseInt(flag('--pairs', '30'), 10);
    const repeat = parseInt(flag('--repeat', '1'), 10);
    let seed = parseInt(flag('--seed', '1'), 10);
    const profile = has('--profile');
    const reverse = has('--reverse');
    const perPair = has('--per-pair');
    const leakTest = has('--leak-test');
    const coldSplit = has('--cold-split');
    const useStore = has('--store');
    const warmCount = parseInt(flag('--warm', '0'), 10);
    const warmSpeed = parseFloat(flag('--speed', '1')); // the speed modifier --warm searches at (physics verdicts are cached per speed, rounded to 0.1)
    const speedTest = has('--speed-test');
    const abFile = flag('--ab', null); // path to another pathfinding module to compare routes against, in-process
    if (has('--verify-probes')) globalThis.__DI_VERIFY_PROBES = [];
    const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

    (async () => {
        mute();
        const fs = await import('node:fs');
        const path = await import('node:path');
        const yaml = (await import('js-yaml')).default;
        const miscModule = await import('#misc');
        miscModule.misc.instantiateSS(import.meta, ['node', 'bench', '--game'], true);
        const ss = miscModule.ss; // a live binding, only set once instantiateSS has run
        const root = ss.rootDir;
        ss.maps = JSON.parse(fs.readFileSync(path.join(root, 'server-game', 'store', 'maps.json'), 'utf8'));
        ss.items = JSON.parse(fs.readFileSync(path.join(root, 'server-game', 'store', 'items.json'), 'utf8'));
        ss.permissions = yaml.load(fs.readFileSync(path.join(root, 'store', 'config', 'distributed_permissions.yaml'), 'utf8'));
        await (await import('#items')).initItems();
        const RoomConstructor = (await import('#rooms')).default;
        const Comm = (await import('#comm')).default;
        const { DeadInternetBot } = await import('./index.js');
        if (typeof (await import('./index.js')).setStoreEnabled === 'function') (await import('./index.js')).setStoreEnabled(useStore);
        const pathfinding = await import('./pathfinding.js');
        const { findPath } = pathfinding;
        unmute();

        const wanted = args.length ? args : ['Castle'];
        const mapIds = wanted.map((w) => /^\d+$/.test(w) ? parseInt(w, 10) : ss.maps.findIndex((m) => m.name.toLowerCase() === w.toLowerCase()));
        if (mapIds.some((i) => i < 0 || !ss.maps[i])) { say(`unknown map in: ${wanted.join(', ')} (have: ${ss.maps.map((m, i) => `${i}:${m.name}`).join(', ')})`); process.exit(1); };

        let session = null;
        if (profile) {
            const { Session } = await import('node:inspector');
            session = new Session();
            session.connect();
            const post = (m, p) => new Promise((res, rej) => session.post(m, p ?? {}, (e, r) => (e ? rej(e) : res(r))));
            session.postAsync = post;
            await post('Profiler.enable');
            await post('Profiler.setSamplingInterval', { interval: 100 });
        };

        for (const mapId of mapIds) {
            mute();
            const room = new RoomConstructor({ gameType: 0, mapId, gameId: 1, gameKey: 784, joinType: Comm.Code.createPrivateGame, locked: false, extraParams: {} });
            ss.room = room; // core helpers like iteratePlayers read the current room from here (worker.js does the same)
            for (let i = 0; i < 600 && !room.map; i++) await new Promise((r) => setTimeout(r, 50));
            if (!room.map) { unmute(); say(`map ${mapId} never finished building`); continue; };
            // Stop the room's own loops: we only want findPath on this thread's clock.
            for (const loop of ['updateLoopObject', 'dataSyncLoopObject', 'metaLoopObject', 'updateRoomDetailsLoopObject', 'spawnItemsLoopObject']) {
                try { room[loop]?.stop?.(); room[loop]?.clear?.(); } catch { };
            };
            const bot = new DeadInternetBot(room, {});
            await bot.init();
            for (const loop of ['updateLoopObject', 'dataSyncLoopObject', 'metaLoopObject', 'updateRoomDetailsLoopObject', 'spawnItemsLoopObject']) {
                try { room[loop]?.stop?.(); room[loop]?.clear?.(); } catch { };
            };
            unmute();

            const player = bot.player;
            const spawns = (room.spawnPoints || []).flat().map((s) => ({ x: Math.floor(s.x) + 0.5, y: s.y, z: Math.floor(s.z) + 0.5 }));
            const pairs = [];
            for (let i = 0; i < pairsWanted && spawns.length > 1; i++) {
                const a = spawns[Math.floor(rng() * spawns.length)];
                let b = a; while (b === a) b = spawns[Math.floor(rng() * spawns.length)];
                pairs.push([a, b]);
            };

            // Count real collider work (the expensive part of geometry/physics checks).
            const counts = { playerCollidesWithMap: 0, pointCollidesWithMap: 0 };
            for (const m of Object.keys(counts)) {
                const original = room.Collider[m]?.bind(room.Collider);
                if (!original) continue;
                room.Collider[m] = (...a) => { counts[m]++; return original(...a); };
            };

            if (reverse) pairs.reverse();

            // --warm N: fill the on-disk geometry cache in advance. Runs N searches - half spawn-to-spawn,
            // half between random standable cells anywhere on the map (so it learns the places a human
            // would actually stand, not just spawn points) - the way the live bots search (snapped goals,
            // partial routes), then saves. Needs --store. Safe to run repeatedly: it only ever adds.
            if (warmCount > 0) {
                const index = await import('./index.js');
                const standable = () => {
                    for (let attempt = 0; attempt < 60; attempt++) {
                        const x = Math.floor(rng() * room.map.width), z = Math.floor(rng() * room.map.depth);
                        for (let y = room.map.height - 2; y >= 1; y--) if (pathfinding.isStandable(room.map, x, y, z, player)) return { x: x + 0.5, y, z: z + 0.5 };
                    };
                    return null;
                };
                const pick = (i) => (i % 2 === 0 && spawns.length > 1) ? spawns[Math.floor(rng() * spawns.length)] : (standable() ?? spawns[Math.floor(rng() * spawns.length)]);
                const t0 = performance.now();
                let none = 0, partial = 0, found = 0;
                for (let i = 0; i < warmCount; i++) {
                    const from = pick(i), to = pick(i + (i % 3));
                    player.respawn(from);
                    Object.assign(player, { x: from.x, y: from.y, z: from.z, dx: 0, dy: 0, dz: 0 });
                    player.modifiers.speedModifier = warmSpeed;
                    mute();
                    const p = findPath(room, player, to, { snapGoal: true, allowPartial: true, maxExpansions: 2500 });
                    unmute();
                    if (!p) none++; else if (p.partial) partial++; else found++;
                    if ((i + 1) % 200 === 0) { const st = pathfinding.geometryCacheStats(room); say('  warm ' + (i + 1) + '/' + warmCount + ': ' + st.probes + ' probes, ' + st.queries + ' lookups  (' + ((performance.now() - t0) / 1000).toFixed(0) + 's)'); };
                };
                const saved = useStore ? await index.saveGeometryCache(room, { force: true }) : null;
                const st = index.geometryStoreStats ? index.geometryStoreStats(room) : null;
                say('warm-up done: ' + found + ' routes, ' + partial + ' partial, ' + none + ' none, in ' + ((performance.now() - t0) / 1000).toFixed(0) + 's' + (st ? '; cache holds ' + st.entries.probes + ' probes, ' + st.entries.queries + ' lookups, ' + st.entries.edges + ' edges' : ''));
                say(saved ? (saved.saved ? 'saved ' + (saved.bytes / 1024).toFixed(0) + 'KB gzipped (' + (saved.rawBytes / 1024 / 1024).toFixed(2) + 'MB raw) -> ' + saved.file : 'not saved: ' + saved.reason) : 'not saved (run with --store to keep it)');
                try { room.destroy?.(); } catch { };
                continue;
            };

            // --leak-test: does a collision probe at one place change a LATER physics simulation
            // somewhere else? Simulate each edge of some real routes twice, each time right after a
            // different "pre-probe" (a rotated non-cube cell vs. a plain full cube), and compare.
            // --ab <module>: run the alternate findPath and this one on every pair from an identical
            // player state and compare the complete routes (every waypoint field), not a hash.
            if (abFile) {
                const alt = await import(new URL('file:///' + path.resolve(abFile).replace(/\\/g, '/')).href);
                const snap = (p) => JSON.stringify(p);
                let same = 0, diff = 0, ta = 0, tb = 0;
                for (const [a, bb] of pairs) {
                    const reset = () => { player.respawn(a); Object.assign(player, { x: a.x, y: a.y, z: a.z, dx: 0, dy: 0, dz: 0, jumping: false, climbing: false }); };
                    reset(); mute(); let t0 = performance.now(); const pa = alt.findPath(room, player, bb); ta += performance.now() - t0; unmute();
                    reset(); mute(); t0 = performance.now(); const pb = findPath(room, player, bb); tb += performance.now() - t0; unmute();
                    if (snap(pa) === snap(pb)) same++;
                    else { diff++; if (diff <= 3) say('  ROUTE DIFFERS ' + JSON.stringify(a) + ' -> ' + JSON.stringify(bb) + '\n    alt:  ' + snap(pa).slice(0, 300) + '\n    this: ' + snap(pb).slice(0, 300)); };
                };
                say('A/B: ' + same + ' identical, ' + diff + ' different routes  |  alt ' + ta.toFixed(0) + 'ms, this ' + tb.toFixed(0) + 'ms (alt runs first, so it pays the cold edge-cache cost)');
                try { room.destroy?.(); } catch { };
                continue;
            };

            // --cold-split: where does the COLD cost go? Same pairs four times: fully cold; then with only
            // the collision-probe/geometry caches emptied (edge-simulation cache kept); then with only the
            // edge-simulation cache emptied (probe caches kept); then fully warm.
            // --speed-test: do the physics edge verdicts depend on the bot's speed modifier? Each pair is
            // searched at several speeds with the edge cache emptied between, and the full routes compared.
            if (speedTest) {
                const phys = await import('./physicsSimulation.js');
                const speeds = [0.3, 0.45, 0.6, 0.8, 1.0, 1.4];
                const routes = speeds.map(() => []);
                for (let si = 0; si < speeds.length; si++) {
                    phys.clearEdgeCache(room);
                    player.changeModifiers?.({ speedModifier: speeds[si] });
                    player.modifiers.speedModifier = speeds[si];
                    for (const [a, bb] of pairs) {
                        player.respawn(a); Object.assign(player, { x: a.x, y: a.y, z: a.z, dx: 0, dy: 0, dz: 0 });
                        mute(); const p = findPath(room, player, bb); unmute();
                        routes[si].push(JSON.stringify(p));
                    };
                };
                for (let si = 1; si < speeds.length; si++) {
                    let same = 0; for (let i = 0; i < pairs.length; i++) if (routes[si][i] === routes[2][i]) same++;
                    say('speed ' + speeds[si] + ' vs 0.6: ' + same + '/' + pairs.length + ' identical routes');
                };
                let same0 = 0; for (let i = 0; i < pairs.length; i++) if (routes[0][i] === routes[2][i]) same0++;
                say('speed ' + speeds[0] + ' vs 0.6: ' + same0 + '/' + pairs.length + ' identical routes');
                try { room.destroy?.(); } catch { };
                continue;
            };

            if (coldSplit) {
                const phys = await import('./physicsSimulation.js');
                const timeAll = () => { let t = 0, f = 0; for (const [a, bb] of pairs) { player.respawn(a); Object.assign(player, { x: a.x, y: a.y, z: a.z, dx: 0, dy: 0, dz: 0 }); mute(); const t0 = performance.now(); const p = findPath(room, player, bb); t += performance.now() - t0; unmute(); if (!p) f++; } return { avg: t / pairs.length, f }; };
                const row = (label, r) => say(label.padEnd(58) + 'avg ' + r.avg.toFixed(1) + 'ms  (fails ' + r.f + ')');
                row('1. fully cold', timeAll());
                const sizes = pathfinding.geometryCacheStats(room);
                say('   after run 1: ' + sizes.probes + ' probes, ' + sizes.queries + ' geometry queries, ' + phys.edgeCacheSize(room) + ' simulated edges');
                pathfinding.clearGeometryCaches(room);
                row('2. probe/geometry caches emptied, edge sims kept', timeAll());
                phys.clearEdgeCache(room);
                row('3. edge sims emptied, probe/geometry caches kept (re-warmed in 2)', timeAll());
                row('4. fully warm', timeAll());
                try { room.destroy?.(); } catch { };
                continue;
            };

            if (leakTest) {
                const { simulateEdge } = await import('./physicsSimulation.js');
                const md = room.map.data;
                let rotated = null, cube = null;
                for (let x = 0; x < room.map.width && !(rotated && cube); x++) for (let y = 0; y < room.map.height && !(rotated && cube); y++) for (let z = 0; z < room.map.depth; z++) {
                    const c = md[x][y][z];
                    if (!c || !c.idx || !c.mesh) continue;
                    const t = c.mesh.colliderType;
                    if (!rotated && (t === 'wedge' || t === 'iwedge' || t === 'aabb' || t === 'obb') && (c.ry || c.rx || c.rz)) rotated = { x: x + 0.5, y: y + 0.5, z: z + 0.5, t };
                    if (!cube && t === 'full') cube = { x: x + 0.5, y: y + 0.5, z: z + 0.5, t };
                };
                say('pre-probe cells: rotated ' + JSON.stringify(rotated) + '  cube ' + JSON.stringify(cube));
                let edges = 0, differ = 0;
                const describe = (r) => r ? JSON.stringify({ ok: r.success, x: +r.x.toFixed(4), y: +r.y.toFixed(4), z: +r.z.toFixed(4), t: r.ticks }) : 'null';
                for (const [a, bb] of pairs.slice(0, 8)) {
                    player.respawn(a);
                    Object.assign(player, { x: a.x, y: a.y, z: a.z, dx: 0, dy: 0, dz: 0 });
                    mute(); const path = findPath(room, player, bb); unmute();
                    if (!path) continue;
                    let from = { x: a.x, y: a.y, z: a.z };
                    for (const to of path) {
                        const opts = { jump: to.type === 'jump', requireSupport: to.type === 'walk' || to.type === 'ramp' };
                        room.Collider.playerCollidesWithMap(player, rotated);
                        const r1 = simulateEdge(player, from, to, opts);
                        room.Collider.playerCollidesWithMap(player, cube);
                        const r2 = simulateEdge(player, from, to, opts);
                        const d1 = describe(r1), d2 = describe(r2);
                        edges++;
                        if (d1 !== d2) { differ++; if (differ <= 6) say('  DIFFERS ' + to.type + ' ' + JSON.stringify(from) + ' -> ' + JSON.stringify({ x: to.x, y: to.y, z: to.z }) + '\n     after rotated: ' + d1 + '\n     after cube:    ' + d2); };
                        from = to;
                    };
                };
                say('leak test: ' + differ + ' of ' + edges + ' edge simulations changed depending only on the previous probe');
                try { room.destroy?.(); } catch { };
                continue;
            };
            say(`\n=== ${ss.maps[mapId].name} (id ${mapId}): ${spawns.length} spawn points, ${pairs.length} pairs x ${repeat} ===`);
            if (session) await session.postAsync('Profiler.start');
            for (let r = 0; r < repeat; r++) {
                const times = [];
                let fails = 0;
                let signature = 0; // cheap fingerprint of every returned route, to prove an optimization changed no paths
                for (const k of Object.keys(counts)) counts[k] = 0;
                for (const [a, b] of pairs) {
                    player.respawn(a);
                    Object.assign(player, { x: a.x, y: a.y, z: a.z, dx: 0, dy: 0, dz: 0 });
                    mute();
                    const t0 = performance.now();
                    const path = findPath(room, player, b);
                    const dt = performance.now() - t0;
                    unmute();
                    times.push(dt);
                    if (!path) fails++;
                    if (perPair) { let ps = 0; if (path) for (const w of path) ps = (ps * 31 + Math.round(w.x * 1000) * 7 + Math.round(w.y * 1000) * 13 + Math.round(w.z * 1000) * 17 + w.type.length) % 2147483647; say(`pair ${a.x},${a.y},${a.z} -> ${b.x},${b.y},${b.z}: ${path ? path.length + ' wp #' + ps : 'none'}`); };
                    if (path) for (const w of path) signature = (signature * 31 + Math.round(w.x * 1000) * 7 + Math.round(w.y * 1000) * 13 + Math.round(w.z * 1000) * 17 + w.type.length) % 2147483647;
                };
                const sorted = [...times].sort((x, y) => x - y);
                const sum = times.reduce((x, y) => x + y, 0);
                const q = (f) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))];
                const stats = pathfinding.geometryCacheStats ? pathfinding.geometryCacheStats(room) : null;
                say(`run ${r + 1}: total ${sum.toFixed(0)}ms  avg ${(sum / times.length).toFixed(1)}  p50 ${q(0.5).toFixed(1)}  p90 ${q(0.9).toFixed(1)}  max ${sorted[sorted.length - 1].toFixed(1)}  fails ${fails}/${times.length}  paths#${signature}  | collider calls/search: playerCollides ${(counts.playerCollidesWithMap / times.length).toFixed(0)}, pointCollides ${(counts.pointCollidesWithMap / times.length).toFixed(0)}${stats ? `  | cache: ${stats.probes} probes, ${stats.queries} queries, heap ${(process.memoryUsage().heapUsed / 1048576).toFixed(0)}MB` : ''}`);
            };
            if (globalThis.__DI_VERIFY_PROBES) { const m = globalThis.__DI_VERIFY_PROBES; say(`probe verification: ${m.length} mismatches`); for (const x of m.slice(0, 12)) say('  ' + JSON.stringify(x)); m.length = 0; };
            if (session) {
                const { profile: prof } = await session.postAsync('Profiler.stop');
                const self = new Map();
                const total = prof.samples.length;
                const byId = new Map(prof.nodes.map((n) => [n.id, n]));
                const hits = new Map();
                for (const id of prof.samples) hits.set(id, (hits.get(id) ?? 0) + 1);
                for (const [id, n] of hits) {
                    const node = byId.get(id);
                    const cf = node.callFrame;
                    const k = `${cf.functionName || '(anon)'}  ${path.basename(cf.url || '')}:${cf.lineNumber + 1}`;
                    self.set(k, (self.get(k) ?? 0) + n);
                };
                const top = [...self].sort((x, y) => y[1] - x[1]).slice(0, 25);
                say('top self time:');
                for (const [k, n] of top) say(`  ${(100 * n / total).toFixed(1).padStart(5)}%  ${k}`);
            };
            try { room.destroy?.(); } catch { };
        };
        process.exit(0);
    })().catch((e) => { unmute(); say('bench failed: ' + (e && e.stack || e)); process.exit(1); });
}
