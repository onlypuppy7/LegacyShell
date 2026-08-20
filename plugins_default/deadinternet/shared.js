//legacyshell: basic
import { CONTROL, isClient, isServer, maxServerSlots, ticksPerSecond } from "#constants";
import Comm from "#comm";
//legacyshell: plugins
import { plugins } from '#plugins';
import { setGameOptionInMentions } from "#permissions";
import ClientConstructor from "#client";
import { DeadInternetBot, findPath } from "./index.js";
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

export const DeadInternetPlugin = {
    registerListeners: function (pluginManager) {
        console.log("registering listeners... (DeadInternetPlugin)");

        this.plugins = pluginManager;

        this.plugins.on('game:permissionsAfterSetup', this.permissionsAfterSetup.bind(this));
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

                    bot.onUpdate = async () => {
                        const targetPlayer = bot.getNearestPlayer();
                        if (!targetPlayer) return;

                        bot.pathTo(targetPlayer.predicted ?? targetPlayer);
                        const status = bot.followPath();

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

                bot.onUpdate = async () => {
                    // Always call followPath() - it's what advances bot.tick every real tick,
                    // even while `pending` is gating everything else (it no-ops harmlessly when
                    // there's no active path, e.g. right after arrival/death).
                    const status = bot.followPath();

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

                // Pass 1: algorithmic. Every ordered pair, i != j.
                const algoFailures = [];
                let algoChecked = 0;
                for (let i = 0; i < spawns.length; i++) {
                    for (let j = 0; j < spawns.length; j++) {
                        if (i === j) continue;
                        algoChecked++;
                        if (!findPath(ctx.room, spawns[i], spawns[j])) algoFailures.push([i, j]);
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

                const bot = new DeadInternetBot(ctx.room, {});
                await bot.init();

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

                    bot.onUpdate = async () => {
                        const status = bot.followPath();
                        if (status === 'arrived' && !settled) {
                            settled = true;
                            clearTimeout(timeout);
                            const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
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

                bot.onUpdate = async () => {
                    const status = bot.followPath();
                    if (status === 'arrived' && !settled) {
                        settled = true;
                        clearTimeout(timeout);
                        const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
                        console.log(`[deadinternet pathtestpair] arrived in ${elapsedSeconds}s`);
                        roomChat(ctx.room, `[pathtestpair] arrived in ${elapsedSeconds}s.`);
                        bot.onUpdate = async () => { };
                    };
                };
            }
        });
    },
};

if (isClient) DeadInternetPlugin.registerListeners(plugins);