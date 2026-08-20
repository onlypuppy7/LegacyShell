//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: samplecommand
import { DeadInternetPlugin } from './shared.js';
import Comm from '#comm';
import { CONTROL, devlog, iteratePlayers, ticksPerSecond } from '#constants';
import { findPath, isStandable, EDGE_TYPE, MOVEMENT_PROFILE } from './pathfinding.js';
//

// Re-exported so a consuming plugin can `import { findPath, EDGE_TYPE, ... } from
// '<path>/deadinternet/index.js'` without also needing to know pathfinding.js exists as a
// separate file - the public surface of this plugin is meant to be this file, not its internals.
export { findPath, isStandable, EDGE_TYPE, MOVEMENT_PROFILE };

export const PluginMeta = {
    identifier: "deadinternet",
    name: 'DeadInternet',
    author: 'onlypuppy7',
    version: '1.0.0',
    descriptionShort: 'Adds bot players to your game', //displayed when loading
    descriptionLong: 'Adds bot players to your game',
    legacyShellVersion: 459, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;

        DeadInternetPlugin.registerListeners(this.plugins);
        this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));
        
        this.plugins.on('game:metaLoop', this.metaLoopHook.bind(this));
        this.plugins.on('game:clientPackSyncLoop', this.clientPackSyncLoopHook.bind(this));
        this.plugins.on('game:clientInit', this.clientInit.bind(this));
        this.plugins.on('game:joinPlayer', this.joinPlayer.bind(this));
        this.plugins.on('game:clientInstantiatePlayer', this.clientInstantiatePlayer.bind(this));
        this.plugins.on('game:clientUpdateLoadoutEnd', this.clientUpdateLoadoutEnd.bind(this));
        this.plugins.on('game:onPlayerDeath', this.onPlayerDeath.bind(this));
        this.plugins.on('game:updateBefore', this.updateBefore.bind(this));
    };

    pluginSourceInsertion(data) {
        data.pluginInsertion.files.push({
            insertBefore: `\nconsole.log("inserting before... (${PluginMeta.name})");`,
            filepath: path.join(this.thisDir, 'shared.js'),
            insertAfter: `\nconsole.log("inserting after... (${PluginMeta.name})!");`,
            position: 'before'
        });
    };

    metaLoopHook(data) {
        var ctx = data.this;
    };

    clientPackSyncLoopHook(data) {
        var ctx = data.this;
        var state = data.state;
        var output = data.output;

    };

    clientInit(data) {
        // console.log("clientInit", PluginMeta.identifier, data.info);
    }

    joinPlayer(data) {
        // console.log("joinPlayer", PluginMeta.identifier, data.info);
    }

    clientInstantiatePlayer(data) {
        // console.log("clientInstantiatePlayer loadout", PluginMeta.identifier, data.this.loadout);
    }

    clientUpdateLoadoutEnd(data) {
        // console.log("clientUpdateLoadoutEnd loadout", PluginMeta.identifier, data.this.loadout);
    }

    async onPlayerDeath(data) {
        const player = data.player;
        for (const bot of DeadInternetBots) {
            if (bot.player === player && bot.onDeath) {
                await bot.onDeath(data);
            }
        }
    }

    async updateBefore(data) {
        const player = data.player;
        for (const bot of DeadInternetBots) {
            if (bot.player === player && bot.onUpdate) {
                await bot.onUpdate(data);
            }
        }
    }
};

export var DeadInternetBots = [];

export class DeadInternetBot {
    constructor(room, opts = {}) {
        this.room = room;
        this.opts = {
            id: null,
            nickname: "DeadInternetBot",
            wsId: null,
            // primary_item_id: 0,
            // secondary_item_id: 0,
            useOOBid: true,
        };
        Object.assign(this.opts, opts);
        DeadInternetBots.push(this);

        this.currentPath = null;
        this.pathIndex = 0;
        this.pathGoalKey = null;
        this.pathRecomputeAt = 0;
        this.pathStuckSinceTick = null;
        this.pathBestDistance = Infinity; // closest horizontal distance-to-waypoint achieved so far - see checkStuck()
        this.pathAvoidedEdges = new Set(); // "x,y,z->x,y,z" edges that turned out not to actually be traversable - see checkStuck()
        this.jumpRunupWaypointIndex = null; // which waypoint index the current jump run-up backup is for - see followPath()
        this.jumpRunupUntilTick = null;
        this.pathFailStreak = 0; // consecutive findPath() failures from the same (unmoved) position - see pathTo()
        this.pathFailPos = null;
        this.stuckEventCount = 0; // total checkStuck() replans since the last real progress, regardless of position - see checkStuck()

        // followPath() runs once per real simulated game tick (see player.js's update() ->
        // 'updateBefore' -> DeadInternetBot's onUpdate -> followPath(), the only path that ever
        // calls it), so counting ticks here instead of using Date.now() for the durations below
        // makes them track actual simulated game time, not wall-clock time - correct regardless
        // of server load/lag, and consistent under any speedModifier or similar time-scaling
        // (confirmed by design review: the old Date.now()-based version would desync from game
        // state under exactly those conditions, even though nothing currently exercises that).
        this.tick = 0;
    }

    async init() {
        this.client = await this.room.joinPlayer({
            id: null,
            nickname: "DeadInternetBot",
            wsId: null,
            primary_item_id: 0,
            secondary_item_id: 0,
            useOOBid: true,
        });

        this.client.noConnectionTimeout = true;

        await this.client.waitUntilReady();

        this.player = this.client.player;

        console.log("client.initiated", this.client.initiated);
        console.log("client.room ??", !!this.client?.room);

        await this.client.clientReady();
        await this.respawn();
    }

    control(control) {
        this.player.controlKeys |= control;
    }

    async respawn() {
        await this.client.requestRespawn();
    }

    // Unlike respawn() above, which goes through the normal client.requestRespawn() flow -
    // gated on the player actually being dead (`canRespawn() && !playing`, see client.js:252-253
    // - it silently no-ops otherwise) - this repositions the bot immediately regardless of
    // whether it's alive. Needed for the stuck-position recovery below: a bot that's merely
    // wedged somewhere (not dead - there's no fall damage in this game) can never legitimately
    // request a respawn through the normal flow, and would otherwise be stuck forever (confirmed
    // by testing: this was a real, previously-undiscovered gap - the first version of this
    // recovery called the normal respawn() and it silently did nothing, over and over). Mirrors
    // exactly what requestRespawn() does once its gate passes: call Player.respawn() then
    // broadcast the same wire packet real clients expect, so the bot's new position is visible
    // to everyone else in the room too, not just tracked server-side.
    async forceRespawn() {
        // getBestSpawn() picks whichever spawn point is FARTHEST from other players - in a
        // small room (as low as one human + this bot), that systematically favors isolated
        // corner/edge spawns over central ones, which on "Castle" (and likely many maps) tend to
        // be exactly the small/elevated tower-top platforms most prone to irregular real geometry
        // the grid model can't represent precisely (see the fell-off-an-unmodeled-ledge check in
        // followPath()). getRandomSpawn() samples uniformly across every spawn point instead -
        // no reason a recovery respawn should be biased toward the hardest spots to escape.
        const spawnPoint = this.room.getRandomSpawn(this.player);
        this.player.respawn(spawnPoint);

        // Player.respawn() resets position but not velocity - a natural death+respawn gets away
        // with that because there are several real seconds of being dead for dx/dy/dz to settle
        // to ~0 on their own before it matters again. forceRespawn() has no such gap: it can fire
        // mid-fall or mid-stuck-struggle with real leftover momentum, which then gets applied on
        // the very next physics tick AT THE NEW POSITION - shoving the bot off its fresh spawn
        // point immediately (confirmed by testing: this was a real, previously-undiscovered
        // contributor to bots looking "stuck" right after every forced respawn on "Castle").
        this.player.dx = 0;
        this.player.dy = 0;
        this.player.dz = 0;
        this.player.controlKeys = 0; // a real death (removeFromPlay()) clears this too - respawn() alone doesn't

        const output = new Comm.Out(12);
        output.packInt8U(Comm.Code.respawn);
        output.packInt8U(this.client.id);
        output.packFloat(this.player.x);
        output.packFloat(this.player.y);
        output.packFloat(this.player.z);
        output.packRadU(this.player.yaw);
        output.packRad(this.player.pitch);
        this.client.sendToAll(output, "respawn");
    }

    getDistanceToPlayer(otherPlayer) {
        const dx = otherPlayer.predicted.x - this.player.x;
        const dy = otherPlayer.predicted.y - this.player.y;
        const dz = otherPlayer.predicted.z - this.player.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const yaw = Math.atan2(dx, dz);
        const pitch = -Math.asin(dy / distance);

        return {
            distance,
            dx, dy, dz,
            yaw, pitch
        };
    }

    getNearestPlayer(human = true) {
        let nearestPlayer = null;
        let nearestDistance = Infinity;

        iteratePlayers((otherPlayer) => {
            // devlog("DeadInternetBot checking player", otherPlayer.name, otherPlayer.client?.isHuman, otherPlayer.playing);
            if (otherPlayer === this.player) return;
            if (!otherPlayer.playing) return;
            if (human && !otherPlayer.client.isHuman) return;

            const distance = this.getDistanceToPlayer(otherPlayer).distance;
            // console.log("DeadInternetBot distance to", otherPlayer.name, distance.toFixed(2));
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestPlayer = otherPlayer;
            }
        });

        return nearestPlayer;
    }

    lookAtPlayer(targetPlayer) {
        const { yaw, pitch } = this.getDistanceToPlayer(targetPlayer);

        this.player.yaw = yaw;
        this.player.pitch = pitch;

        // console.log("DeadInternetBot looking at", targetPlayer.name, "yaw:", yaw.toFixed(2), "pitch:", pitch.toFixed(2));
    }

    // --- Pathfinding ---------------------------------------------------------------------
    // The actual A* search lives in pathfinding.js and knows nothing about bots or players -
    // these methods are the glue that turns a computed route into actual controlKeys/jump()
    // calls against this bot's real Player, tick by tick. See pathfinding.js's own header
    // comment for why the movement-capability constants it uses are estimates, not exact
    // physics, and why that's fine here: followPath() below is self-correcting (see
    // "stuck detection" further down) specifically so an imperfect edge doesn't strand a bot.

    // Computes (or recomputes) a path to `target` ({x,y,z}, or anything with x/y/z properties -
    // a Player instance works directly). Safe to call every tick if you want to always chase a
    // moving target; it no-ops most calls on its own (see pathRecomputeAt) rather than
    // re-running A* 60 times a second.
    pathTo(target, opts = {}) {
        const goalKey = `${Math.floor(target.x)},${Math.floor(target.y)},${Math.floor(target.z)}`;
        const now = Date.now();
        const force = opts.force || false;

        if (!force && this.currentPath && goalKey === this.pathGoalKey && now < this.pathRecomputeAt) {
            return this.currentPath;
        };

        // A new destination gets a clean slate - an edge that failed on the way to some earlier
        // target isn't necessarily invalid for a completely different route. stuckEventCount
        // resets here too (not on every replan - checkStuck()'s own forced replans reuse the
        // SAME target, so goalKey doesn't change there, and stuckEventCount needs to keep
        // accumulating across those to do its job).
        if (goalKey !== this.pathGoalKey) {
            this.pathAvoidedEdges.clear();
            this.stuckEventCount = 0;
        };

        const path = findPath(this.room, this.player, target, { avoidEdges: this.pathAvoidedEdges, ...opts });

        if (!path) {
            // Track whether findPath() is failing repeatedly from the SAME spot, regardless of
            // what target was requested - that's a different problem than "this particular goal
            // is unreachable". A bot can end up resting on a decorative aabb/obb prop's collision
            // top (torches, banners, rocks - all over "Castle"), which can sit at an arbitrary
            // non-grid-aligned height the standable-cell model has no representation for at all;
            // no amount of edge-avoidance replanning fixes that, because the position itself,
            // not a specific edge, is what's unresolvable (confirmed by testing: this stranded a
            // bot permanently until this recovery was added).
            const pos = { x: this.player.x, y: this.player.y, z: this.player.z };
            const samePos = this.pathFailPos && Math.length3(pos.x - this.pathFailPos.x, pos.y - this.pathFailPos.y, pos.z - this.pathFailPos.z) < 0.5;
            this.pathFailStreak = samePos ? (this.pathFailStreak || 0) + 1 : 1;
            this.pathFailPos = pos;

            if (this.pathFailStreak >= 3) {
                // respawn() (client.requestRespawn()) is a no-op here - the bot is stuck, not
                // dead, and that method only works on a dead player (confirmed by testing: the
                // first version of this recovery called it and it silently did nothing, forever).
                // forceRespawn() bypasses that gate.
                devlog('DeadInternetBot repeatedly failed to find a path from its current position, force-respawning', this.player.name);
                this.pathFailStreak = 0;
                const targetPos = { x: target.x, y: target.y, z: target.z };
                this.forceRespawn().then(() => this.pathTo(targetPos, { force: true }));
            };
        } else {
            this.pathFailStreak = 0;
        };

        this.currentPath = path;
        this.pathIndex = 0;
        this.pathGoalKey = goalKey;
        this.pathTargetPos = { x: target.x, y: target.y, z: target.z }; // so followPath()'s own stuck-recovery can re-path without the caller having to call pathTo() every tick too
        this.pathRecomputeAt = now + (opts.recomputeIntervalMs ?? 1000);
        this.pathStuckSinceTick = null;
        this.pathBestDistance = Infinity;

        return path;
    };

    stopPath() {
        this.currentPath = null;
        this.pathIndex = 0;
        this.pathGoalKey = null;
        this.pathStuckSinceTick = null;
        this.jumpRunupWaypointIndex = null;
        this.jumpRunupUntilTick = null;
    };

    // Call once per tick (from onUpdate) to steer along whatever path pathTo() last computed.
    // Returns 'idle' (no active path), 'following', or 'arrived' (reached the final waypoint -
    // the path is cleared automatically, call pathTo() again for a new destination).
    followPath() {
        this.tick++;

        if (!this.currentPath) return 'idle';

        // findPath() returns `[]` (a valid zero-length path, not null) when the start and goal
        // are already the same cell - see pathfinding.js. That's a real, successful result, not
        // "no path" - treating it the same as a null/never-computed path (as the old single
        // `!this.currentPath.length` check above did) meant a bot that happened to already be
        // standing on its target - including one that just landed there via the stuck-position
        // force-respawn recovery below, which is not a rare coincidence, it's exactly what that
        // recovery is trying to do - would sit there reporting 'idle' forever instead of
        // 'arrived', which callers who wait specifically for 'arrived' would never see (confirmed
        // by testing on "Castle": this stranded two otherwise-successful legs at the destination
        // itself, timing out repeatedly despite having genuinely already gotten there).
        if (this.currentPath.length === 0) { this.stopPath(); return 'arrived'; };

        // Safety net: nothing about the grid should ever route the bot below the map, but a
        // real-physics edge case (a corner-cut through a wall, an imprecise landing) can still
        // send it off the bottom into an unbounded fall. Once that happens there's no standable
        // cell for findPath's start-resolution to recover from (it only searches down
        // MOVEMENT_PROFILE.maxFallLevels cells - see pathfinding.js's findLandingBelow), so
        // every future pathTo() call would return null forever without this. Force-respawning is
        // the only real recovery (confirmed by testing: this exact scenario happened on
        // "Castle") - the normal respawn() no-ops here since the bot is still alive, not dead.
        if (this.player.y < -2) {
            devlog('DeadInternetBot fell off the map, force-respawning', this.player.name);
            this.stopPath();
            const targetPos = this.pathTargetPos;
            this.forceRespawn().then(() => { if (targetPos) this.pathTo(targetPos, { force: true }); });
            return 'idle';
        };

        const waypoint = this.currentPath[this.pathIndex];
        if (!waypoint) { this.stopPath(); return 'idle'; };

        const dx = waypoint.x - this.player.x;
        const dz = waypoint.z - this.player.z;
        const horizontalDistance = Math.sqrt(dx * dx + dz * dz);

        this.player.yaw = Math.atan2(dx, dz);

        // A standing jump (0 approach speed) only reaches roughly half a block of clearance -
        // see pathfinding.js's header comment on the physics constants this is derived from -
        // well under the full block a JUMP edge needs to clear. Real testing on "Castle"
        // confirmed this concretely: the bot repeatedly failed the exact same jumps from a
        // standing start, no matter which approach angle the replan/avoid-edge logic tried next.
        // A brief backward "run-up" phase before the jump - moving away from the takeoff point
        // first, then approaching at speed - mirrors how a real running jump actually clears a
        // level. Bounded to a short, fixed duration (not distance-based) so it can't wander far;
        // if it happens to back the bot off some other ledge, that's exactly what the
        // fell-off-the-map/stuck-position recovery above already exists to catch.
        // Backing away deliberately increases distance-to-waypoint for a moment - checkStuck()
        // below measures progress as "closest distance-to-waypoint achieved", not raw movement,
        // specifically so this doesn't get mistaken for real progress (confirmed by testing:
        // measuring raw displacement instead - the first version of this - let the backup phase
        // fool the stuck-timer into resetting every cycle, since moving away is still "movement",
        // and the bot would time out forever without the stuck/replan safety net ever firing).
        if (waypoint.type === EDGE_TYPE.JUMP) {
            if (this.jumpRunupWaypointIndex !== this.pathIndex) {
                this.jumpRunupWaypointIndex = this.pathIndex;
                this.jumpRunupUntilTick = this.tick + Math.round(0.35 * ticksPerSecond);
            };

            if (this.tick < this.jumpRunupUntilTick) {
                this.control(CONTROL.down);
            } else {
                this.control(CONTROL.up);
                this.player.jump();
            };
        } else {
            this.control(CONTROL.up);
        };

        const verticalDistance = Math.abs(this.player.y - waypoint.y);

        // A same-level (WALK/RAMP) edge ending up with the bot far BELOW where it should be
        // means it didn't walk there - it fell off an edge the grid model didn't know was there.
        // Confirmed by testing on "Castle": two tower-top spawn points had every same-level
        // neighbor cell classified as a safe walk, but the actual walkable footprint up there is
        // smaller than a full grid cell (round tower geometry), so stepping toward any of them
        // sent the bot straight off the tower instead. checkStuck()'s horizontal-only progress
        // metric never catches this on its own - holding forward keeps shrinking the horizontal
        // gap to the waypoint the entire way down, since gravity only affects y, so it looks like
        // continuous real progress all the way to the ground (confirmed by testing: this produced
        // repeated 30s timeouts with no stuck/replan log in between - the bot was actively,
        // "successfully" closing horizontal distance while plummeting). Catch it directly instead
        // of waiting for a timer that this specific failure mode is built to evade.
        if ((waypoint.type === EDGE_TYPE.WALK || waypoint.type === EDGE_TYPE.RAMP) && this.player.y < waypoint.y - 2) {
            const from = this.currentPath[this.pathIndex - 1];
            const fromKey = from
                ? `${Math.floor(from.x)},${from.y},${Math.floor(from.z)}`
                : `${Math.floor(this.player.x)},${Math.floor(waypoint.y)},${Math.floor(this.player.z)}`;
            const toKey = `${Math.floor(waypoint.x)},${waypoint.y},${Math.floor(waypoint.z)}`;
            this.pathAvoidedEdges.add(`${fromKey}->${toKey}`);

            devlog('DeadInternetBot fell off an unmodeled ledge attempting', fromKey, '->', toKey, ', replanning from where it landed', this.player.name);
            if (this.pathTargetPos) this.pathTo(this.pathTargetPos, { force: true });
            return 'following';
        };

        if (horizontalDistance < MOVEMENT_PROFILE.arrivalRadius && verticalDistance < 1.25) {
            this.pathIndex++;
            this.pathStuckSinceTick = null;
            this.pathBestDistance = Infinity;
            this.stuckEventCount = 0;

            if (this.pathIndex >= this.currentPath.length) {
                this.stopPath();
                return 'arrived';
            };
        } else {
            this.checkStuck(horizontalDistance);
        };

        return 'following';
    };

    // Estimated jump/step physics (pathfinding.js) can be wrong about exactly what a given
    // edge needs, and other players/bots can wander into a route after it was planned - rather
    // than trying to model every possible failure up front, just notice when the bot hasn't
    // actually gotten anywhere in a while and react: nudge with a jump first (cheap, fixes most
    // "technically blocked by a lip" cases), then force a full replan if that didn't help either.
    checkStuck(horizontalDistance) {
        // Progress = getting closer to the waypoint than ever before this attempt, not just
        // "moved at all" - a bot bouncing in place while repeatedly failing a jump edge shows
        // real vertical movement every tick (and, with the run-up backup above, real horizontal
        // movement too, just in the wrong direction), either of which would otherwise keep
        // resetting this check and mask the fact that it's making zero actual progress toward
        // the waypoint (confirmed by testing: both were real failure modes before this fix).
        if (horizontalDistance < this.pathBestDistance - 0.3) {
            this.pathBestDistance = horizontalDistance;
            this.pathStuckSinceTick = null;
            return;
        };

        if (!this.pathStuckSinceTick) { this.pathStuckSinceTick = this.tick; return; };

        const stuckForTicks = this.tick - this.pathStuckSinceTick;
        const stuckFor600 = Math.round(0.6 * ticksPerSecond);
        const stuckFor900 = Math.round(0.9 * ticksPerSecond);
        const stuckFor1800 = Math.round(1.8 * ticksPerSecond);
        if (stuckForTicks > stuckFor600 && stuckForTicks < stuckFor900) {
            this.player.jump(); // cheap first recovery attempt
        } else if (stuckForTicks >= stuckFor1800) {
            this.stuckEventCount++;

            // Hard backstop, independent of the per-edge blacklist below: if the bot's actual
            // Y coordinate is oscillating across a cell boundary (a persistent bounce, not a
            // clean landing), each replan below computes its "from" cell from a DIFFERENT floor()
            // value each time - so the same underlying obstacle never accumulates 3 blacklisted
            // edges for any ONE fromKey, and "exhausted every option" below never fires, even
            // though zero real progress is being made (confirmed by testing on "Castle": the bot
            // alternated between two different "from" cells indefinitely, replanning every ~1.8s
            // for over 9 minutes straight, without ever tripping the per-cell exhaustion check).
            // Total stuck-events since the last real waypoint arrival is a coarser, position-
            // independent signal that can't be defeated the same way - respawn unconditionally
            // once it's clearly not just "one bad edge, try the next."
            if (this.stuckEventCount >= 5) {
                devlog('DeadInternetBot stuck for too many replans in a row (possible position oscillation), force-respawning', this.player.name);
                this.stuckEventCount = 0;
                this.pathStuckSinceTick = null;
                const targetPos = this.pathTargetPos;
                this.forceRespawn().then(() => { if (targetPos) this.pathTo(targetPos, { force: true }); });
                return;
            };

            // Blacklist the specific edge that failed, not just "try again" - without this, a
            // replan from the same stuck position finds the exact same edge again (nothing about
            // the map changed) and the bot just re-stalls on it forever (confirmed by testing).
            const target = this.currentPath?.[this.pathIndex];
            const from = this.currentPath?.[this.pathIndex - 1];
            const fromKey = from
                ? `${Math.floor(from.x)},${from.y},${Math.floor(from.z)}`
                : `${Math.floor(this.player.x)},${Math.floor(this.player.y)},${Math.floor(this.player.z)}`;
            if (target) {
                const toKey = `${Math.floor(target.x)},${target.y},${Math.floor(target.z)}`;
                this.pathAvoidedEdges.add(`${fromKey}->${toKey}`);
            };

            devlog('DeadInternetBot stuck, forcing replan around', fromKey, '->', target ? `${Math.floor(target.x)},${target.y},${Math.floor(target.z)}` : '?', this.player.name);
            this.pathStuckSinceTick = null;
            // Re-path right now, ourselves - don't just flag it and hope the caller calls
            // pathTo() again next tick. followPath() needs to be safe to call on its own (some
            // callers, like the pathtest command, only call pathTo() once up front and then just
            // followPath() every tick after - confirmed by testing that this is a real usage
            // pattern, not a hypothetical one).
            const replanned = this.pathTargetPos ? this.pathTo(this.pathTargetPos, { force: true }) : null;

            if (this.pathTargetPos && !replanned) {
                // Every edge reachable from right here has now been tried and blacklisted for
                // this destination - not "wrong edge, try another", the current position itself
                // is the dead end. Don't wait for pathTo()'s own separate repeated-failure
                // counter to catch this on its own: that counter is keyed per-destination
                // (avoidEdges resets whenever the goal changes - see pathTo()), so if a caller
                // moves on to a DIFFERENT destination after this leg times out, it would just
                // rediscover and re-exhaust the exact same dead end from scratch instead of
                // remembering it's bad (confirmed by testing: this was a real, slow-grinding
                // failure mode on "Castle" - a bot stuck at one of its own spawn points kept
                // re-litigating the same handful of doomed edges, leg after leg, for minutes).
                devlog('DeadInternetBot exhausted every option from its current position, force-respawning', this.player.name);
                const targetPos = this.pathTargetPos;
                this.forceRespawn().then(() => { if (targetPos) this.pathTo(targetPos, { force: true }); });
            };
        };
    };
};