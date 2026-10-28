// Real-physics regressions for zombies leaving props and stairs. One map per process.
// node plugins_default/zombiesmode/test-navigation.js [Blue] [seed] [plain|small|brutish|sudden]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

if (isMainThread) {
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: process.argv.slice(2), stdout: true, stderr: true });
    worker.on('message', (line) => { if (typeof line === 'string') console.log(line); });
    worker.on('error', (error) => { console.error(error); process.exitCode = 1; });
    worker.on('exit', (code) => { process.exitCode = code; });
} else {
    console.log = console.info = console.warn = console.error = () => {};
    const fs = await import('node:fs');
    const path = await import('node:path');
    const yaml = (await import('js-yaml')).default;
    const miscModule = await import('#misc');
    miscModule.misc.instantiateSS(import.meta, ['node', 'test', '--game'], true);
    const ss = miscModule.ss;
    ss.maps = JSON.parse(fs.readFileSync(path.join(ss.rootDir, 'server-game/store/maps.json'), 'utf8'));
    ss.items = JSON.parse(fs.readFileSync(path.join(ss.rootDir, 'server-game/store/items.json'), 'utf8'));
    ss.permissions = yaml.load(fs.readFileSync(path.join(ss.rootDir, 'store/config/distributed_permissions.yaml'), 'utf8'));
    let seed = Number(workerData[1] ?? 1) >>> 0;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const { plugins } = await import('#plugins');
    const zombies = await import('./index.js');
    const deadinternet = await import('../deadinternet/index.js');
    const { findSupportedY } = await import('../deadinternet/pathfinding.js');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const plugin = new zombies.Plugin(plugins, here);
    new deadinternet.Plugin(plugins, path.join(here, '../deadinternet'));
    deadinternet.setStoreEnabled(false);
    await (await import('#items')).initItems();
    const Room = (await import('#rooms')).default;
    const Comm = (await import('#comm')).default;
    const { GameType } = await import('#gametypes');
    const { TickStep } = await import('#constants');
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await sleep(100);
    const mapName = workerData[0] ?? 'Blue';
    const mapId = ss.maps.findIndex((m) => m.name.toLowerCase() === mapName.toLowerCase());
    if (mapId < 0) throw new Error('unknown map ' + mapName);
    const room = new Room({ gameType: GameType.zombies, mapId, gameId: 1, gameKey: 784, joinType: Comm.Code.createPrivateGame, locked: false, extraParams: {} });
    ss.room = room;
    for (let i = 0; i < 600 && !room.map; i++) await sleep(50);
    if (!room.map) throw new Error('room never built');
    const stopLoops = () => {
        for (const name of ['updateLoopObject', 'dataSyncLoopObject', 'metaLoopObject', 'updateRoomDetailsLoopObject', 'spawnItemsLoopObject']) room[name]?.stop?.();
        clearTimeout(room.roundTimeout);
    };
    stopLoops();
    room.gameOptions.plugins.zombies.count = 0;
    const human = await room.joinPlayer({ id: null, nickname: 'NavigationTarget', classIdx: 0, wsId: 7001, primary_item_id: 0, secondary_item_id: 0, useOOBid: true });
    human.noConnectionTimeout = true;
    await human.waitUntilReady(); await human.clientReady(); await human.requestRespawn();
    const h = human.player;
    const state = { active: true, bots: [], searchFrame: 0, searchEnd: 0, searchCost: 0 };
    const cfg = { ...room.gameOptions.plugins.zombies };
    const variant = workerData[2] ?? 'plain';
    if (variant === 'sudden') cfg.zombieSpeed = cfg.suddenDeathSpeed;
    const bot = await plugin.spawnZombie(room, state, cfg, ['small', 'brutish'].includes(variant) ? variant : null);
    state.bots.push(bot);
    stopLoops();
    const p = bot.player, map = room.map;
    p.changeModifiers({ contactDamage: 0 });
    let virtual = Date.now();
    Date.now = () => virtual;
    room.lastTimeStamp = virtual;
    room.roundEndTime = virtual + 1e9;
    const tick = async () => { virtual += TickStep; h.hp = 100; h.predicted = h; await room.updateLoop(1); };
    const points = [];
    for (let x = 0; x < map.width; x++) for (let y = 1; y < map.height; y++) for (let z = 0; z < map.depth; z++) {
        const cell = map.data[x]?.[y]?.[z];
        if (!['aabb', 'obb', 'wedge'].includes(cell?.mesh?.colliderType)) continue;
        const rest = findSupportedY(p, x + 0.5, z + 0.5, y - 0.02, y + 1.02);
        if (rest !== null) points.push({ x: x + 0.5, y: rest, z: z + 0.5, name: cell.mesh.name });
    };
    const spawns = room.spawnPoints.flat().filter(Boolean).map((s) => ({ x: s.x + 0.5, y: findSupportedY(h, s.x + 0.5, s.z + 0.5, s.y - 1, s.y + 2), z: s.z + 0.5 })).filter((s) => s.y !== null);
    let failed = 0, tested = 0;
    for (const from of points) {
        const to = spawns.filter((s) => Math.hypot(s.x - from.x, s.z - from.z) >= 3).sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z))[0];
        if (!to) continue;
        tested++;
        bot.stopPath(); bot.combat.reset(); bot.zWander = bot.zIdle = bot.zPath = 0; bot.zProgress = null;
        bot.pathFailUntil = bot.pathFailCount = 0; bot.pathAvoidedEdges.clear();
        p.respawn({ ...from, yaw: 0, pitch: 0 }); p.dx = p.dy = p.dz = 0;
        p.jumping = p.isFalling = p.climbing = false;
        Object.assign(h, to); h.predicted = h;
        let arrived = false;
        for (let t = 0; t < 30 * 60; t++) {
            await tick();
            if (Math.hypot(p.x - h.x, p.z - h.z) < 0.7 && Math.abs(p.y - h.y) < 0.6) { arrived = true; break; };
        };
        if (!arrived) failed++;
        parentPort.postMessage(`${arrived ? 'ok' : 'FAIL'} - ${from.name} at ${from.x.toFixed(1)},${from.y.toFixed(2)},${from.z.toFixed(1)} -> ${to.x},${to.y.toFixed(2)},${to.z}; ended ${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}, route ${bot.pathIndex}/${bot.currentPath?.length ?? 'none'}, wander ${bot.zWander}, idle ${bot.zIdle}`);
    };
    if (!tested) throw new Error('no supported props/stairs tested');
    parentPort.postMessage(`${mapName} (${variant}, seed ${workerData[1] ?? 1}): ${tested - failed}/${tested} props/stairs reached the human`);
    process.exit(failed ? 1 : 0);
}
