// Headless zombies lag bench: a real zombies room, the horde spawned through the plugin's own code, stand-in humans that jump
// to a random spawn every few seconds, on a virtual clock (so the ticks are real cost but a minute takes seconds).
//   node plugins_default/zombiesmode/bench-zombies.js [map] [seconds] [seed] [--store] [--humans N] [--hop S] [--json] [--prof] [--replay]
// --plugins <dir>  run another copy of the plugins (a folder with zombiesmode, deadinternet, legacyshellcore, modernshellhats; it has to be
//                  inside the repo for the #imports to resolve), to compare against how it was before a change.
// --store          load the pathfinding cache (without it every map starts cold, which is where the worst spikes are)
// --prof           write a .cpuprofile next to this file; --replay re-runs the slowest pathTo on its own, three times
// reports tick ms (avg/p95/p99/worst, ticks over 16.7ms and 33ms), what path searching cost, and how close the horde got to the humans
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker, isMainThread } from 'node:worker_threads';
import { writeSync } from 'node:fs';
if (isMainThread) { const w = new Worker(fileURLToPath(import.meta.url), { argv: process.argv.slice(2) }); w.on('error', (e) => { console.error(e); process.exitCode = 1; }); w.on('exit', (c) => process.exit(c)); } else {
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const has = (n) => { const i = args.indexOf(n); if (i < 0) return false; args.splice(i, 1); return true; };
const useStore = has('--store');
const humansN = +flag('--humans', 3);
const hopSecs = +flag('--hop', 6);
const pluginsRoot = flag('--plugins', null);
const asJson = has('--json');
const prof = has('--prof');
const mapName = (args[0] || 'Castle').toLowerCase();
const seconds = +(args[1] || 60);
let seed = +(args[2] || 1) >>> 0;
Math.random = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const real = { log: console.log, info: console.info, warn: console.warn, error: console.error };
const mute = () => { console.log = console.info = console.warn = console.error = () => {}; };
const unmute = () => Object.assign(console, real);
const say = (s) => writeSync(1, s + String.fromCharCode(10));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mute();
const fs = await import('node:fs');
const path = await import('node:path'); const path_ = path;
const yaml = (await import('js-yaml')).default;
const miscModule = await import('#misc');
miscModule.misc.instantiateSS(import.meta, ['node', 'bench', '--game'], true);
const ss = miscModule.ss;
const root = pluginsRoot ? path.resolve(pluginsRoot) : path.join(ss.rootDir, 'plugins_default');
ss.maps = JSON.parse(fs.readFileSync(path.join(ss.rootDir, 'server-game/store/maps.json'), 'utf8'));
ss.items = JSON.parse(fs.readFileSync(path.join(ss.rootDir, 'server-game/store/items.json'), 'utf8'));
ss.permissions = yaml.load(fs.readFileSync(path.join(ss.rootDir, 'store/config/distributed_permissions.yaml'), 'utf8'));
const { plugins } = await import('#plugins');
const zombies = await import(pathToFileURL(path.join(root, 'zombiesmode/index.js')).href);
const di = await import(pathToFileURL(path.join(root, 'deadinternet/index.js')).href);
new zombies.Plugin(plugins, path.join(root, 'zombiesmode'));
new di.Plugin(plugins, path.join(root, 'deadinternet'));
di.setStoreEnabled(useStore);
await (await import('#items')).initItems();
const Room = (await import('#rooms')).default;
const Comm = (await import('#comm')).default;
const { GameType } = await import('#gametypes');
const { TickStep } = await import('#constants');
await sleep(100);
const mapId = ss.maps.findIndex((m) => m.name.toLowerCase() === mapName);
if (mapId < 0) { unmute(); say('unknown map'); process.exit(1); }
const room = new Room({ gameType: GameType.zombies, mapId, gameId: 1, gameKey: 784, joinType: Comm.Code.createPrivateGame, locked: false, extraParams: {} });
ss.room = room;
for (let i = 0; i < 600 && !room.map; i++) await sleep(50);
const stopLoops = () => { for (const n of ['updateLoopObject', 'dataSyncLoopObject', 'metaLoopObject', 'updateRoomDetailsLoopObject', 'spawnItemsLoopObject']) { try { room[n]?.stop?.(); room[n]?.clear?.(); } catch { } } };
stopLoops();
const zc = room.gameOptions.plugins.zombies;
zc.headStartSecs = 0; zc.staggerSecs = 0;
const plugin = zombies.pluginInstance;
// virtual-clock respawns
let virtual = Date.now();
const queue = [];
plugin.scheduleRespawn = (z, bot, secs) => { bot.zombieTimer = 1; queue.push({ at: virtual + secs * 1e3, z, bot }); };
plugin.infect = () => {};
const replay = has('--replay');
let worstCall = null;
{ const raw = di.DeadInternetBot.prototype.pathTo; di.DeadInternetBot.prototype.pathTo = function (target, opts = {}) {
    const p = this.player, snap = { x: p.x, y: p.y, z: p.z, dx: p.dx, dy: p.dy, dz: p.dz, climbing: p.climbing, onGround: p.onGround, jumping: p.jumping };
    const t0 = performance.now(); const r = raw.call(this, target, opts); const ms = performance.now() - t0;
    if (!worstCall || ms > worstCall.ms) worstCall = { ms, bot: this, snap, target: { x: target.x, y: target.y, z: target.z }, opts: { ...opts }, avoid: [...(this.pathAvoidedEdges ?? [])], chaseBudget: 0 };
    return r; }; }
const humans = [];
for (let i = 0; i < humansN; i++) {
    const c = await room.joinPlayer({ id: null, nickname: 'H' + i, classIdx: 0, wsId: 7001 + i, primary_item_id: 0, secondary_item_id: 0, useOOBid: true });
    c.noConnectionTimeout = true;
    await c.waitUntilReady(); await c.clientReady(); await c.requestRespawn();
    humans.push(c);
}
await plugins.emit('metaLoop', { this: room });
const botsOf = () => di.DeadInternetBots.filter((b) => b.room === room);
for (let i = 0; i < 2000 && botsOf().length < zc.count; i++) await sleep(20);
for (const b of botsOf()) if (!b.player.playing) { b.player.nextRespawn = 0; await b.respawn(); }
stopLoops(); clearTimeout(room.roundTimeout);
let loaded = null; if (useStore) loaded = await di.loadGeometryCache(room);
const spawns = room.spawnPoints.flat().filter(Boolean);
Date.now = () => virtual;
room.lastTimeStamp = virtual;
const N = Math.round(seconds * 60);
const tick = new Float64Array(N);
di.perf.start();
const cpu = prof ? (await import('node:inspector')).default : null;
let session; if (cpu) { session = new cpu.Session(); session.connect(); await new Promise((r) => session.post('Profiler.enable', r)); await new Promise((r) => session.post('Profiler.start', r)); }
const hopTicks = Math.round(hopSecs * 60);
let distSum = 0, distN = 0, near = 0, travelled = 0; const last = new Map();
for (let t = 0; t < N; t++) {
    virtual += TickStep;
    // humans hop to random spawns (staggered), stay alive, stay human
    humans.forEach((c, i) => {
        const p = c.player;
        if (!p.playing) { p.nextRespawn = 0; c.requestRespawn(); }
        p.hp = 100;
        if ((t + i * Math.floor(hopTicks / humansN)) % hopTicks === 0) { const s = spawns[Math.floor(Math.random() * spawns.length)]; p.x = s.x + 0.5; p.y = s.y; p.z = s.z + 0.5; }
    });
    for (let q = queue.length - 1; q >= 0; q--) if (queue[q].at <= virtual) { const { bot } = queue[q]; queue.splice(q, 1); bot.zombieTimer = null; if (!bot.removed) await bot.respawn(); }
    const t0 = performance.now();
    await room.updateLoop(1);
    if (t % 120 === 0) { await plugins.emit('metaLoop', { this: room }); clearTimeout(room.roundTimeout); }
    tick[t] = performance.now() - t0;
    if (t % 30 === 0) { for (const b of botsOf()) { if (!b.player.playing) continue; let d = Infinity; for (const c of humans) d = Math.min(d, Math.hypot(c.player.x - b.player.x, c.player.y - b.player.y, c.player.z - b.player.z)); distSum += d; distN++; if (d < 3) near++; } }
    if (t % 30 === 0) for (const b of botsOf()) { if (!b.player.playing) continue; const l = last.get(b); if (l) travelled += Math.hypot(b.player.x - l.x, b.player.z - l.z); last.set(b, { x: b.player.x, z: b.player.z }); }
}
di.perf.stop();
if (session) { const { profile } = await new Promise((r) => session.post('Profiler.stop', (e, p) => r(p))); fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), `zb-${mapName}-${seed}.cpuprofile`), JSON.stringify(profile)); }
if (replay && worstCall) {
    const { bot, snap, target, opts } = worstCall, p = bot.player, keep = { x: p.x, y: p.y, z: p.z, dx: p.dx, dy: p.dy, dz: p.dz, climbing: p.climbing, onGround: p.onGround, jumping: p.jumping };
    say('replaying worst pathTo ' + worstCall.ms.toFixed(0) + 'ms from ' + [snap.x, snap.y, snap.z].map((v) => v.toFixed(2)) + ' to ' + [target.x, target.y, target.z].map((v) => v.toFixed(2)) + ' opts ' + JSON.stringify(opts) + ' as ' + JSON.stringify(bot.pathAs ?? null) + ' avoid ' + worstCall.avoid.length);
    for (let k = 0; k < 3; k++) {
        Object.assign(p, snap);
        if (k === 1 && cpu) { session ??= new cpu.Session(); try { session.connect(); } catch { } await new Promise((r) => session.post('Profiler.enable', r)); await new Promise((r) => session.post('Profiler.start', r)); }
        const t0 = performance.now();
        const path = di.findPath(room, p, target, { avoidEdges: new Set(worstCall.avoid), as: bot.pathAs, snapGoal: true, allowPartial: true, ...opts });
        say('  replay ' + k + ': ' + (performance.now() - t0).toFixed(1) + 'ms, ' + (path ? path.length + 'wp partial=' + !!path.partial + ' end ' + JSON.stringify(path[path.length - 1] ? { x: path[path.length - 1].x, y: path[path.length - 1].y, z: path[path.length - 1].z } : null) : 'null'));
        if (k === 1 && cpu) { const { profile } = await new Promise((r) => session.post('Profiler.stop', (e, pr) => r(pr))); fs.writeFileSync(path_.join(path_.dirname(fileURLToPath(import.meta.url)), 'zb-replay.cpuprofile'), JSON.stringify(profile)); }
    }
    Object.assign(p, keep);
}
unmute();
const s = [...tick].sort((a, b) => a - b), q = (f) => s[Math.min(s.length - 1, Math.floor(s.length * f))];
const sum = tick.reduce((a, b) => a + b, 0);
const over = (ms) => tick.filter((x) => x > ms).length;
const ps = di.perf.sections, fp = ps.get('findPath'), th = ps.get('think'), fo = ps.get('followPath');
const out = { map: mapName, seed, store: useStore, avg: +(sum / N).toFixed(3), p95: +q(.95).toFixed(2), p99: +q(.99).toFixed(2), p999: +q(.999).toFixed(1), worst: +s[s.length - 1].toFixed(1), over16: over(16.7), over8: over(8), over33: over(33), think: +(th?.total ?? 0).toFixed(0), findPath: +(fp?.total ?? 0).toFixed(0), searches: fp?.calls ?? 0, fpWorst: +(fp?.max ?? 0).toFixed(1), follow: +(fo?.total ?? 0).toFixed(0), followWorst: +(fo?.max ?? 0).toFixed(1), moved: +(travelled / Math.max(1, botsOf().length)).toFixed(0), meanDist: +(distSum / Math.max(1, distN)).toFixed(2), nearPct: +(100 * near / Math.max(1, distN)).toFixed(1) };
if (di.perf.slowSearches?.length && !asJson) say('slowest: ' + [...di.perf.slowSearches].sort((a, b) => b.ms - a.ms).slice(0, 10).map((x) => `${x.ms.toFixed(0)}ms/${x.expansions}exp/${x.outcome}/${x.dist.toFixed(0)}blk${x.up ? (x.up > 0 ? '+' : '') + x.up.toFixed(0) : ''}/${x.len}wp`).join('  '));
if (asJson) say('JSON ' + JSON.stringify(out));
if (loaded) say("store: " + JSON.stringify({ loaded: loaded.loaded, added: loaded.added, reason: loaded.reason }) + " now " + JSON.stringify(di.geometryStoreStats(room).entries));
if (!asJson) { say(JSON.stringify(out)); say(di.perf.report ? di.perf.report() : ''); }
process.exit(0);
}
