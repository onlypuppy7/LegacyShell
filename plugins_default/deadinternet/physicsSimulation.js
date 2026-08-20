// Real-physics edge verification. pathfinding.js's static classification (isStandable /
// hasHeadroom / the jump-cost estimate) approximates whether an edge is traversable from cell
// occupancy alone - every real bug found this session (corner-cutting through a wall, "walkable"
// tower-top cells that are actually thinner than a grid cell, jump-height estimates that don't
// match real physics) was exactly that approximation diverging from what the real collision
// geometry and real player physics actually do. This module replaces the guess with ground
// truth: it temporarily drives the CALLING BOT'S OWN real, live Player through the candidate
// edge - using simulateMovement()/jump(), the exact same code its real ticks run - and reports
// where it actually ends up, then restores the player to exactly its original state.
//
// Deliberately not a separate throwaway "phantom" player: that would need its own modifiers,
// weapon loadout, and gameOptions kept in sync with whatever the real bot has (team, speed
// changes from /bots add, etc.), which is exactly the kind of thing that quietly drifts out of
// sync over time. Reusing the real player's own already-correct state via player.js's existing
// createSnapshot()/restoreSnapshot() - built for reconciliation, reused here for the same
// "run some ticks, then put it back exactly as it was" shape - sidesteps that entirely: nothing
// here is a duplicate of real state, so nothing here can drift from it.
import { CONTROL, ticksPerSecond } from '#constants';

// Map geometry never changes for a room's lifetime, so a given edge's simulated outcome is
// deterministic - simulate any (fromKey,toKey,jump) combination at most once per room, ever,
// and reuse the cached result for every future query (this search, and every future search -
// pathfinding.js re-queries the same local edges constantly across different goals).
const roomCaches = new WeakMap(); // room -> Map<string, result>

function getCache(room) {
    let cache = roomCaches.get(room);
    if (!cache) { cache = new Map(); roomCaches.set(room, cache); };
    return cache;
};

// NOT 1/60. server-game/src/rooms.js's room loop calls a non-human player's update() with the
// literal integer 1 every tick (`await player.update(1)`, see roomManager's updateLoop) - the
// whole physics model (accel, gravity, jump impulse) is calibrated per-TICK, not per-second, and
// the 60/s TICK RATE is handled entirely by how often update() gets called, not by the delta
// value passed into it. Using 1/60 here (a bug that survived several earlier "fixes" this
// session) made every force in this simulation run at 1/60th of its real strength - which is
// exactly why a cold start looked implausibly slow and seemed to need an artificial velocity
// seed (removed below) to reach any usable speed within a sane tick budget.
const deltaSeconds = 1;

// Simulates approaching (to.x, to.z) from (from.x, from.y, from.z) using `player`'s own real
// modifiers/physics, mirroring DeadInternetBot.followPath()'s real per-tick control logic
// (index.js) as closely as this offline simulation can: re-aiming at the target every tick
// (not just once), and - for a jump edge - backing away briefly before approaching and jumping,
// since a standing jump alone doesn't reliably clear a full level (see followPath()'s own
// comment on this). `player` is left in exactly the state it was found in once this returns,
// success or failure (see finally).
// maxTicks is a hard ceiling above the progressWindowTicks bail (see below) for the case where
// distance keeps *slowly* improving the whole time without either arriving or triggering the
// stuck bail - 600 ticks is a generous 10 real-time seconds for a single grid-edge hop, well
// beyond anything a real successful approach takes, while still bounding worst-case speed
// buildup the same way the stuck-bail window does.
export function simulateEdge(player, from, to, { jump = false, maxTicks = 600, arrivalRadius = 0.3, verticalTolerance = 1.25 } = {}) {
    const snapshot = player.createSnapshot();
    // createSnapshot()'s field list (see player.js) doesn't include a couple of fields this
    // simulation also touches - saved separately so restore is complete, not just "mostly".
    const wasJumping = player.jumping;
    const wasLastTouchedGround = player.lastTouchedGround;
    const wasClimbingCell = { ...player.climbingCell };

    try {
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        const ddx = dx / len;
        const ddz = dz / len;

        player.x = from.x;
        player.y = from.y;
        player.z = from.z;
        // Starting from a dead stop, not a seeded "cruise" velocity: with delta fixed above,
        // acceleration (.007/tick, see player.js) reaches a normal walking speed within a
        // handful of ticks, same as a real player actually does when they first press a
        // direction key - a hand-tuned velocity seed isn't needed to make this realistic, it was
        // only ever compensating for the delta bug fixed above, and risked its own inaccuracy
        // (an arbitrary "how long was the runup" guess) once that compensation wasn't needed.
        player.dx = 0;
        player.dy = 0;
        player.dz = 0;
        player.jumping = false;
        player.jumps = 0;
        player.isFalling = false;
        player.climbing = false;
        player.corrected = { dx: 0, dy: 0, dz: 0 };
        player.corrections = 0;
        // lookForLadder() (called from inside moveX/moveZ) gates ladder-entry on
        // `controlKeys & CONTROL.up`, matching how a real bot holds "up" its whole approach.
        player.controlKeys = CONTROL.up;

        // followPath() backs the bot directly away from the takeoff point for a fixed 0.35s
        // before approaching a JUMP waypoint, because a standing jump (0 approach speed) only
        // reaches roughly half a block of clearance - well under the full block a JUMP edge
        // needs. Skipping this and just jumping from a standing start (the first version of this
        // function) meant every JUMP edge was judged by a weaker jump than a real bot ever
        // actually attempts, and failed almost universally as a result.
        // 0.35 real seconds worth of TICKS - ticksPerSecond (the tick rate), not deltaSeconds (the
        // per-tick physics delta), converts a real-time duration to a tick count. Conflating the
        // two here once meant this evaluated to 0 ticks (0.35/1, since deltaSeconds is 1) and the
        // run-up phase silently never ran at all - confirmed by testing: JUMP edges were bailing
        // at almost exactly the "standing jump only clears half a block" distance from index.js's
        // own comment, i.e. exactly the outcome of never actually getting a run-up.
        const jumpRunupTicks = jump ? Math.round(0.35 * ticksPerSecond) : 0;

        // Bail out once horizontal distance-to-target has gone a full window without improving
        // at all, rather than a raw velocity threshold - a walk starts from a dead stop and needs
        // a handful of ticks to accelerate up to speed, so "is velocity near zero" can't tell
        // "still accelerating normally" apart from "genuinely stuck against a wall" (confirmed by
        // testing: a velocity-threshold version of this bailed out early on ordinary walks and
        // rejected almost every real edge as a false failure). Distance either keeps shrinking as
        // the player actually approaches, or it doesn't - that's a direct, unambiguous signal.
        //
        // The window is 1.8s (108 ticks at 60/s) to match index.js's real checkStuck() exactly -
        // that's the real bot's own hard "stuck too long, force a replan" threshold. This isn't
        // just cosmetic: dx/dz accumulate from held-direction acceleration with NO speed cap
        // anywhere in simulateMovement (only dy is clamped) - a real bot never sees that matter
        // because checkStuck() always gives up within 1.8s of no progress, long before speed can
        // grow unrealistic. An earlier, much longer window (600 real-time ticks, reasoned purely
        // from "simulated ticks are free CPU, so a big budget costs nothing") let a genuinely
        // stuck simulated player keep accelerating for 10+ real-time seconds with nothing to stop
        // it, reaching speeds no real bot ever reaches and producing bogus outcomes once that
        // speed hit a collision (tunneling through geometry, getting launched off a ledge) -
        // confirmed by testing: this was the actual cause of a wave of same-level AND rise-level
        // edges failing with a suspiciously identical ~0.4-unit vertical drop, unrelated to real
        // map geometry. Matching the real give-up timing fixes both problems as one: it's more
        // physically accurate AND keeps speed bounded to what real play actually produces.
        const progressWindowTicks = 108;
        let bestDistance = Infinity;
        let bestDistanceAtTick = 0;

        for (let tick = 1; tick <= maxTicks; tick++) {
            // followPath() re-aims at the (fixed) waypoint from the player's CURRENT position
            // every single tick, not once at the start - so a mid-approach deflection (a clipped
            // corner, a partial collision on one axis) gets corrected on the very next tick
            // instead of permanently skewing the rest of the approach. The first version of this
            // function computed ddx/ddz once before the loop and held it fixed the whole way,
            // which - confirmed by testing - let a single-tick collision on one axis alone bend
            // the trajectory away from the target with no way to recover: exactly the kind of
            // false failure this whole module exists to avoid introducing.
            const curDx = to.x - player.x;
            const curDz = to.z - player.z;
            const curLen = Math.sqrt(curDx * curDx + curDz * curDz) || 1;
            let ddx = curDx / curLen;
            let ddz = curDz / curLen;

            if (jump && tick <= jumpRunupTicks) {
                // Run-up phase: hold directly away from the target (mirrors followPath()'s
                // CONTROL.down, which negates the same yaw-facing direction used for "up").
                ddx = -ddx;
                ddz = -ddz;
            } else if (jump) {
                player.jump();
            };

            player.simulateMovement({ ddx, ddy: 0, ddz, delta: deltaSeconds });

            const horizontalDistance = Math.length2(player.x - to.x, player.z - to.z);
            const verticalDistance = Math.abs(player.y - to.y);
            if (horizontalDistance < arrivalRadius && verticalDistance < verticalTolerance) {
                return { success: true, x: player.x, y: player.y, z: player.z, ticks: tick };
            };

            if (horizontalDistance < bestDistance - 0.05) {
                bestDistance = horizontalDistance;
                bestDistanceAtTick = tick;
            } else if (tick - bestDistanceAtTick > progressWindowTicks) {
                console.log('[physicsSimulation DEBUG] bailed', { from, to, jump, tick, bestDistance, playerPos: { x: player.x, y: player.y, z: player.z }, playerVel: { dx: player.dx, dy: player.dy, dz: player.dz }, jumping: player.jumping, isFalling: player.isFalling });
                break;
            };
        };

        console.log('[physicsSimulation DEBUG] FAILED', { from, to, jump, ddx, ddz, endPos: { x: player.x, y: player.y, z: player.z }, endVel: { dx: player.dx, dy: player.dy, dz: player.dz }, jumping: player.jumping, isFalling: player.isFalling });
        return { success: false, x: player.x, y: player.y, z: player.z, ticks: maxTicks };
    } finally {
        player.restoreSnapshot(snapshot);
        player.jumping = wasJumping;
        player.lastTouchedGround = wasLastTouchedGround;
        player.climbingCell = wasClimbingCell;
    };
};

export function simulateEdgeCached(room, player, fromKey, toKey, from, to, opts = {}) {
    const cache = getCache(room);
    const cacheKey = `${fromKey}->${toKey}:${opts.jump ? 'j' : 'w'}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const result = simulateEdge(player, from, to, opts);
    cache.set(cacheKey, result);
    return result;
};

// True for anything duck-typed enough to simulate with (a real Player has these; the plain
// {x,y,z} objects test-pathfinding.js's synthetic fixtures use, and any caller not passing a
// live bot player as `start`, don't) - pathfinding.js falls back to its static estimates
// whenever this is false, so the offline unit tests keep working unchanged.
export function canSimulate(player) {
    return !!(player && typeof player.simulateMovement === 'function' && typeof player.createSnapshot === 'function');
};
