// Headless version of `/botsdebug pathtestcheckpoints`: boots a real room on a parkour test map and
// drives a bot through the map's checkpoint route exactly the way the command does (spawn the bot,
// respawn it at checkpoint1, `pathTo(next, { force: true })`, then `followPath()` every tick), on a
// virtual clock, so a full route takes seconds instead of minutes - no game server, no browser.
//
// It reports, per leg, what the command would: arrived first try / arrived but needed stuck-recovery /
// timed out / no path - and what the bot looked like (its speed modifier, route length).
//
// Usage (from the repo root; one map per process):
//   node plugins_default/deadinternet/bench-checkpoints.js [--map PathEasyParkourTestA] [--plugin <dir>]
//        [--speed <n>] [--seed 1] [--leg-seconds 90] [--direct] [--quiet]
//
// --plugin <dir>  run a different copy of the plugin's files (e.g. the code as it was at some commit,
//                 extracted with `git show <rev>:<path>`), to tell whether a change broke a route.
// --speed <n>     force the bot's speed modifier after init (to test whether speed is the cause).
// --direct        also run the end-to-end leg (checkpoint1 straight to goal), like the command does.

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
    const mapName = flag('--map', 'PathEasyParkourTestA');
    const pluginDirArg = flag('--plugin', null);
    const forcedSpeed = flag('--speed', null);
    const legSeconds = parseFloat(flag('--leg-seconds', '90'));
    let seed = parseInt(flag('--seed', '1'), 10);
    const direct = has('--direct');
    const quiet = has('--quiet');

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
        const { TickStep } = await import('#constants');
        const mod = await import(pathToFileURL(path.join(pluginDir, 'index.js')).href);
        if (mod.setStoreEnabled) mod.setStoreEnabled(false); // measure the code, not whatever happens to be cached
        unmute();

        const mapId = ss.maps.findIndex((m) => m.name.toLowerCase() === mapName.toLowerCase());
        if (mapId < 0) { say('unknown map: ' + mapName); process.exit(1); };

        plugins.on('game:updateBefore', async (data) => { for (const bot of mod.DeadInternetBots) if (bot.player === data.player && bot.onUpdate) await bot.onUpdate(data); });
        plugins.on('game:onPlayerDeath', async (data) => { for (const bot of mod.DeadInternetBots) if (bot.player === data.player && bot.onDeath) await bot.onDeath(data); });

        mute();
        const room = new RoomConstructor({ gameType: 0, mapId, gameId: 1, gameKey: 784, joinType: Comm.Code.createPrivateGame, locked: false, extraParams: {} });
        ss.room = room;
        for (let i = 0; i < 600 && !room.map; i++) await new Promise((r) => setTimeout(r, 50));
        if (!room.map) { unmute(); say('room never built'); process.exit(1); };
        for (const loop of ['updateLoopObject', 'dataSyncLoopObject', 'metaLoopObject', 'updateRoomDetailsLoopObject', 'spawnItemsLoopObject']) { try { room[loop]?.stop?.(); room[loop]?.clear?.(); } catch { } };

        // Same checkpoint discovery as the command.
        const map = room.map;
        const checkpoints = {};
        for (let x = 0; x < map.width; x++) for (let y = 0; y < map.height; y++) for (let z = 0; z < map.depth; z++) {
            const cell = map.data[x]?.[y]?.[z];
            if (cell?.mesh?.theme === 'PARKOUR') checkpoints[cell.mesh.name] = { x: x + 0.5, y, z: z + 0.5 };
        };
        const route = ['checkpoint1', 'checkpoint2', 'checkpoint3', 'checkpoint4', 'checkpoint5', 'goal'].filter((n) => checkpoints[n]);
        if (route.length < 2) { unmute(); say('map has no checkpoint route: ' + Object.keys(checkpoints).join(', ')); process.exit(1); };

        // Same bot setup as the command.
        const bot = new mod.DeadInternetBot(room, {});
        await bot.init();
        for (const loop of ['updateLoopObject', 'dataSyncLoopObject', 'metaLoopObject', 'updateRoomDetailsLoopObject', 'spawnItemsLoopObject']) { try { room[loop]?.stop?.(); room[loop]?.clear?.(); } catch { } };
        if (forcedSpeed !== null) bot.player.changeModifiers({ speedModifier: parseFloat(forcedSpeed) });
        const mods = bot.player.modifiers;
        const respawnAt = (label) => { bot.player.respawn({ ...checkpoints[label], yaw: 0, pitch: 0 }); bot.player.dx = 0; bot.player.dy = 0; bot.player.dz = 0; };
        respawnAt(route[0]);
        unmute();

        let virtual = Date.now();
        Date.now = () => virtual;
        room.lastTimeStamp = virtual;

        say(`\n=== ${pluginDirArg ?? 'current code'} | ${ss.maps[mapId].name}: ${route.join(' -> ')} ===`);
        say(`bot modifiers: speed ${mods.speedModifier}, gravity ${mods.gravityModifier}, jumpBoost ${mods.jumpBoostModifier}, scale ${mods.scale}, damage ${mods.damageModifier}`);

        async function leg(fromLabel, toLabel) {
            const destination = checkpoints[toLabel];
            const stuckBefore = bot.totalStuckEvents;
            mute();
            const route0 = bot.pathTo(destination, { force: true });
            unmute();
            if (!route0) return { from: fromLabel, to: toLabel, ok: false, reason: 'no path' };
            const kinds = {}; for (const w of route0) kinds[w.type] = (kinds[w.type] ?? 0) + 1;
            let status = 'following', seconds = 0;
            bot.onUpdate = async (data) => { status = bot.followPath(data?.delta); };
            const maxTicks = Math.round(legSeconds * 60);
            mute();
            let t = 0;
            for (; t < maxTicks && status !== 'arrived'; t++) { virtual += TickStep; await room.updateLoop(1); };
            unmute();
            seconds = t / 60;
            const stuck = bot.totalStuckEvents - stuckBefore;
            const summary = Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ');
            if (status !== 'arrived') return { from: fromLabel, to: toLabel, ok: false, reason: `timeout (${legSeconds}s), bot at ${bot.player.x.toFixed(1)},${bot.player.y.toFixed(1)},${bot.player.z.toFixed(1)}`, summary };
            if (stuck > 0) return { from: fromLabel, to: toLabel, ok: false, reason: `arrived in ${seconds.toFixed(1)}s but needed ${stuck} stuck-recovery cycle(s)`, summary };
            return { from: fromLabel, to: toLabel, ok: true, seconds, summary };
        };

        const results = [];
        for (let i = 0; i < route.length - 1; i++) {
            const r = await leg(route[i], route[i + 1]);
            results.push(r);
            if (!quiet) say(`  ${r.from} -> ${r.to}: ${r.ok ? 'OK, first try, ' + r.seconds.toFixed(1) + 's' : 'FAILED - ' + r.reason}${r.summary ? '   [' + r.summary + ']' : ''}`);
        };
        if (direct && route.length > 2) {
            mute(); respawnAt(route[0]); unmute();
            const r = await leg(`${route[0]} (direct)`, route[route.length - 1]);
            results.push(r);
            if (!quiet) say(`  ${r.from} -> ${r.to}: ${r.ok ? 'OK, first try, ' + r.seconds.toFixed(1) + 's' : 'FAILED - ' + r.reason}${r.summary ? '   [' + r.summary + ']' : ''}`);
        };
        const ok = results.filter((r) => r.ok).length;
        say(`RESULT: ${ok}/${results.length} legs first try${ok === results.length ? '  (100%)' : ''}`);
        process.exit(ok === results.length ? 0 : 2);
    })().catch((e) => { unmute(); say('bench failed: ' + (e && e.stack || e)); process.exit(1); });
}
