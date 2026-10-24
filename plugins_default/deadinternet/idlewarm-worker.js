// The worker idlewarm.js runs: boots the way a room worker does (plugins and all, so the map and the code fingerprint match a real room's
// and the answers are the ones a real room would load), then for each map/profile it is given runs searches between random places, the
// way bench-pathfinding.js --warm does, saving after every chunk. It is killed from outside, whenever.
import { parentPort, workerData } from 'node:worker_threads';
import { ss, misc } from '#misc';
import { plugins } from '#plugins';

const { seed, work, chunk } = workerData;

misc.instantiateSS(import.meta, process.argv);
Object.assign(ss, seed);
await plugins.loadPlugins('game');
await (await import('#items')).initItems();

const RoomConstructor = (await import('#rooms')).default;
const Comm = (await import('#comm')).default;
const { DeadInternetBot, saveGeometryCache } = await import('./index.js');
const pathfinding = await import('./pathfinding.js');

let state = Date.now() & 0x7fffffff;
const rng = () => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state / 0x7fffffff; };

const quiet = async (fn) => { const saved = { log: console.log, info: console.info, warn: console.warn }; console.log = console.info = console.warn = () => { }; try { return await fn(); } finally { Object.assign(console, saved); } };
const stopLoops = (room) => { for (const loop of ['updateLoopObject', 'dataSyncLoopObject', 'metaLoopObject', 'updateRoomDetailsLoopObject', 'spawnItemsLoopObject']) { try { room[loop]?.stop?.(); room[loop]?.clear?.(); } catch { } } };

let current = null; //{ map, room, player, spawns }

async function open(map) {
    if (current) { await saveGeometryCache(current.room, { force: true }); try { current.room.destroy?.(); } catch { } current = null; }
    const mapId = ss.maps.findIndex((m) => m.name === map);
    if (mapId < 0) return false;
    return quiet(async () => {
        const room = new RoomConstructor({ gameType: 0, mapId, gameId: 1, gameKey: 784, joinType: Comm.Code.createPrivateGame, locked: false, extraParams: {} });
        ss.room = room;
        for (let i = 0; i < 600 && !room.map; i++) await new Promise((r) => setTimeout(r, 50));
        if (!room.map) return false;
        stopLoops(room);
        const bot = new DeadInternetBot(room, {});
        await bot.init();
        stopLoops(room);
        const spawns = (room.spawnPoints || []).flat().filter(Boolean).map((s) => ({ x: Math.floor(s.x) + 0.5, y: s.y, z: Math.floor(s.z) + 0.5 }));
        current = { map, room, player: bot.player, spawns, base: { ...bot.player.modifiers } };
        return true;
    });
}

for (const item of work) {
    if (current?.map !== item.map && !(await open(item.map))) continue;
    const { room, player, spawns, base } = current;
    const standable = () => {
        for (let attempt = 0; attempt < 60; attempt++) {
            const x = Math.floor(rng() * room.map.width), z = Math.floor(rng() * room.map.depth);
            for (let y = room.map.height - 2; y >= 1; y--) if (pathfinding.isStandable(room.map, x, y, z, player)) return { x: x + 0.5, y, z: z + 0.5 };
        }
        return null;
    };
    const pick = (i) => (i % 2 === 0 && spawns.length > 1) ? spawns[Math.floor(rng() * spawns.length)] : (standable() ?? spawns[Math.floor(rng() * spawns.length)]);

    for (let done = 0; done < item.left;) {
        const n = Math.min(chunk, item.left - done);
        await quiet(async () => {
            for (let i = 0; i < n; i++) {
                const from = pick(i), to = pick(i + (i % 3));
                player.respawn(from);
                Object.assign(player, { x: from.x, y: from.y, z: from.z, dx: 0, dy: 0, dz: 0 });
                Object.assign(player.modifiers, base, item.modifiers); //(from the bot's own each time: a job only names what it changes, and the last job's scale used to stay on)
                pathfinding.findPath(room, player, to, { snapGoal: true, allowPartial: true, maxExpansions: 2500 });
            }
            await saveGeometryCache(room, { force: true });
        });
        done += n;
        parentPort.postMessage({ key: item.key, done: n });
    }
}
process.exit(0);
