// Tests for how DeadInternetBot.pathTo() avoids needless searching - route reuse, the search floor,
// backing off after a failure, snapping a mid-air goal, partial routes, and keeping a route through
// a fight - plus the search-level options (snapGoal / allowPartial) in pathfinding.js. Offline: a
// synthetic map and a plain-object player (so pathfinding uses its static estimates), with a
// controllable clock.
//
// Run with: node plugins_default/deadinternet/test-path-economy.js

import { DeadInternetBot, DeadInternetBots, perf } from './index.js';
import { findPath } from './pathfinding.js';

let passed = 0, failed = 0;
const assert = (name, ok, detail = '') => { if (ok) { passed++; console.log(`  ok - ${name}`); } else { failed++; console.log(`  FAIL - ${name}${detail ? ` (${detail})` : ''}`); } };

function makeMap(width, height, depth) {
    const data = [];
    for (let x = 0; x < width; x++) { data[x] = []; for (let y = 0; y < height; y++) { data[x][y] = []; for (let z = 0; z < depth; z++) data[x][y][z] = {}; } }
    return { data, width, height, depth };
}
const solid = (map, x, y, z) => { map.data[x][y][z] = { idx: 1, mesh: { colliderType: 'full' }, rx: 0, ry: 0, rz: 0 }; };
function flatMap(w = 30, d = 30, h = 6) {
    const map = makeMap(w, h, d);
    for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) solid(map, x, 0, z);
    return map;
}

// A controllable clock: pathTo() reads Date.now().
const realNow = Date.now;
let clock = 1_000_000;
Date.now = () => clock;
const advance = (ms) => { clock += ms; };

function makeBot(map, at = { x: 2.5, y: 1, z: 2.5 }) {
    const bot = new DeadInternetBot({ map }, {});
    bot.player = { ...at, dx: 0, dy: 0, dz: 0, controlKeys: 0, modifiers: {}, jumping: false, isFalling: false, climbing: false, name: 'test' };
    return bot;
}
const counter = (name) => perf.counters.get(name) ?? 0;
const cleanup = () => { DeadInternetBots.length = 0; };

perf.start();

console.log('Test: route reuse');
{
    const map = flatMap();
    const bot = makeBot(map);
    const goal = { x: 20.5, y: 1, z: 20.5 };
    const first = bot.pathTo(goal, { chase: true });
    assert('finds a route', !!first && first.length > 0);
    const searches = counter('searches.found');

    advance(50);
    const again = bot.pathTo({ x: 20.5, y: 1, z: 21.5 }, { chase: true });
    assert('a goal that moved one block keeps the same route (no search)', again === first && counter('searches.found') === searches);
    assert('...and says so', counter('search.skipped.reuse') >= 1);

    advance(50);
    const sameCell = bot.pathTo({ x: 20.7, y: 1, z: 20.6 }, { chase: true });
    assert('the same cell keeps it too', sameCell === first);

    advance(900);
    const farMove = bot.pathTo({ x: 6.5, y: 1, z: 25.5 }, { chase: true });
    assert('a goal that moved far gets a new search', farMove !== first && counter('searches.found') === searches + 1);

    // tolerance: shrinks with distance
    const near = makeBot(map, { x: 10.5, y: 1, z: 10.5 });
    const nearRoute = near.pathTo({ x: 12.5, y: 1, z: 10.5 }, { chase: true });
    advance(1000);
    const nearMoved = near.pathTo({ x: 12.5, y: 1, z: 13.5 }, { chase: true });
    assert('a goal 2 blocks away that moves 3 blocks is a new route (tolerance shrinks with distance)', nearMoved !== nearRoute);

    // old routes expire
    const old = makeBot(map);
    const oldRoute = old.pathTo(goal, { chase: true });
    advance(6000);
    assert('a route is re-checked after a few seconds even if nothing moved', old.pathTo(goal, { chase: true }) !== oldRoute);
    cleanup();
}

console.log('Test: the search floor');
{
    const map = flatMap();
    const bot = makeBot(map);
    const first = bot.pathTo({ x: 25.5, y: 1, z: 5.5 }, { chase: true });
    advance(100);
    const before = counter('searches.found');
    const second = bot.pathTo({ x: 5.5, y: 1, z: 25.5 }, { chase: true });
    // That jump is ~28 blocks - a different destination, so it does not wait for the floor.
    assert('a completely different destination is searched for at once', second !== first && counter('searches.found') === before + 1);

    const chaser = makeBot(map);
    const r1 = chaser.pathTo({ x: 20.5, y: 1, z: 10.5 }, { chase: true });
    advance(100);
    const s = counter('searches.found');
    const r2 = chaser.pathTo({ x: 20.5, y: 1, z: 17.5 }, { chase: true }); // 7 blocks: beyond tolerance, but inside the floor window
    assert('a moving target is not re-searched more than about twice a second', r2 === r1 && counter('searches.found') === s && counter('search.skipped.floor') >= 1);
    advance(800);
    const r3 = chaser.pathTo({ x: 20.5, y: 1, z: 17.5 }, { chase: true });
    assert('...but is once the floor has passed', r3 !== r1);
    cleanup();
}

console.log('Test: backing off after a failed search');
{
    const map = flatMap();
    // A sealed box the goal sits inside: unreachable, with no way to get closer than its walls.
    for (let x = 18; x <= 22; x++) for (let z = 18; z <= 22; z++) for (let y = 1; y <= 4; y++) if (x === 18 || x === 22 || z === 18 || z === 22 || y === 4) solid(map, x, y, z);
    const bot = makeBot(map);
    const goal = { x: 20.5, y: 1, z: 20.5 };

    const attempt1 = bot.pathTo(goal);
    assert('an unreachable goal gives no route', attempt1 === null);
    const searches = counter('searches.none') + counter('searches.exhausted') + counter('searches.limit');
    advance(100);
    const attempt2 = bot.pathTo({ x: 20.5, y: 1, z: 21.5 });
    assert('trying a neighbouring cell straight away does not search again', attempt2 === null && counter('search.skipped.backoff') >= 1 && (counter('searches.none') + counter('searches.exhausted') + counter('searches.limit')) === searches);
    const until1 = bot.pathFailUntil;

    advance(2000);
    bot.pathTo(goal);
    assert('after the wait it tries again', (counter('searches.none') + counter('searches.exhausted') + counter('searches.limit')) === searches + 1);
    assert('...and waits longer next time (backs off exponentially)', bot.pathFailUntil - clock > until1 - 1_000_000 - 99999 && bot.pathFailCount === 2 && (bot.pathFailUntil - clock) > 1000);

    // a wildly different goal is not held back by the failure
    advance(100);
    const elsewhere = bot.pathTo({ x: 5.5, y: 1, z: 5.5 });
    assert('a different, reachable goal is not blocked by the backoff', !!elsewhere && bot.pathFailCount === 0);
    cleanup();
}

console.log('Test: snapping a mid-air goal and partial routes');
{
    const map = flatMap();
    const bot = makeBot(map);
    const midair = { x: 15.5, y: 4.2, z: 15.5 };
    assert('a goal in mid-air gives no route normally', findPath({ map }, bot.player, midair) === null);
    const snapped = findPath({ map }, bot.player, midair, { snapGoal: true });
    assert('with snapGoal it heads for the floor underneath', !!snapped && Math.abs(snapped[snapped.length - 1].x - 15.5) < 1.1 && snapped[snapped.length - 1].y === 1, JSON.stringify(snapped && snapped[snapped.length - 1]));

    // A wall across the whole room, no gap: the goal is unreachable but a partial route gets close.
    const walled = flatMap();
    for (let x = 0; x < 30; x++) for (let y = 1; y <= 5; y++) solid(walled, x, y, 15);
    const b2 = makeBot(walled, { x: 3.5, y: 1, z: 3.5 });
    const far = { x: 25.5, y: 1, z: 25.5 };
    assert('walled off: no route normally', findPath({ map: walled }, b2.player, far) === null);
    const partial = findPath({ map: walled }, b2.player, far, { allowPartial: true });
    assert('with allowPartial it gets as close as it can', !!partial && partial.partial === true && partial[partial.length - 1].z <= 14.6, JSON.stringify(partial && partial[partial.length - 1]));
    assert('...and that really is closer than where it started', Math.hypot(partial[partial.length - 1].x - far.x, partial[partial.length - 1].z - far.z) < Math.hypot(3.5 - far.x, 3.5 - far.z) - 5);

    const standing = makeBot(walled, { x: 25.5, y: 1, z: 14.5 }); // directly across the wall from the goal
    assert('already as close as it can get: reported as no route, not a pointless one', findPath({ map: walled }, standing.player, far, { allowPartial: true }) === null);

    const viaBot = makeBot(walled, { x: 3.5, y: 1, z: 3.5 });
    const chased = viaBot.pathTo(far, { chase: true });
    assert('a chasing bot takes the partial route', !!chased && chased.partial === true);
    assert('an exact-destination caller does not', makeBot(walled, { x: 3.5, y: 1, z: 3.5 }).pathTo(far) === null);

    const complete = makeBot(map, { x: 2.5, y: 1, z: 2.5 }).pathTo({ x: 25.5, y: 1, z: 25.5 }, { chase: true });
    assert('a reachable goal still gets a complete route', !!complete && !complete.partial);
    cleanup();
}

console.log('Test: keeping the route through a fight');
{
    const map = flatMap();
    const bot = makeBot(map);
    const goal = { x: 25.5, y: 1, z: 2.5 };
    const route = bot.pathTo(goal, { chase: true });
    assert('has a route', !!route && route.length > 3);
    bot.pathIndex = 2;

    bot.suspendPath();
    assert('suspending keeps the route', bot.currentPath === route && bot.pathSuspended === true);
    assert('...but the bot does not follow it meanwhile', bot.followPath(1) === 'idle' && bot.player.controlKeys === 0);

    bot.player.x += 1.0; bot.player.z += 0.8; // the fight moved it a little
    advance(200);
    const before = counter('searches.found');
    const resumed = bot.pathTo(goal, { chase: true });
    assert('afterwards the same route is picked up again, with no new search', resumed === route && !bot.pathSuspended && counter('searches.found') === before && counter('path.resumed') >= 1);
    assert('...from the waypoint nearest the bot', bot.pathIndex >= 0 && bot.pathIndex < route.length);

    bot.suspendPath();
    bot.player.x = 2.5; bot.player.z = 25.5; // carried far away from the route
    advance(1500);
    const fresh = bot.pathTo(goal, { chase: true });
    assert('if the fight took it far from the route, it searches again', fresh !== route && !bot.pathSuspended);

    const dropper = makeBot(map);
    dropper.pathTo(goal, { chase: true });
    dropper.suspendPath();
    dropper.stopPath();
    assert('stopPath() clears a suspended route', dropper.currentPath === null && dropper.pathSuspended === false);

    const second = makeBot(map);
    second.pathTo(goal, { chase: true });
    second.suspendPath(); second.suspendPath();
    assert('suspending twice is harmless', second.pathSuspended === true && !!second.currentPath);
    cleanup();
}

console.log('Test: the combat AI uses all of this');
{
    const map = flatMap();
    const bot = makeBot(map);
    bot.combat = { markUnreachable() { } };
    const goal = { x: 22.5, y: 1, z: 8.5 };
    bot.applyCombat({ engaged: false, moveTo: goal, state: 'hunt', reload: false, swap: null, grenade: null, yaw: 0, pitch: 0, controls: 0, jump: false }, 1);
    const route = bot.currentPath;
    assert('a destination from the combat layer starts a route', !!route && route.length > 0);
    bot.applyCombat({ engaged: true, yaw: 1, pitch: 0, controls: 1, jump: false, reload: false, swap: null, grenade: null, moveTo: null, state: 'engage' }, 1);
    assert('engaging suspends it instead of discarding it', bot.currentPath === route && bot.pathSuspended === true);
    assert('...and the combat layer owns the controls meanwhile', bot.player.controlKeys === 1 && bot.player.yaw === 1);
    advance(300);
    bot.applyCombat({ engaged: false, moveTo: goal, state: 'hunt', reload: false, swap: null, grenade: null, yaw: 0, pitch: 0, controls: 0, jump: false }, 1);
    assert('when the fight ends the same route resumes', bot.currentPath === route && bot.pathSuspended === false);
    bot.applyCombat({ engaged: true, yaw: 1, pitch: 0, controls: 1, jump: false, reload: false, swap: null, grenade: null, moveTo: null, state: 'engage' }, 1);
    bot.applyCombat({ engaged: false, moveTo: null, state: 'idle', reload: false, swap: null, grenade: null, yaw: 0, pitch: 0, controls: 0, jump: false }, 1);
    assert('with nowhere left to go, a suspended route is dropped rather than followed', bot.currentPath === null && bot.pathSuspended === false);
    cleanup();
}

perf.stop();
Date.now = realNow;
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
