//legacyshell: basic
import { CONTROL, isClient, isServer, maxServerSlots, ticksPerSecond } from "#constants";
import Comm from "#comm";
//legacyshell: plugins
import { plugins } from '#plugins';
import { setGameOptionInMentions } from "#permissions";
import ClientConstructor from "#client";
import { DeadInternetBot, findPath } from "./index.js";
//(server-only-start)
import { ss } from "#misc";
import fs from 'node:fs';
import path from 'node:path';
//(server-only-end)
//

// This file is the "demo" half of the plugin - the actual reusable bot/pathfinding API lives in
// index.js and pathfinding.js. Everything below (both commands) is test/demo glue: real working
// examples of driving a bot, but not the surface another plugin should build against.

// room.notify() sends a Comm.Code.notification packet - a timed, transient on-screen banner (see
// client.js's notify()), not a chat line, and it disappears after `timeoutTime` seconds with
// nothing left in the scrollback. pathtestall/pathtestpair's status updates are meant to be a
// readable log of what happened, so they go out as a real chat message instead - the same
// packChat()+sendToAll() a normal player's chat message uses (see client.js's Comm.Code.chat
// handler), just from the server (id 255) with Comm.Chat.cmd's styling instead of a real player's
// id, so it reads as a system/command message in the chat log and stays there.
function roomChat(room, text) {
    const output = new Comm.Out();
    room.packChat(output, text, 255, Comm.Chat.cmd);
    room.sendToAll(output, null, "chat");
};

// Keyed by player.id, not room - a room only ever has one worker/thread, and player ids are
// only meaningful within it, so this never needs to be broken out per-room separately. One
// entry per player CURRENTLY recording; playerStateUpdate (below) is a no-op for everyone else.
const activeRecordings = new Map();

export const DeadInternetPlugin = {
    registerListeners: function (pluginManager) {
        console.log("registering listeners... (DeadInternetPlugin)");

        this.plugins = pluginManager;

        this.plugins.on('game:permissionsAfterSetup', this.permissionsAfterSetup.bind(this));
        // playerStateUpdate (see rooms.js's updateLoop) fires once per REPLAYED INPUT STATE for
        // each real (non-bot) player - not once per outer tick, and not at all for bots, which is
        // exactly the granularity a manual recording wants: the same buffered-input replay a real
        // player's own movement is reconstructed from server-side, at full resolution, with no
        // separate sampling/throttling needed. Registered once here, not per-room-worker-restart-
        // safe by construction the same way every other listener in this file already is (see
        // permissionsAfterSetup's own commands, none of which guard against being called more than
        // once either) - each room worker independently loads plugins exactly once for its own
        // lifetime (see CLAUDE.md's "Game server internals").
        this.plugins.on('game:playerStateUpdate', this.recordPlayerState.bind(this));
    },

    // Records one full-resolution row into whichever player's recording is currently active (a
    // no-op for every other player, checked first since this fires for every real player, every
    // state, all the time). Kept a flat array, not a keyed object, to avoid repeating six-plus
    // property names per row - explicitly requested over a coarser sampling rate, since 1-3 tick
    // differences are exactly what this tool exists to capture (an ordinary run is at most a few
    // thousand rows either way, not something a compact row format needs to trade accuracy for).
    // Row shape: [t, x, y, z, yaw, pitch, dx, dy, dz, controlKeys, jumping].
    recordPlayerState: function (data) {
        const player = data.player;
        const rec = activeRecordings.get(player.id);
        if (!rec) return;

        const t = +((Date.now() - rec.startedAt) / 1000).toFixed(3);
        rec.samples.push([
            t, +player.x.toFixed(3), +player.y.toFixed(3), +player.z.toFixed(3),
            +player.yaw.toFixed(3), +player.pitch.toFixed(3),
            +player.dx.toFixed(3), +player.dy.toFixed(3), +player.dz.toFixed(3),
            player.controlKeys, player.jumping ? 1 : 0,
        ]);

        const targetName = rec.route[rec.nextIndex];
        const target = rec.checkpoints[targetName];
        if (!target) return;
        // A generous 1.0-unit radius, not the live bot's own tighter MOVEMENT_PROFILE.arrivalRadius
        // - a human player overshoots/undershoots a marker tile by more than a bot's own steering
        // ever would, and this only needs to notice "reached roughly this tile", not verify a
        // precise arrival the way pathtestcheckpoints' bot-driven version does.
        const dist = Math.length3(player.x - target.x, player.y - target.y, player.z - target.z);
        if (dist >= 1.0) return;

        const legSeconds = +((Date.now() - rec.lastCheckpointAt) / 1000).toFixed(1);
        rec.legTimes.push({ from: rec.nextIndex === 0 ? '(start)' : rec.route[rec.nextIndex - 1], to: targetName, seconds: legSeconds });
        roomChat(data.this, `[beginmanualrecording] reached ${targetName} (${legSeconds}s)`);
        rec.lastCheckpointAt = Date.now();
        rec.nextIndex++;

        if (rec.nextIndex < rec.route.length) return;

        // Route complete - write out and clear the active recording.
        activeRecordings.delete(player.id);
        const totalSeconds = +((Date.now() - rec.startedAt) / 1000).toFixed(1);
        const outDir = path.join(ss.rootDir, 'store', 'deadinternet', 'recordings');
        try {
            fs.mkdirSync(outDir, { recursive: true });
            const fname = `${rec.mapName}-${rec.startedAt}.json`;
            fs.writeFileSync(path.join(outDir, fname), JSON.stringify({
                mapName: rec.mapName, playerName: rec.playerName, route: rec.route,
                totalSeconds, legTimes: rec.legTimes,
                sampleColumns: ['t', 'x', 'y', 'z', 'yaw', 'pitch', 'dx', 'dy', 'dz', 'controlKeys', 'jumping'],
                samples: rec.samples,
            }));
            roomChat(data.this, `[beginmanualrecording] done - reached the goal in ${totalSeconds}s total, saved as ${fname}.`);
            console.log(`[deadinternet beginmanualrecording] saved`, fname, 'legTimes:', rec.legTimes);
        } catch (error) {
            roomChat(data.this, `[beginmanualrecording] done in ${totalSeconds}s, but failed to save: ${error.message}`);
            console.log(`[deadinternet beginmanualrecording] save FAILED:`, error);
        };
    },

    permissionsAfterSetup: function (data) {
        var ctx = data.this;

        ctx.newCommand({
            identifier: "addbot",
            isCheat: true,
            name: "add",
            category: "bots",
            description: "Spawns some useless bots.",
            example: "1",
            warningText: "Add some test bots to the server.",
            permissionLevel: [ctx.ranksEnum.Moderator, ctx.ranksEnum.Guest, true], //later change to Moderator
            inputType: ["number", 1, 18, 1],
            executeClient: ({ player, opts, mentions }) => { },
            executeServer: async ({ player, opts, mentions }) => {
                // ctx.room.gameOptions.glitchyRoom1 = opts;
                // new ClientConstructor(ctx.room, {
                //     id: maxServerSlots + 1,
                //     nickname: "DeadInternetBot",
                //     wsId: null,
                // });
                for (let i = 0; i < opts; i++) {
                    const bot = new DeadInternetBot(ctx.room, {
                        // useOOBid: true,
                    });

                    await bot.init();

                    bot.player.changeModifiers({
                        speedModifier: Math.getRandomInt(4,6) / 10,
                    });

                    bot.onDeath = () => {
                        setTimeout(() => {
                            bot.respawn();
                        }, 7500);
                    };

                    bot.onUpdate = async (data) => {
                        const targetPlayer = bot.getNearestPlayer();
                        if (!targetPlayer) return;

                        bot.pathTo(targetPlayer.predicted ?? targetPlayer);
                        const status = bot.followPath(data?.delta);

                        if (status === 'idle' || status === 'arrived') {
                            // no route found, or already at the target's cell (melee range) -
                            // just face them directly rather than standing there doing nothing.
                            bot.lookAtPlayer(targetPlayer);
                        };
                    };

                    let weaponIdx = 1;
                    setInterval(() => {
                        // console.log("DeadInternetBot swapping weapon", weaponIdx);
                        bot.player.swapWeapon(weaponIdx);
                        weaponIdx = (weaponIdx + 1) % 2;
                        bot.player.jump();
                    }, 10e3);
                }
            }
        });

        // --- Test/demo command: spawns one bot that wanders forever between random spawn
        // points on the map, announcing each new destination and each arrival in chat. Not part
        // of the reusable API - this exists to make manual in-game QA of pathfinding.js fast and
        // hands-off (spawn points are scattered around the map by design, so routes between them
        // reliably exercise ramps/jumps/falls/ladders without needing to manually stand somewhere
        // tricky first, unlike targeting a human player's current position which is often only a
        // trivial one-step walk away from where the bot spawned).
        ctx.newCommand({
            identifier: "pathtestbot",
            name: "pathtest",
            category: "bots",
            description: "Spawns a bot that wanders between random spawn points, announcing its route in chat.",
            warningText: "Debug tool for testing DeadInternet's pathfinding.",
            // Deliberately not isCheat/owner-gated like /bots add - this is a read-only debug
            // aid (spawns one bot that walks around and logs its route), not something that
            // needs the same gameplay-affecting-cheat ceremony. Guest/Guest/false means anyone
            // in the room can run it, no "must be game owner" requirement.
            permissionLevel: [ctx.ranksEnum.Guest, ctx.ranksEnum.Guest, false],
            inputType: [],
            executeClient: ({ player, opts, mentions }) => { },
            executeServer: async ({ player, opts, mentions }) => {
                const bot = new DeadInternetBot(ctx.room, {});
                await bot.init();

                const fmt = (pos) => `${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`;

                // Every pacing decision below (the pause after arrival, the retry delay, the
                // post-death respawn wait) runs off bot.tick - incremented once per real
                // simulated tick inside followPath(), which onUpdate already calls every tick via
                // the room's own update loop (see index.js) - rather than spinning up separate
                // setTimeout chains alongside it. One driving loop, not two competing ones.
                let pending = null; // { atTick, action }
                const scheduleAfter = (seconds, action) => {
                    pending = { atTick: bot.tick + Math.round(seconds * ticksPerSecond), action };
                };

                // Picks a fresh random spawn point and starts pathing to it, announcing the
                // destination in chat. If that particular spawn turns out to be unreachable
                // (sealed off, etc.) it doesn't just sit there - waits a beat and tries another,
                // same as the retry pacing used after a successful arrival below.
                const headToRandomSpawn = () => {
                    const list = ctx.room.spawnPoints[bot.player.team] ?? ctx.room.spawnPoints[0];
                    if (!list || !list.length) {
                        ctx.room.notify(`[pathtest] no spawn points available on this map.`, 6);
                        console.log('[deadinternet pathtest] no spawn points available for team', bot.player.team);
                        return;
                    };

                    const spawn = Math.getRandomFromList(list);
                    const destination = { x: spawn.x + 0.5, y: spawn.y, z: spawn.z + 0.5 };
                    const path = bot.pathTo(destination, { force: true });

                    if (!path) {
                        ctx.room.notify(`[pathtest] no path found to spawn point (${fmt(destination)}) - trying another.`, 6);
                        console.log('[deadinternet pathtest] no path found', { from: { x: bot.player.x, y: bot.player.y, z: bot.player.z }, to: destination });
                        scheduleAfter(1, headToRandomSpawn);
                        return;
                    };

                    const counts = {};
                    for (const wp of path) counts[wp.type] = (counts[wp.type] || 0) + 1;
                    const summary = Object.entries(counts).map(([type, n]) => `${n} ${type}`).join(', ') || 'already there';
                    ctx.room.notify(`[pathtest] heading to spawn point (${fmt(destination)}): ${path.length} waypoints (${summary}).`, 6);
                    console.log(`[deadinternet pathtest] route to spawn point (${fmt(destination)}):`, path);
                };

                bot.onUpdate = async (data) => {
                    // Always call followPath() - it's what advances bot.simulatedTime every real
                    // tick, even while `pending` is gating everything else (it no-ops harmlessly
                    // when there's no active path, e.g. right after arrival/death).
                    const status = bot.followPath(data?.delta);

                    if (pending) {
                        if (bot.tick >= pending.atTick) {
                            const action = pending.action;
                            pending = null;
                            action();
                        };
                        return;
                    };

                    if (status === 'arrived') {
                        ctx.room.notify(`[pathtest] arrived at (${fmt(bot.player)}).`, 6);
                        console.log('[deadinternet pathtest] arrived at spawn point', { x: bot.player.x, y: bot.player.y, z: bot.player.z });
                        scheduleAfter(1, headToRandomSpawn);
                    };
                };

                bot.onDeath = () => {
                    bot.stopPath();
                    scheduleAfter(3, async () => {
                        await bot.respawn();
                        headToRandomSpawn();
                    });
                };

                headToRandomSpawn();
            }
        });

        // --- Test/demo command: the rigorous connectivity check. Not part of the reusable API -
        // this is how pathfinding.js itself gets validated against a real map's real spawn
        // points, rather than trusting the synthetic fixtures in test-pathfinding.js alone.
        // Two passes:
        //   1. Algorithmic - findPath() between every ordered pair of spawn points, no bot or
        //      movement involved. Fast (well under a second even for dozens of spawns), and
        //      catches anything the ALGORITHM can't connect at all.
        //   2. Live - a real bot tours every spawn point once, in a random order, using the same
        //      pathTo/followPath/checkStuck self-correction as every other bot (see index.js).
        //      This is what actually proves a route is physically executable, not just
        //      theoretically valid - the algorithmic pass alone can't catch things like the
        //      chained-jump reliability issue pathfinding.js's cost model accounts for.
        ctx.newCommand({
            identifier: "pathtestall",
            name: "pathtestall",
            category: "bots",
            description: "Exhaustively tests pathfinding between every spawn point on the map.",
            example: "5",
            warningText: "Debug tool: validates pathfinding connectivity across every spawn point on the map, then runs a real bot through all of them.",
            permissionLevel: [ctx.ranksEnum.Guest, ctx.ranksEnum.Guest, false],
            // Optional leg cap (default 0 = every spawn point) - lets a debugging session iterate
            // on a small slice of the live tour (`/bots pathtestall 5`) in a fraction of the time
            // a full map tour takes, rather than waiting several minutes per iteration to see
            // whether a fix actually helped.
            inputType: ["number", 0, 999, 1],
            executeClient: ({ player, opts, mentions }) => { },
            executeServer: async ({ player, opts, mentions }) => {
                const spawnList = ctx.room.spawnPoints[0] || [];
                if (spawnList.length < 2) {
                    roomChat(ctx.room, `[pathtestall] map only has ${spawnList.length} spawn point(s), nothing to test.`);
                    return;
                };

                const spawns = spawnList.map(s => ({ x: s.x + 0.5, y: s.y, z: s.z + 0.5 }));
                const fmt = (p) => `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;

                roomChat(ctx.room, `[pathtestall] starting: ${spawns.length} spawn points on this map.`);
                console.log(`[deadinternet pathtestall] ${spawns.length} spawn points:`, spawns);

                const bot = new DeadInternetBot(ctx.room, {});
                await bot.init();

                // Pass 1: algorithmic. Every ordered pair, i != j. Uses the bot's own real Player
                // (respawned to each source spawn in turn) as findPath's `start`, not a plain
                // {x,y,z} object - isStandable/isBlockedAt/hasHeadroom all fall back to a coarse,
                // colliderType-based guess when no real player is given (see pathfinding.js's own
                // comments on this), which is close enough for the small, simple test maps this
                // whole system was originally built against but badly understates real connectivity
                // on genuinely complex geometry. Confirmed live on "Castle": the plain-object version
                // reported spawn 0 unable to reach a point 3 cells away on its own flat platform,
                // and a real player respawned there found a plain 2-edge walk to it instantly - the
                // guess isn't a close approximation for this map's geometry, it's simply wrong.
                const algoFailures = [];
                let algoChecked = 0;
                for (let i = 0; i < spawns.length; i++) {
                    bot.player.respawn(spawns[i]);
                    for (let j = 0; j < spawns.length; j++) {
                        if (i === j) continue;
                        algoChecked++;
                        if (!findPath(ctx.room, bot.player, spawns[j])) algoFailures.push([i, j]);
                    };
                };

                console.log(`[deadinternet pathtestall] algorithmic pass: ${algoChecked - algoFailures.length}/${algoChecked} pairs connected.`);
                if (algoFailures.length) {
                    console.log(`[deadinternet pathtestall] algorithmic FAILURES:`, algoFailures.map(([i, j]) => `${i}->${j} (${fmt(spawns[i])} -> ${fmt(spawns[j])})`));
                };
                roomChat(ctx.room, `[pathtestall] algorithmic pass: ${algoChecked - algoFailures.length}/${algoChecked} pairs connected${algoFailures.length ? `, ${algoFailures.length} FAILED (see console)` : ''}.`);

                // Pass 2: live. Visiting every ordered pair for real would take far too long (each
                // leg is several real seconds) - one full tour visiting every spawn point exactly
                // once, in a random order, covers every spawn as both an origin and a destination
                // at least once while staying practical to run.
                let order = Math.shuffleArray(spawns.map((_, i) => i));
                // No +1 here: the bot's actual starting position is the implicit first stop (not
                // part of `order`), so N spawn points in `order` already means N legs.
                if (opts > 0) order = order.slice(0, opts);
                roomChat(ctx.room, `[pathtestall] starting live tour of ${order.length} spawn points...`);
                console.log(`[deadinternet pathtestall] live tour order:`, order);

                // 30s was tight enough to falsely "fail" legs that were genuinely still
                // recovering, not stuck - a bad-luck streak of landing on several tricky spawns
                // in a row (each taking several seconds to exhaust and respawn past) can add up
                // past 30s even though the bot reliably reaches the goal given a bit more time
                // (confirmed by testing on "Castle": every one of the 8 failures in a 27/35 run
                // showed active, ongoing exhausted-position respawns right up to the cutoff, not
                // a true dead end).
                const legTimeoutMs = 90000;
                const travelTo = (fromLabel, toIdx) => new Promise((resolve) => {
                    const destination = spawns[toIdx];
                    const startedAt = Date.now();
                    // A leg only counts as a real pass if it gets there smoothly, first try - not
                    // "eventually arrived after N internal stuck/replan/force-respawn cycles". The
                    // self-correction in checkStuck() is real, valuable bot behavior, but it isn't
                    // proof the route/edge worked - it's proof the bot recovered from it NOT
                    // working. Snapshotting the lifetime counter here and checking it again on
                    // arrival is how "arrived" and "arrived cleanly" get told apart.
                    const stuckEventsBefore = bot.totalStuckEvents;
                    const path = bot.pathTo(destination, { force: true });

                    const botPos = () => `${bot.player.x.toFixed(2)}, ${bot.player.y.toFixed(2)}, ${bot.player.z.toFixed(2)}`;

                    if (!path) {
                        console.log(`[deadinternet pathtestall] leg ${fromLabel}->${toIdx}: no path found (bot at ${botPos()})`);
                        roomChat(ctx.room, `[pathtestall] leg ${fromLabel}->${toIdx}: no path found.`);
                        // Don't resolve immediately - pathTo()'s own stuck-position recovery
                        // (respawning after repeated failures, see index.js) is asynchronous and
                        // needs real ticks to actually take effect. Resolving instantly here would
                        // let this loop blaze through every remaining leg in a single JS turn,
                        // faster than any recovery could ever complete (confirmed by testing: the
                        // first version of this loop did exactly that - 32 legs "failed" within
                        // the same millisecond, all logging a respawn that never had a chance to
                        // actually happen before the next leg's pathTo() call ran).
                        setTimeout(() => {
                            resolve({ from: fromLabel, to: toIdx, ok: false, reason: 'no path' });
                        }, 2500);
                        return;
                    };

                    let settled = false;
                    const timeout = setTimeout(() => {
                        if (settled) return;
                        settled = true;
                        console.log(`[deadinternet pathtestall] leg ${fromLabel}->${toIdx}: TIMED OUT after ${legTimeoutMs}ms (bot at ${botPos()})`);
                        roomChat(ctx.room, `[pathtestall] leg ${fromLabel}->${toIdx}: timed out.`);
                        resolve({ from: fromLabel, to: toIdx, ok: false, reason: 'timeout' });
                    }, legTimeoutMs);

                    bot.onUpdate = async (data) => {
                        const status = bot.followPath(data?.delta);
                        if (status === 'arrived' && !settled) {
                            settled = true;
                            clearTimeout(timeout);
                            const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
                            const stuckEvents = bot.totalStuckEvents - stuckEventsBefore;
                            if (stuckEvents > 0) {
                                const edge = bot.lastStuckEdge;
                                console.log(`[deadinternet pathtestall] leg ${fromLabel}->${toIdx}: arrived in ${elapsedSeconds}s but NOT first-try - ${stuckEvents} stuck event(s), last around ${edge?.from} -> ${edge?.to} (${edge?.type})`);
                                roomChat(ctx.room, `[pathtestall] leg ${fromLabel}->${toIdx}: FAILED - arrived but needed ${stuckEvents} stuck-recovery cycle(s), not first try.`);
                                resolve({ from: fromLabel, to: toIdx, ok: false, reason: `stuck-recovered (${stuckEvents}x, last: ${edge?.from}->${edge?.to} ${edge?.type})`, seconds: elapsedSeconds });
                                return;
                            };
                            console.log(`[deadinternet pathtestall] leg ${fromLabel}->${toIdx}: arrived in ${elapsedSeconds}s`);
                            roomChat(ctx.room, `[pathtestall] leg ${fromLabel}->${toIdx}: arrived in ${elapsedSeconds}s.`);
                            resolve({ from: fromLabel, to: toIdx, ok: true, seconds: elapsedSeconds });
                        };
                    };
                });

                // A leg hitting the timeout isn't proof the destination is unreachable - the
                // algorithmic pass above already proved 100% of pairs are connected, and the
                // self-correcting recovery in index.js (edge-avoidance replanning, force-respawn
                // once a position is proven to have zero viable edges) never permanently gives up
                // on its own. A single legTimeoutMs window can still run out mid-recovery on a bad
                // luck streak (confirmed by testing) - retrying the SAME destination, rather than
                // abandoning it for the next tour stop, lets recovery finish what it was already
                // doing instead of discarding that progress.
                // Single attempt per leg, deliberately - the self-correction already happening
                // WITHIN one attempt (edge-avoidance replanning, exhaustion-triggered
                // force-respawn, the stuck-event backstop, all in index.js) is real bot behavior,
                // not a test-harness crutch. Retrying the whole leg from scratch here on top of
                // that was masking whatever's still actually wrong instead of surfacing it -
                // a single honest pass is what tells us if there's a real bug left to fix.
                const maxAttemptsPerLeg = 1;
                const legResults = [];
                let prevLabel = 'spawn';
                for (const toIdx of order) {
                    let result;
                    for (let attempt = 1; attempt <= maxAttemptsPerLeg; attempt++) {
                        // pathAvoidedEdges only clears on a genuine destination change (see
                        // pathTo()) - within these retries the destination never changes, so
                        // without this it just keeps accumulating across every internal replan
                        // from every attempt. After enough attempts that can blacklist every real
                        // route to a destination that's still genuinely reachable (confirmed by
                        // testing: 5 retries' worth of accumulated blacklisting produced
                        // "no path found" for several legs the 100%-connected algorithmic pass
                        // had already proven reachable). Each retry deserves a clean slate - a
                        // fresh random respawn position can make a previously-bad edge irrelevant
                        // anyway.
                        bot.pathAvoidedEdges.clear();
                        result = await travelTo(prevLabel, toIdx);
                        if (result.ok) break;
                        if (attempt < maxAttemptsPerLeg) {
                            console.log(`[deadinternet pathtestall] leg ${prevLabel}->${toIdx}: retrying (attempt ${attempt + 1}/${maxAttemptsPerLeg})`);
                        };
                    };
                    legResults.push(result);
                    prevLabel = toIdx;
                };

                bot.onUpdate = async () => { };

                const succeeded = legResults.filter(r => r.ok).length;
                roomChat(ctx.room, `[pathtestall] tour complete: ${succeeded}/${legResults.length} legs succeeded.`);
                console.log(`[deadinternet pathtestall] TOUR COMPLETE: ${succeeded}/${legResults.length} legs succeeded`);
                console.log(`[deadinternet pathtestall] full results:`, legResults);
                if (legResults.some(r => !r.ok)) {
                    console.log(`[deadinternet pathtestall] FAILED LEGS:`, legResults.filter(r => !r.ok).map(r => `${r.from} -> spawn ${r.to} (${fmt(spawns[r.to])}): ${r.reason}`));
                };
            }
        });

        // --- Deterministic parkour-route test: unlike pathtestall (which pairs random spawn
        // points, or every ordered pair for the algorithmic-only check), this follows the map
        // author's OWN intended route, marked with PARKOUR.checkpoint1..checkpoint5.none and
        // PARKOUR.goal.none tiles (colliderType 'none' - purely position markers, no collision,
        // from the parkour plugin). checkpoint1 doubles as the bot's actual starting position
        // (via a real respawn there, not just a pathTo target) - this replaces the map's real
        // spawn points entirely for this test, removing the random-spawn-selection element so
        // repeat runs are comparable, and testing exactly the sequence the map was designed for
        // rather than whatever pair pathtestall's shuffle happens to land on.
        ctx.newCommand({
            identifier: "pathtestcheckpoints",
            name: "pathtestcheckpoints",
            category: "bots",
            description: "Runs the bot through the map's PARKOUR checkpoint route (checkpoint1 -> ... -> checkpoint5 -> goal) in the map author's intended order, starting FROM checkpoint1 rather than a random spawn. Optionally pass two checkpoint names to isolate just that one leg for debugging.",
            example: "checkpoint2 checkpoint3",
            warningText: "Debug tool: tests the designated parkour route via PARKOUR.checkpointN.none/PARKOUR.goal.none tiles, not random spawn points.",
            permissionLevel: [ctx.ranksEnum.Guest, ctx.ranksEnum.Guest, false],
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => { },
            executeServer: async ({ player, opts, mentions }) => {
                const map = ctx.room.map;
                const checkpoints = {};
                for (let x = 0; x < map.width; x++) {
                    for (let y = 0; y < map.height; y++) {
                        for (let z = 0; z < map.depth; z++) {
                            const cell = map.data[x]?.[y]?.[z];
                            if (cell?.mesh?.theme === 'PARKOUR') {
                                checkpoints[cell.mesh.name] = { x: x + 0.5, y, z: z + 0.5 };
                            };
                        };
                    };
                };

                const order = ['checkpoint1', 'checkpoint2', 'checkpoint3', 'checkpoint4', 'checkpoint5', 'goal'];
                // Optional "from to" pair (e.g. "checkpoint2 checkpoint3") isolates just that one
                // leg, starting the bot directly at "from" - for reproducing a specific failing
                // leg on demand without re-running (and re-passing) every leg before it.
                const requestedPair = (opts || '').trim().split(/\s+/).filter(Boolean);
                const route = requestedPair.length === 2 ? requestedPair : order.filter(name => checkpoints[name]);
                const fmt = (p) => `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;

                if (route.length < 2 || !checkpoints[route[0]]) {
                    roomChat(ctx.room, `[pathtestcheckpoints] map needs at least checkpoint1 and one more marker to test (or a valid "from to" pair) - found: ${route.join(', ') || '(none)'}.`);
                    return;
                };

                roomChat(ctx.room, `[pathtestcheckpoints] route: ${route.join(' -> ')}`);
                console.log(`[deadinternet pathtestcheckpoints] checkpoints:`, checkpoints);

                const bot = new DeadInternetBot(ctx.room, {});
                await bot.init();
                // Real respawn AT checkpoint1, not just a pathTo target - see header comment on
                // why this replaces the random spawn entirely for this test.
                bot.player.respawn({ ...checkpoints[route[0]], yaw: 0, pitch: 0 });
                bot.player.dx = 0;
                bot.player.dy = 0;
                bot.player.dz = 0;

                const legTimeoutMs = 90000;
                const travelTo = (fromLabel, toLabel) => new Promise((resolve) => {
                    const destination = checkpoints[toLabel];
                    const startedAt = Date.now();
                    // See pathtestall's identical comment - "arrived" alone doesn't mean the route
                    // worked, only that the bot's self-correction eventually got it there.
                    const stuckEventsBefore = bot.totalStuckEvents;
                    const path = bot.pathTo(destination, { force: true });
                    console.log(`[deadinternet pathtestcheckpoints] leg ${fromLabel}->${toLabel} planned:`, path ? path.map(w => `${w.type}(${w.x.toFixed(1)},${w.y.toFixed(1)},${w.z.toFixed(1)})`) : null);

                    const botPos = () => `${bot.player.x.toFixed(2)}, ${bot.player.y.toFixed(2)}, ${bot.player.z.toFixed(2)}`;

                    if (!path) {
                        console.log(`[deadinternet pathtestcheckpoints] leg ${fromLabel}->${toLabel}: no path found (bot at ${botPos()})`);
                        roomChat(ctx.room, `[pathtestcheckpoints] leg ${fromLabel}->${toLabel}: no path found.`);
                        setTimeout(() => {
                            resolve({ from: fromLabel, to: toLabel, ok: false, reason: 'no path' });
                        }, 2500);
                        return;
                    };

                    let settled = false;
                    const timeout = setTimeout(() => {
                        if (settled) return;
                        settled = true;
                        console.log(`[deadinternet pathtestcheckpoints] leg ${fromLabel}->${toLabel}: TIMED OUT after ${legTimeoutMs}ms (bot at ${botPos()})`);
                        roomChat(ctx.room, `[pathtestcheckpoints] leg ${fromLabel}->${toLabel}: timed out.`);
                        resolve({ from: fromLabel, to: toLabel, ok: false, reason: 'timeout' });
                    }, legTimeoutMs);

                    bot.onUpdate = async (data) => {
                        const status = bot.followPath(data?.delta);
                        if (status === 'arrived' && !settled) {
                            settled = true;
                            clearTimeout(timeout);
                            const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
                            const stuckEvents = bot.totalStuckEvents - stuckEventsBefore;
                            if (stuckEvents > 0) {
                                const edge = bot.lastStuckEdge;
                                console.log(`[deadinternet pathtestcheckpoints] leg ${fromLabel}->${toLabel}: arrived in ${elapsedSeconds}s but NOT first-try - ${stuckEvents} stuck event(s), last around ${edge?.from} -> ${edge?.to} (${edge?.type})`);
                                roomChat(ctx.room, `[pathtestcheckpoints] leg ${fromLabel}->${toLabel}: FAILED - arrived but needed ${stuckEvents} stuck-recovery cycle(s), not first try.`);
                                resolve({ from: fromLabel, to: toLabel, ok: false, reason: `stuck-recovered (${stuckEvents}x, last: ${edge?.from}->${edge?.to} ${edge?.type})`, seconds: elapsedSeconds });
                                return;
                            };
                            console.log(`[deadinternet pathtestcheckpoints] leg ${fromLabel}->${toLabel}: arrived in ${elapsedSeconds}s`);
                            roomChat(ctx.room, `[pathtestcheckpoints] leg ${fromLabel}->${toLabel}: arrived in ${elapsedSeconds}s.`);
                            resolve({ from: fromLabel, to: toLabel, ok: true, seconds: elapsedSeconds });
                        };
                    };
                });

                const legResults = [];
                for (let i = 0; i < route.length - 1; i++) {
                    const result = await travelTo(route[i], route[i + 1]);
                    legResults.push(result);
                };

                // A full route run (not an isolated "from to" pair debug request - see
                // requestedPair above) finishes with one more leg: the ACTUAL start straight to
                // the ACTUAL goal, no intermediate checkpoints guiding it along the way. Every leg
                // above already passing doesn't by itself prove the bot can navigate the whole
                // route unassisted - each one only has to find its way to the NEXT checkpoint, a
                // much shorter search than the map author's own real distance between the two
                // ends, and a search that's easy across five separate short hops can still fail to
                // find (or fail to execute) the genuinely longer, more complex path a real player
                // would take start to end. Respawning back at the true start and pathing directly
                // to the true goal, skipping every intermediate stop, is the only check that
                // actually exercises that full-length route as one continuous problem.
                if (requestedPair.length !== 2 && route.length > 2) {
                    bot.player.respawn({ ...checkpoints[route[0]], yaw: 0, pitch: 0 });
                    bot.player.dx = 0;
                    bot.player.dy = 0;
                    bot.player.dz = 0;
                    const e2eResult = await travelTo(`${route[0]} (direct)`, route[route.length - 1]);
                    legResults.push(e2eResult);
                };

                bot.onUpdate = async () => { };

                const succeeded = legResults.filter(r => r.ok).length;
                roomChat(ctx.room, `[pathtestcheckpoints] route complete: ${succeeded}/${legResults.length} legs succeeded.`);
                console.log(`[deadinternet pathtestcheckpoints] ROUTE COMPLETE: ${succeeded}/${legResults.length} legs succeeded`);
                if (legResults.some(r => !r.ok)) {
                    console.log(`[deadinternet pathtestcheckpoints] FAILED LEGS:`, legResults.filter(r => !r.ok).map(r => `${r.from} -> ${r.to} (${fmt(checkpoints[r.to])}): ${r.reason}`));
                };
            }
        });

        // --- Debug tool: records a REAL player's own manual attempt at the map's PARKOUR
        // checkpoint route, full tick resolution, as a rough reference trace for tricky jumps -
        // not meant to substitute for pathtestcheckpoints' own pass/fail verification, just a
        // ground-truth "here's what a real run through this looks like" to compare a stuck bot's
        // behavior against, instead of only ever inferring the intended route from bailed/FAILED
        // simulateEdge traces. See recordPlayerState (registered against playerStateUpdate) for
        // where the actual per-tick capture happens - this command only sets up the checkpoint
        // route and hands off to it.
        ctx.newCommand({
            identifier: "beginmanualrecording",
            name: "beginmanualrecording",
            category: "bots",
            description: "Records your own movement (position/direction/velocity/held controls) through the map's PARKOUR checkpoint route as you walk it manually, printing each checkpoint as you reach it and saving the full trace to store/deadinternet/recordings/ once you reach the goal.",
            warningText: "Debug tool: records your movement until you reach the goal tile (or /bots beginmanualrecording again to discard and restart).",
            permissionLevel: [ctx.ranksEnum.Guest, ctx.ranksEnum.Guest, false],
            inputType: [],
            executeClient: ({ player, opts, mentions }) => { },
            executeServer: async ({ player, opts, mentions }) => {
                const map = ctx.room.map;
                const checkpoints = {};
                for (let x = 0; x < map.width; x++) {
                    for (let y = 0; y < map.height; y++) {
                        for (let z = 0; z < map.depth; z++) {
                            const cell = map.data[x]?.[y]?.[z];
                            if (cell?.mesh?.theme === 'PARKOUR') {
                                checkpoints[cell.mesh.name] = { x: x + 0.5, y, z: z + 0.5 };
                            };
                        };
                    };
                };
                const order = ['checkpoint1', 'checkpoint2', 'checkpoint3', 'checkpoint4', 'checkpoint5', 'goal'];
                const route = order.filter(name => checkpoints[name]);
                if (route.length < 2) {
                    roomChat(ctx.room, `[beginmanualrecording] map needs at least checkpoint1 and one more PARKOUR marker - found: ${route.join(', ') || '(none)'}.`);
                    return;
                };

                if (activeRecordings.has(player.id)) {
                    roomChat(ctx.room, `[beginmanualrecording] discarding ${player.name}'s previous unfinished recording and starting a new one.`);
                };

                const startedAt = Date.now();
                activeRecordings.set(player.id, {
                    mapName: ctx.room.minMap?.name || map.name || 'unknown',
                    playerName: player.name,
                    startedAt, lastCheckpointAt: startedAt,
                    route, checkpoints, nextIndex: 0,
                    samples: [], legTimes: [],
                });

                roomChat(ctx.room, `[beginmanualrecording] recording started for ${player.name} - route: ${route.join(' -> ')}. Walk to ${route[0]} to begin.`);
                console.log(`[deadinternet beginmanualrecording] started for`, player.name, 'route:', route);
            }
        });

        // --- Debug tool: reproduces one specific spawn-to-spawn leg on demand, rather than
        // waiting for pathtestall's random tour order to happen to include it - lets a
        // known-bad pair (spotted in a pathtestall run's FAILED LEGS output, indices into that
        // same run's "N spawn points" console log) get re-tested directly while iterating on a
        // fix, without re-running the whole tour and hoping for the same shuffle.
        ctx.newCommand({
            identifier: "pathtestpair",
            name: "pathtestpair",
            category: "bots",
            description: "Tests live pathfinding between two specific spawn indices (see pathtestall's spawn point list in console).",
            example: "28 10",
            warningText: "Debug tool: reproduces one specific spawn-to-spawn leg on demand.",
            permissionLevel: [ctx.ranksEnum.Guest, ctx.ranksEnum.Guest, false],
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => { },
            executeServer: async ({ player, opts, mentions }) => {
                const [fromStr, toStr] = opts.trim().split(/\s+/);
                const fromIdx = Number(fromStr), toIdx = Number(toStr);
                const spawnList = ctx.room.spawnPoints[0] || [];
                if (!Number.isInteger(fromIdx) || !Number.isInteger(toIdx) || !spawnList[fromIdx] || !spawnList[toIdx]) {
                    roomChat(ctx.room, `[pathtestpair] usage: /bots pathtestpair <fromIdx> <toIdx> (0-${spawnList.length - 1})`);
                    return;
                };

                const spawns = spawnList.map(s => ({ x: s.x + 0.5, y: s.y, z: s.z + 0.5 }));
                const fmt = (p) => `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;

                const bot = new DeadInternetBot(ctx.room, {});
                await bot.init();
                bot.player.respawn(spawns[fromIdx]);

                roomChat(ctx.room, `[pathtestpair] testing ${fromIdx} (${fmt(spawns[fromIdx])}) -> ${toIdx} (${fmt(spawns[toIdx])})`);
                console.log(`[deadinternet pathtestpair] testing ${fromIdx} (${fmt(spawns[fromIdx])}) -> ${toIdx} (${fmt(spawns[toIdx])})`);

                const startedAt = Date.now();
                // See pathtestall's identical comment - "arrived" alone doesn't mean the route
                // worked, only that the bot's self-correction eventually got it there.
                const stuckEventsBefore = bot.totalStuckEvents;
                const path = bot.pathTo(spawns[toIdx], { force: true });
                if (!path) {
                    console.log(`[deadinternet pathtestpair] no path found immediately`);
                    roomChat(ctx.room, `[pathtestpair] no path found immediately.`);
                    return;
                };

                const legTimeoutMs = 90000;
                let settled = false;
                const timeout = setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    console.log(`[deadinternet pathtestpair] TIMED OUT (bot at ${bot.player.x.toFixed(2)}, ${bot.player.y.toFixed(2)}, ${bot.player.z.toFixed(2)})`);
                    roomChat(ctx.room, `[pathtestpair] timed out.`);
                    bot.onUpdate = async () => { };
                }, legTimeoutMs);

                bot.onUpdate = async (data) => {
                    const status = bot.followPath(data?.delta);
                    if (status === 'arrived' && !settled) {
                        settled = true;
                        clearTimeout(timeout);
                        const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
                        const stuckEvents = bot.totalStuckEvents - stuckEventsBefore;
                        if (stuckEvents > 0) {
                            const edge = bot.lastStuckEdge;
                            console.log(`[deadinternet pathtestpair] arrived in ${elapsedSeconds}s but NOT first-try - ${stuckEvents} stuck event(s), last around ${edge?.from} -> ${edge?.to} (${edge?.type})`);
                            roomChat(ctx.room, `[pathtestpair] FAILED - arrived but needed ${stuckEvents} stuck-recovery cycle(s), not first try.`);
                        } else {
                            console.log(`[deadinternet pathtestpair] arrived in ${elapsedSeconds}s`);
                            roomChat(ctx.room, `[pathtestpair] arrived in ${elapsedSeconds}s.`);
                        };
                        bot.onUpdate = async () => { };
                    };
                };
            }
        });

        // --- Debug tool: like pathtestpair, but for two exact raw coordinates instead of spawn
        // indices - useful for reproducing one specific edge from a bug report or a purpose-built
        // diagnostic map without needing a spawn point placed exactly there.
        ctx.newCommand({
            identifier: "pathtestraw",
            name: "pathtestraw",
            category: "bots",
            description: "Tests live pathfinding between two exact raw coordinates (grid cell + 0.5 for center).",
            example: "1.5 1 4.5 3.5 1 6.5",
            warningText: "Debug tool: reproduces one specific arbitrary from/to pair on demand.",
            permissionLevel: [ctx.ranksEnum.Guest, ctx.ranksEnum.Guest, false],
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => { },
            executeServer: async ({ player, opts, mentions }) => {
                const parts = opts.trim().split(/\s+/).map(Number);
                if (parts.length !== 6 || parts.some(Number.isNaN)) {
                    roomChat(ctx.room, `[pathtestraw] usage: /bots pathtestraw <fromX fromY fromZ toX toY toZ>`);
                    return;
                };
                const [fx, fy, fz, tx, ty, tz] = parts;
                const from = { x: fx, y: fy, z: fz };
                const to = { x: tx, y: ty, z: tz };
                const fmt = (p) => `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;

                const bot = new DeadInternetBot(ctx.room, {});
                await bot.init();
                bot.player.respawn(from);

                roomChat(ctx.room, `[pathtestraw] testing ${fmt(from)} -> ${fmt(to)}`);
                console.log(`[deadinternet pathtestraw] testing ${fmt(from)} -> ${fmt(to)}`);

                const startedAt = Date.now();
                const stuckEventsBefore = bot.totalStuckEvents;
                const path = bot.pathTo(to, { force: true });
                if (!path) {
                    console.log(`[deadinternet pathtestraw] no path found immediately`);
                    roomChat(ctx.room, `[pathtestraw] no path found immediately.`);
                    return;
                };
                console.log(`[deadinternet pathtestraw] planned:`, path.map(w => `${w.type}(${w.x.toFixed(1)},${w.y.toFixed(1)},${w.z.toFixed(1)})`));

                const legTimeoutMs = 90000;
                let settled = false;
                const timeout = setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    console.log(`[deadinternet pathtestraw] TIMED OUT (bot at ${bot.player.x.toFixed(2)}, ${bot.player.y.toFixed(2)}, ${bot.player.z.toFixed(2)})`);
                    roomChat(ctx.room, `[pathtestraw] timed out.`);
                    bot.onUpdate = async () => { };
                }, legTimeoutMs);

                bot.onUpdate = async (data) => {
                    const status = bot.followPath(data?.delta);
                    if (status === 'arrived' && !settled) {
                        settled = true;
                        clearTimeout(timeout);
                        const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
                        const stuckEvents = bot.totalStuckEvents - stuckEventsBefore;
                        if (stuckEvents > 0) {
                            const edge = bot.lastStuckEdge;
                            console.log(`[deadinternet pathtestraw] arrived in ${elapsedSeconds}s but NOT first-try - ${stuckEvents} stuck event(s), last around ${edge?.from} -> ${edge?.to} (${edge?.type})`);
                            roomChat(ctx.room, `[pathtestraw] FAILED - arrived but needed ${stuckEvents} stuck-recovery cycle(s), not first try.`);
                        } else {
                            console.log(`[deadinternet pathtestraw] arrived in ${elapsedSeconds}s`);
                            roomChat(ctx.room, `[pathtestraw] arrived in ${elapsedSeconds}s.`);
                        };
                        bot.onUpdate = async () => { };
                    };
                };
            }
        });

        // --- Debug tool: sends a bot to wherever the calling player is standing right now, no
        // spawn-point indices needed - the fastest way to hand-test a specific spot in the map
        // (like the one in a bug report screenshot) without hunting for its nearest spawn index.
        // Snapshots the player's position once at the moment the command runs - it does not chase
        // them if they keep moving afterward.
        ctx.newCommand({
            identifier: "pathtestme",
            name: "pathtestme",
            category: "bots",
            description: "Spawns a bot and paths it to your current position.",
            warningText: "Debug tool: sends a bot walking to wherever you're currently standing.",
            permissionLevel: [ctx.ranksEnum.Guest, ctx.ranksEnum.Guest, false],
            inputType: [],
            executeClient: ({ player, opts, mentions }) => { },
            executeServer: async ({ player, opts, mentions }) => {
                const target = { x: player.x, y: player.y, z: player.z };
                const fmt = (p) => `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;

                const bot = new DeadInternetBot(ctx.room, {});
                await bot.init();

                roomChat(ctx.room, `[pathtestme] heading to ${player.name} at (${fmt(target)})`);
                console.log(`[deadinternet pathtestme] heading to ${player.name} at (${fmt(target)})`);

                const startedAt = Date.now();
                const path = bot.pathTo(target, { force: true });
                if (!path) {
                    console.log(`[deadinternet pathtestme] no path found immediately`);
                    roomChat(ctx.room, `[pathtestme] no path found immediately.`);
                    return;
                };

                const legTimeoutMs = 90000;
                let settled = false;
                const timeout = setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    console.log(`[deadinternet pathtestme] TIMED OUT (bot at ${bot.player.x.toFixed(2)}, ${bot.player.y.toFixed(2)}, ${bot.player.z.toFixed(2)})`);
                    roomChat(ctx.room, `[pathtestme] timed out.`);
                    bot.onUpdate = async () => { };
                }, legTimeoutMs);

                bot.onUpdate = async (data) => {
                    const status = bot.followPath(data?.delta);
                    if (status === 'arrived' && !settled) {
                        settled = true;
                        clearTimeout(timeout);
                        const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
                        console.log(`[deadinternet pathtestme] arrived in ${elapsedSeconds}s`);
                        roomChat(ctx.room, `[pathtestme] arrived in ${elapsedSeconds}s.`);
                        bot.onUpdate = async () => { };
                    };
                };
            }
        });
    },
};

if (isClient) DeadInternetPlugin.registerListeners(plugins);