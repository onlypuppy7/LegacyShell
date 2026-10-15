// Headless LAG benchmark: reproduces the "/botsdebug field stress" test you'd do in the browser, but
// offline and measured tick by tick. It boots a real room (real map, collider, physics, the room's
// own update loop with its sync step), spawns the same field of bots through the same code path as
// the command, and then runs the room forward on a VIRTUAL clock - so a 30 simulated-second test
// takes a few real seconds, but every tick's cost is the real cost of that tick.
//
// What it reports is what a player would feel:
//   - tick time: average / p50 / p95 / p99 / worst. The game budget is 16.7ms per tick (60Hz).
//   - lag ticks: ticks that took longer than the budget, and the "debt" they add up to - how far
//     behind real time the server would fall (it then runs catch-up ticks, which is the stutter).
//   - a per-second timeline of the worst tick, so the opening spike is visible.
//   - the AI profile (perf.js): how much of it is path search, how many searches, how many failed.
//   - behavior sanity: kills, deaths, how much the bots moved, how often they were in a fight -
//     so a speed-up that quietly made the bots dumb would show.
//
// Usage (from the repo root; one scenario per process):
//   node plugins_default/deadinternet/bench-lag.js [--scenario stress] [--bots 30] [--seconds 30]
//        [--map Castle] [--seed 1] [--plugin <dir>] [--store] [--label text]
//
// --plugin <dir>  run against a different copy of the plugin's files (e.g. store/baseline, a
//                 snapshot of the code before an optimization) - the harness itself is shared, so
//                 before/after runs are measured identically.
// --store         enable the on-disk geometry cache (only exists in versions that have it).

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (isMainThread) {
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { args: process.argv.slice(2) }, stdout: false, stderr: false });
    worker.on('message', (msg) => { if (msg && msg.__bench) console.log(msg.line); });
    worker.on('error', (e) => { console.error('bench worker error:', e); process.exitCode = 1; });
    worker.on('exit', (code) => process.exit(code));
} else {
    const say = (line) => parentPort.postMessage({ __bench: true, line });
    const realLog = { log: console.log, info: console.info, warn: console.warn };
    const mute = () => { console.log = () => {}; console.info = () => {}; console.warn = () => {}; };
    const unmute = () => Object.assign(console, realLog);

    const args = workerData.args;
    const flag = (name, fallback) => { const i = args.indexOf(name); if (i < 0) return fallback; const v = args[i + 1]; args.splice(i, 2); return v; };
    const has = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
    const scenario = flag('--scenario', 'stress');
    const botCount = parseInt(flag('--bots', '30'), 10);
    const seconds = parseFloat(flag('--seconds', '30'));
    const mapName = flag('--map', 'Castle');
    let seed = parseInt(flag('--seed', '1'), 10);
    const pluginDirArg = flag('--plugin', null);
    const useStore = has('--store');
    const noCompress = has('--no-compress');
    const label = flag('--label', null);

    // Seeded Math.random so a run can be repeated (the rooms and the bots both use it).
    let a = seed >>> 0;
    Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

    (async () => {
        mute();
        const fs = await import('node:fs');
        const path = await import('node:path');
        const yaml = (await import('js-yaml')).default;
        const here = path.dirname(fileURLToPath(import.meta.url));
        const pluginDir = pluginDirArg ? path.resolve(pluginDirArg) : here;

        const miscModule = await import('#misc');
        miscModule.misc.instantiateSS(import.meta, ['node', 'bench', '--game'], true);
        const ss = miscModule.ss;
        ss.maps = JSON.parse(fs.readFileSync(path.join(ss.rootDir, 'server-game', 'store', 'maps.json'), 'utf8'));
        ss.items = JSON.parse(fs.readFileSync(path.join(ss.rootDir, 'server-game', 'store', 'items.json'), 'utf8'));
        ss.permissions = yaml.load(fs.readFileSync(path.join(ss.rootDir, 'store', 'config', 'distributed_permissions.yaml'), 'utf8'));
        await (await import('#items')).initItems();
        const RoomConstructor = (await import('#rooms')).default;
        const Comm = (await import('#comm')).default;
        const { plugins } = await import('#plugins');
        const { TickStep, iteratePlayers } = await import('#constants');

        const mod = await import(pathToFileURL(path.join(pluginDir, 'index.js')).href);
        const scen = await import(pathToFileURL(path.join(pluginDir, 'scenarios.js')).href);
        if (useStore && mod.setStoreEnabled) mod.setStoreEnabled(true);
        else if (mod.setStoreEnabled) mod.setStoreEnabled(false);
        if (mod.setStoreCompression) mod.setStoreCompression(!noCompress);
        unmute();

        const mapId = ss.maps.findIndex((m) => m.name.toLowerCase() === mapName.toLowerCase());
        if (mapId < 0) { say('unknown map: ' + mapName); process.exit(1); };

        // The same hooks the real plugin registers (index.js's Plugin.updateBefore / onPlayerDeath): the
        // harness does not load plugins (that would git pull), so it wires the bots in itself.
        plugins.on('game:updateBefore', async (data) => { for (const bot of mod.DeadInternetBots) if (bot.player === data.player && bot.onUpdate) await bot.onUpdate(data); });
        plugins.on('game:onPlayerDeath', async (data) => { for (const bot of mod.DeadInternetBots) if (bot.player === data.player && bot.onDeath) await bot.onDeath(data); });

        mute();
        const room = new RoomConstructor({ gameType: 0, mapId, gameId: 1, gameKey: 784, joinType: Comm.Code.createPrivateGame, locked: false, extraParams: {} });
        ss.room = room;
        for (let i = 0; i < 600 && !room.map; i++) await new Promise((r) => setTimeout(r, 50));
        if (!room.map) { unmute(); say('room never built'); process.exit(1); };
        for (const loop of ['updateLoopObject', 'dataSyncLoopObject', 'metaLoopObject', 'updateRoomDetailsLoopObject', 'spawnItemsLoopObject']) { try { room[loop]?.stop?.(); room[loop]?.clear?.(); } catch { } };

        // Spawn the field exactly as `/botsdebug field <scenario> <n>` does. Bots are told not to
        // respawn on their own timers (the harness does it, on the virtual clock).
        const { plan, errors } = scen.planField(scenario, botCount, { overrides: { respawnDelay: 120 } });
        if (errors.length && !plan.length) { unmute(); say('scenario error: ' + errors.join('; ')); process.exit(1); };
        const spawnStart = performance.now();
        for (const entry of plan) {
            const bot = new mod.DeadInternetBot(room, { combat: entry.config });
            await bot.init();
            bot.startCombatAI();
        };
        const spawnMs = performance.now() - spawnStart;
        for (const loop of ['updateLoopObject', 'dataSyncLoopObject', 'metaLoopObject', 'updateRoomDetailsLoopObject', 'spawnItemsLoopObject']) { try { room[loop]?.stop?.(); room[loop]?.clear?.(); } catch { } };
        const bots = mod.DeadInternetBots.filter((b) => b.room === room);
        const loadedAtStart = useStore && mod.loadGeometryCache ? await mod.loadGeometryCache(room) : null;
        unmute();

        // Virtual clock: each tick advances exactly one TickStep, so the room's catch-up loop runs
        // exactly one tick per call, and every Date.now() inside the game/bots sees game time.
        let virtual = Date.now();
        Date.now = () => virtual;
        room.lastTimeStamp = virtual;

        const totalTicks = Math.round(seconds * 60);
        const tickMs = new Float64Array(totalTicks);
        const SECTIONS = ['findPath', 'followPath', 'scan', 'engage', 'cover.enter', 'cover.tick', 'grenade.try', 'sounds', 'nearestHostile'];
        const sectionMs = Object.fromEntries(SECTIONS.map((n) => [n, new Float64Array(totalTicks)]));
        const aiMs = new Float64Array(totalTicks);
        const searchCount = new Int32Array(totalTicks);
        const searchMax = new Float64Array(totalTicks); // the part of each tick spent in bot AI (perf.js 'think')
        const perSecondWorst = [];
        const startPos = new Map(bots.map((b) => [b, { x: b.player.x, z: b.player.z }]));
        let travelled = 0, fightSamples = 0, samples = 0;
        const lastPos = new Map(bots.map((b) => [b, { x: b.player.x, z: b.player.z }]));
        if (mod.perf) mod.perf.start();

        mute();
        for (let t = 0; t < totalTicks; t++) {
            virtual += TickStep;
            const th0 = mod.perf?.sections.get('think')?.total ?? 0;
            const fpCalls0 = mod.perf?.sections.get('findPath')?.calls ?? 0;
            if (mod.perf) mod.perf.tickMaxSearch = 0;
            const before = SECTIONS.map((n) => mod.perf?.sections.get(n)?.total ?? 0);
            const t0 = performance.now();
            await room.updateLoop(1);
            tickMs[t] = performance.now() - t0;
            aiMs[t] = (mod.perf?.sections.get('think')?.total ?? 0) - th0;
            searchCount[t] = (mod.perf?.sections.get('findPath')?.calls ?? 0) - fpCalls0;
            searchMax[t] = mod.perf?.tickMaxSearch ?? 0;
            SECTIONS.forEach((n, k) => { sectionMs[n][t] = (mod.perf?.sections.get(n)?.total ?? 0) - before[k]; });

            if (t % 30 === 0) {
                for (const b of bots) {
                    if (!b.player.playing && b.player.canRespawn()) await b.respawn();
                    const lp = lastPos.get(b);
                    if (b.player.playing) { travelled += Math.hypot(b.player.x - lp.x, b.player.z - lp.z); samples++; if (b.combat?.target && b.combat.targetVisible) fightSamples++; };
                    lp.x = b.player.x; lp.z = b.player.z;
                };
            };
            const s = Math.floor(t / 60);
            perSecondWorst[s] = Math.max(perSecondWorst[s] ?? 0, tickMs[t]);
        };
        unmute();
        if (mod.perf) mod.perf.stop();

        // ---- report ----
        const sorted = [...tickMs].sort((x, y) => x - y);
        const q = (f) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))];
        const sum = tickMs.reduce((x, y) => x + y, 0);
        const BUDGET = TickStep;
        let lagTicks = 0, stalls = 0, debt = 0, worstRun = 0, run = 0;
        for (const ms of tickMs) {
            if (ms > BUDGET) { lagTicks++; debt += ms - BUDGET; run++; worstRun = Math.max(worstRun, run); } else run = 0;
            if (ms > 50) stalls++;
        };
        const kills = bots.reduce((n, b) => n + (b.player.kills || 0), 0);
        const deaths = bots.reduce((n, b) => n + (b.player.deaths || 0), 0);

        say(`\n=== ${label ?? (pluginDirArg ? pluginDirArg : 'current code')} | ${scenario} x${bots.length} on ${ss.maps[mapId].name}, ${seconds}s (${totalTicks} ticks), seed ${seed}${useStore ? ', geometry store ON' : ''} ===`);
        say(`bots spawned in ${spawnMs.toFixed(0)}ms (not part of the ticks below)`);
        { const names = mod.SHELL_COLORS ?? []; const byTeam = new Map(); for (const b of bots) { const k = 'team ' + b.player.team + ' = ' + (names[b.player.shellColor] ?? ('colour ' + b.player.shellColor)) + ' (client ' + (names[b.client.colorIdx] ?? b.client.colorIdx) + ')'; byTeam.set(k, (byTeam.get(k) ?? 0) + 1); }; say('egg colours: ' + [...byTeam].map(([k, n]) => n + 'x ' + k).join(', ')); };
        say(`tick ms:  avg ${(sum / totalTicks).toFixed(2)}   p50 ${q(0.5).toFixed(2)}   p95 ${q(0.95).toFixed(2)}   p99 ${q(0.99).toFixed(2)}   worst ${sorted[sorted.length - 1].toFixed(1)}   (budget ${BUDGET.toFixed(1)})`);
        say(`LAG: ${lagTicks} of ${totalTicks} ticks over budget (${(100 * lagTicks / totalTicks).toFixed(1)}%), ${stalls} stalls over 50ms, longest run of late ticks ${worstRun}, accumulated debt ${debt.toFixed(0)}ms (= ${(debt / 1000).toFixed(2)}s behind over ${seconds}s)`);
        say(`keeps up with real time? ${sum <= seconds * 1000 ? 'yes' : 'NO'} - simulated ${seconds}s in ${(sum / 1000).toFixed(2)}s of tick work (${(100 * sum / (seconds * 1000)).toFixed(0)}% of one core)`);
        { const order = [...tickMs.keys()].sort((x, y) => tickMs[y] - tickMs[x]).slice(0, 6); say('six worst ticks (tick# = ms): ' + order.map((i) => { const top = SECTIONS.map((n) => [n, sectionMs[n][i]]).sort((x, y) => y[1] - x[1])[0]; return i + ' = ' + tickMs[i].toFixed(0) + ' (AI ' + aiMs[i].toFixed(0) + (top[1] > 1 ? ', mostly ' + top[0] + ' ' + top[1].toFixed(0) : '') + '; ' + searchCount[i] + ' searches, slowest ' + searchMax[i].toFixed(0) + 'ms)'; }).join(', ')); };
        say('worst tick per simulated second: ' + perSecondWorst.slice(0, 12).map((v) => v.toFixed(0)).join(' ') + (perSecondWorst.length > 12 ? ' ...' : '') + '  ms');
        if (mod.perf && mod.perf.sections.size) {
            const ps = mod.perf.sections;
            const think = ps.get('think'), fp = ps.get('findPath'), none = mod.perf.counters.get('findPath.none') ?? 0;
            if (think) say(`AI: ${think.total.toFixed(0)}ms total = ${(100 * think.total / sum).toFixed(0)}% of tick work   |   path search: ${fp ? fp.calls : 0} searches, ${fp ? fp.total.toFixed(0) : 0}ms (${fp && think ? (100 * fp.total / think.total).toFixed(0) : 0}% of AI), avg ${fp ? (fp.total / fp.calls).toFixed(1) : '-'}ms, worst ${fp ? fp.max.toFixed(0) : '-'}ms, ${none} found no path`);
        };
        if (mod.perf && mod.perf.counters.size) { const c = mod.perf.counters; const g = (k) => c.get(k) ?? 0; say(`why searches ran: fresh ${g('search.fresh')}, goal moved ${g('search.goalMoved')}, timer ${g('search.timer')}, forced ${g('search.forced')}  |  outcomes: found ${g('searches.found')} (avg ${(g('expansions.found') / Math.max(1, g('searches.found'))).toFixed(0)} expansions), hit limit ${g('searches.limit')} (avg ${(g('expansions.limit') / Math.max(1, g('searches.limit'))).toFixed(0)}), exhausted ${g('searches.exhausted')} (avg ${(g('expansions.exhausted') / Math.max(1, g('searches.exhausted'))).toFixed(0)}), nothing-to-search ${g('searches.none')}`); };
        if (mod.perf?.slowSearches?.length) { const sl = [...mod.perf.slowSearches].sort((a, b) => b.ms - a.ms).slice(0, 8); say('slowest searches: ' + sl.map((x) => `${x.ms.toFixed(0)}ms/${x.expansions}exp/${x.outcome}/${x.dist.toFixed(0)}blk${x.up ? (x.up > 0 ? '+' : '') + x.up.toFixed(0) : ''}/${x.len}wp[${x.types}]`).join('  ')); };
        say(`behaviour: ${kills} kills / ${deaths} deaths, bots moved ${(travelled / Math.max(1, bots.length)).toFixed(0)} blocks each, in a fight ${(100 * fightSamples / Math.max(1, samples)).toFixed(0)}% of the time`);
        if (useStore && mod.saveGeometryCache) {
            const loaded = await mod.loadGeometryCache(room);
            const saved = await mod.saveGeometryCache(room, { force: true });
            const st = mod.geometryStoreStats(room);
            const lt = loadedAtStart?.ms, sv = saved?.ms;
            if (lt) say(`  load timings: read ${lt.read.toFixed(0)}ms, unzip ${lt.unzip.toFixed(0)}ms (off-thread), decode ${lt.decode.toFixed(0)}ms, JSON.parse ${lt.parse.toFixed(0)}ms, import ${lt.import.toFixed(0)}ms  => game loop blocked ${lt.blocking.toFixed(0)}ms of ${lt.total.toFixed(0)}ms total`);
            if (sv) say(`  save timings: export ${sv.export.toFixed(0)}ms, stringify ${sv.stringify.toFixed(0)}ms, ${sv.gzip !== undefined ? 'gzip ' + sv.gzip.toFixed(0) + 'ms (off-thread)' : 'encode ' + sv.encode.toFixed(0) + 'ms'}, write ${sv.write.toFixed(0)}ms  => game loop blocked ${sv.blocking.toFixed(0)}ms`);
            say(`geometry store: at start ${loadedAtStart?.loaded ? 'loaded ' + loadedAtStart.added + ' answers (' + (loadedAtStart.bytes / 1024).toFixed(0) + 'KB)' : 'nothing loaded (' + (loadedAtStart?.reason ?? '?') + ')'}; now holds ${st.entries.probes} probes, ${st.entries.queries} geometry lookups, ${st.entries.edges} simulated edges; ${saved.saved ? 'saved ' + (saved.bytes / 1024).toFixed(0) + 'KB gzipped (' + (saved.rawBytes / 1024 / 1024).toFixed(2) + 'MB raw) to ' + saved.file : 'not saved: ' + saved.reason}`);
        };
        say('JSON ' + JSON.stringify({ label: label ?? pluginDirArg ?? 'current', avg: +(sum / totalTicks).toFixed(3), p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2), worst: +sorted[sorted.length - 1].toFixed(1), lagTicks, totalTicks, stalls, debt: +debt.toFixed(0), kills, deaths }));
        process.exit(0);
    })().catch((e) => { unmute(); say('bench failed: ' + (e && e.stack || e)); process.exit(1); });
}
