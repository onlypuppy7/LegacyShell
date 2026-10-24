//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: samplecommand
import { DeadInternetPlugin } from './shared.js';
import Comm from '#comm';
import { CONTROL, classes, devlog, iteratePlayers, ticksPerSecond } from '#constants';
import { AllItems } from '#items';
import { findPath, lastFindPathStats, isStandable, isLadderCell, EDGE_TYPE, MOVEMENT_PROFILE } from './pathfinding.js';
import { perf } from './perf.js';
import { loadGeometryCache, saveGeometryCache, geometryStoreStats, clearGeometryStore, setStoreEnabled, setStoreCompression, isStoreEnabled } from './geometryStore.js';
import { CombatController, resolveCombatOptions, parseCombatArgs, listPresets, registerPreset, COMBAT_OPTIONS, DIFFICULTY_PRESETS, hasLineOfSight, weaponProfile, setClassProvider, resolveClassIndex, listClasses, parseSkill, SoundTracker, SKILL_CURVES, resolveShellColor, SHELL_COLORS } from './combat.js';
import { startIdleWarm } from './idlewarm.js';
import { simulateEdge, canSimulate, JUMP_RUNUP_BACKAWAY_SECONDS, ladderCatchTarget } from './physicsSimulation.js';
//

// Re-exported so a consuming plugin can `import { findPath, EDGE_TYPE, ... } from
// '<path>/deadinternet/index.js'` without also needing to know pathfinding.js exists as a
// separate file - the public surface of this plugin is meant to be this file, not its internals.
export { findPath, isStandable, EDGE_TYPE, MOVEMENT_PROFILE };
export { perf };
export { loadGeometryCache, saveGeometryCache, geometryStoreStats, clearGeometryStore, setStoreEnabled, setStoreCompression, isStoreEnabled };
export { CombatController, resolveCombatOptions, parseCombatArgs, listPresets, registerPreset, COMBAT_OPTIONS, DIFFICULTY_PRESETS, hasLineOfSight, weaponProfile, resolveClassIndex, listClasses, parseSkill, SoundTracker, SKILL_CURVES, resolveShellColor, SHELL_COLORS };

// The bot's `class` option is validated against the game's own class list, read live: a plugin that
// adds a class (Crackshot does, in its constructor) shows up here when it's loaded and simply isn't
// there when it isn't - nothing in this plugin refers to any specific plugin.
setClassProvider(() => classes);

export const PluginMeta = {
    identifier: "deadinternet",
    name: 'DeadInternet',
    author: 'onlypuppy7 (+Claude)', //NOTE! most of this plugin is VIBECODED.
    version: '1.1.2',
    descriptionShort: 'Adds bot players that walk the map and fight, at any skill level', //displayed when loading
    descriptionLong: 'Adds bot players that walk the map and fight (aim, strafe, take cover, throw grenades, hear gunfire), from target dummies to nightmare skill, with ready-made fields of bots - plus a general A* pathfinding engine other plugins can use.',
    legacyShellVersion: 459, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;

        DeadInternetPlugin.registerListeners(this.plugins);
        startIdleWarm(); //fills the pathfinding cache while a game server has no rooms
        this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));

        this.plugins.on('game:metaLoop', this.metaLoopHook.bind(this));
        this.plugins.on('game:clientPackSyncLoop', this.clientPackSyncLoopHook.bind(this));
        this.plugins.on('game:clientInit', this.clientInit.bind(this));
        this.plugins.on('game:joinPlayer', this.joinPlayer.bind(this));
        this.plugins.on('game:clientInstantiatePlayer', this.clientInstantiatePlayer.bind(this));
        this.plugins.on('game:clientUpdateLoadoutEnd', this.clientUpdateLoadoutEnd.bind(this));
        this.plugins.on('game:onPlayerDeath', this.onPlayerDeath.bind(this));
        this.plugins.on('game:updateBefore', this.updateBefore.bind(this));

        this.plugins.on('services:initTablesMaps', this.initTablesMaps.bind(this));
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

        async initTablesMaps(data) {
            await data.ss.recs.insertMaps(path.join(this.thisDir, 'maps')); //hopefully avoid the annoying startup crash
        };
};

export var DeadInternetBots = [];

// How far apart two goals are for route-reuse purposes: ground distance, with height counting extra
// (a goal one level up is a different place, not a slightly different one).
function goalDistance(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z) + Math.abs(a.y - b.y) * 1.5;
}

// One SoundTracker per room, shared by every bot in it (hearing is inferred from room state - see
// combat-tactics.js - so there's no point each bot doing its own polling), and one "squad" focus
// object per room + role + team, which bots use to gang up on the same target.
const soundTrackers = new WeakMap();
const squads = new WeakMap();

function getSoundTracker(room) {
    let tracker = soundTrackers.get(room);
    if (!tracker) {
        tracker = new SoundTracker({
            iteratePlayers,
            getProjectiles: () => {
                const mm = room.munitionsManager;
                const grenades = [], rockets = [];
                mm?.grenadePool?.forEachActive((g) => grenades.push(g));
                mm?.rocketPool?.forEachActive((r) => rockets.push(r));
                return { grenades, rockets };
            },
        });
        soundTrackers.set(room, tracker);
    };
    return tracker;
}

function getSquad(room, key) {
    let byKey = squads.get(room);
    if (!byKey) { byKey = new Map(); squads.set(room, byKey); };
    let squad = byKey.get(key);
    if (!squad) { squad = { focus: null, until: 0 }; byKey.set(key, squad); };
    return squad;
}

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

        // Combat behavior config: `opts.combat` is { difficulty, ...overrides } - a preset name
        // plus any individual option overrides (see combat.js's COMBAT_OPTIONS). Resolved here
        // once so a bad option is reported before the bot ever joins the room; the controller
        // itself is built in init(), once there's a real Player to read from.
        this.combatConfig = { ...(opts.combat ?? {}) };
        this.combatResolved = resolveCombatOptions(this.combatConfig);
        this.combat = null;
        this.owner = opts.owner ?? null;

        this.currentPath = null;
        this.pathIndex = 0;
        this.pathIndex0NeedsGroundWait = false; // whether path[0] still needs the player to land before being pursued - see pathTo()/followPath()
        this.pathGoalKey = null;
        this.pathRecomputeAt = 0;
        this.pathLastFailed = false; // whether the last findPath() for pathGoalKey returned null - see pathTo()
        this.pathStuckSinceTime = null;
        this.pathBestDistance = Infinity; // closest distance-to-waypoint achieved so far (horizontal normally, vertical while climbing - see checkStuck()) for the CURRENT metric only
        this.pathWasClimbing = false; // tracks checkStuck()'s progress metric across ticks, so a mid-waypoint switch between it (horizontal <-> vertical) resets pathBestDistance instead of comparing incompatible values
        this.pathLastPos = null; // player x/y/z as of the previous checkStuck() call - lets it notice a same-tick position discontinuity and reset pathBestDistance instead of treating the new, much worse distance as "stuck" - see checkStuck()
        this.pathAvoidedEdges = new Set(); // "x,y,z->x,y,z" edges that turned out not to actually be traversable - see checkStuck()
        this.fallCheckedWaypointIndex = null; // which waypoint index has already had its pre-commit fall dry run - see followPath()
        this.jumpRunupWaypointIndex = null; // which waypoint index the current jump run-up backup is for - see followPath()
        this.jumpRunupUntilTime = null; // simulatedTime value at the end of phase 1 (back away)
        this.jumpLiftoffFired = false; // whether phase 3 has already called player.jump() once for the CURRENT jump waypoint - see followPath()'s phase 3
        this.jumpNeedsRunup = false; // whether the current jump waypoint needs the phase-1/2 run-up at all (height gain OR a long same-level gap) - see followPath()
        this.jumpChargeMaxTime = null; // safety-net simulatedTime cap on phase 2 (charge to the takeoff edge, grounded) - jump() fires once reached or this fires
        this.jumpRunupTargetDist = 0; // straight-line distance from where phase 2 began to the near edge of that cell - see followPath()
        this.jumpRunupStartX = 0; // player.x when phase 2 began, to measure progress toward jumpRunupTargetDist - see followPath()
        this.jumpRunupStartZ = 0; // player.z when phase 2 began, to measure progress toward jumpRunupTargetDist - see followPath()
        this.jumpRunupSpeed = 0; // previous tick's run-up speed, to detect a collision (sudden drop) and cut the run-up short - see followPath()
        this.jumpRunupStartY = 0; // player.y when the current run-up began, to detect backing off the takeoff ledge itself - see followPath()
        this.pathFailStreak = 0; // consecutive findPath() failures from the same (unmoved) position - see pathTo()
        this.pathFailPos = null;
        // Search economy (see pathTo()): after a failed search the bot backs off instead of retrying the
        // same unreachable place every time the target steps into a new cell; a route that still serves
        // its goal is reused instead of re-searched; and a route survives a fight (suspended, not dropped).
        this.pathFailCount = 0;     // consecutive failed searches
        this.pathFailUntil = 0;     // Date.now() before which a retry near pathFailGoal is skipped
        this.pathFailGoal = null;   // where the last failed search was headed
        this.pathReplanBy = 0;      // even a good route is re-checked after this
        this.pathSuspended = false; // route kept while the bot fights - see suspendPath()
        this.pathAs = null;         // modifiers its searches use in place of its own (findPath's opts.as), e.g. { scale: 1 } to take a normal sized bot's routes
        this.stuckEventCount = 0; // total checkStuck() replans since the last real progress, regardless of position - see checkStuck()
        // Lifetime counter, deliberately NEVER auto-reset (unlike stuckEventCount above, which
        // resets on real progress for ITS OWN purpose) - a test harness snapshots this before and
        // after a leg to tell "arrived smoothly" apart from "arrived after N internal stuck/
        // replan/respawn cycles", which the leg's own success/failure result can't distinguish on
        // its own (both currently just report "arrived"). See pathtestall/pathtestpair/
        // pathtestcheckpoints in shared.js.
        this.totalStuckEvents = 0;
        this.lastStuckEdge = null; // { from, to } of the most recent stuck event's blacklisted edge, for debugging WHAT actually triggered it - see checkStuck()

        // followPath() runs once per real simulated game tick (see player.js's update() ->
        // 'updateBefore' -> DeadInternetBot's onUpdate -> followPath(delta), the only path that
        // ever calls it), and accumulates the REAL delta it's handed each call (see followPath()'s
        // own header comment) rather than using Date.now() or a plain tick count for the durations
        // below - correct regardless of server load/lag, and correct under physicsSpeedModifier
        // or any other time-scaling, since it's the same clock the physics itself runs on.
        this.simulatedTime = 0;
    }

    async init() {
        this.client = await this.room.joinPlayer({
            id: null,
            nickname: this.combatResolved.options.nickname,
            classIdx: resolveClassIndex(this.combatResolved.options.class),
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
        await this.applyShellColor();
        await this.respawn();

        // Pick up what earlier runs learned about this map (once per room; a missing or stale file just
        // means starting cold). Awaited here so it is in place before the first search ever runs.
        const store = await loadGeometryCache(this.room);
        if (store.loaded) console.log(`[deadinternet] pathfinding cache loaded: ${store.added} answers (${(store.bytes / 1024).toFixed(0)}KB) for ${this.room.minMap?.name ?? 'this map'}`);
        else if (store.reason && store.reason !== 'disabled' && store.reason !== 'no file yet') console.log(`[deadinternet] pathfinding cache not used: ${store.reason}`);

        this.setupCombat();
    }

    // Sets the bot's egg colour (the `color` option) and tells everyone already in the room. The game only
    // lets subscribers pick colours 7-13 (Client.setColorIdx clamps everyone else to 0-6, which includes
    // every bot), so this sets the colour on the client directly and then applies the loadout, which
    // broadcasts the change. Players joining later get it from the client when it is announced to them.
    async applyShellColor() {
        const index = resolveShellColor(this.combatResolved.options.color);
        if (index === null) return;
        this.client.colorIdx = index;
        await this.client.applyLoadout();
    }

    // Builds the CombatController and applies the options that live on the Player itself (team,
    // speed/damage/resistance modifiers). Only touches a modifier when its option is set - null
    // means "leave the game's own value alone".
    setupCombat() {
        const o = this.combatResolved.options;
        // Join the requested team first: the squad (who gangs up on whom) is per team.
        if (o.team >= 0 && this.player.team !== o.team) this.player.switchTeam(o.team);

        this.combat = new CombatController({
            player: this.player,
            map: this.room.map,
            iteratePlayers,
            owner: this.owner,
            getPickups: (kind) => this.getPickups(kind),
            sounds: getSoundTracker(this.room),
            squad: getSquad(this.room, `${o.role}:${this.player.team}`),
            perf,
        }, this.combatConfig);

        // NOTE: the player-side modifiers (speed, damage, resistance) are deliberately NOT applied here.
        // init() is also how the debug/pathtest bots (and any plugin that just wants a bot to navigate)
        // are created, and they must keep the game's default physics: a bot slowed to a combat skill's
        // speed can't make the jumps its route needs, and the pathfinder - which verifies every move
        // against the bot's real physics - correctly reports no path. They are applied when the combat
        // AI actually starts, see applyCombatModifiers().
    }

    // Applies the combat options that change the Player itself: speed, damage dealt, resistance. Only
    // when set - null means "leave the game's own value alone" - and taken from the controller's own
    // (per-bot varied) copy of the options. Runs once, when the combat AI starts (startCombatAI() or the
    // first think()), so a bot that never fights keeps its default modifiers.
    applyCombatModifiers() {
        if (this.combatModifiersApplied || !this.combat) return;
        this.combatModifiersApplied = true;
        const c = this.combat.opts;
        const mods = {};
        if (c.speed !== null) mods.speedModifier = c.speed;
        if (c.damage !== null) mods.damageModifier = c.damage;
        if (c.resistance !== null) mods.resistanceModifier = c.resistance;
        if (Object.keys(mods).length) this.player.changeModifiers(mods);
    }

    // Active pickups of one item kind in this room ('AMMO', 'HEALTH', ...), as plain {x,y,z}. The
    // pool index is looked up by codeName rather than assumed, since plugins add item kinds - and
    // a kind this room doesn't have (the health pack plugin not loaded, say) just gives [].
    getPickups(codeName) {
        const out = [];
        const kind = AllItems.findIndex((item) => item.codeName === codeName);
        const pool = kind < 0 ? null : this.room.itemManager?.pools?.[kind];
        if (pool) pool.forEachActive((item) => out.push({ x: item.x, y: item.y, z: item.z }));
        return out;
    }

    setOwner(owner) {
        this.owner = owner;
        this.combat?.setOwner(owner);
    }

    // Applies one CombatController command to the real Player. When engaged the combat layer owns
    // yaw + controls (path following is paused, since followPath() steers by setting yaw toward
    // the next waypoint and forward is relative to yaw - they can't both drive it at once);
    // otherwise it just supplies a destination for the normal pathTo()/followPath() pair.
    applyCombat(cmd, delta = 1) {
        const p = this.player;

        if (cmd.reload) p.reload();
        if (cmd.swap !== null) p.swapWeapon(cmd.swap);
        // Queue a grenade; the controller keeps the aim locked until the throw actually happens.
        if (cmd.grenade !== null && cmd.grenade !== undefined) p.queueGrenade(cmd.grenade);

        if (cmd.engaged) {
            this.suspendPath(); // keeps the route for after the fight; also zeroes controlKeys
            p.yaw = cmd.yaw;
            p.pitch = cmd.pitch;
            p.controlKeys = cmd.controls & ~CONTROL.jump; // jump is an impulse (player.jump()) for bots, not a held key
            if (cmd.jump) p.jump();
            return;
        };

        if (cmd.moveTo) {
            const pt0 = perf.now();
            this.pathTo(cmd.moveTo, { chase: true });
            perf.add('pathTo', pt0);
            // No route to a pickup or cover spot: have the controller pick another next scan.
            if ((cmd.state === 'restock' || cmd.state === 'heal' || cmd.state === 'cover') && this.pathLastFailed && !this.currentPath) this.combat.markUnreachable(cmd.moveTo);
        } else if (this.pathSuspended) this.stopPath(); // nowhere to go any more: don't keep a route nobody is following
        const fp0 = perf.now();
        this.followPath(delta); // no-ops (and clears controlKeys) when there's no path
        perf.add('followPath', fp0);
    }

    // One tick of the full default combat AI: decide, then act. Call from onUpdate, or use
    // startCombatAI() to have it wired up for you.
    think(delta = 1) {
        if (!this.combat) return null;
        this.applyCombatModifiers();
        const t0 = perf.now();
        const cmd = this.combat.update(delta / ticksPerSecond);
        perf.add('update', t0);
        const a0 = perf.now();
        this.applyCombat(cmd, delta);
        perf.add('apply', a0);
        perf.add('think', t0);
        return cmd;
    }

    // Wires think() into onUpdate and a respawn-after-delay into onDeath. Replace either hook
    // afterwards for custom behavior - they're plain properties.
    startCombatAI() {
        this.applyCombatModifiers();
        this.onUpdate = async (data) => { this.think(data?.delta); };
        this.onDeath = () => {
            this.combat?.reset();
            clearTimeout(this.respawnTimer);
            this.respawnTimer = setTimeout(() => { if (!this.removed) this.respawn(); }, this.combatResolved.options.respawnDelay * 1000);
        };
    }

    // Takes the bot out of the room for good: disconnects its client (which broadcasts the
    // removePlayer packet and frees its slot) and stops every hook from touching it again.
    // Safe to call more than once.
    remove() {
        if (this.removed) return;
        this.removed = true;
        clearTimeout(this.respawnTimer);
        this.onUpdate = null;
        this.onDeath = null;
        this.stopPath?.();
        const i = DeadInternetBots.indexOf(this);
        if (i !== -1) DeadInternetBots.splice(i, 1);
        this.client?.onclose();
    }

    control(control) {
        this.player.controlKeys |= control;
    }

    async respawn() {
        await this.client.requestRespawn();
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

        if (!force) {
            // Backing off: the last search toward (about) here failed, so don't repeat it every time the
            // target steps into a new cell - that was a full search per step for something unreachable.
            if (this.pathFailGoal && now < this.pathFailUntil && goalDistance(target, this.pathFailGoal) < 6) {
                perf.count('search.skipped.backoff');
                return this.currentPath;
            };

            if (this.currentPath) {
                // A route kept through a fight: pick it up again if the bot is still near it.
                if (this.pathSuspended && !this.resumeSuspendedPath()) {
                    this.stopPath();
                } else if (this.pathServesGoal(target, now)) {
                    perf.count('search.skipped.reuse');
                    return this.currentPath;
                } else if (now < this.pathRecomputeAt && this.pathTargetPos && goalDistance(target, this.pathTargetPos) < 15) {
                    // The goal moved further than the route tolerates, but we searched a moment ago. Keep
                    // walking the old route rather than searching on every step of a moving target.
                    perf.count('search.skipped.floor');
                    return this.currentPath;
                };
            };
        };

        // A new destination gets a clean slate - an edge that failed on the way to some earlier
        // target isn't necessarily invalid for a completely different route. stuckEventCount
        // resets here too (not on every replan - checkStuck()'s own forced replans reuse the
        // SAME target, so goalKey doesn't change there, and stuckEventCount needs to keep
        // accumulating across those to do its job).
        if (goalKey !== this.pathGoalKey && !(this.pathTargetPos && goalDistance(target, this.pathTargetPos) < 3)) {
            this.pathAvoidedEdges.clear();
            this.stuckEventCount = 0;
        };

        if (perf.enabled) perf.count(force ? 'search.forced' : this.pathGoalKey === null ? 'search.fresh' : goalKey !== this.pathGoalKey ? 'search.goalMoved' : 'search.timer');
        // Chasing something (the combat AI) wants a bounded search that always heads somewhere useful:
        // aim for the nearest standable cell if the target is mid-air, and settle for the closest
        // reachable point if there's no full route. Exact destinations (tests, tours) opt out.
        // The budget scales with how far away the goal is: reaching a chased target takes ~30 expansions
        // (measured), and a search that can't find one just burns its whole budget exploring everything
        // reachable - so a nearby goal gets a small budget, a far one more.
        const chaseBudget = () => Math.round(Math.max(400, Math.min(2500, 200 + 40 * Math.hypot(target.x - this.player.x, target.z - this.player.z))));
        const searchOpts = opts.chase ? { snapGoal: true, allowPartial: true, maxExpansions: chaseBudget() } : {};
        const fpt0 = perf.now();
        let path = findPath(this.room, this.player, target, { avoidEdges: this.pathAvoidedEdges, as: this.pathAs, ...searchOpts, ...opts });
        perf.add('findPath', fpt0);
        if (!path) perf.count('findPath.none');
        if (perf.enabled) {
            const st = lastFindPathStats();
            perf.count('expansions.' + st.outcome, st.expansions);
            perf.count('searches.' + st.outcome);
            const ms = performance.now() - fpt0;
            if (ms > 15 && (perf.slowSearches ??= []).length < 40) perf.slowSearches.push({ ms, expansions: st.expansions, outcome: st.outcome, dist: Math.hypot(target.x - this.player.x, target.z - this.player.z), up: target.y - this.player.y, chase: !!opts.chase, len: path ? path.length : 0, types: path ? [...new Set(path.map((w) => w.type))].join('/') : '' });
        };

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

            // Force-respawning as a recovery from this was removed on purpose: it fired every tick
            // when the failing pathTo() came from a caller that retries each tick (e.g. chasing an
            // unreachable target), producing a respawn storm. The bot just stays put and backs off.
            if (this.pathFailStreak >= 3) {
                devlog('DeadInternetBot repeatedly failed to find a path from its current position', this.player.name);
                this.pathFailStreak = 0;
            };

            this.pathFailCount++;
            this.pathFailUntil = now + Math.min(6000, 600 * 2 ** (this.pathFailCount - 1));
            this.pathFailGoal = { x: target.x, y: target.y, z: target.z };
        } else {
            this.pathFailStreak = 0;
            this.pathFailCount = 0;
            this.pathFailUntil = 0;
            this.pathFailGoal = null;
        };

        this.currentPath = path;
        this.pathIndex = 0;
        this.pathSuspended = false;
        this.ladderCatchSteeringWaypointIndex = null;
        // Every fresh path is computed from wherever the player happens to BE right now - which,
        // if this pathTo() call is a checkStuck()-forced replan (or any caller chaining straight
        // off a just-arrived "arrived" result), can be mid-flight from an abandoned/incomplete
        // previous jump attempt (still jumping/isFalling true). Walking or jumping toward path[0]
        // immediately treats that leftover ballistic momentum as irrelevant, when it's actually
        // still actively carrying the player somewhere the new plan didn't account for - by the
        // time it actually lands, the plan's very first step is already stale. followPath() holds
        // forward and waits for this flag before touching path[0], for exactly one path (cleared
        // once seen grounded, or once genuinely past the first waypoint) - see its check.
        this.pathIndex0NeedsGroundWait = true;
        this.pathGoalKey = goalKey;
        this.pathTargetPos = { x: target.x, y: target.y, z: target.z }; // so followPath()'s own stuck-recovery can re-path without the caller having to call pathTo() every tick too
        this.pathLastFailed = !path;
        // The floor between searches is spread +-30% per search: bots that all start at the same instant
        // (a freshly spawned field) would otherwise all come due again on the very same tick and search
        // together. The spread changes nothing about how a bot behaves; it just stops them marching in step.
        this.pathRecomputeAt = now + (opts.recomputeIntervalMs ?? 500) * (0.7 + Math.random() * 0.6);
        this.pathReplanBy = now + 5000;
        this.pathStuckSinceTime = null;
        this.pathBestDistance = Infinity;

        return path;
    };

    // Does the current route still do the job for `target`? Yes while the goal hasn't moved further
    // than a tolerance that grows with distance (a target 20 blocks away can wander 5 before the route
    // is stale; one right next to the bot barely at all), the route isn't old, and the bot is still on it.
    pathServesGoal(target, now) {
        if (!this.currentPath || !this.currentPath.length || !this.pathTargetPos) return false;
        if (now > this.pathReplanBy) return false;
        const remaining = Math.hypot(target.x - this.player.x, target.z - this.player.z);
        const tolerance = Math.max(1.5, Math.min(6, remaining * 0.25));
        if (goalDistance(target, this.pathTargetPos) > tolerance) return false;
        return this.nearRoute(3.5, this.pathIndex - 1, this.pathIndex + 3) >= 0;
    }

    // Index of the route waypoint within `radius` blocks (horizontally, and within two blocks of height)
    // of the bot, searching waypoints [from, to] - or -1. Nearest wins.
    nearRoute(radius, from, to) {
        const path = this.currentPath;
        if (!path || !path.length) return -1;
        let best = -1, bestD = radius;
        for (let i = Math.max(0, from); i <= Math.min(path.length - 1, to); i++) {
            const w = path[i];
            if (Math.abs(w.y - this.player.y) > 2) continue;
            const d = Math.hypot(w.x - this.player.x, w.z - this.player.z);
            if (d <= bestD) { best = i; bestD = d; };
        };
        return best;
    }

    // While the bot fights, the route it was following is put aside instead of thrown away: the fight
    // moves it a few blocks, but when the fight ends the route is usually still the way to go. All of
    // the execution state (jump run-ups and so on) is reset exactly as stopPath() does - only the route
    // itself, and which goal it was for, are kept.
    suspendPath() {
        if (!this.currentPath || this.pathSuspended) { this.player.controlKeys = 0; return; };
        const keep = { path: this.currentPath, goalKey: this.pathGoalKey, index: this.pathIndex };
        this.stopPath();
        this.currentPath = keep.path;
        this.pathGoalKey = keep.goalKey;
        this.pathIndex = keep.index;
        this.pathSuspended = true;
    }

    // Takes a suspended route up again from the waypoint nearest the bot, if it's still close to it.
    resumeSuspendedPath() {
        const at = this.nearRoute(3.5, 0, (this.currentPath?.length ?? 0) - 1);
        if (at < 0) return false;
        this.pathIndex = at;
        this.pathIndex0NeedsGroundWait = true;
        this.pathSuspended = false;
        this.pathStuckSinceTime = null;
        this.pathBestDistance = Infinity;
        perf.count('path.resumed');
        return true;
    }

    stopPath() {
        this.pathSuspended = false;
        this.currentPath = null;
        this.pathIndex = 0;
        this.pathIndex0NeedsGroundWait = false; // whether path[0] still needs the player to land before being pursued - see pathTo()/followPath()
        this.pathGoalKey = null;
        this.pathStuckSinceTime = null;
        this.pathBestDistance = Infinity;
        this.pathWasClimbing = false;
        this.fallCheckedWaypointIndex = null;
        this.jumpRunupWaypointIndex = null;
        this.jumpRunupUntilTime = null;
        this.jumpLiftoffFired = false;
        this.jumpNeedsRunup = false;
        this.jumpGainsLevel = false;
        this.jumpChargeMaxTime = null;
        this.jumpRunupTargetDist = 0;
        this.jumpRunupStartX = 0;
        this.jumpRunupStartZ = 0;
        this.jumpRunupSpeed = 0;
        this.jumpRunupStartY = 0;
        this.ladderCatchSteeringWaypointIndex = null;

        // control() only ever ORs bits into controlKeys (see above) - nothing ever clears them on
        // its own, and this is the only place in this file that stops actively steering the bot.
        // Without this, whatever direction followPath() was last holding (almost always
        // CONTROL.up, sometimes CONTROL.down mid jump-runup) stayed held forever once the path
        // ended - the bot would keep walking in that exact direction indefinitely instead of
        // actually stopping, confirmed by testing: visibly walking off into open water at the end
        // of a completed route.
        this.player.controlKeys = 0;
    };

    // Call once per tick (from onUpdate) to steer along whatever path pathTo() last computed.
    // Returns 'idle' (no active path), 'following', or 'arrived' (reached the final waypoint -
    // the path is cleared automatically, call pathTo() again for a new destination).
    //
    // `delta` is the SAME scaled delta player.js's own update(delta, resim) receives (it already
    // has physicsSpeedModifier folded in - see update()'s very first line). Default of 1, not
    // 1/ticksPerSecond, matches what a real, unscaled tick's delta actually is - see
    // physicsSimulation.js's deltaSeconds comment: the whole physics model is calibrated
    // per-TICK (server-game's room loop calls a bot's update() with the literal integer 1 every
    // tick), not per-second, so 1 tick's worth of un-scaled delta really is 1, not 1/60.
    //
    // Dividing by ticksPerSecond once here, at accumulation, converts that into a real-seconds-
    // equivalent running total - simulatedTime advances by ~1/ticksPerSecond per real tick at
    // 1x, or twice that at physicsSpeedModifier=2 - so every duration threshold below can stay
    // expressed as plain calibrated seconds (0.1, 0.6, ...) without each one separately needing
    // to know or divide out the current speed. This is the ONLY place ticksPerSecond appears in
    // this function, purely as a unit conversion for accumulation - nothing below compares
    // against real wall-clock time or a raw tick count, only against this running total.
    followPath(delta = 1) {
        this.simulatedTime += delta / ticksPerSecond;

        // control() only ever ORs bits into controlKeys - by design, so multiple control() calls
        // within the SAME tick can combine (e.g. up+left for a diagonal walk). But nothing was
        // ever CLEARING it between ticks either, and stopPath() (the only place that zeroes it)
        // only fires once a WHOLE path finishes - not between waypoints within one. A real human
        // client doesn't have this problem: their controlKeys is the client's own current key
        // state, sent explicitly on every change, key-up included. A bot driven by this file's
        // control() helper has no equivalent "release" - so a direction held on one waypoint
        // (almost always CONTROL.up, for an ordinary walk) stayed silently held into the NEXT
        // waypoint too, for the rest of the path. Since player.js's up/down (and left/right) are
        // each their own independent, non-exclusive `if` block, holding BOTH up and down
        // simultaneously doesn't average or prioritize - their ddx/ddz contributions cancel to
        // EXACTLY zero (see player.js: `ddz += Math.cos(yaw)` for up, `ddz -= Math.cos(yaw)` for
        // down). Any JUMP waypoint whose run-up needs a back-away phase (CONTROL.down), preceded
        // by even one earlier waypoint in the same path (which almost always left CONTROL.up set),
        // got exactly this: back-away silently did nothing, then charge-forward ALSO did nothing
        // (up|down stays stuck at 3 for the rest of the path, nothing ever clears one bit alone),
        // and the eventual jump() still fired but covered zero horizontal distance - a standing
        // jump with no run-up ever having actually happened, despite the code believing one had.
        // Confirmed live on "PathLadderTest": an ordinary walk-then-jump leg showed exactly this
        // signature tick by tick - z-velocity pinned at ~0 through the entire back-away/charge
        // window, controlKeys reading 3 (up|down) the whole time. Clearing here, once per tick
        // before anything below sets what THIS tick actually wants, makes every tick self-
        // contained - exactly how a real client's input already behaves.
        this.player.controlKeys = 0;

        if (!this.currentPath || this.pathSuspended) return 'idle';

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
        // Force-respawning here was removed on purpose; the bot just gives up its path.
        if (this.player.y < -2) {
            devlog('DeadInternetBot fell off the map', this.player.name);
            this.stopPath();
            return 'idle';
        };

        const waypoint = this.currentPath[this.pathIndex];
        if (!waypoint) { this.stopPath(); return 'idle'; };

        // See pathTo()'s pathIndex0NeedsGroundWait comment - a fresh path's first waypoint can be
        // computed from a snapshot of the player still mid-flight from an abandoned previous
        // attempt (typically a checkStuck()-forced replan firing while still airborne). Hold
        // forward and wait for that leftover momentum to resolve before touching path[0] at all,
        // regardless of what type it turns out to be - a WALK toward a target computed from a
        // now-stale position is just as wrong as a JUMP run-up starting mid-air.
        if (this.pathIndex === 0 && this.pathIndex0NeedsGroundWait) {
            if (this.player.jumping || this.player.isFalling) {
                // Same flaw the JUMP-waypoint run-up guard had (see its own comment further down):
                // blindly holding forward assumes the only thing left to resolve is a brief
                // vertical settle, but a brand-new path's very first waypoint is frequently a JUMP
                // itself - meaning "forward" can point straight across a real gap with no ground
                // underneath. Confirmed live on "PathJumpTest": finishing the checkpoint2->
                // checkpoint3 jump landed this "arrived" (the arrival check is a pure proximity
                // radius, not a landed/settled check - see below) while STILL carrying forward
                // momentum from the jump; the very next pathTo() call (checkpoint3->checkpoint4,
                // a real 2-cell gap jump) immediately re-entered this branch and kept holding
                // forward across that gap before ever registering as grounded, walking the bot
                // off checkpoint3's edge and a full level down before its own run-up logic ever
                // got a chance to run. Checking a short distance ahead first, the same way the
                // proactive back-away guard below does, keeps the forward hold to the case it was
                // actually written for.
                const dx0 = waypoint.x - this.player.x;
                const dz0 = waypoint.z - this.player.z;
                const aheadLen0 = Math.sqrt(dx0 * dx0 + dz0 * dz0) || 1;
                const aheadPos0 = { x: this.player.x + (dx0 / aheadLen0) * 0.4, y: this.player.y - 0.15, z: this.player.z + (dz0 / aheadLen0) * 0.4 };
                if (this.player.Collider.playerCollidesWithMap(this.player, aheadPos0)) this.control(CONTROL.up);
                return 'following';
            };
            this.pathIndex0NeedsGroundWait = false;
        };

        // Pre-commit dry run for FALL edges specifically: once the bot actually walks off the
        // ledge, gravity takes over and there's no cancelling it the way a bad jump attempt can
        // just be walked back from. pathfinding.js's own simulateEdgeCached already verified this
        // edge once, during planning, from an idealized cell-center position - cached forever for
        // the room after that. This re-checks it fresh, once, right as this waypoint becomes
        // active, using the bot's ACTUAL current position instead of that idealized one - a
        // landing that looked fine from dead-center but doesn't hold up from wherever the bot
        // really ended up (arrival tolerance allows drifting up to 1.25 units off) gets caught
        // and replanned around before the drop, not discovered mid-air.
        if (waypoint.type === EDGE_TYPE.FALL && this.fallCheckedWaypointIndex !== this.pathIndex) {
            this.fallCheckedWaypointIndex = this.pathIndex;
            if (canSimulate(this.player)) {
                const preCheck = simulateEdge(
                    this.player,
                    { x: this.player.x, y: this.player.y, z: this.player.z },
                    { x: waypoint.x, y: waypoint.y, z: waypoint.z },
                    { jump: false },
                );
                if (!preCheck.success) {
                    const from = this.currentPath[this.pathIndex - 1];
                    const fromKey = from
                        ? `${Math.floor(from.x)},${Math.floor(from.y)},${Math.floor(from.z)}`
                        : `${Math.floor(this.player.x)},${Math.floor(this.player.y)},${Math.floor(this.player.z)}`;
                    const toKey = `${Math.floor(waypoint.x)},${Math.floor(waypoint.y)},${Math.floor(waypoint.z)}`;
                    this.pathAvoidedEdges.add(`${fromKey}->${toKey}`);

                    devlog('DeadInternetBot pre-flight check rejected a fall from its actual position, replanning before stepping off', fromKey, '->', toKey, this.player.name);
                    if (this.pathTargetPos) this.pathTo(this.pathTargetPos, { force: true });
                    return 'following';
                };
            };
        };

        // A mid-air ladder catch needs to keep steering through the ladder plane until its thin
        // collider is touched. Steering at the ladder cell centre itself makes the direction flip
        // as soon as the player crosses that centre, often one tick before lookForLadder() sees
        // the collision. Use the same fixed point 0.75 cells beyond the rung that simulateEdge()
        // verified. Derive it from the planned departure waypoint, so normal full blocks and
        // ordinary ladder climbs remain completely unchanged.
        let steeringX = waypoint.x;
        let steeringZ = waypoint.z;
        if (waypoint.ladderCatch) {
            if (this.ladderCatchSteeringWaypointIndex !== this.pathIndex) {
                this.ladderCatchSteeringWaypointIndex = this.pathIndex;
                const departure = this.currentPath[this.pathIndex - 1] || this.player;
                const cell = this.room.map.data[Math.floor(waypoint.x)]?.[Math.floor(waypoint.y)]?.[Math.floor(waypoint.z)];
                const target = ladderCatchTarget(departure, waypoint, cell?.mesh?.colliderType === 'ladder' ? cell.ry : undefined);
                this.ladderCatchSteeringX = target.x;
                this.ladderCatchSteeringZ = target.z;
            };
            steeringX = this.ladderCatchSteeringX;
            steeringZ = this.ladderCatchSteeringZ;
        };

        if (waypoint.type === EDGE_TYPE.LADDER && !this.player.climbing && this.player.y < waypoint.y - 0.03) {
            const x = Math.floor(waypoint.x), z = Math.floor(waypoint.z);
            const cell = this.room.map.data[x]?.[Math.floor(waypoint.y) - 1]?.[z];
            if (cell?.mesh?.colliderType === 'ladder') {
                if (this.ladderApproachWaypoint !== waypoint) {
                    this.ladderApproachWaypoint = waypoint;
                    this.ladderApproachTarget = ladderCatchTarget(this.currentPath[this.pathIndex - 1] || this.player, {x:x+0.5,z:z+0.5}, cell.ry);
                }
                steeringX = this.ladderApproachTarget.x; steeringZ = this.ladderApproachTarget.z;
            }
        }
        if (waypoint.via?.length) {
            if (this.viaWaypoint !== waypoint) { this.viaWaypoint = waypoint; this.viaIndex = 0; }
            while (this.viaIndex < waypoint.via.length
                && Math.hypot(waypoint.via[this.viaIndex].x - this.player.x, waypoint.via[this.viaIndex].z - this.player.z) < 0.06) this.viaIndex++;
            const turn = waypoint.via[this.viaIndex];
            if (turn) { steeringX = turn.x; steeringZ = turn.z; }
        }
        const dx = steeringX - this.player.x;
        const dz = steeringZ - this.player.z;
        const horizontalDistance = waypoint.type === EDGE_TYPE.LADDER || waypoint.via?.length
            ? Math.hypot(waypoint.x - this.player.x, waypoint.z - this.player.z)
            : Math.sqrt(dx * dx + dz * dz);


        // Skip while climbing, and skip once close enough to the target that dx/dz themselves
        // become unreliable: a LADDER waypoint shares the exact same x,z as the cell it climbs
        // from (only y changes - see pathfinding.js), so dx/dz sit near zero for the whole climb -
        // but the same near-zero values also show up for a few ticks just BEFORE climbing starts,
        // during the final approach into the ladder cell, since that's the same target. atan2 of
        // two near-zero values is numerically unstable - ordinary sub-pixel jitter in the player's
        // real position was enough to swing the computed yaw wildly, spinning the character both
        // while genuinely climbing straight up AND in the moment just before grabbing on
        // (confirmed by testing: fixing only the climbing case left the pre-attach spin still
        // happening). Yaw doesn't matter once this close either way - simulateMovement's climbing
        // branch never reads it, and lookForLadder()'s own alignment check only needs it to be
        // roughly right, not still being freshly (and unstably) recomputed every tick - so keeping
        // the last stable value from further out is strictly better than trusting noise.
        if (!this.player.climbing && Math.hypot(dx,dz) > MOVEMENT_PROFILE.arrivalRadius) this.player.yaw = Math.atan2(dx, dz);

        // Same position-discontinuity case checkStuck() detects and reacts to below (see its own
        // header comment for the full story and how pathLastPos is maintained - this reads it,
        // doesn't write it, so both checks agree using the same previous-tick position) - but a
        // JUMP waypoint needs an EXTRA reaction checkStuck() alone can't provide: run-up/flight
        // phase state (jumpRunupWaypointIndex, jumpRunupUntilTime, jumpChargeMaxTime) is initialized
        // once per waypoint activation (see the `!==` check a few lines down) and then left alone
        // for the rest of the jump, exactly like a real jump wouldn't re-plan itself mid-air. If the
        // teleport happens WHILE jumping: true (a real jump is mid-flight when position gets reset
        // out from under it), that state is now stale - still tracking phase timing and a takeoff
        // point relative to a spot the player isn't at anymore - so the JUMP branch below keeps
        // running the OLD flight's leftover physics (confirmed live on "PathJumpTest": a jump that
        // was 0.5 units from a clean landing got its position reset back near the map's spawn tile
        // mid-flight - `player.reachedGoal`'s 2-second-delayed respawn-to-spawn firing from an
        // earlier, unrelated botched attempt that briefly grazed the actual goal tile, unrelated to
        // this flight - and kept rising through the SAME arc as before, just now starting from the
        // wrong place, with zero chance of ever reaching a target that far away again). Clearing
        // jumpRunupWaypointIndex here forces the `!==` check to see it as a fresh waypoint
        // activation next time the JUMP branch runs (this same tick), so run-up/flight state
        // reinitializes cleanly from wherever the player actually is now, instead of continuing a
        // flight plan computed for a position that no longer exists.
        if (this.pathLastPos) {
            const jumpDist = Math.length3(
                this.player.x - this.pathLastPos.x,
                this.player.y - this.pathLastPos.y,
                this.player.z - this.pathLastPos.z,
            );
            if (jumpDist > 1.5) this.jumpRunupWaypointIndex = null;
        };

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
        const previousWaypoint = this.currentPath[this.pathIndex - 1];
        const previousSupport = previousWaypoint && this.room.map.data[Math.floor(previousWaypoint.x)]?.[Math.floor(previousWaypoint.y) - 1]?.[Math.floor(previousWaypoint.z)];
        const departingJumpPad = previousSupport?.mesh?.name === 'jump-pad' && this.player.jumping;
        if (waypoint.type === EDGE_TYPE.JUMP && departingJumpPad) {
            // The pad supplied this launch; keep steering throughout the boost arc instead of
            // replacing it with the ordinary grounded jump/run-up controller.
            this.control(CONTROL.up);
        } else if (waypoint.ladderTop && this.player.climbing
            && Math.floor(this.player.climbingCell.x) === Math.floor(waypoint.x)
            && Math.floor(this.player.climbingCell.z) === Math.floor(waypoint.z)) {
            // A jump to a ladder top may catch its face first. The verifier
            // continues climbing in this state; live execution must do so too,
            // rather than stop supplying up or detach from the destination.
            this.control(CONTROL.up);
        } else if (waypoint.type === EDGE_TYPE.JUMP) {
            const prevWp = this.currentPath[this.pathIndex - 1];
            // Don't start a FRESH run-up/jump sequence while still airborne from whatever the
            // player was just doing (typically a big previous jump that overshot its own target
            // waypoint's arrival tolerance and is still rising or falling when THIS waypoint
            // becomes active) - the whole run-up model assumes a real standing start on solid
            // ground (see the header comment on this block), and initializing it mid-air treats
            // leftover, uncontrolled momentum as if it were a stationary takeoff. Confirmed live
            // on "PathHalfTest": a bot landing a large gap+height jump right at the edge of its
            // arrival tolerance (still ~0.7 units above the target, still ascending) immediately
            // had the NEXT jump waypoint activate on top of that, and visibly "jumped in place in
            // random spots" several times before settling and stumbling onto a working sequence -
            // exactly what initializing a run-up on top of unresolved velocity looks like. Just
            // hold forward and let gravity/collision settle the player onto solid ground first;
            // the run-up initializes fresh, from a real stop, the tick after that happens.
            //
            // player.climbing is a SEPARATE reason to wait, not just another "not grounded yet"
            // case - see player.js's update(): while climbing is true, CONTROL.up/down don't mean
            // "move forward/backward" at all, they mean "climb up/down the ladder" (a completely
            // different movement branch, driving vertical ddy instead of horizontal ddx/ddz). A
            // JUMP waypoint that immediately follows dismounting a ladder (a diagonal/knight's-
            // move jump off the top of a climb, confirmed live on "PathLadderTest": a
            // (3,1,7)->(2,2,5) jump straight off a ladder rung racked up 29 stuck events on one
            // leg) would otherwise fire this run-up's phase 1/2 controls while still attached,
            // making the player climb the ladder up/down instead of backing away or charging
            // forward - the run-up literally cannot do its job while the control scheme means
            // something else entirely. No directional input at all while still climbing (as
            // opposed to holding forward for the airborne case above) - CONTROL.up here would
            // mean "keep climbing", the opposite of what dismounting to jump needs.
            //
            // player.jump()'s ladder-detach (dy=0.03, half a normal jump's impulse - see
            // player.js) used to be left for checkStuck's own cheap-recovery jump() to trigger
            // whenever it noticed no progress, on the theory that leaning on the existing
            // detach path was enough without duplicating it here. Confirmed live on "PathMapTest"
            // checkpoint2->checkpoint3 that theory doesn't hold: checkStuck's cheap-recovery only
            // fires after 0.6-0.9s of registered non-progress, so the player hangs motionless on
            // the ladder for most of a real second doing nothing before the first detach attempt
            // even happens - and the detach's own boost is already only half height/duration of
            // an ordinary jump, so burning most of that brief flight window waiting instead of
            // using it left essentially no time to build the horizontal distance this branch's
            // forward-hold (below) needs. The player fell straight back onto the same ladder cell
            // and re-attached before ever making real progress, over and over, for the whole 90s
            // timeout. Detaching immediately the first tick this waypoint is active - not waiting
            // on a stuck timer for a transition that's ALWAYS going to need detaching, not just
            // when something's gone wrong - hands the forward-hold below the entire flight to work
            // with instead of a fraction of it.
            if (this.player.climbing) {
                // No `jumpRunupWaypointIndex !== pathIndex` gate - the ORIGINAL version of this
                // check only ever detached on the very first tick this waypoint became active, on
                // the assumption that `climbing` becoming true again afterward would be caught by
                // the general stuck-timer instead. Confirmed live on "PathShipyardTest" by a
                // tick-by-tick trace that assumption doesn't hold for every ladder-to-ladder jump:
                // a flight that's already past its first tick (jumpRunupWaypointIndex already set)
                // can still re-collide with the departure ladder mid-arc, and once that happens
                // this whole branch stopped applying - falling through to the ordinary run-up
                // phases below, which have no climbing-awareness at all and just hold CONTROL.up
                // while ACTUALLY CLIMBING (a completely different control meaning - see this
                // block's own header comment), going nowhere until the 1.8s stuck-timer eventually
                // notices and forces a full replan. Detaching again immediately, every single tick
                // `climbing` reads true regardless of which tick this waypoint is on, turns an
                // 1.8s+ stall into (at most) one extra tick's delay - the same safe, already-proven
                // detach this branch always used, just no longer limited to firing once.
                //
                // Also checks the actual departure CELL, not just prevWp.type === LADDER - a jump
                // can depart a ladder cell without the edge that landed the bot there itself being
                // typed LADDER (pathfinding.js's ladder-sideways-step-off jump lands on a ladder
                // cell via a JUMP-type edge; the NEXT jump departing from that same waypoint has
                // prevWp.type reading JUMP, not LADDER, which silently skipped this branch for
                // exactly that case before).
                const prevCell = prevWp && this.room.map.data[Math.floor(prevWp.x)]?.[Math.floor(prevWp.y)]?.[Math.floor(prevWp.z)];
                if (prevWp?.type === EDGE_TYPE.LADDER || isLadderCell(prevCell)) this.player.jump();
            } else if (this.jumpRunupWaypointIndex !== this.pathIndex && (this.player.jumping || this.player.isFalling)) {
                // Only keep walking toward the target while waiting to settle if there's actually
                // solid ground ahead to walk onto - blindly holding forward here (the original
                // version of this branch) assumes the only thing left to resolve is a BRIEF
                // vertical settle from the previous jump's own landing bounce, but a JUMP waypoint
                // by definition can also mean the ground ahead simply isn't there yet (that's the
                // whole reason it's a jump edge, not a walk edge) - in that case the same forward
                // hold walks the bot clean off whatever ledge it landed on and into a BRAND NEW,
                // self-perpetuating fall (still airborne every tick, so this branch keeps holding
                // forward, so it keeps drifting further from the real takeoff point) instead of
                // the short settle it was written for. Confirmed live on "PathJumpTest":
                // checkpoint3->checkpoint4 is a genuine 2-cell gap jump, so holding forward here
                // walked the bot straight off checkpoint3's edge before it ever registered as
                // grounded, landing a full level down and nowhere near where the jump needed to
                // start from. Checking a short distance ahead (not the full jump distance - just
                // enough to distinguish "still on the platform" from "about to walk off it") with
                // the same real player-box check the proactive back-away guard below uses keeps
                // the forward hold to cases where it can't do this harm.
                const aheadLen = Math.sqrt(dx * dx + dz * dz) || 1;
                const aheadPos = { x: this.player.x + (dx / aheadLen) * 0.4, y: this.player.y - 0.15, z: this.player.z + (dz / aheadLen) * 0.4 };
                // A jump departing straight off a ladder (the previous waypoint was LADDER) is a
                // different case from the "settling after landing" scenario the ground-ahead check
                // above exists for - there IS no ground ahead by construction (that's why it's a
                // jump edge at all), so that check always reads false here and this branch does
                // nothing, every tick, for the entire flight. player.jump()'s ladder-detach gives
                // only a small vertical boost (see this block's own header comment) with no
                // horizontal push of its own; without forward input converting that hop into real
                // horizontal distance, gravity just pulls the player straight back down onto the
                // same ladder cell it detached from, re-triggering `climbing` and repeating -
                // confirmed live on "PathMapTest" checkpoint2->checkpoint3: jumpRunupWaypointIndex
                // stayed null and `climbing` kept flipping true/false/true for the entire 90s
                // timeout, the player never traveling more than a few tenths of a unit from the
                // ladder the whole time. Holding forward unconditionally for this specific case is
                // safe precisely because there's nothing to accidentally walk off of mid-settle -
                // the "walked off a ledge" failure mode the ground-ahead check guards against can't
                // happen here, since the player is already airborne off the ladder, not standing on
                // a platform that might not extend as far as assumed.
                if (this.player.Collider.playerCollidesWithMap(this.player, aheadPos) || prevWp?.type === EDGE_TYPE.LADDER) this.control(CONTROL.up);
            } else {
            if (this.jumpRunupWaypointIndex !== this.pathIndex) {
                this.jumpRunupWaypointIndex = this.pathIndex;
                this.jumpRunupStartY = this.player.y;
                // Collision settling on a ramp/full-block seam can leave the live player a few
                // hundredths below the waypoint's nominal Y. That is still a same-level jump,
                // not an ascent: classifying it as height-gaining cuts the charge cap from 1.0s
                // to 0.2s and makes long jumps launch a full cell too early. Require a meaningful
                // rise, matching the grid edge the verifier actually evaluated.
                this.jumpGainsLevel = !waypoint.fractionalRampRise && waypoint.y > this.jumpRunupStartY + 0.25;
                this.jumpLiftoffFired = false;
                // Run-up only matters for a jump that has to GAIN height - it exists specifically
                // to build enough approach speed for the marginal step-up-on-collision mantle a
                // level-up jump relies on (see pathfinding.js's up-one-level cost comment). A
                // same-level or downward jump doesn't need to clear anything vertically, just
                // cover horizontal distance, which a standing jump already accumulates fine over
                // its own ~40-tick air time - backing away first only adds risk (see the
                // ground-loss guard below) for zero benefit. Confirmed on "PathTestMap": an
                // ordinary flat 2-cell gap-jump backed off its own shallow takeoff platform for no
                // reason, since it never needed the extra height run-up provides.
                //
                // For a jump that DOES need height, a single "back away then jump immediately"
                // phase turned out to be actively counterproductive, for two compounding reasons
                // found by tracing a real failing edge tick by tick on "PathTestMap":
                //  1. Reversing direction after backing away isn't instant - simulateMovement
                //     smooths velocity, not just position, so canceling N ticks' worth of backward
                //     momentum takes roughly N MORE ticks of forward accel before the player is
                //     even moving toward the target again. A 21-tick (0.35s) back-away left the
                //     player STILL drifting away from the target 14 ticks after jump() had fired.
                //  2. Jumping the INSTANT the back-away ends means the forward charge happens
                //     entirely WHILE AIRBORNE - by the time the player reaches the wall, a good
                //     chunk of the jump's fixed ~40-tick air time (and its ascent) is already
                //     spent, leaving little arc left for the moveX step-up-on-collision nudge
                //     (`out.y += Math.abs(ndx) + .01*delta`) to accumulate the needed height
                //     before gravity wins. A real running jump leaves the ground already moving,
                //     not from a standing start mid-air.
                // Three phases fix both: back away briefly (still grounded), charge forward for a
                // bit LONGER while still grounded (building real speed before ever leaving the
                // ground), then jump - carrying that ground speed into the leap, hitting the wall
                // early in the arc while there's still height and time left for the nudge to work.
                //
                // waypoint.smallHop (set by pathfinding.js's half-step generator), not a live
                // position comparison - a half-height aabb/obb step only needs a plain standing
                // jump (confirmed live on "HalfTestMap": running the full back-away/charge/leap
                // maneuver for that tiny a climb looked wrong, the bot visibly backed up and
                // charged at every step on its way up a staircase). A threshold on
                // `waypoint.y - this.player.y` seemed like an equivalent way to detect this, but
                // regressed real full-level jumps on live testing - this.player.y at the moment a
                // jump waypoint starts can sit up to the 1.25-unit arrival tolerance away from
                // where the edge was actually planned from, so a genuine ~1.0 rise could measure
                // under the threshold and skip the run-up it needs. Reading the flag pathfinding.js
                // already computed precisely, instead of re-deriving it from noisy live state,
                // avoids that entirely.
                // Phase 2 tuned, not removed - live testing found jumping from a standing start
                // (hold forward, jump) covers pretty much the same distance as the full run-up,
                // and that WHERE on the takeoff cell the jump happens (the edge nearest the gap,
                // not mid-cell) mattered more than how long the charge itself was. So phase 2 now
                // ends as soon as the player reaches that edge (tracked as `jumpRunupTargetDist`,
                // the straight-line distance from the takeoff point to the near edge of its own
                // cell, roughly 0.5 units for a grid-aligned jump) rather than always waiting out
                // a fixed charge duration - the duration is now just a safety-net cap.
                // Phase 1 (back away) duration is unchanged - cutting it too, on the same "little
                // distance difference" theory, regressed Castle's hardest jumps (multi-cell
                // diagonal/knight's-move gaps): those need the extra ground speed the back-away
                // builds, not just edge positioning, to reliably clear.
                // Two separate reasons a jump needs a real ground-based run-up, not one: gaining
                // height (the original reason - see the header comment above), OR covering real
                // horizontal distance at the far end of what a gap-jump attempts. horizontalDistance
                // here is the live distance-to-waypoint computed at the top of followPath() for
                // THIS tick - since this branch only runs on the very first tick a jump waypoint is
                // active (see jumpRunupWaypointIndex check above), it hasn't had a chance to shrink
                // yet and is exactly the jump's real starting distance, not a stale snapshot.
                // Confirmed on "PathLadderTest": a plain, flat, 3-cell platform-to-platform jump -
                // no height change, no obstruction, about as ordinary a jump as exists - failed live
                // on the first real attempt every time despite being offline-verified as a (barely)
                // passing edge, because zero-run-up same-level jumps only ever accumulate speed
                // DURING the ~40-tick flight, which isn't enough runway at the far edge of the
                // distance this game's gap-jumps attempt.
                // A same-level jump under the 2-unit distance threshold was deliberately left
                // without run-up (see this whole block's own header comment on "PathTestMap") on
                // the theory that a standing jump's natural ~40-tick flight always covers that
                // little ground fine - true when the far side has forgiving footing, but not when
                // the gap being crossed is a genuine PIT with nothing to catch a landing that falls
                // even slightly short. Confirmed live on "PathShipyardTest": an exactly-2.0-unit
                // same-level jump (horizontalDistance > 2 reads false right at the boundary) flew a
                // completely normal rise-then-fall arc, lost horizontal speed to ordinary air drag
                // partway across, and plunged straight through an unsupported gap below its own
                // flight path instead of landing anywhere - not a wall hit (traced tick by tick:
                // no sudden stop, a gradual decay matching drag, not collision), a standing jump's
                // natural reach simply wasn't enough margin for THIS specific gap's real geometry.
                // Distance alone can't tell that apart from "PathTestMap"'s already-safe case - a
                // real probe for whether solid ground actually exists anywhere under the path can:
                // same real-collider check hasGroundBehind/groundAhead already use elsewhere in
                // this same run-up machinery, just checking the midpoint of the flight instead of
                // immediately behind or ahead the takeoff point.
                const midX = (this.player.x + waypoint.x) / 2, midZ = (this.player.z + waypoint.z) / 2;
                const midY = Math.max(this.player.y, waypoint.y);
                const hasMidpointPit = horizontalDistance <= 2 && waypoint.y <= this.player.y && ![0.1, 0.4, 0.7, 1.0, 1.5].some(dy =>
                    this.player.Collider.playerCollidesWithMap(this.player, { x: midX, y: midY - dy, z: midZ })
                );
                const needsRunup = (!waypoint.smallHop && waypoint.y > this.player.y) || horizontalDistance > 2 || hasMidpointPit;
                this.jumpNeedsRunup = needsRunup;
                // Proactive ground-loss check, not just the reactive one a few lines below - that
                // one can only detect a drop AFTER it's already happened (by which point a real
                // in-game fall can't be undone), which is too late on a genuinely shallow platform
                // where even the first couple of back-away ticks walk the player clean off the
                // edge before any drop shows up to react to. Confirmed live on "PathJumpTest":
                // checkpoint3's platform was shallow enough in the back-away direction that phase
                // 1 fell the player a full level almost immediately, well before the reactive
                // guard's next check. Sampling roughly where phase 1 would actually take the
                // player (using the same real player-box check hasRealSupport/the FALL pre-check
                // use elsewhere) and skipping the back-away entirely - going straight to charge
                // from a standing start - when there's no solid ground there avoids ever taking
                // the step that would need reacting to in the first place.
                const runupLen = Math.sqrt(dx * dx + dz * dz) || 1;
                const behindX = this.player.x - (dx / runupLen) * 0.6;
                const behindZ = this.player.z - (dz / runupLen) * 0.6;
                // A single fixed vertical offset (0.15 below the CURRENT position) assumes the
                // ground 0.6 units behind sits at roughly the same height the player is at right
                // now - true for flat ground, but not for a ramp, whose height changes
                // continuously along the very direction being probed. Reported live on
                // "PathJumpHardTest": backing away from partway up a ramp (y=2.64) toward its low
                // end checks around y=2.49, but the low end is a full block at y=2.0 - nowhere near
                // that probe height - so this found nothing and reported no ground behind at all,
                // skipping the back-away phase entirely for a jump the map's own author built
                // specifically expecting one. Sweeping several candidate offsets (the same ladder
                // findRampRestY already uses for "where does a sloped/stepped surface actually
                // rest") catches a real surface wherever it is along that slope, not just at
                // whatever height happens to match wherever the player is standing right now.
                const hasGroundBehind = [0.15, 0.4, 0.65, 0.9, 1.15].some(dy =>
                    this.player.Collider.playerCollidesWithMap(this.player, { x: behindX, y: this.player.y - dy, z: behindZ })
                );
                // this.simulatedTime already accumulates the real, physicsSpeedModifier-scaled
                // delta every call (see followPath()'s header comment) - so a duration is just
                // added directly, in simulated seconds, no ticksPerSecond conversion or
                // physicsSpeedModifier division needed. That's the whole point: the clock itself
                // already runs at the right speed, so nothing here has to know or care what speed
                // physics is running at.
                this.jumpRunupUntilTime = (needsRunup && hasGroundBehind) ? this.simulatedTime + JUMP_RUNUP_BACKAWAY_SECONDS : this.simulatedTime;
                this.jumpRunupSpeed = 0;
                this.jumpRunupStartX = this.player.x;
                this.jumpRunupStartZ = this.player.z;
                // Used to be a tight per-direction estimate of "distance from center to this
                // cell's own edge" (0.5 cardinal, up to 0.5*sqrt(2) diagonal - see git history),
                // reasoning that a flat takeoff only ever has about half a cell of real charging
                // room. That's backwards: this value is a CAP, and the two reactive checks below
                // (wall-collision speed-drop, ground-ahead) are what actually decide when to stop
                // charging - "keep walking for as long as genuinely still possible, then jump the
                // INSTANT that stops being true" (see this phase's own header comment) is exactly
                // the design goal a tight estimated cap works against, cutting the charge off
                // before those reactive checks ever get a chance to run. Confirmed live on
                // "PathJumpDiagTest" checkpoint1->goal: even the direction-aware diagonal estimate
                // (~0.665 for this specific angle) ended the charge while the takeoff block's real,
                // solid surface still extended well past it - the reactive wall-collision check
                // never fired because there was never a wall, just cap hit first. The bot landed a
                // full level short and fell into the gap below. A single generous cap for every
                // takeoff shape - flat cell OR ramp alike, no longer distinguished - lets whichever
                // reactive check actually applies (a wall on a small platform, lost ground at a
                // ramp's real peak) be the one that decides, the same way both already do for a
                // ramp departure. Only matters as a safety net for the rare case neither ever
                // fires (a corner-clipped approach with no wall and continuous ground) - it should
                // essentially never be the deciding factor for the real edges this file targets.
                this.jumpRunupTargetDist = 2.5;
                this.jumpChargeSpeed = 0;
                // Phase 2 itself is NOT shared with physicsSimulation.js's jumpChargeSeconds the
                // way the back-away duration above is - deliberately, not by oversight. This live
                // version ends the charge the instant the bot reaches the takeoff cell's edge
                // (jumpRunupTargetDist) or runs out of real ground/hits a wall (the checks just
                // below), because it has a real position to react to every tick; physicsSimulation.js
                // verifies edges ahead of time from an idealized cell-center start with no "real"
                // position to react to, so it still uses a fixed charge duration there.
                //
                // The safety-net CAP itself isn't one-size-fits-all, though - an ASCENDING jump
                // (waypoint.y > where this run-up started) relies on repeated short charge-then-
                // attempt cycles for its mantle nudge (see jumpLiftoffFired's own comment on why
                // ascending jumps are exempted from the once-only liftoff guard), so a short 0.2s
                // cap is what that case needs and already had. But a same-level or descending jump
                // has no such repeated-cycle mechanic to fall back on - it gets exactly one real
                // shot at covering ground before liftoff, and per the wall/ground-ahead checks just
                // below, the win there isn't more built-up speed, it's reaching a physically closer
                // takeoff point. Confirmed live on "PathJumpHardTest": tried widening this cap
                // uniformly first, and it broke the (ascending) crate-climb badly - checkpoint1->2
                // went from rock-solid to a full 90s timeout, because the longer cap let a SINGLE
                // charge cycle run long enough to disrupt the mantle sequence's own repeated-attempt
                // rhythm. Scoping the wider cap to non-ascending jumps only keeps the crate's
                // existing, already-correct behavior completely untouched.
                this.jumpChargeMaxTime = this.jumpRunupUntilTime + (this.jumpGainsLevel && !waypoint.fractionalRampRise ? 0.2 : 1.0);
            };

            if (this.simulatedTime < this.jumpRunupUntilTime) {
                // Phase 1 - back away, still grounded.
                this.control(CONTROL.down);

                // Wall-collision cutoff: the back-away runs for a fixed duration regardless of
                // what's actually behind the takeoff point - on a tight layout that's often a wall
                // a few ticks in. moveX/moveZ's collision response halves velocity on failure
                // (`out.dx *= .5`), so hitting one shows up as a sudden drop in speed instead of
                // the steady growth pure acceleration produces (confirmed by testing on
                // "LadderTest"). Ending phase 1 the moment that signature appears - moving straight
                // to phase 2 with whatever speed was actually built - is what a real player
                // bumping into a wall while backing up would naturally do.
                // Epsilon widened from 1e-6 to 1e-3: a real wall bump halves velocity outright
                // (moveX/moveZ's collision response is `out.dx *= .5`), an unmistakably large drop
                // this still catches easily - 1e-6 was instead also catching ordinary floating-point
                // noise in the acceleration curve itself, which isn't perfectly monotonic tick to
                // tick even with nothing in the way. That noise is exactly the kind of thing real,
                // non-deterministic OS-level scheduling jitter (this project's tick loop is a real
                // hybrid setTimeout/setImmediate scheduler, not a pure logical clock - see looper.js)
                // can tip either way between separate process runs given otherwise-identical inputs,
                // which lines up with what was actually observed live on "Castle" and "PathJumpTest":
                // the same already-marginal diagonal jump (needing horizontalDistance > 2, not a
                // height gain) succeeding 100% of attempts on some fresh server instances and failing
                // 100% of attempts on others, with byte-identical timing on every earlier leg and an
                // identical planned route in both cases - nothing but this jump's own phase 1 could
                // plausibly be the diverging factor between two otherwise-identical runs.
                const speed = Math.length2(this.player.dx, this.player.dz);
                if (speed < this.jumpRunupSpeed - 1e-3) this.jumpRunupUntilTime = this.simulatedTime;
                this.jumpRunupSpeed = speed;

                // Ground-loss guard: same idea as the wall-collision cutoff above but for the
                // opposite direction - backing away can just as easily walk the bot off the BACK
                // edge of its own takeoff ledge as into a wall (confirmed on "PathTestMap": an
                // ordinary flat 2-cell gap-jump backed off a 1-cell-deep takeoff platform onto a
                // lower level, turning an easy jump into an unreachable one). Unlike
                // physicsSimulation.js's isolated simulation, a real in-game fall can't be
                // reverted without an ugly visible rubber-band, so this only stops digging the
                // hole deeper - end phase 1 the instant any drop appears rather than continuing to
                // back away for the rest of the fixed window.
                // Widened from 0.01 to 0.05 for the same reason as the wall-collision epsilon just
                // above: standing on solid ground still has a small residual downward dy each tick
                // from gravity before collision resolution snaps it back (traced elsewhere this
                // session at roughly -0.003/tick while genuinely grounded), and 0.01 is only 3-4
                // ticks of that ordinary noise away from tripping this guard on ground that isn't
                // perfectly re-snapping every single tick. A REAL drop off a ledge accumulates dy
                // much faster than that (jump()'s own dy impulse is 0.06, an order of magnitude
                // more per tick), so this still catches a genuine fall well before it matters.
                if (this.player.y < this.jumpRunupStartY - 0.05) this.jumpRunupUntilTime = this.simulatedTime;
            } else if (
                this.simulatedTime < this.jumpChargeMaxTime &&
                Math.length2(this.player.x - this.jumpRunupStartX, this.player.z - this.jumpRunupStartZ) < this.jumpRunupTargetDist
            ) {
                // Phase 2 - approach the takeoff edge, STILL grounded (no jump() yet), until the
                // player reaches the edge of its takeoff cell. This phase applies to EVERY jump,
                // not only jumps that need the optional phase-1 backward run-up: smallHop means
                // "do not back away on this cramped half-step", not "jump immediately from
                // wherever the previous waypoint's arrival radius happened to advance". The
                // latter conflation left short crate-to-platform hops launching roughly 0.3 units
                // before the usable edge. A manual trace confirms the reliable input is a plain
                // forward approach to the near edge followed by jump, with no backward movement.
                // The time/distance caps remain safety nets for the rare case the edge is never
                // reached (e.g. a corner-clipped approach).
                this.control(CONTROL.up);
                // Phase 2's own wall-collision cutoff - physicsSimulation.js's offline verifier
                // already has the exact equivalent of this (see its chargeBlockedAtTick), and
                // phase 1 (back-away, just above) already has its own live version - this phase
                // was the one place in the whole run-up that was missing it entirely, silently
                // holding CONTROL.up uselessly against a wall it had already hit until an
                // unrelated cap (jumpChargeMaxTime or jumpRunupTargetDist) eventually ended it.
                //
                // The distinction matters more here than it sounds: this ISN'T really about
                // building extra speed at all - a standing jump and a run-up jump cover close to
                // the same distance in this physics model. What actually matters is TAKEOFF
                // POSITION - waiting even 1-2 more ticks before jumping means leaving the ground
                // from a point that's physically closer to the target, which is the entire margin
                // on a jump this tight (confirmed by direct live report: on real controls, closing
                // that last sliver of distance by hand is razor-thin). So the right behavior isn't
                // "charge for an assumed distance/duration, then jump" - it's "keep walking for as
                // long as genuinely still possible, then jump the INSTANT that stops being true".
                // A wall-collision speed-drop is exactly that instant, and jumping one tick late
                // because the game kept walking forward right up to it is the whole fix - not
                // building more speed.
                //
                // Same grace-period reasoning as physicsSimulation.js's own version: phase 1 ending
                // and phase 2 beginning reverses direction, which causes a genuine, momentary dip
                // in speed MAGNITUDE (decelerating through zero before accelerating the other way)
                // that a bare "did speed drop" check can't tell apart from a real wall. Skipping
                // the first stretch of phase 2 before watching for a drop avoids tripping on that
                // reversal instead of an actual collision.
                if (this.simulatedTime - this.jumpRunupUntilTime > 0.05) {
                    const chargeSpeed = Math.length2(this.player.dx, this.player.dz);
                    if (chargeSpeed < this.jumpChargeSpeed - 1e-3) this.jumpChargeMaxTime = this.simulatedTime;
                    this.jumpChargeSpeed = chargeSpeed;
                };
                // A wall-collision speed-drop (just above) only catches a genuine solid obstruction
                // - it does NOT catch charging off the far edge of a ramp into open air, since
                // there's no collision there to cause a speed drop at all, only a subsequent fall
                // that's already one tick too late to react to cleanly. Reported live on
                // "PathJumpHardTest": this exact ramp's own edge is an open drop into the gap it's
                // jumping across, not a wall - and per the report, that's what actually needs
                // riding right up to: on a ramp specifically, walking one tick further is BOTH
                // physically closer to the target AND higher (the incline itself), so the ideal
                // liftoff tick is the literal last one solid ground still exists under the NEXT
                // step, not the first tick after it stops. A short forward probe using the same
                // multi-height sweep the ground-behind check above uses (a ramp's surface height
                // changes continuously along this exact direction, so one fixed offset can't be
                // trusted here either) answers that directly instead of waiting to react to a fall
                // that's already begun.
                const chargeLen = Math.sqrt(dx * dx + dz * dz) || 1;
                // Keep this conservative centre-ahead sample aligned with the verifier. A full
                // collider-width probe ends the charge too early on known-good ramp departures.
                const takeoffSupport = prevWp && this.room.map.data[Math.floor(prevWp.x)]?.[Math.floor(prevWp.y - 0.05)]?.[Math.floor(prevWp.z)];
                const partialSupport = ['aabb', 'obb'].includes(takeoffSupport?.mesh?.colliderType);
                const nextStep = partialSupport ? Math.max(0.035, Math.length2(this.player.dx, this.player.dz) + 0.007) : 0.2;
                const chargeAheadX = this.player.x + (dx / chargeLen) * nextStep;
                const chargeAheadZ = this.player.z + (dz / chargeLen) * nextStep;
                const groundAhead = [0.15, 0.4, 0.65, 0.9].some(dy =>
                    this.player.Collider.playerCollidesWithMap(this.player, { x: chargeAheadX, y: this.player.y + 0.05 - dy, z: chargeAheadZ })
                );
                // player.canJump() has a built-in 0.2-unit near-ground grace probe. Use a short,
                // bounded three-tick slice of that intentional allowance so a tight ledge jump
                // takes off at the real edge, rather than conservatively before it. The
                // verifier mirrors this exactly in physicsSimulation.js.
                if (!groundAhead) this.jumpChargeMaxTime = this.simulatedTime;
            } else {
                // Phase 3 - liftoff. Calling jump() again every subsequent tick here was assumed
                // harmless (canJump() blocks re-firing while already jumping) but isn't: player.js's
                // canJump() has its own near-ground grace check (temporarily lowers y by 0.2 and
                // checks collidesWithMap - a small coyote-time allowance) that CAN return true again
                // while still technically `jumping`, if the player happens to pass close enough over
                // solid ground - and for a SAME-LEVEL or descending jump, the whole shallow arc stays
                // close to ground the entire flight, so this can trigger well before the waypoint
                // actually registers as arrived. Reported live (not just traced): every same-level
                // gap jump visibly double-jumps the instant it lands, adding a full second flight's
                // wait before the bot can continue - confirmed NOT happening on an ascending jump
                // (e.g. "PathHalfTest"), which matches the mechanism exactly: an ascending jump stays
                // elevated above nearby ground for most of its arc, only satisfying the grace check
                // once genuinely landing.
                //
                // jumpLiftoffFired makes this call-once EXCEPT when the jump needs height - an
                // ascending jump's repeated re-triggers are load-bearing (see the up-one-level cost
                // comment in pathfinding.js: the climb relies on the marginal step-up-on-collision
                // mantle nudge accumulating across several boosts, confirmed by testing - an earlier,
                // blanket "call jump() at most once, ever" version broke exactly that mantling and
                // regressed a previously-clean crate climb). Scoping the guard to same-level/
                // descending jumps only, where a repeat was never doing anything useful in the first
                // place, keeps the ascending case's real behavior completely untouched.
                this.control(CONTROL.up);
                if (!this.jumpLiftoffFired || this.jumpGainsLevel) {
                    this.player.jump();
                    this.jumpLiftoffFired = true;
                };
            };
            };
        } else {
            this.control(CONTROL.up);
        };

        const verticalDistance = Math.abs(this.player.y - waypoint.y);

        // Unlike an ordinary JUMP landing, proximity to a ladder-catch waypoint is not success:
        // the required outcome is the collision system actually attaching to that rung. The jump
        // itself deliberately goes through the ordinary run-up/charge/liftoff state machine above
        // so live execution matches the verifier instead of using a second, weaker jump model.
        if (waypoint.ladderCatch) {
            if (this.player.climbing
                && Math.floor(this.player.climbingCell.x) === Math.floor(waypoint.x)
                && Math.floor(this.player.climbingCell.z) === Math.floor(waypoint.z)) {
                this.pathIndex++;
                this.pathStuckSinceTime = null;
                this.pathBestDistance = Infinity;
                this.stuckEventCount = 0;
            } else {
                this.checkStuck(horizontalDistance, verticalDistance, true);
            };
            return 'following';
        };

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
                ? `${Math.floor(from.x)},${Math.floor(from.y)},${Math.floor(from.z)}`
                : `${Math.floor(this.player.x)},${Math.floor(waypoint.y)},${Math.floor(this.player.z)}`;
            const toKey = `${Math.floor(waypoint.x)},${Math.floor(waypoint.y)},${Math.floor(waypoint.z)}`;
            this.pathAvoidedEdges.add(`${fromKey}->${toKey}`);

            devlog('DeadInternetBot fell off an unmodeled ledge attempting', fromKey, '->', toKey, ', replanning from where it landed', this.player.name);
            if (this.pathTargetPos) this.pathTo(this.pathTargetPos, { force: true });
            return 'following';
        };


        const ladderTopSettled = !waypoint.ladderTop || (!this.player.climbing
            && this.player.y >= waypoint.y - 0.03
            && this.player.Collider.playerCollidesWithMap(this.player, { x: this.player.x, y: this.player.y - 0.03, z: this.player.z }));
        if (horizontalDistance < MOVEMENT_PROFILE.arrivalRadius && verticalDistance < (waypoint.type === EDGE_TYPE.LADDER ? 0.1 : 1.25) && ladderTopSettled) {
            this.pathIndex++;
            this.pathStuckSinceTime = null;
            this.pathBestDistance = Infinity;
            this.stuckEventCount = 0;

            if (this.pathIndex >= this.currentPath.length) {
                this.stopPath();
                return 'arrived';
            };
        } else {
            // A JUMP waypoint whose run-up sequence has already started is the same kind of case
            // as a RAMP climb below - "temporarily not improving" is the plan working as intended,
            // not a sign of being stuck. Phase 1 deliberately backs AWAY from the target first (see the
            // run-up's own header comment), which briefly makes distance-to-waypoint worse before
            // it gets better; pathBestDistance resets to Infinity the instant this waypoint became
            // active (see the arrival branch above), gets pinned near the takeoff distance on the
            // very first tick, and then - by design - doesn't beat that recorded best again until
            // well into the actual flight, since the back-away has to be undone first before any
            // real approach even begins. For a jump that needs a real run-up (extended this session
            // to cover long-distance gap-jumps, not just height gains), that whole back-away+charge+
            // flight-until-past-the-old-mark sequence routinely takes longer than this check's
            // 0.6s window, well before the bot has done anything wrong.
            const inJumpRunup = this.jumpRunupWaypointIndex === this.pathIndex;

            // A FALL waypoint's own arrival check (below) is a pure proximity radius against the
            // landing cell - verticalTolerance (1.25) is generous enough that it can trigger while
            // the player is still legitimately descending the last bit of the drop, not yet
            // grounded. The very next waypoint (typically a WALK) then starts being judged by
            // checkStuck() immediately, while the player still has real leftover downward
            // velocity from the fall - horizontalDistance barely moves during that residual
            // settle, indistinguishable from actually being stuck. player.isFalling doesn't catch
            // this (confirmed by tracing: it read false the whole time despite dy staying
            // meaningfully negative), so check dy directly instead. Same family of bug as the RAMP
            // fix above (a transition into a WALK waypoint that isn't actually ready to be judged
            // yet), same fix shape as pathIndex0NeedsGroundWait's landing wait - hold forward and
            // don't touch checkStuck at all until the residual fall velocity has actually settled.
            // Confirmed live on "PathLadderTest" (walk right after a 2-level fall, 3,1,0->4,1,1):
            // dy was still -0.09 and decreasing when the stuck clock would otherwise have started,
            // and this guard correctly holds off until it settles a tick or two later. At the time
            // this guard was written, that edge still failed afterward - a later trace initially
            // read as the post-settle walk heading the wrong direction, but checkStuck()'s
            // pathBestDistance/pathLastPos discontinuity fix (see checkStuck()'s own comment)
            // turned out to be the real fix: PathLadderTest is 4/4 clean now that it's in place,
            // so the "wrong direction" reading was this same stale-baseline bug, not a genuine
            // collision/obstacle deflection.
            const prevType = this.currentPath[this.pathIndex - 1]?.type;
            if (waypoint.type === EDGE_TYPE.WALK && prevType === EDGE_TYPE.FALL && this.player.dy < -0.02) {
                this.control(CONTROL.up);
                return 'following';
            };

            this.checkStuck(horizontalDistance, verticalDistance, waypoint.type === EDGE_TYPE.RAMP || inJumpRunup, waypoint.type === EDGE_TYPE.RAMP);
        };

        return 'following';
    };

    // Estimated jump/step physics (pathfinding.js) can be wrong about exactly what a given
    // edge needs, and other players/bots can wander into a route after it was planned - rather
    // than trying to model every possible failure up front, just notice when the bot hasn't
    // actually gotten anywhere in a while and react: nudge with a jump first (cheap, fixes most
    // "technically blocked by a lip" cases), then force a full replan if that didn't help either.
    checkStuck(horizontalDistance, verticalDistance, suppressCheapJump = false, isRamp = false) {
        // A LADDER waypoint shares the exact same x,z as the cell it climbs from (see
        // pathfinding.js - each rung is its own edge, only y changes), so horizontalDistance sits
        // near zero for the entire climb and never reflects real progress one way or the other.
        // Judge climbing progress by vertical distance instead - the actual thing changing.
        //
        // A RAMP climb has the mirror-image problem: it's real geometric motion, not a fixed x,z
        // like a ladder, so horizontalDistance isn't STUCK at zero the way it is on a ladder - but
        // it's still the wrong signal, because most of a ramp's travel is vertical (climbing the
        // incline), with only gradual horizontal creep alongside it. Confirmed live on
        // "PathJumpTest": traced a ramp climb tick by tick and found it was GENUINELY succeeding
        // the whole time - y reached the target exactly, horizontalDistance was steadily closing -
        // right up until the hard 1.8s stuck threshold fired anyway and force-respawned the bot
        // mid-climb, because horizontalDistance's specific 0.3-unit improvement bar hadn't been
        // cleared fast enough even though real (vertical) progress never stopped. Same fix as
        // ladders: judge a ramp by the distance that's actually changing.
        const climbing = this.player.climbing;
        const usingVerticalMetric = climbing || isRamp;
        const distance = usingVerticalMetric ? verticalDistance : horizontalDistance;

        // pathBestDistance only means anything relative to the metric it was last measured in -
        // switching mid-waypoint (approaching a ladder base with horizontalDistance≈0, then
        // attaching, where verticalDistance starts around 1.0 for a fresh rung) previously
        // compared the new metric against the old one's leftover value, which the new metric could
        // essentially never beat. That looked exactly like "stuck from tick one" on every single
        // climb, even a perfectly successful one, and after 1.8s tripped the hard recovery below -
        // blacklisting the ladder edge and forcing a replan around a route that was actually
        // working fine. Confirmed by testing: this is what took a fully-working ladder tower from
        // 10/10 to under half after the metric split was first added - reset the baseline
        // whenever the metric itself changes, not just on waypoint arrival. Tracks
        // usingVerticalMetric as a whole (climbing OR isRamp), not just climbing alone, since
        // entering/leaving a RAMP waypoint flips the metric exactly the same way ladder
        // attach/detach does.
        if (usingVerticalMetric !== this.pathWasClimbing) {
            this.pathBestDistance = Infinity;
            this.pathStuckSinceTime = null;
            this.pathWasClimbing = usingVerticalMetric;
        };

        // A same-tick position discontinuity - the player's real x/y/z jumping several units
        // between one followPath() call and the next, with no waypoint change, no replan, and no
        // respawn logged - poisons pathBestDistance exactly like the metric-switch case above: the
        // recorded best is still measured from the OLD position, so the new, much larger distance
        // can never beat it, and the bot is judged "stuck" for the rest of the 1.8s window even
        // while making completely normal, steady progress from where it actually now is. Confirmed
        // live on "PathMazeTest": a walk waypoint's tracked position jumped from (2.69,1,8.4) to
        // (1.5,1,1.5) in a single tick mid-waypoint (pathIndex never changed, nothing else in the
        // log explains it - no requestRespawn, no resetGamePlayer, no fell-off-the-map catch above
        // firing), and horizontalDistance-to-target went from 0.79 straight to 7.28 as a result.
        // The subsequent walk from that point was completely clean (steady ~0.03/tick improvement
        // the whole way), but pathBestDistance stayed pinned at its pre-jump value of 1.034 (never
        // closer than 0.79 - 0.3 = 0.49 was reached before the jump), so nothing after the jump
        // could ever beat "best - 0.3" again from that much farther away, and the hard 1.8s
        // threshold fired on an edge that was never actually stuck. Same fix shape as the metric
        // switch: whatever caused the jump, treat it as a fresh start for progress-tracking rather
        // than compare against a baseline measured from a position the bot isn't at anymore. 1.5
        // units is comfortably above any real single-tick displacement (this session's traces show
        // ordinary walking around 0.03-0.05/tick, and even mid-jump dy changes only ~0.06/tick) and
        // comfortably below the 6.5-unit jump actually observed, so it can't mask a genuine "moved
        // backwards while still trying" case checkStuck is supposed to catch.
        if (this.pathLastPos) {
            const jumpDist = Math.length3(
                this.player.x - this.pathLastPos.x,
                this.player.y - this.pathLastPos.y,
                this.player.z - this.pathLastPos.z,
            );
            if (jumpDist > 1.5) {
                this.pathBestDistance = Infinity;
                this.pathStuckSinceTime = null;
            };
        };
        this.pathLastPos = { x: this.player.x, y: this.player.y, z: this.player.z };

        // Progress = getting closer to the waypoint than ever before this attempt, not just
        // "moved at all" - a bot bouncing in place while repeatedly failing a jump edge shows
        // real vertical movement every tick (and, with the run-up backup above, real horizontal
        // movement too, just in the wrong direction), either of which would otherwise keep
        // resetting this check and mask the fact that it's making zero actual progress toward
        // the waypoint (confirmed by testing: both were real failure modes before this fix).
        if (distance < this.pathBestDistance - 0.3) {
            this.pathBestDistance = distance;
            this.pathStuckSinceTime = null;
            return;
        };

        if (!this.pathStuckSinceTime) { this.pathStuckSinceTime = this.simulatedTime; return; };

        // Plain simulated-second thresholds compared directly against accumulated simulatedTime -
        // no ticksPerSecond conversion, so "stuck for 0.6s" means 0.6 simulated seconds regardless
        // of physicsSpeedModifier, not 0.6 seconds' worth of real ticks.
        const stuckForSeconds = this.simulatedTime - this.pathStuckSinceTime;
        const stuckFor600 = 0.6;
        const stuckFor900 = 0.9;
        const stuckFor1800 = 1.8;
        // jump() has a special branch while climbing: it deliberately detaches from the ladder
        // with a small upward boost, meant as an intentional mid-climb bailout, never as an
        // automatic "nudge" for a climb that's still genuinely progressing (which the fixed
        // distance metric above should mean checkStuck rarely even sees) - guarded here too as a
        // backstop, since calling it on a real, active climb would forcibly and visibly knock the
        // bot off mid-rung for no reason.
        //
        // suppressCheapJump covers two more cases the caller identifies, both the same shape as
        // climbing above - "temporarily not improving" that's the plan working as intended, not a
        // sign of being stuck:
        //  - A RAMP waypoint: walking up an incline is genuinely slower than flat ground (the
        //    player's collision box is fighting the diagonal surface every tick), so
        //    horizontalDistance can easily fail to improve by 0.3 within the 0.6s window even while
        //    making completely normal progress up the slope. Confirmed by testing on "JumpTestMap":
        //    a working single-wedge ramp repeatedly triggered this cheap-jump nudge mid-climb
        //    (visibly "jumping over and over halfway up"), which does nothing useful on an incline
        //    and just interrupts a climb that was never actually stuck - it self-recovered every
        //    time via the full replan/respawn path below, but only after burning several seconds.
        //  - A JUMP waypoint whose run-up sequence has already started: calling player.jump() again
        //    mid-flight isn't just useless, it's actively harmful - canJump()'s near-ground grace
        //    check can let it succeed WHILE ALREADY AIRBORNE, handing the player a genuine second
        //    dy impulse that cancels its current fall and re-launches it, visibly interrupting the
        //    jump's arc instead of letting it land. Confirmed live on "PathJumpTest": a run-up jump
        //    (checkpoint4->goal's jump(8.5,2.0,2.5)) got repeatedly re-triggered exactly like this,
        //    tick-traced to `jumping: true` the entire time the nudge kept firing - this was never
        //    a stuck bot, it was normal run-up-then-flight taking longer than 0.6s to beat its own
        //    recorded best distance (pathBestDistance resets to Infinity the instant the waypoint
        //    activates, and phase 1 deliberately backs AWAY from the target first - see the run-up's
        //    own header comment - so beating that recorded best necessarily means undoing the
        //    back-away AND completing real approach distance, comfortably longer than 0.6s for
        //    exactly the longer-distance run-ups this session extended run-up to cover).
        if (stuckForSeconds > stuckFor600 && stuckForSeconds < stuckFor900) {
            if (!climbing && !suppressCheapJump) this.player.jump(); // cheap first recovery attempt
        } else if (stuckForSeconds >= stuckFor1800) {
            // Briefly defer the hard replan while genuinely airborne: forcing a replan calls
            // pathTo() -> findPath(), which runs real-physics verification (simulateEdgeCached)
            // against THIS SAME live player via createSnapshot/simulateMovement/restoreSnapshot -
            // thorough for position/velocity but not perfect, and running it while the player has
            // a genuine jump in flight on a DIFFERENT part of the path can leave stale velocity on
            // landing, corrupting the live jump it interrupted.
            //
            // BOUNDED, not unconditional - an earlier version just returned whenever `jumping` was
            // true, with no cap. That's exactly what let it go wrong: `jumping` isn't a clean
            // "mid-flight" signal on its own, it also flickers true-then-false-then-true-again
            // during a bot that's genuinely bouncing/re-jumping near a bad edge (a ladder grab that
            // keeps failing, say) - and every one of those flickers re-satisfies `if (jumping)
            // return`, so the escalating recovery this branch exists to run (blacklist-and-retry,
            // eventually the 5-strikes force-respawn) never got a chance to fire at all. Confirmed
            // via a controlled A/B on "Castle": with the unconditional version, several spawns hit
            // a genuine 90s TIMEOUT that never happened without it - worse than the corruption bug
            // it was trying to prevent, since a timeout never recovers at all. A real jump's flight
            // is a fixed, short, known duration (~40 ticks, under a second) - capping the defer
            // window at stuckGraceMaxSeconds well beyond that covers the genuine case (an actual
            // jump in flight elsewhere finishing up) while guaranteeing this branch's own recovery
            // ladder still runs on schedule for a bot that's actually stuck, jumping-flicker or not.
            const stuckGraceMaxSeconds = stuckFor1800 + 1.5;
            if (this.player.jumping && stuckForSeconds < stuckGraceMaxSeconds) return;
            this.stuckEventCount++;
            this.totalStuckEvents++;

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
            // (Used to force-respawn here; removed on purpose. Now it just abandons the path.)
            if (this.stuckEventCount >= 5) {
                devlog('DeadInternetBot stuck for too many replans in a row (possible position oscillation), giving up on the path', this.player.name);
                this.stuckEventCount = 0;
                this.pathStuckSinceTime = null;
                this.pathAvoidedEdges.clear();
                this.stopPath();
                return;
            };

            // Blacklist the specific edge that failed, not just "try again" - without this, a
            // replan from the same stuck position finds the exact same edge again (nothing about
            // the map changed) and the bot just re-stalls on it forever (confirmed by testing).
            //
            // x/z were always floored here, but y wasn't - harmless while every waypoint's y was a
            // plain integer, but the ramp-exit-position and WALK-support-height fixes both now
            // legitimately put a FRACTIONAL y on some waypoints (e.g. 2.9 for a ramp's real rest
            // height). pathfinding.js's own graph keys (see key() in pathfinding.js) are always
            // built from the plain integer grid y, computed before either of those corrections
            // apply - so an unfloored blacklist key like "7,2.9,5" silently never matches the real
            // graph edge "7,3,5" that findPath()'s avoidEdges check looks for, and the blacklist
            // does nothing at all. Confirmed live on "PathJumpHardTest": a stuck bot kept
            // rediscovering and re-attempting the exact same failing checkpoint3->ramp approach
            // every ~12s, identically, forever - the blacklist should have ruled it out after the
            // first failure and never has. Flooring y here makes this match pathfinding.js's own
            // key format exactly, the same way x/z already did.
            const target = this.currentPath?.[this.pathIndex];
            const from = this.currentPath?.[this.pathIndex - 1];
            const fromKey = from
                ? `${Math.floor(from.x)},${Math.floor(from.y)},${Math.floor(from.z)}`
                : `${Math.floor(this.player.x)},${Math.floor(this.player.y)},${Math.floor(this.player.z)}`;
            if (target) {
                const toKey = `${Math.floor(target.x)},${Math.floor(target.y)},${Math.floor(target.z)}`;
                this.pathAvoidedEdges.add(`${fromKey}->${toKey}`);
                this.lastStuckEdge = { from: fromKey, to: toKey, type: target.type };
            };

            devlog('DeadInternetBot stuck, forcing replan around', fromKey, '->', target ? `${Math.floor(target.x)},${Math.floor(target.y)},${Math.floor(target.z)}` : '?', this.player.name);
            this.pathStuckSinceTime = null;
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
                // (Used to force-respawn here; removed on purpose.) Drop the path and the
                // blacklist so a later pathTo() starts from a clean slate instead of staying
                // permanently boxed in by edges that were only bad relative to old positions.
                devlog('DeadInternetBot exhausted every option from its current position, giving up on the path', this.player.name);
                this.pathAvoidedEdges.clear();
                this.stopPath();
            };
        };
    };
};
