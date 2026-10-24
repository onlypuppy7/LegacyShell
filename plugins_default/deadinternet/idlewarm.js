// Fills the pathfinding cache while a game server has nothing better to do. Once no room has been running for idleDelayMs it starts a
// worker (idlewarm-worker.js) that runs searches on each map for each physics profile it has been asked for, and the moment a room is
// made the worker is killed. Whatever it learned is already saved (it saves after every chunk), and how far it got is remembered, so the
// next quiet spell carries on instead of starting over.
//
// Other plugins add what to warm through the `idleWarmJobs` event: push { maps: ['Castle'] (or null for every map), modifiers: { speedModifier: 0.65, ... }, searches: 1000, priority: 0 }
// (lower priority goes first) to data.jobs. The physics profile is the cache key: speed (to 0.1), gravity, jumpBoost, physicsSpeed and scale.
import { Worker, isMainThread } from 'node:worker_threads';
import { ss } from '#misc';
import { plugins } from '#plugins';

const idleDelayMs = 20e3; //no rooms for this long before warming starts (rooms come and go, and the worker takes a while to boot)
const checkMs = 500; //how quickly it notices a room has been made
const defaultSearches = 1000;
const chunk = 250;

const progress = new Map(); //job key -> searches done so far, kept across stops

let worker = null;
let idleSince = null;
let finished = false;
let starting = false;

const roomCount = () => ss.RoomManager?.rooms?.size;

async function collectWork() {
    const data = { jobs: [{ maps: null, modifiers: {}, searches: defaultSearches, priority: 10 }] };
    await plugins.emit('idleWarmJobs', data);
    const names = (ss.maps ?? []).map((m) => m.name);
    const work = [];
    for (const job of data.jobs) for (const map of job.maps ?? names) {
        const key = JSON.stringify([map, job.modifiers]);
        const left = (job.searches ?? defaultSearches) - (progress.get(key) ?? 0);
        if (left > 0 && names.includes(map)) work.push({ key, map, modifiers: job.modifiers, left, priority: job.priority ?? 10 });
    };
    return work.sort((a, b) => a.priority - b.priority || names.indexOf(a.map) - names.indexOf(b.map));
}

async function start() {
    const work = await collectWork();
    if (!work.length) return finished = true;
    if (roomCount() !== 0) return; //(a room was made while that was being worked out)
    console.log(`[deadinternet] no rooms, warming the pathfinding cache (${work.length} map/profile pairs left)`);
    worker = new Worker(new URL('./idlewarm-worker.js', import.meta.url), {
        workerData: { seed: { maps: ss.maps, items: ss.items, permissions: ss.permissions, config: ss.config }, work, chunk },
    });
    worker.on('message', (msg) => { if (msg.key) progress.set(msg.key, (progress.get(msg.key) ?? 0) + msg.done); });
    worker.on('error', (error) => { console.error('[deadinternet] idle cache warming failed:', error); finished = true; });
    worker.on('exit', (code) => { worker = null; if (code === 0) finished = true; });
}

function stop() {
    if (!worker) return;
    console.log('[deadinternet] a room was made, stopping cache warming');
    worker.terminate();
    worker = null;
}

export function startIdleWarm() {
    if (!isMainThread || plugins.type !== 'game') return;
    setInterval(() => {
        const rooms = roomCount();
        if (rooms === undefined || finished) return; //(not a game server's main thread, or nothing left to do)
        if (rooms > 0) { idleSince = null; return stop(); };
        idleSince ??= Date.now();
        if (!worker && !starting && Date.now() - idleSince >= idleDelayMs) {
            starting = true;
            start().catch((error) => console.error('[deadinternet] idle cache warming:', error)).finally(() => starting = false);
        };
    }, checkMs).unref();
}
