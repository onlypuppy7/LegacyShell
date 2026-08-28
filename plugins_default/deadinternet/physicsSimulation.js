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

// Shared with index.js's followPath() - the two run independently (this file drives a real
// player through the whole edge synchronously here, ahead of time, to verify it before the
// planner offers it; followPath() drives the SAME player one real tick at a time, live, on
// whichever edge got chosen), so they can't literally share a tick loop, but the ONE piece that
// genuinely should always match - how long a jump's initial back-away phase runs - lives here so
// there's exactly one place to change it. Getting this out of sync is not hypothetical: it's
// what caused a real bug earlier the same day this constant was extracted (see git history around
// "phase-2 wall-collision cutoff") - index.js's copy got tuned and this file's didn't, and the
// two silently disagreed about how a jump waypoint should be approached until something checked.
export const JUMP_RUNUP_BACKAWAY_SECONDS = 0.1;

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
// maxTicks is a hard ceiling above the progressWindowSeconds bail (see below) for the case where
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
        // Arrive already moving, not from a dead stop. A real bot reaches a takeoff cell walking -
        // it came from the previous waypoint - so by the time it commits to an edge it is already at
        // the walk equilibrium speed and slightly PAST the cell centre. Starting cold at the exact
        // centre understates both, and once the drag below makes speeds honest that understatement
        // is the difference between an edge verifying and being rejected: measured on
        // "PathJumpHardTest" checkpoint3->4, the live bot began its jump at x=5.702 already at speed
        // and mantled up onto the block (y 2.001 -> 2.655), while the cold-start simulation of the
        // same edge fell into the gap instead (y 2 -> 1.688) and stalled 0.25 short of even
        // entering the target cell.
        // The seed is the drag equilibrium itself (.007 accel against .8/tick drag settles at
        // .007*.8/(1-.8)), not a hand-tuned guess - it's the speed the physics actually converges
        // to, so this starts the sim where a walking bot genuinely already is rather than making it
        // spend the whole edge accelerating up to it. An earlier version of this file had a velocity
        // seed removed for being an arbitrary "how long was the runup" guess compensating for a
        // since-fixed delta bug; this one is derived from the engine's own constants.
        const equilibriumSpeed = 0.007 * 0.8 / (1 - 0.8);
        player.dx = ddx * equilibriumSpeed;
        player.dz = ddz * equilibriumSpeed;
        player.dy = 0;
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
        // Run-up matters for two different reasons, not just one: gaining height (building
        // approach speed for the marginal step-up-on-collision mantle a level-up jump relies on -
        // see the up-one-level cost comment in pathfinding.js), OR covering real horizontal
        // DISTANCE at the far end of what a gap-jump attempts. A short same-level hop (2 cells or
        // less) doesn't need either - a standing jump's own ~40-tick air time comfortably covers
        // it, and backing away first only adds risk (see the ground-loss guard below) for zero
        // benefit; confirmed on "PathTestMap", an ordinary flat 2-cell gap-jump backed off its own
        // shallow takeoff platform for no reason. But a LONG same-level jump (3 cells, the far
        // edge of what pathfinding.js's gap-jump generator even attempts) still needs real ground
        // speed built up BEFORE leaving the ground, for the exact same reason a height jump does -
        // starting from zero and accelerating only during the ~40-tick flight isn't enough runway
        // to cover the full distance. Confirmed on "PathLadderTest": a plain, flat, obstruction-
        // free 3-cell platform-to-platform jump - about as ordinary a jump as exists in this game -
        // was offline-verified as a narrow, marginal pass (landed 0.256 units off target, just
        // under the 0.3 arrival radius, while still 0.74 units above the target height and
        // visibly still falling) and failed live on the very first real attempt, every time.
        const jumpNeedsRunup = to.y > from.y || len > 2;
        // 0.35s (21 ticks) as a single "back away then jump immediately" phase turned out to be
        // actively counterproductive, for two compounding reasons found by tracing a real failing
        // edge on "PathTestMap" tick by tick:
        //  1. simulateMovement smooths velocity, not just position, so reversing direction after
        //     backing away isn't instant - canceling N ticks' worth of backward momentum takes
        //     roughly N MORE ticks of forward accel before the player is even moving toward the
        //     target again. With a 21-tick back-away, the player was STILL drifting away from the
        //     target at tick 35, 14 ticks after jump() had already fired.
        //  2. Calling jump() the INSTANT the back-away ends means the forward charge happens
        //     entirely WHILE AIRBORNE - by the time the player actually reaches the wall, a good
        //     chunk of the jump's fixed ~40-tick air time (and, worse, its ascent) is already
        //     spent, leaving little remaining arc for the moveX step-up-on-collision nudge
        //     (`out.y += Math.abs(ndx) + .01*delta`) to accumulate the needed height before
        //     gravity wins. A real running jump builds speed on solid GROUND first and leaves the
        //     ground already moving, not from a standing start mid-air.
        // Three phases fix both: back away briefly (still grounded), charge forward for a bit
        // LONGER while still grounded (building real speed before ever leaving the ground), then
        // jump - carrying that ground speed into the leap, hitting the wall early in the arc while
        // there's still height and time left for the nudge to work.
        // player.js's update() scales its own per-tick delta by physicsSpeedModifier before any
        // movement/gravity math runs (see the deltaSeconds comment above - this loop calls
        // simulateMovement with a fixed delta of 1 every iteration, matching how the real game
        // drives a bot, and physicsSpeedModifier scales it from there internally). So the loop's
        // own `tick` counter - a count of ITERATIONS - doesn't correspond to a fixed amount of
        // simulated time unless physicsSpeedModifier is 1: at 2x, each iteration already covers
        // twice the simulated motion. `simulatedTime` (accumulated below, inside the loop) tracks
        // actual elapsed simulated time directly instead, so every duration below - matching
        // index.js's own run-up timing exactly - is expressed as plain calibrated seconds
        // (JUMP_RUNUP_BACKAWAY_SECONDS, 0.15) and compared against that running total, not
        // against a pre-computed, speed-blind tick count.
        const physicsSpeed = player?.modifiers?.physicsSpeedModifier || 1;
        // Used to be 0.15s for a flat takeoff and 1.0s only when fromOnRamp, on the theory that a
        // standing jump already covers about as much distance as a full run-up on FLAT ground, so
        // a short window was fine there and only a ramp (continuing to walk up a slope keeps
        // gaining real distance AND height) needed the wider one. That theory doesn't hold once a
        // same-level jump is close enough to its real max range that the difference matters: a
        // flat takeoff's real solid surface commonly extends well past what 0.15s of charge would
        // ever reach, and the reactive checks just below (chargeBlockedAtTick's wall-collision
        // drop, and the ground-ahead probe) are what actually decide when a real player would stop
        // and jump - not an assumed duration. Confirmed live on "PathJumpDiagTest"
        // checkpoint1->goal: a flat, same-level, non-ramp diagonal jump landed a full level short
        // and fell into the gap below, with the 0.15s window ending the charge while the takeoff
        // block's real surface still continued - the wall-collision check never had a chance to
        // fire because there was never a wall, just the short window running out first.
        //
        // Scoped to NON-ascending jumps specifically (same-level or descending), not widened
        // universally - an ascending (level-up) jump's approach ends at the base of a rising wall,
        // not on a continuous flat/sloped surface, and the reactive ground-ahead probe just below
        // has no way to tell "no ground within the probe's height range because it's open air"
        // apart from "no ground within range because the real surface is a wall taller than the
        // probe reaches" - both look identical to a downward-only height sweep. Confirmed live on
        // "PathJumpHardTest": widening this unconditionally broke checkpoint1->checkpoint2 and
        // every other ascending jump in the map outright (findPath returned null for all of them,
        // not just a marginal shortfall) - the wide window let the charge get close enough to the
        // target's base wall to trip the ground-ahead probe as a false "lost ground", cutting the
        // charge to nothing right at the one point an ascending jump most needs speed for the
        // step-up-on-collision mantle it relies on (see pathfinding.js's up-one-level cost
        // comment). Ascending jumps keep the original narrow window and no reactive ground-ahead
        // check at all - already correct and extensively verified across tonight's whole session,
        // untouched by this fix.
        const jumpChargeSeconds = to.y > from.y ? 0.15 : 1.0;
        const jumpLiftoffSeconds = JUMP_RUNUP_BACKAWAY_SECONDS + jumpChargeSeconds;
        // Mutable ceiling on top of the fixed jumpLiftoffSeconds cap above - phase 2's own ground-
        // ahead check (below) can only ever CUT this shorter (never extend past jumpLiftoffSeconds
        // itself), the same relationship index.js's followPath() has between its safety-net TIME
        // cap and its reactive jumpChargeMaxTime. A ramp cell's charge window here is wide (1.0s)
        // specifically because continuing to walk up the slope keeps gaining real ground and real
        // height - but past the ramp's actual PEAK there's no more slope to gain from, only open
        // air, and blindly holding forward for the rest of that 1.0s window walks straight off the
        // edge into a genuine fall instead of ever lifting off. Confirmed live on "PathJumpHardTest"
        // checkpoint5->goal: without this, the simulated player fell continuously from y=3.96 to
        // y=1.0 over about a second of "charging" that was never actually charging past the first
        // few ticks, `jumping` staying false the entire time - not a slow charge, a genuine
        // uncontrolled fall the fixed time cap alone had no way to react to.
        let jumpChargeMaxTime = jumpLiftoffSeconds;
        // followPath() holds "back away" for a fixed 0.35s regardless of what's actually behind
        // the takeoff point - on a tight/compact layout that's often a wall a few ticks in.
        // moveX/moveZ's collision response halves velocity on failure (`out.dx *= .5`), so a
        // wall hit shows up as a sudden, sharp DROP in run-up speed instead of the steady growth
        // pure acceleration produces - confirmed on "LadderTest": a run-up hit a wall around tick
        // 19 of 21, stalled there for the rest of the window, and the jump that followed had far
        // less built-up speed than a full unobstructed run-up assumes, landing short every time.
        // Cutting the run-up short the moment that signature appears - and jumping immediately
        // with whatever speed was actually built - is what a real player bumping into a wall
        // while backing up would naturally do; continuing to push into it for the rest of the
        // fixed window never gains anything.
        let runupSpeed = 0;
        let runupBlockedAtTick = null;
        // Same wall-collision signature as the back-away guard above, but for phase 2 (charge
        // forward) - a short takeoff cell (the target ledge close enough that the fixed 0.15s
        // charge window reaches its vertical face before jump() ever fires at jumpLiftoffSeconds)
        // meant the charge phase could plow straight into the wall, kill all horizontal velocity
        // via the same moveX/moveZ collision response, and THEN call jump() from that now-dead
        // stop - producing exactly the "barely rises, barely moves" failure this was silently
        // causing, indistinguishable from a genuinely impossible jump without tracing it tick by
        // tick. Confirmed on "PathMapTest": a plain one-level climb onto a wall lip one cell away
        // from the takeoff point failed identically every time, endPos.y barely above the start
        // height 121 ticks after liftoff should have happened - the charge phase had already
        // killed its own momentum before jump() got a chance to use any of it. Cutting phase 2
        // short the instant this appears - and lifting off immediately with whatever speed was
        // actually built - mirrors what a real player bumping into the wall mid-approach would
        // do (jump on collision, not keep walking into it for the rest of the window).
        let chargeSpeed = 0;
        let chargeBlockedAtTick = null;
        let phase2StartTick = null; // raw loop-iteration count phase 2 began at - see its own grace-period comment below
        // Ground-loss guard reference: `runupStartSnapshot` is the ORIGINAL pre-run-up state, used
        // to DETECT any cumulative drop (comparing against just the previous tick misses a
        // gradual fall - see the check itself). `lastSafeSnapshot` is separate and tracks the most
        // RECENT still-safe tick, updated every tick that hasn't drifted yet - reverting all the
        // way to the original on detection turns the whole run-up into a zero-velocity standing
        // jump, which is actively worse than no fix at all for an UP jump: the up-one-level climb
        // relies on moveX's step-up-on-collision nudge (`out.y += Math.abs(ndx) + .01*delta`),
        // which scales with horizontal approach SPEED - a standing jump has near-zero ndx and gets
        // essentially no nudge, so it can never actually clear the level. Reverting to the most
        // recent safe tick instead preserves whatever real run-up distance/speed was safely built
        // before the ledge, the same way a real player backing toward an edge would stop right at
        // it and immediately charge forward from there, not teleport all the way back to a dead
        // stop. Confirmed on "PathTestMap": reverting fully to start left endVel.dx negative for
        // the whole simulation (the charge phase never meaningfully started), and the jump failed
        // every time even though this exact edge is the map's only static route across.
        const runupStartSnapshot = jump ? player.createSnapshot(true) : null;
        let lastSafeSnapshot = runupStartSnapshot;

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
        // 1.8s, matching index.js's real checkStuck() exactly - see that constant's own comment
        // for why. Compared against simulatedTime (below), not a pre-computed tick count, for the
        // same physicsSpeedModifier-awareness reason as the run-up durations above.
        const progressWindowSeconds = 1.8;
        let bestDistance = Infinity;
        let bestDistanceAtSimTime = 0;
        let simulatedTime = 0;

        for (let tick = 1; tick <= maxTicks; tick++) {
            simulatedTime += physicsSpeed / ticksPerSecond;
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

            // followPath() sets this every tick too (`this.player.yaw = Math.atan2(dx, dz)`,
            // same formula, same curDx/curDz) - simulateMovement()'s own accel math doesn't
            // depend on yaw (it uses ddx/ddz directly), but other real player mechanics do:
            // lookForLadder() (see player.js) only attaches to a ladder cell when yaw is roughly
            // aligned with the ladder's facing (ry) - leaving yaw unset here meant it kept
            // whatever stale value the bot's last real tick left it at, which had no reason to
            // face the ladder, and the simulated player would just walk into it and stop rather
            // than climb. Confirmed on "PathTestMap": every edge leading onto the tower's ladder
            // failed physics verification until this was added.
            player.yaw = Math.atan2(curDx, curDz);

            // update() (the real per-tick caller this module stands in for) branches the SAME
            // "up" input differently depending on this.climbing: normally CONTROL.up adds
            // horizontal ddx/ddz toward the facing direction, but once attached to a ladder it
            // adds ddy instead and horizontal input is ignored entirely (see player.js). Calling
            // simulateMovement() directly, as this whole module does, bypasses that translation -
            // without replicating it here, a player that attaches to a ladder mid-approach (via
            // the ordinary collision-triggered lookForLadder() inside moveX/moveZ) would stay
            // attached but never actually climb, since ddy was always hardcoded to 0.
            let ddx, ddy = 0, ddz;
            if (player.climbing) {
                ddx = 0;
                ddz = 0;
                ddy = 1;
            } else {
                ddx = curDx / curLen;
                ddz = curDz / curLen;

                if (jump && jumpNeedsRunup && runupBlockedAtTick === null && simulatedTime <= JUMP_RUNUP_BACKAWAY_SECONDS) {
                    // Phase 1 - back away, still grounded (mirrors followPath()'s CONTROL.down,
                    // which negates the same yaw-facing direction used for "up").
                    ddx = -ddx;
                    ddz = -ddz;
                } else if (jump && jumpNeedsRunup && chargeBlockedAtTick === null && simulatedTime <= jumpChargeMaxTime) {
                    // Phase 2 - charge forward, STILL grounded (no jump() yet) - ddx/ddz already
                    // point toward the target from the assignment above, nothing to flip. This is
                    // what actually builds real ground speed before ever leaving the ground.
                } else if (jump) {
                    // Phase 3 - liftoff. jump() only succeeds once (canJump() returns false once
                    // already jumping - see player.js), so calling it again every subsequent tick
                    // here is a harmless no-op that keeps the branch simple.
                    player.jump();
                };
            };

            player.simulateMovement({ ddx, ddy, ddz, delta: deltaSeconds });
            // Horizontal drag. player.js's update() applies this to dx/dz EVERY tick, airborne or
            // not, right after its own simulateMovement() call (the `this.dx *= Math.pow(.8, delta)`
            // pair at the end of update). This module drives simulateMovement directly instead of
            // going through update(), so it never picked the drag up - meaning it was simulating a
            // different physics engine than the one the bot actually runs under.
            //
            // The error was not subtle. Drag at .8/tick against the .007/tick air acceleration
            // settles at .007*.8/(1-.8) = .028, and that is exactly what the real bot does -
            // measured live, horizontal speed climbs to ~0.028 and sits there for the whole flight.
            // Without the drag this loop's speed grew linearly past 0.14, so every jump was judged
            // as reaching roughly FIVE TIMES further than the bot can actually throw itself. Found
            // by trapping writes to the live player's dx and reading the stack: player.js:419,
            // a clean 0.03404 -> 0.02723 (exactly x0.8) on the tick after acceleration was applied.
            //
            // This MUST land together with the cell-based arrival check below - see that comment.
            // Applying drag alone regresses things badly, because the old centre-to-centre arrival
            // test silently depended on the inflated speeds to ever be satisfiable.
            player.dx *= Math.pow(0.8, deltaSeconds);
            player.dz *= Math.pow(0.8, deltaSeconds);

            // Ground-loss guard: the takeoff cell isn't necessarily the middle of a wide platform
            // - backing straight away from the target for the full fixed window can walk the
            // player right off the BACK edge onto a lower level (or nothing at all), same failure
            // shape as the wall-collision case below but the opposite direction. Confirmed on
            // "PathTestMap": an ordinary flat 2-cell gap-jump backed off its own 1-cell-deep
            // takeoff ledge, dropped a full level, and never recovered enough of the intended
            // horizontal approach to make the (now effectively longer, and now also uphill) jump -
            // an edge that should have been trivial failed outright because the run-up sabotaged
            // its own takeoff point. The drop compounds gradually (gravity accumulates from zero,
            // it doesn't snap the player down in one tick) so DETECTING against only the PREVIOUS
            // tick misses it - by the time any single tick's delta clears a sane threshold, several
            // ticks of partial fall have already happened. Comparing against the ORIGINAL pre-
            // run-up height instead catches the first tick any cumulative drop appears. But the
            // REVERT target is `lastSafeSnapshot`, not the original - reverting all the way to a
            // dead stop turns an UP jump into a zero-velocity standing jump, which can never
            // actually clear the level: the climb relies on moveX's step-up-on-collision nudge
            // (`out.y += Math.abs(ndx) + .01*delta`), which scales with horizontal approach speed,
            // so a standing jump gets essentially no nudge at all. Reverting to the most recent
            // still-safe tick instead preserves whatever real run-up distance/speed was safely
            // built before the edge - a real player backing toward a ledge would stop right at it
            // and immediately charge forward from there, not teleport all the way back to a dead
            // stop. Confirmed on "PathTestMap": reverting fully to start left endVel.dx negative
            // for the entire simulation (the charge phase never meaningfully began), failing the
            // map's only static route across every single time.
            if (jump && jumpNeedsRunup && runupBlockedAtTick === null && simulatedTime <= JUMP_RUNUP_BACKAWAY_SECONDS) {
                if (player.y < runupStartSnapshot.y - 0.01) {
                    player.restoreSnapshot(lastSafeSnapshot);
                    runupBlockedAtTick = tick;
                } else {
                    lastSafeSnapshot = player.createSnapshot(true);
                    const speed = Math.sqrt(player.dx * player.dx + player.dz * player.dz);
                    if (speed < runupSpeed - 1e-6) runupBlockedAtTick = tick;
                    runupSpeed = speed;
                };
                phase2StartTick = tick + 1;
            };

            // Phase 2's own wall-collision cutoff - no revert needed here (unlike phase 1 above),
            // since charging INTO the wall doesn't lose ground that was already gained the way
            // backing into one does; this just needs to stop charging and let the very next tick
            // fall through to liftoff instead of continuing to push into the wall for the rest of
            // the fixed window.
            if (jump && jumpNeedsRunup && chargeBlockedAtTick === null && simulatedTime > JUMP_RUNUP_BACKAWAY_SECONDS && simulatedTime <= jumpChargeMaxTime) {
                const speed = Math.sqrt(player.dx * player.dx + player.dz * player.dz);
                // Skip the first few LOOP ITERATIONS of the charge phase before watching for a
                // drop - the direction reversal from phase 1's back-away to phase 2's OPPOSITE-
                // direction charge causes a genuine, momentary dip in speed MAGNITUDE
                // (decelerating through zero before accelerating the other way), indistinguishable
                // from a real wall collision by a bare "did speed drop" check. Confirmed by
                // testing: without this grace period, that natural reversal alone tripped the
                // cutoff on the very first or second phase-2 tick almost every time, reducing the
                // charge phase to nothing regardless of whether a wall was actually anywhere
                // nearby - the exact opposite of what this was meant to fix. Deliberately a raw
                // iteration count (phase2StartTick, set the first tick phase 2 is entered above),
                // not simulated-time-scaled - this is about how many numerical integration steps
                // the reversal needs to settle, not a real-time-calibrated duration.
                const ticksIntoCharge = tick - phase2StartTick;
                if (ticksIntoCharge > 3 && speed < chargeSpeed - 1e-6) chargeBlockedAtTick = tick;
                chargeSpeed = speed;
                // A wall-collision speed-drop (just above) only catches a genuine solid obstruction
                // - it does NOT catch charging off the far edge of a takeoff surface into open air,
                // since there's no collision there to cause a speed drop at all: the player keeps
                // moving horizontally at full speed while ALSO falling, which this check has no way
                // to distinguish from ordinary charging. Confirmed live on "PathJumpHardTest"
                // checkpoint5->goal (a ramp): without this, the simulated player walked straight
                // off the second wedge's peak and fell continuously for most of a full second
                // before ever lifting off - `jumping` stayed false the whole time, y dropped from
                // 3.96 to 1.0, and the eventual jump had almost none of its intended height or
                // reach left. Originally scoped to fromOnRamp only, on the theory that only a
                // ramp's own edge could be walked off mid-charge undetected by the wall check - but
                // the exact same shape of failure showed up on a flat, non-ramp takeoff too
                // (confirmed on "PathJumpDiagTest" checkpoint1->goal), so this is scoped the same
                // way jumpChargeSeconds above now is: non-ascending only, not fromOnRamp-only.
                //
                // Still gated to non-ascending specifically, not made fully unconditional - this
                // probe only sweeps DOWNWARD from close to the player's current height (0.15-0.9
                // units below), which can't distinguish real open air from simply approaching a
                // rising wall taller than that range, the exact situation every ascending jump's
                // charge phase is in by design. Confirmed live on "PathJumpHardTest": making this
                // unconditional broke checkpoint1->checkpoint2 and every other ascending jump in
                // the map outright (findPath returned null, not a marginal shortfall) - the wide
                // charge window let the approach get close enough to the target's base wall to
                // trip this probe as a false "lost ground", killing the charge at the exact point
                // an ascending jump most needs the speed for its step-up mantle. Same multi-height
                // forward probe index.js's followPath() already uses for its own live version of
                // this exact check (a takeoff surface's height can change or simply end along the
                // approach direction, so one fixed probe offset can't be trusted) - cutting the
                // charge the instant real ground stops being there, not after the fall has already
                // begun, is what "jump on the literal last tick before losing ground" (the map
                // author's own principle, already applied on the live-bot side) means here.
                if (to.y <= from.y) {
                    const chargeLen = Math.sqrt(curDx * curDx + curDz * curDz) || 1;
                    const chargeAheadX = player.x + (curDx / chargeLen) * 0.2;
                    const chargeAheadZ = player.z + (curDz / chargeLen) * 0.2;
                    const groundAhead = [0.15, 0.4, 0.65, 0.9].some(probeDy =>
                        player.Collider.playerCollidesWithMap(player, { x: chargeAheadX, y: player.y + 0.05 - probeDy, z: chargeAheadZ })
                    );
                    if (!groundAhead) jumpChargeMaxTime = simulatedTime;
                };
            };

            const horizontalDistance = Math.length2(player.x - to.x, player.z - to.z);
            const verticalDistance = Math.abs(player.y - to.y);
            // Arriving means "got onto the target cell", not "got within arrivalRadius of its exact
            // centre". A grid cell is a whole unit across, so demanding the centre asks for up to
            // half a cell of extra travel that the real edge never requires - and with the drag
            // above making speeds honest, that half-cell is the difference between an edge passing
            // and being rejected outright. Measured on "PathJumpHardTest" checkpoint3->4, a jump the
            // bot completes reliably in 1.7s: centre-to-centre is 2.0 units, the bot's real reach is
            // ~1.7, and it succeeds only because it starts at x=5.702 (not the cell centre 5.5) and
            // lands on the block's near EDGE. Judged centre-to-centre that working jump verifies as
            // impossible; judged by "is it standing on the block" it verifies as the routine hop it
            // actually is. The vertical tolerance still applies either way, so this can't accept a
            // player merely passing high over the cell mid-arc.
            const inTargetCell = Math.floor(player.x) === Math.floor(to.x) && Math.floor(player.z) === Math.floor(to.z);
            // A jump can satisfy proximity while genuinely still mid-flight, not just at the actual
            // moment of landing - the comment above claims verticalTolerance alone rules this out,
            // but 1.25 units stays satisfied for almost the player's whole arc, not just near
            // touchdown. Confirmed on "PathJumpHardTest" checkpoint4->5: this returned success with
            // the player still ASCENDING (dy=+0.042, before the arc's apex) over a target with open
            // space below it - the real live bot, same physics, keeps flying, passes straight
            // through that point, and eventually falls a full unit further to an actual floor in a
            // pit. Requiring the player to have fully landed (checked via `!jumping` first) turned
            // out to be the wrong fix, not just a stricter one - EVERY edge in this model exits via
            // the proximity check before physically landing, since the loop's own progress-stall
            // bailout has nothing left to react to once movement toward an already-close target
            // stops improving, so demanding a real landing broke every jump, not just this one.
            //
            // A velocity threshold (dy near zero) was tried next and ALSO turned out wrong, not
            // just for the same reason as `!jumping` but a new one: gravity's own per-tick decel
            // here is tiny (~0.003/tick), so dy lingers inside any narrow "settled" band for a
            // dozen-plus ticks while still rising toward the apex - a threshold just delays the
            // false accept a few ticks, it doesn't remove it. Confirmed directly on this same
            // edge: dy=0.018 (under a 0.02 band) at tick 88 while y was still climbing tick-over-
            // tick (2.610 -> 2.639 -> ... -> 2.706), nowhere near the apex turning over, let alone
            // landed. Velocity alone can't tell "still rising, coincidentally slow" from "at rest
            // on solid ground" when the rise itself is that gradual.
            //
            // Ground truth (a `playerCollidesWithMap` footing probe under the player's feet, same
            // pattern index.js already uses for hasGroundBehind/phase-2 groundAhead) was tried
            // next, alone, and ALSO turned out wrong on its own - not because the concept is
            // wrong, but because a single fixed probe depth can't serve both jump shapes at once.
            // A shallow probe (0.1) never found the crate-mantle's real landing at all (0 hits in
            // ~9800 checks on a previously-reliable edge - real regression, confirmed live). A
            // deep enough probe to catch that (0.5) started reaching straight through open air
            // into the target platform's surface while the player was still meaningfully above it
            // and still ascending - reproducing the EXACT original false positive (dy=+0.042,
            // same value as the very first traced case) through a different mechanism.
            //
            // The fix is to require BOTH signals together, not pick one: the player must not be
            // rising (`dy <= 0` rules out the ascending/apex case outright, so the probe no longer
            // needs to be shallow to avoid it) AND have real support within a generous probe depth
            // (so the probe no longer needs to be shallow to avoid the apex case either, since
            // `notRising` already excludes it). Each condition covers the other's blind spot -
            // together they accept a genuine landing (however gradually dy settles) without ever
            // accepting a still-rising pass over a lower surface. Scoped to jump edges - WALK/
            // RAMP/FALL don't arc through unrelated airspace the way a jump does.
            const notRising = player.dy <= 0;
            const grounded = !jump || (notRising && [0.1, 0.3, 0.5].some(dy =>
                player.Collider.playerCollidesWithMap(player, { x: player.x, y: player.y - dy, z: player.z })
            ));
            if ((horizontalDistance < arrivalRadius || inTargetCell) && verticalDistance < verticalTolerance && grounded) {
                return { success: true, x: player.x, y: player.y, z: player.z, ticks: tick };
            };

            if (horizontalDistance < bestDistance - 0.05) {
                bestDistance = horizontalDistance;
                bestDistanceAtSimTime = simulatedTime;
            } else if (simulatedTime - bestDistanceAtSimTime > progressWindowSeconds) {
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
