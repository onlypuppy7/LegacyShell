//basic
import path from 'node:path';
import express from 'express';
//plugin: zombiesmode
import { ZombiesModePlugin, ZombiesModeDefaults, ZombiesModeMaps, ZombiesTeams, ZombiesCues } from './shared.js';
import { DeadInternetBot, registerPreset } from '../deadinternet/index.js';
import { hasGroundAhead } from '../deadinternet/combat.js';
import { isBlockingCell } from '../deadinternet/pathfinding.js';
import Player from '#player';
//legacyshell
import { iteratePlayers, CONTROL, TickStep } from '#constants';
import Comm from '#comm';
import { LegacyShellCorePlugin } from '../legacyshellcore/shared.js';
//

export const PluginMeta = {
    identifier: "zombiesmode",
    name: 'ZombiesMode',
    author: 'onlypuppy7 (+Claude)', //NOTE! most of this plugin is VIBECODED.
    version: '1.8.4',
    descriptionShort: 'Adds the zombies gamemode: survive the horde, the infected join it', //displayed when loading
    descriptionLong: 'Adds the Zombies gamemode. A horde of slow DeadInternet bots walks at the humans and bites them; a human who dies (or leaves the fight through the menu) is infected and joins the horde. Last human standing wins, or the humans win by outlasting the round.',
    legacyShellVersion: 613, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

// The bots. Slow, unarmed in practice (holdFire) and aimed straight at the humans from anywhere on the map. They bite through the
// team's contactDamage; see the gametype in shared.js. Speed and toughness are set again per room when they spawn (zombieSpeed and
// zombieResistance in the room's settings), these are just the defaults, and what `/bots add 5 zombie` gives.
registerPreset('zombie', {
    skill: 0.5,
    nickname: 'Zombie',
    team: 2,
    color: 'lime',
    speed: ZombiesModeDefaults.zombieSpeed,
    resistance: ZombiesModeDefaults.zombieResistance,
    holdFire: true,
    grenades: 0,
    //no aiming: it turns on the spot to face whoever it is after (a slow, wobbly turn makes a zombie circle its target)
    turnRateDeg: 3600,
    aimErrorDeg: 0,
    missChance: 0,
    flinch: 0,
    leadFactor: 0,
    movePenalty: 0,
    reactionTime: 0,
    engageMovement: 'advance',
    preferredRangeMin: 0,
    preferredRangeMax: 0, //it wants no distance at all: keeps walking at whoever it has found
    spacing: 0, //a horde does not step around itself
    aggression: 1,
    useCover: 0,
    retreatBelow: 0,
    healthPacks: false,
    restock: false,
    jumpChance: 0.05,
    huntRange: 500, //knows where the humans are, wherever they are
    sightRange: 80,
    memoryTime: 15,
    respawnDelay: ZombiesModeDefaults.respawnSecs,
});

const { HUMANS, HORDE } = ZombiesTeams;
const WIND_DIRECTION = 70; //the round's storm always blows the same way
const WALK_PACE = 0.0315; //how far a player at speed 1 goes in a tick walking (it settles there: acceleration .007, drag .8)

// Ghosts are the horde's players with noclip (nothing else turns it on in this gamemode), which is also how the browsers tell them apart.
const isGhost = (player) => !!player.modifiers.noclip;

// What a horde player's touch takes: the team's contactDamage, a ghost's own, or a brutish one's bit harder, a small one's less.
const biteOf = (player, room) => {
    const cfg = settings(room);
    if (isGhost(player)) return cfg.ghostBite;
    const bite = room.gameOptions.contactDamage[HORDE];
    return Math.round(bite * (player.zVariant === 'brutish' ? cfg.brutishDamage : player.zVariant === 'small' ? cfg.smallDamage : 1));
};

// The win streak is how many rounds in a row the humans have won. It adds to the win bonus, and makes the horde nastier: more brutish
// zombies (at a pace that gets closer to the plain ones') and quicker ghosts. All of it stops growing at streakCap.
const streakOf = (z, cfg) => Math.min(z.streak, cfg.streakCap);
const winBonus = (z, cfg) => cfg.winEggs + cfg.streakWinEggs * streakOf(z, cfg);
const brutishRatioOf = (z, cfg) => Math.max(cfg.brutishRatio, Math.min(cfg.brutishRatioMax, cfg.brutishRatio + cfg.streakBrutishRatio * streakOf(z, cfg)));
const brutishPhysicsOf = (z, cfg) => Math.max(cfg.brutishPhysics, Math.min(cfg.brutishPhysicsMax, cfg.brutishPhysics + cfg.streakBrutishPhysics * streakOf(z, cfg)));
const ghostSpeedOf = (z, cfg) => Math.max(cfg.ghostSpeed, Math.min(cfg.ghostSpeedMax, cfg.ghostSpeed + cfg.streakGhostSpeed * streakOf(z, cfg)));

// Exploding ghosts: from bombStreak, one of the ghosts is one (two from bombSecondStreak). The further the streak, the shorter the fuse and the
// faster the ticking before it. The grenade the blast is made with always does 130 (bullets.js): the bomber's damageModifier scales it to bombDamage.
const GRENADE_DAMAGE = 130;
const bombersOf = (z, cfg) => z.streak < cfg.bombStreak ? 0 : Math.min(cfg.bombMax, z.streak < cfg.bombSecondStreak ? 1 : 2);
const bombLerp = (z, cfg, from, to) => from + (to - from) * Math.max(0, Math.min(1, (streakOf(z, cfg) - cfg.bombStreak) / (cfg.streakCap - 1 - cfg.bombStreak)));
const bombFuseOf = (z, cfg) => Math.round(bombLerp(z, cfg, cfg.bombFuseMs, cfg.bombFuseMinMs));
const bombIdleOf = (z, cfg) => Math.round(bombLerp(z, cfg, cfg.bombIdleMs, cfg.bombIdleMinMs));

// One per room (a worker only has one, but the plugin is also loaded on the main thread, which has none).
const states = new WeakMap();

function isZombieRoom(room) {
    return !!room?.gameOptions?.plugins?.zombies;
}

function settings(room) {
    return { ...ZombiesModeDefaults, ...room.gameOptions.plugins.zombies };
}

export { getState, streakOf, winBonus, brutishRatioOf, brutishPhysicsOf, ghostSpeedOf, bombersOf, bombFuseOf, bombIdleOf }; //(for the tests)

function getState(room) {
    let z = states.get(room);
    if (!z) {
        z = {
            roundKey: null,         //room.roundEndTime of the round being played: changes when a new round starts
            active: false,          //a round is being played (not the gap between two)
            roundStart: 0,
            hordeReadyAt: 0,        //zombies start spawning at this time (the humans get a head start); 0 = not worked out yet
            sirened: false,         //the siren has gone off for this round
            humansAtStart: 0,       //most humans seen at once early in the round (or the first ones, if nobody was here at the start)
            suddenDeath: false,
            winner: null,           //'humans' | 'zombies', set when the round is ended early
            bots: [],               //DeadInternetBots making up the horde
            searchFrame: 0,         //when the tick the route searches are being paid for began (performance.now())
            searchCost: 0,          //...and what they have cost so far this tick, in ms
            searchEnd: 0,           //...and when the last of them finished
            filling: false,         //fillHorde() is running
            eggs: new Map(),        //player id -> kill eggs earned this round
            savedEnv: null,         //weather and time as they were before the round changed them
            victory: false,         //the humans have won and the horde is being put down: nothing comes back, nothing bites
            timerKey: null,         //which round the round-end timer has been taken over for
            envStage: 0,            //how far through the round's sky it is: 0 day, 1 darkening, 2 getting darker still, 3 sudden death
            streak: 0,              //rounds in a row the humans have won (the horde winning, or nobody being left in the room, resets it)
            round: 0,               //counts up every round, so the browsers can tell a new one from the same one's params being resent
            results: null,          //player id -> how the last round went for them, for the card at the end (see finishRound)
            lastWinner: 0,          //0 nobody, 1 humans, 2 horde
        };
        states.set(room, z);
    };
    return z;
}

// The humans still in the fight: on the human team and have been in play this round. Someone sitting on the menu who never spawned
// does not count either way, and someone who has left through the menu has been infected, so is on the other team.
function activeHumans(z) {
    const out = [];
    iteratePlayers((player) => {
        if (player.client?.isHuman && player.team === HUMANS && player.zombieSeen === z.roundKey) out.push(player);
    });
    return out;
}

function anyHumanClient() {
    let found = false;
    iteratePlayers((player) => { if (player.client?.isHuman) found = true; });
    return found;
}

// A line in the room's chat, from the server (green). (Nothing in this mode uses the big pop-up, room.notify: the screen has its own text, see zombiesui.js.)
function chat(room, text) {
    const output = new Comm.Out();
    room.packChat(output, '> ' + text, 255, Comm.Chat.user);
    room.sendToAll(output, null, 'chat');
}

const clone = (value) => JSON.parse(JSON.stringify(value ?? null));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;

        ZombiesModePlugin.registerListeners(this.plugins);
        ZombiesModePlugin.blockFire(Player);
        this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));
        this.plugins.on('client:onStartServer', this.onStartServer.bind(this));
        this.plugins.on('client:shaderSources', this.shaderSources.bind(this));
        this.plugins.on('game:idleWarmJobs', this.idleWarmJobs.bind(this));
        this.plugins.on('services:insertMaps', this.insertMaps.bind(this));

        this.plugins.on('game:metaLoop', this.metaLoop.bind(this));
        this.plugins.on('game:playerUpdate', this.playerUpdate.bind(this));
        this.plugins.on('game:resetGamePlayer', this.resetGamePlayer.bind(this));
        this.plugins.on('game:packRoundEnd', this.packRoundEnd.bind(this));
        this.plugins.on('game:onPlayerDeath', this.onPlayerDeath.bind(this));
        this.plugins.on('game:clientInstantiatePlayerEnd', this.clientInstantiatePlayerEnd.bind(this));
        this.plugins.on('game:requestRespawn', this.requestRespawn.bind(this));
        this.plugins.on('game:scoreKillEggs', this.scoreKillEggs.bind(this));
        this.plugins.on('game:roomDestroy', this.roomDestroy.bind(this));
        this.plugins.on('game:itemsLoaded', this.itemsLoaded.bind(this));
        this.plugins.on('game:packUpdateRoomParams', this.packUpdateRoomParams.bind(this));
        this.plugins.on('game:packModifiers', this.packModifiers.bind(this));
    };

    onStartServer(data) {
        data.app.use(express.static(path.join(this.thisDir, 'client'))); //(the siren and sudden death sounds)
    };

    pluginSourceInsertion(data) {
        data.pluginInsertion.files.push({
            insertBefore: `\nconsole.log("inserting before... (${PluginMeta.name})");`,
            filepath: path.join(this.thisDir, 'shared.js'),
            insertAfter: `\nconsole.log("inserting after... (${PluginMeta.name})!");`,
            position: 'before'
        });
        data.pluginInsertion.files.push({ //what a zombie looks like, which shared.js hooks onto the actors
            insertBefore: `\nconsole.log("inserting before... (${PluginMeta.name} look)");`,
            filepath: path.join(this.thisDir, 'zombievisuals.js'),
            insertAfter: `\nconsole.log("inserting after... (${PluginMeta.name} look)!");`,
            position: 'before'
        });
        data.pluginInsertion.files.push({ //what the round looks like on screen: the egg counter, the end of round card, the PLAY menu
            insertBefore: `\nconsole.log("inserting before... (${PluginMeta.name} ui)");`,
            filepath: path.join(this.thisDir, 'zombiesui.js'),
            insertAfter: `\nconsole.log("inserting after... (${PluginMeta.name} ui)!");`,
            position: 'before'
        });
    };

    // ---- events ------------------------------------------------------------------------------------------------------------

    // Every two seconds: start/maintain the round, keep the horde at strength, check for a winner.
    metaLoop(data) {
        const room = data.this;
        if (!isZombieRoom(room)) return;
        const z = getState(room);
        const cfg = settings(room);
        const now = Date.now();

        if (!room.betweenRounds() && z.roundKey !== room.roundEndTime) this.beginRound(room, z);
        if (!z.active) return;

        this.environment(room, z, cfg, now);

        if (z.timerKey !== z.roundKey) { //the round ends through roundTimeUp from here (see there)
            z.timerKey = z.roundKey;
            clearTimeout(room.roundTimeout);
            room.roundTimeout = setTimeout(() => this.roundTimeUp(room), Math.max(0, room.roundEndTime - now));
        };

        z.bots = z.bots.filter((bot) => !bot.removed && room.players_by_id[bot.player?.id] === bot.player);

        if (!anyHumanClient()) { //nobody to hunt: don't run a horde for no one
            this.clearHorde(z);
            z.hordeReadyAt = 0;
            z.streak = 0; //(an empty room starts over)
            return;
        };
        if (!z.hordeReadyAt) z.hordeReadyAt = now + cfg.headStartSecs * 1e3; //somebody has just turned up: the same head start again

        //Everyone is spawned in when a round starts, and anyone who joins can press play: someone who still has not spawned after a while
        //(the spawn failed, or they are just sitting on the menu) is infected, so they do not hold up the round or sit out as a human.
        iteratePlayers((player) => {
            if (!player.client?.isHuman || player.team !== HUMANS) return;
            if (player.zombieSeen === z.roundKey) { player.zWaitKey = null; return; };
            if (player.zWaitKey !== z.roundKey) { player.zWaitKey = z.roundKey; player.zWaitSince = now; };
            if (now - player.zWaitSince >= cfg.spawnFailsafeSecs * 1e3) { this.infect(room, z, player, 'never spawned in'); z.neverSpawned = true; };
        });
        if (z.neverSpawned && !z.winner) { //the round has nobody left to play it if they were all infected
            let waiting = false;
            iteratePlayers((player) => { if (player.client?.isHuman && player.team === HUMANS) waiting = true; });
            if (!waiting) this.endEarly(room, z, 'zombies');
        };

        const humans = activeHumans(z);
        if (humans.length > z.humansAtStart && (now - z.roundStart <= cfg.graceSecs * 1e3 || z.humansAtStart === 0)) z.humansAtStart = humans.length;

        this.fillHorde(room, z, cfg);
        this.respawnIdleZombies(room, z, cfg);

        //sudden death comes towards the end whatever happens, as well as when there is only one human left
        if (!z.suddenDeath && room.roundEndTime - now <= cfg.suddenDeathSecs * 1e3) this.startSuddenDeath(room, z, cfg);

        this.checkWin(room, z, cfg);
    };

    // Every tick, every player. Notes who has been in play this round, and infects anyone who then drops out of play without dying:
    // that is what leaving through the menu does (the game takes you out of play a few seconds after you press escape).
    playerUpdate(data) {
        const player = data.player;
        if (player.team === HORDE && isGhost(player) && !player.client?.isHuman && isZombieRoom(data.this)) return this.ghostThink(data.this, player);
        if (player.team !== HUMANS || !player.client?.isHuman) return;
        const room = data.this;
        if (!isZombieRoom(room)) return;
        const z = getState(room);
        if (!z.active) return;

        if (player.playing) {
            player.zombieSeen = z.roundKey;
        } else if (player.zombieSeen === z.roundKey && player.hp > 0) {
            this.infect(room, z, player, 'left the fight');
            this.checkWin(room, z, settings(room));
        };
    };

    // Round starts and ends both reset every player. At a start the round has time left; at an end roundEndTime has just been set to now.
    // At a start everyone is put straight into the round, so nobody spawns into a horde that has had time to walk to the spawn.
    resetGamePlayer(data) {
        const room = data.this;
        if (!isZombieRoom(room)) return;
        if (!(room.roundEndTime > Date.now())) return;

        const z = getState(room);
        if (z.roundKey !== room.roundEndTime) this.beginRound(room, z); //the first player reset starts the round

        const player = data.player;
        if (!player.client?.isHuman) return;
        if (player.team !== HUMANS) player.switchTeam(HUMANS); //the infected are cured for the new round

        ZombiesModePlugin.resetHuman(player);
        player.nextRespawn = 0;
        player.client.requestRespawn().catch((error) => console.error('[zombiesmode] could not spawn a player:', error));
    };

    packRoundEnd(data) {
        const room = data.this;
        if (!isZombieRoom(room)) return;
        this.finishRound(room, getState(room), settings(room));
    };

    // A human dying is infected: they respawn on the horde's side.
    onPlayerDeath(data) {
        const player = data.player;
        const room = player.room;
        if (!isZombieRoom(room)) return;
        const z = getState(room);
        if (!z.active || !player.client?.isHuman || player.team !== HUMANS) return;

        this.infect(room, z, player);
        this.checkWin(room, z, settings(room));
    };

    // Everyone starts on the human side. (The room's own pick, which balances the teams, would put the second human on the horde's
    // side while the horde is still being spawned.)
    clientInstantiatePlayerEnd(data) {
        const client = data.this;
        if (!isZombieRoom(client.room) || !client.isHuman || !client.player) return;

        if (client.player.team !== HUMANS) {
            client.player.team = HUMANS; //not switchTeam: nobody has been told about this player yet
            client.player.setDefaultModifiers(true);
        };

        const z = getState(client.room);
        if (z.active && z.suddenDeath) this.buffHuman(client.player, settings(client.room), true); //(joining in sudden death)
    };

    // Someone spawning into a round that has been going a while for the first time comes in as a zombie.
    requestRespawn(data) {
        const client = data.this;
        const room = client.room;
        const player = data.player;
        if (!isZombieRoom(room)) return;
        if (player.team === HORDE) { //bots and the infected
            const spawn = this.hordeSpawn(room, settings(room));
            if (spawn) Object.assign(data.spawnPoint, spawn);
            return;
        };
        if (!client.isHuman || player.team !== HUMANS) return;
        const z = getState(room);
        const cfg = settings(room);

        const late = z.active && z.humansAtStart > 0 && Date.now() - z.roundStart > cfg.graceSecs * 1e3;
        if (!late || player.zombieSeen === z.roundKey) return;

        this.infect(room, z, player, 'joined late');
        Object.assign(data.spawnPoint, this.hordeSpawn(room, cfg) ?? room.getBestSpawn(player)); //the horde has its own spawns
    };

    // Kills pay a flat amount for zombies (capped per round) instead of the usual reward, and nothing for anything else.
    scoreKillEggs(data) {
        const killer = data.this;
        const victim = data.killedPlayer;
        const room = killer.room;
        if (!isZombieRoom(room)) return;
        data.cancel = true;

        const z = getState(room);
        const cfg = settings(room);
        if (!z.active || killer.gameOptions.cheatsEnabled) return;
        if (killer.team !== HUMANS || victim.team !== HORDE) return;

        const earned = z.eggs.get(killer.id) ?? 0;
        if (earned >= cfg.eggCap) return;
        z.eggs.set(killer.id, earned + cfg.killEggs);
        killer.client.addEggsViaServices(cfg.killEggs);

        if (killer.client.isHuman && Comm.Code.zombiesEggs !== undefined) { //(what the egg counter on screen shows)
            const output = new Comm.Out();
            output.packInt8U(Comm.Code.zombiesEggs);
            output.packInt8U(cfg.killEggs);
            output.packInt16U(earned + cfg.killEggs);
            killer.client.sendToMe(output, 'zombiesEggs');
        };
    };

    // Tells the browsers whether it is the gap between two rounds (in the room params, which everyone gets on joining and whenever they
    // change). The browser cannot work this out for itself reliably: what it knows about rounds depends on which packets it happened to be there for.
    packUpdateRoomParams(data) {
        const room = data.this;
        if (!isZombieRoom(room)) return;
        const z = getState(room), now = Date.now();
        room.gameOptions.plugins.zombiesInterim = !z.active && room.roundEndTime <= now && room.roundRestartTime > now;
        room.gameOptions.plugins.zombiesSuddenDeath = z.active && z.suddenDeath;

        //what the browsers draw (zombiesui.js): the streak and the round it is, how the last round went for each player, and the countdowns
        //(in seconds from now: the browser cannot compare its clock with ours)
        const plugins = room.gameOptions.plugins, cfg = settings(room);
        plugins.zombiesStreak = z.streak;
        plugins.zombiesRound = z.round;
        plugins.zombiesWinner = z.active ? 0 : z.lastWinner;
        plugins.zombiesNextIn = plugins.zombiesInterim ? Math.max(0, +((room.roundRestartTime - now) / 1e3).toFixed(2)) : 0;
        plugins.zombiesGraceLeft = !z.active ? 0 : z.humansAtStart === 0 ? -1 : Math.max(0, +((z.roundStart + cfg.graceSecs * 1e3 - now) / 1e3).toFixed(2)); //(-1: nobody has been in the round yet, so whoever comes is a human whenever they do)
        if (!z.active && z.results) plugins.zombiesResults = z.results;
        else delete plugins.zombiesResults;
    };

    // Health packs (the healthpackitem plugin, enabled for this gamemode in shared.js) are for the humans: the horde walks over them.
    // Pickups (health, ammo, grenades) are for the humans: the horde walks over them without taking anything, and they stay where they are.
    itemsLoaded(data) {
        for (const type of [data.ItemTypes.HEALTH, data.ItemTypes.AMMO, data.ItemTypes.GRENADE]) {
            const item = type === undefined ? null : data.AllItems[type];
            if (!item || item.zombiesWrapped) continue;
            item.zombiesWrapped = true;
            const collect = item.collect;
            item.collect = function (player, applyToWeaponIdx) {
                if (isZombieRoom(player.room) && player.team === HORDE) return false;
                return collect.call(this, player, applyToWeaponIdx);
            };
        };
    };

    roomDestroy(data) {
        const room = data.this;
        if (isZombieRoom(room)) this.clearHorde(getState(room));
    };

    // ---- round -------------------------------------------------------------------------------------------------------------

    beginRound(room, z) {
        this.restoreEnvironment(room, z);
        z.roundKey = room.roundEndTime;
        z.active = true;
        z.roundStart = Date.now();
        z.hordeReadyAt = z.roundStart + settings(room).headStartSecs * 1e3;
        z.humansAtStart = 0;
        z.sirened = false;
        z.suddenDeath = false;
        z.winner = null;
        z.results = null;
        z.round++;
        z.eggs = new Map();
        z.envStage = 0;
        z.victory = false;
        z.neverSpawned = false;
        this.plugins.emit('zombiesRoundStarted', { room });
        room.updateRoomParamsForClients(); //(the interim is over)
        iteratePlayers((player) => { //the last round's victory switched the bite off for whoever was left
            if (player.team === HORDE) player.changeModifiers({ contactDamage: biteOf(player, room) });
        });

        const cfg = settings(room);
        this.applyStreak(room, z, cfg);
        if (cfg.weatherArc) { //the sky starts as an ordinary day
            z.savedEnv = { weather: clone(room.gameOptions.plugins.weather), time: clone(room.gameOptions.plugins.time) };
            this.setSky(room, { rain: 0, storm: { intensity: 0.1, lightning: 0 }, transitionSecs: 0 }, { preset: 'day', transitionSecs: 0 });
        };

        console.log(`[zombiesmode] round started (${room.roundLength}s)`);
    };

    // The round's over, however it ended: say who won, pay the survivors, put the weather back.
    finishRound(room, z, cfg) {
        if (!z.active) return;
        z.active = false;

        const survivors = activeHumans(z);
        const winner = z.winner ?? (z.humansAtStart === 0 ? null : (survivors.length ? 'humans' : 'zombies'));
        this.plugins.emit('zombiesRoundFinished', { room, winner, survivors });

        for (const bot of z.bots) { //no zombies coming back during the gap between rounds
            clearTimeout(bot.zombieTimer);
            bot.zombieTimer = null;
        };

        //how it went for everyone who was in it, for the card at the end (outcome 1 survived, 2 bitten, 3 left through the menu, 4 came in as a zombie)
        const bonus = winBonus(z, cfg), ofStreak = cfg.streakWinEggs * streakOf(z, cfg);
        z.results = {};
        iteratePlayers((player) => {
            if (!player.client?.isHuman) return;
            const how = player.zInfected?.key === z.roundKey ? player.zInfected.how : null;
            const outcome = player.team === HUMANS ? (player.zombieSeen === z.roundKey ? 1 : 0) : how === null ? 0 : how === '' ? 2 : how === 'left the fight' ? 3 : 4;
            if (!outcome) return;
            const cheats = !!player.gameOptions.cheatsEnabled, paid = outcome === 1 && winner === 'humans' && !cheats;
            const vip = player.client.userData; //(the services pay everything out times the account's VIP multiplier, while it lasts)
            const multiplier = vip?.upgradeMultiplier > 1 && vip.upgradeExpiryDate > Date.now() / 1e3 ? vip.upgradeMultiplier : 1;
            z.results[player.id] = [outcome, z.eggs.get(player.id) ?? 0, paid ? bonus : 0, paid ? ofStreak : 0, cheats ? 1 : player.client.session?.length ? 0 : 2, multiplier];
        });

        if (winner === 'humans') {
            z.streak++;
            chat(room, `The humans survived! (${survivors.length} left)${z.streak > 1 ? ` That's ${z.streak} rounds in a row.` : ''}`);
            for (const player of survivors) {
                if (!player.gameOptions.cheatsEnabled) player.client.addEggsViaServices(bonus);
            };
        } else if (winner === 'zombies') {
            chat(room, z.streak > 1 ? `The horde wins. Nobody is left, and the ${z.streak} round streak is over.` : 'The horde wins. Nobody is left.');
            z.streak = 0;
        };
        z.lastWinner = winner === 'humans' ? 1 : winner === 'zombies' ? 2 : 0;

        this.restoreEnvironment(room, z);
        room.updateRoomParamsForClients(); //(the interim begins)
        console.log(`[zombiesmode] round over: ${winner ?? 'no winner'}`);
    };

    // The round timer has run out (this replaces the room's own, which would end the round on the spot). If there are humans left they
    // have won: the horde is put down, one after another, and only then does the round end.
    roundTimeUp(room) {
        const z = getState(room);
        const cfg = settings(room);
        const survivors = activeHumans(z);
        if (!z.active || z.winner || z.victory || survivors.length === 0) return room.endRound();

        z.victory = true;
        const horde = [];
        iteratePlayers((player) => {
            if (player.team !== HORDE) return;
            player.changeModifiers({ contactDamage: 0 }); //nobody gets bitten while it plays out
            if (player.playing && !player.isDead()) horde.push(player);
        });

        horde.forEach((player, i) => setTimeout(() => {
            if (player.playing && !player.isDead() && z.victory) player.die(survivors[i % survivors.length].id); //credited to a survivor in the kill feed, not scored
        }, i * cfg.victoryGapMs));
        setTimeout(() => { if (z.victory && z.active) room.endRound(); }, horde.length * cfg.victoryGapMs + cfg.victoryHoldMs);
        console.log(`[zombiesmode] humans win: putting down ${horde.length}`);
    };

    // Ends the round now (the timer would otherwise run to its end).
    endEarly(room, z, winner) {
        z.winner = winner;
        setTimeout(() => { //a moment for the last death to land, and out of the middle of the hit that caused it
            if (z.active && z.winner === winner) room.endRound(); //resets everyone and reaches packRoundEnd, which is where finishRound runs
        }, 1500);
    };

    checkWin(room, z, cfg) {
        if (!z.active || z.winner) return;
        const humans = activeHumans(z);

        if (z.humansAtStart > 0 && humans.length === 0) return this.endEarly(room, z, 'zombies');
        if (z.humansAtStart >= 2 && humans.length === 1 && !z.suddenDeath) this.startSuddenDeath(room, z, cfg);
    };

    // A round starting with a streak behind it: the ghosts that are already there get their new pace and the brutish theirs, and plain zombies
    // are taken out for fillHorde to put brutish ones back in their place, up to the share the streak is worth (or the other way round, when
    // a streak has ended). The horde stays at cfg.count.
    applyStreak(room, z, cfg) {
        const speed = ghostSpeedOf(z, cfg), physics = brutishPhysicsOf(z, cfg);
        const brutes = z.bots.filter((bot) => bot.zVariant === 'brutish');
        for (const bot of z.bots) {
            if (!bot.player) continue;
            if (bot.zBomber) { if (bot.player.zFuseAt) this.defuse(bot.player); bot.player.changeModifiers({ speedModifier: speed, zombieBomber: bombIdleOf(z, cfg) }); }
            else if (bot.zGhost) bot.player.changeModifiers({ speedModifier: speed });
            else if (bot.zVariant === 'brutish') bot.player.changeModifiers({ physicsSpeedModifier: physics });
        };

        const swap = Math.floor(cfg.count * brutishRatioOf(z, cfg) + 1e-9) - brutes.length;
        const bombers = z.bots.filter((bot) => bot.zBomber), bombSwap = bombersOf(z, cfg) - bombers.length; //(a plain ghost makes way for one, or one goes back to being a plain one)
        const out = [
            ...(swap > 0 ? z.bots.filter((bot) => !bot.zGhost && !bot.zVariant) : brutes).slice(0, Math.abs(swap)),
            ...(bombSwap > 0 ? z.bots.filter((bot) => bot.zGhost && !bot.zBomber) : bombers).slice(0, Math.abs(bombSwap)),
        ];
        for (const bot of out) {
            clearTimeout(bot.zombieTimer);
            bot.remove();
        };
        if (out.length) z.bots = z.bots.filter((bot) => !out.includes(bot));
    };

    // ---- infection ---------------------------------------------------------------------------------------------------------

    infect(room, z, player, how = '') {
        player.zInfected = { key: z.roundKey, how }; //(the card at the end of the round says how it happened)
        player.zSuddenBuff = false; //(switching team gives back the team's own modifiers)
        player.switchTeam(HORDE); //the horde's team options (bite, no gun, a bit under full health) apply from here
        if (z.suddenDeath) this.speedUp(player, settings(room));
        chat(room, `${player.name} ${how ? how + ' and ' : ''}was infected`);
    };

    // A sound for every human in the room, as a u8 off ZombiesCues (the second packet this mode adds, see shared.js).
    cue(room, name) {
        if (Comm.Code.zombiesSound === undefined) return;
        iteratePlayers((player) => {
            if (!player.client?.isHuman || player.room !== room) return;
            const output = new Comm.Out();
            output.packInt8U(Comm.Code.zombiesSound);
            output.packInt8U(ZombiesCues.indexOf(name));
            player.client.sendToMe(output, 'zombiesSound');
        });
    };

    // ---- sudden death ------------------------------------------------------------------------------------------------------

    startSuddenDeath(room, z, cfg) {
        if (z.suddenDeath) return;
        z.suddenDeath = true;

        if (cfg.weatherArc) this.environment(room, z, cfg, Date.now());

        iteratePlayers((player) => {
            if (player.team === HORDE) this.speedUp(player, cfg);
            else if (player.team === HUMANS) this.buffHuman(player, cfg);
        });
        room.gameOptions.plugins.zombiesSuddenDeath = true; //(the browsers' reload timer follows this)
        room.updateRoomParamsForClients();
        this.cue(room, 'suddenDeath');

        console.log('[zombiesmode] sudden death');
    };

    // Everyone on the horde goes to cfg.suddenDeathSpeed, whatever they were at (the bots and the infected differ). Remembered as the factor it
    // took, so it can be taken off again.
    // The humans get a little quicker on their feet and with a reload in sudden death (the reload is the player's reloadSpeedModifier).
    buffHuman(player, cfg, init = false) {
        if (player.zSuddenBuff) return;
        player.zSuddenBuff = true;
        player.changeModifiers({ speedModifier: player.modifiers.speedModifier + cfg.suddenDeathHumanSpeed, reloadSpeedModifier: cfg.suddenDeathReload }, init);
    };

    unbuffHuman(room, player, cfg) {
        if (!player.zSuddenBuff) return;
        player.zSuddenBuff = false;
        player.changeModifiers({ speedModifier: player.modifiers.speedModifier - cfg.suddenDeathHumanSpeed, reloadSpeedModifier: room.gameOptions.reloadSpeedModifier[player.team] });
    };

    speedUp(player, cfg) {
        if (player.zombieSpeedUp) return;
        const base = player.modifiers.speedModifier / (player.zRush || 1); //(not counting a lit fuse's rush)
        const pace = isGhost(player) ? Math.min(cfg.suddenDeathSpeed, cfg.suddenDeathSpeed * ghostSpeedOf(getState(player.room), cfg) / cfg.zombieSpeed) : cfg.suddenDeathSpeed; //(a ghost stays as much slower than a zombie, but never quicker)
        player.zombieSpeedUp = pace / base;
        player.changeModifiers({ speedModifier: player.modifiers.speedModifier * player.zombieSpeedUp });
    };

    // ---- the sky ---------------------------------------------------------------------------------------------------------------
    // Written to legacyweather's state (gameOptions.plugins.weather / .time, both in its own format; without that plugin they are only
    // values nobody reads). The clients blend between what they are sent over transitionSecs, so a few updates make a smooth round-long arc:
    // an ordinary day, then within darkenSecs a dark, stormy dusk, then slowly on towards night with the storm building, and in sudden
    // death a downpour with lightning every second or two.

    setSky(room, weather, time) {
        room.gameOptions.plugins.weather = { wind: { strength: 0.5, direction: WIND_DIRECTION }, ...weather };
        room.gameOptions.plugins.time = time;
        room.updateRoomParamsForClients();
    };

    environment(room, z, cfg, now) {
        if (!cfg.weatherArc || !z.active) return;
        const elapsed = (now - z.roundStart) / 1e3;

        if (z.suddenDeath) {
            if (z.envStage < 3) {
                z.envStage = 3;
                this.setSky(room,
                    { rain: 0.9, storm: { intensity: 1, lightning: 4, flash: 2.5, thunder: 1, distance: 55, front: 0.6 }, wind: { strength: 1.6, direction: WIND_DIRECTION }, transitionSecs: 6 },
                    { preset: 'night', sky: 0.06, transitionSecs: 6 });
            };
        } else if (z.envStage === 0 && elapsed >= cfg.dayHoldSecs) {
            z.envStage = 1;
            this.setSky(room,
                { rain: 0.5, storm: { intensity: 0.75, lightning: 0.6, thunder: 0.8, distance: 90 }, wind: { strength: 0.6, direction: WIND_DIRECTION }, transitionSecs: cfg.darkenSecs },
                { preset: 'twilight', transitionSecs: cfg.darkenSecs });
        } else if (z.envStage === 1 && elapsed >= cfg.dayHoldSecs + cfg.darkenSecs) {
            z.envStage = 2; //from here to nearly the end of the round: a little darker, the storm a little stronger
            const secs = Math.max(10, Math.round(room.roundLength - elapsed - 10));
            this.setSky(room,
                { rain: 0.65, storm: { intensity: 0.9, lightning: 1.2, thunder: 0.9, distance: 80 }, wind: { strength: 0.9, direction: WIND_DIRECTION }, transitionSecs: secs },
                { preset: 'night', transitionSecs: secs });
        };
    };

    restoreEnvironment(room, z) {
        room.gameOptions.plugins.zombiesSuddenDeath = false;
        const cfg = settings(room);
        iteratePlayers((player) => {
            this.unbuffHuman(room, player, cfg);
            if (!player.zombieSpeedUp) return;
            player.changeModifiers({ speedModifier: player.modifiers.speedModifier / player.zombieSpeedUp });
            player.zombieSpeedUp = 0;
        });
        if (!z.savedEnv) return;

        if (z.savedEnv.weather === null) delete room.gameOptions.plugins.weather;
        else room.gameOptions.plugins.weather = z.savedEnv.weather;
        if (z.savedEnv.time === null) delete room.gameOptions.plugins.time;
        else room.gameOptions.plugins.time = z.savedEnv.time;
        z.savedEnv = null;
        room.updateRoomParamsForClients();
    };

    // Services is putting the maps into its database: the ones this mode is played on get a "Zombies" mode (their other modes are left as they were).
    insertMaps(data) {
        const map = data.map;
        if (!ZombiesModeMaps.includes(map.name)) return;
        map.modes = { FFA: true, Teams: true, ...(map.modes ?? {}), Zombies: true };
    };

    // Ghosts are see-through: a copy of the shared player shader (zombievisuals.js makes the materials) that gives up part of its alpha and glows (lit towards white, whatever the light: at night the lit egg is nearly black, and it would blend into the dark as a black ghost).
    shaderSources(data) {
        if (!data.shaders.pixel.includes('//@pixelPreFog')) return;
        data.shaders.pixel = data.shaders.pixel.replace('//@pixelPreFog', '//@pixelPreFog\n    #ifdef GHOSTALPHA\n        color.rgb = mix(color.rgb, vec3(1.), 0.75);\n        color.a = GHOSTALPHA;\n    #endif');
    };

    // ---- the horde ---------------------------------------------------------------------------------------------------------

    // Spawns zombies one after another until the room has the number it should: not before the humans have had their head start, and
    // spread over staggerSecs so they do not arrive as one clump. A bot takes a moment to join, so this runs on its own.
    async fillHorde(room, z, cfg) {
        if (z.filling) return;
        z.filling = true;
        try {
            while (z.active && !z.victory && z.bots.length < cfg.count && anyHumanClient()) {
                const wait = z.hordeReadyAt - Date.now();
                if (wait > 0) { await sleep(wait); continue; };
                if (!z.sirened) { z.sirened = true; this.cue(room, 'siren'); };

                //a share of them are ghosts (evenly through the horde: with 1 in 6, the 6th, the 12th...)
                //...and of the rest, some are brutish or small, the same way
                const due = (match, ratio) => z.bots.filter(match).length < Math.floor((z.bots.length + 1) * ratio + 1e-9);
                const variant = due((bot) => bot.zVariant === 'brutish', brutishRatioOf(z, cfg)) ? 'brutish' : due((bot) => bot.zVariant === 'small', cfg.smallRatio) ? 'small' : null;
                const bot = due((bot) => bot.zGhost, cfg.ghostRatio) ? await this.spawnGhost(room, z, cfg, z.bots.filter((bot) => bot.zBomber).length < bombersOf(z, cfg)) : await this.spawnZombie(room, z, cfg, variant);
                z.bots.push(bot);
                if (cfg.staggerSecs > 0) await sleep(cfg.staggerSecs * 1e3 / cfg.count);
            };
        } catch (error) {
            console.error('[zombiesmode] could not spawn a zombie:', error);
        } finally {
            z.filling = false;
        };
    };

    async spawnZombie(room, z, cfg, variant) {
        const bot = new DeadInternetBot(room, { combat: { difficulty: 'zombie', speed: cfg.zombieSpeed, resistance: cfg.zombieResistance } });
        if (variant) bot.hatId = variant === 'brutish' ? cfg.brutishHat : cfg.smallHat;
        await bot.init();
        bot.startCombatAI(); //(this is what applies the bot's combat speed, damage and resistance to the player)
        //exactly the zombie speed: the bots each get a few percent either way, which is within the same pathfinding speed bucket, so the
        //jumps it has verified for the one are not quite right for the other, and the slower of the two lands short of a wide gap
        bot.player.changeModifiers({ speedModifier: cfg.zombieSpeed });
        if (variant) await this.applyVariant(room, bot, cfg, variant);
        else LegacyShellCorePlugin.setEggColor(bot.player, ...cfg.zombieColor);
        //when there is no way to someone, the route it settles for is the closest point the search got to, so a bigger search budget than the
        //bots' default (which is sized for a target that can be reached) gets it a lot closer
        const rawPathTo = bot.pathTo.bind(bot);
        //Searching is what costs: a few searches in the same tick is how a slow server stalls, since each is a lot of physics. They are paid for
        //out of one budget per tick for the whole horde: once it is spent the other zombies carry on with the route they have (or wait a tick for
        //one), and search on a later tick.
        let deferred = false;
        const pathTo = (target, search) => {
            const t0 = performance.now();
            //A new tick is when the last search ended a while ago (one tick's steps for the whole horde run back to back, a few ms), or, if the
            //server is so far behind that ticks run back to back too, when this budget is old enough that the horde must not go on waiting for it.
            //(or the room has gone on to its next tick, if it is keeping up: a search that goes on for a few ticks is paid for tick by tick, and the 8ms gap is not there when ticks run back to back, as they do when it is being tested)
            const tick = room.lastTimeStamp, behind = Date.now() - tick > TickStep * 1.5;
            if (t0 - z.searchEnd > 8 || t0 - z.searchFrame > 50 || (tick !== z.searchTick && !behind)) { z.searchFrame = t0; z.searchCost = 0; z.searchTick = tick; };
            const left = cfg.searchBudgetMs * (bot.currentPath && !bot.pathSuspended ? 0.5 : 1) - z.searchCost; //(a zombie that has a route to walk is not the one that is stood still waiting: it leaves half the budget to those)
            if (left <= 0 && !search.force) { deferred = true; return bot.currentPath ?? null; };
            //a search that has not finished by the end of what is left is carried on in the next ticks (the whole map flooded looking for a way to someone there is no way to is hundreds of ms in one go)
            const route = rawPathTo(target, { ...search, sliceMs: Math.max(left, 1) });
            z.searchEnd = performance.now();
            z.searchCost += z.searchEnd - t0;
            return route;
        };
        bot.pathTo = (target, opts = {}) => {
            const search = { maxExpansions: cfg.searchBudget, maxMs: cfg.searchMaxMs, ...opts };
            if (!opts.chase) return pathTo(target, search); //(a stuck replan: it is not left out when the budget is gone, but it is paid for out of it)
            //Nobody gets all the way to somewhere there is no way to, and a partial route does not back a bot off the way a failed search does, so a
            //horde after someone out of reach would search for the same spot over and over: once one has come up short, the rest keep the route they have for a bit
            const noWay = z.noWay ??= new Map(), key = `${Math.floor(target.x)},${Math.floor(target.y)},${Math.floor(target.z)}`, now = Date.now();
            //Taking a kept route up again costs no search. Neither the horde budget nor another bot's failed search may leave it suspended.
            if (!opts.force && bot.pathSuspended && bot.pathServesGoal(target, now) && bot.resumeSuspendedPath()) return bot.currentPath;
            if (!opts.force && !bot.pathSuspended && bot.pathServesGoal(target, now) && now < (noWay.get(key) ?? 0)) return bot.currentPath;
            const t0 = performance.now();
            deferred = false;
            const route = pathTo(target, search);
            if (deferred || bot.pathPending) return route; //(no search happened, or it is still going: nothing has been learned about whether this goal is reachable)
            if (!route && cfg.searchMaxMs && performance.now() - t0 >= cfg.searchMaxMs * 0.9) { bot.pathFailUntil = 0; bot.pathFailCount = 0; return route; }; //(ran out of time, not out of ways: no backing off, the next go starts with what this one worked out)
            if (!route || route.partial) { if (noWay.size > 60) noWay.clear(); noWay.set(key, now + cfg.noWayMs); } else noWay.delete(key);
            if (!route?.partial || bot.zWander > 0) return route;
            //no way to them, so the route ends at the closest it got and every zombie goes there: once enough are standing about at the end of it, the rest roam instead
            const p = bot.player, end = route.length ? route[route.length - 1] : p;
            const here = (o) => Math.hypot(o.x - end.x, o.z - end.z) < 2.5 && Math.abs(o.y - end.y) < 2;
            if (here(p) && z.bots.filter((o) => o !== bot && o.player && o.player.playing && here(o.player)).length >= cfg.deadEndCap) this.roam(bot, 600, 6);
            return route;
        };
        const applyCombat = bot.applyCombat.bind(bot);
        bot.applyCombat = (cmd, delta) => {
            if (!z.active) { bot.stopPath(); return; }; //between rounds nobody is being chased: not worth the searches and the stuck replans of a horde with nowhere to go
            this.zombieThink(bot, cmd); applyCombat(cmd, delta); this.zombieDrive(bot, cmd);
        };
        bot.onDeath = () => { //replaces the default respawn so the delay can be cut short or cancelled with the round
            bot.combat?.reset();
            this.scheduleRespawn(z, bot, cfg.respawnSecs);
        };
        return bot;
    };

    // The brutish are slow, tough and hit hard; the small are quick and fragile (scale divides damage taken). Physics speed rather than speed,
    // so the pathfinding (which works from the bot's real physics) follows it. The egg's colour goes out through legacyshellcore.
    async applyVariant(room, bot, cfg, variant) {
        const player = bot.player;
        bot.zVariant = player.zVariant = variant;
        const [color, mods] = variant === 'brutish'
            ? [cfg.brutishColor, { physicsSpeedModifier: brutishPhysicsOf(getState(room), cfg), resistanceModifier: cfg.brutishResistance }]
            : [cfg.smallColor, { physicsSpeedModifier: cfg.smallPhysics, scale: cfg.smallScale }];
        player.changeModifiers({ ...mods, contactDamage: biteOf(player, room) });
        if (variant === 'small') bot.pathAs = { scale: 1 }; //takes the plain zombies' routes, and their cache: a few of them would never warm one of their own
        LegacyShellCorePlugin.setEggColor(player, ...color);
    };

    // What deadinternet warms its pathfinding cache for when a game server is idle: the zombies' usual speed and sudden death, on the maps the
    // mode is played on (the cache is per profile, so the bots' usual one does not help). The variants share them: physics speed is not part of
    // a profile, and the small ones search as plain.
    idleWarmJobs(data) {
        const d = ZombiesModeDefaults;
        for (const speedModifier of [d.zombieSpeed, d.suddenDeathSpeed]) {
            data.jobs.push({ maps: ZombiesModeMaps, modifiers: { speedModifier }, searches: 2000, priority: 0 });
        };
    };

    // A ghost: white, in a ghost hat, slower than a zombie and biting less, and with noclip, so it goes straight through walls. It has no
    // combat AI or route finding: ghostThink just points it at whoever is nearest every tick.
    async spawnGhost(room, z, cfg, bomber = false) {
        const speed = ghostSpeedOf(z, cfg);
        const bot = new DeadInternetBot(room, { combat: { difficulty: 'zombie', nickname: bomber ? 'Bomber Ghost' : 'Ghost', color: 'white', speed, resistance: cfg.ghostResistance } });
        bot.hatId = cfg.ghostHat;
        await bot.init();
        bot.zGhost = true;
        bot.player.changeModifiers({ noclip: 1, speedModifier: speed, resistanceModifier: cfg.ghostResistance, contactDamage: cfg.ghostBite });
        if (bomber) { //what the browsers read off it (see packModifiers): zombieBomber is its slow tick, zombieFuse its fuse while it is lit
            bot.zBomber = bot.player.zBomber = true; bot.player.zBot = bot;
            bot.player.changeModifiers({ damageModifier: cfg.bombDamage / GRENADE_DAMAGE, grenadeTimerModifier: 0.01, zombieBomber: bombIdleOf(z, cfg), zombieFuse: 0 }); //(the quick grenade timer is so the blast comes at once)
        };
        bot.onDeath = () => this.scheduleRespawn(z, bot, cfg.respawnSecs);
        return bot;
    };

    // Every tick, before the game moves a ghost: its velocity is a straight line at whoever is nearest, in all three axes, at the pace of
    // walking (the noclip movement then scales that by its speed modifier).
    ghostThink(room, player) {
        const z = getState(room);
        if (!z.active || z.victory || !player.playing || player.isDead()) { player.dx = player.dy = player.dz = 0; if (player.zFuseAt) this.defuse(player); return; };

        let target = null, best = Infinity;
        iteratePlayers((other) => {
            if (other.team === HORDE || !other.playing || other.isDead()) return;
            const t = other.predicted ?? other;
            const d = Math.hypot(t.x - player.x, t.y - player.y, t.z - player.z);
            if (d < best) { best = d; target = t; };
        });
        if (player.zBomber) this.bombThink(room, z, player, best);
        if (!target || best < 0.05) { player.dx = player.dy = player.dz = 0; return; }; //nobody, or right on top of them

        const dx = target.x - player.x, dy = target.y - player.y, dz = target.z - player.z;
        player.dx = dx / best * WALK_PACE;
        player.dy = dy / best * WALK_PACE;
        player.dz = dz / best * WALK_PACE;
        if (dx || dz) player.yaw = Math.atan2(dx, dz);
    };

    // An exploding ghost lights its fuse when someone gets within bombRange (and goes on to explode wherever it is by then), and when it runs out
    // it throws a real grenade at its own feet, the grenade's own timer set so short it goes at once: the browsers play the grenade's own blast
    // and the damage comes from the game's explosion code, which leaves the horde alone (the same team) and takes bombDamage off a human at
    // point blank (see GRENADE_DAMAGE). The ghost itself goes out of play (no death), and comes back after a while like any other.
    bombThink(room, z, player, near) {
        const cfg = settings(room), now = Date.now();
        if (!player.zFuseAt) {
            if (near > cfg.bombRange) return;
            const ms = bombFuseOf(z, cfg);
            player.zFuseAt = now + ms;
            player.zRush = Math.max(1, cfg.bombRush);
            player.changeModifiers({ zombieFuse: ms, speedModifier: player.modifiers.speedModifier * player.zRush }); //(the browsers start their ticks and the spin off this)
            return;
        };
        if (now >= player.zFuseAt) this.explode(player);
    };

    explode(player) {
        player.grenadeCount = 1; player.grenadeCountdown = 0; player.grenadeThrowPower = 0; player.pitch = 0; //(level, so it is thrown from beside its feet whatever it was last looking at)
        player.throwGrenade();
        player.grenadesQueued = 0;
        if (player.grenadeCount) return; //(it was not ready to throw: the next tick tries again)
        this.defuse(player);
        player.removeFromPlay(); //(out of play rather than dead: no death animation, and the blast does not hit it, nothing out of play is hit)
        player.client.sendToAll(player.client.packPaused(), 'pause'); //(what tells the browsers it is gone)
        this.scheduleRespawn(getState(player.room), player.zBot, settings(player.room).respawnSecs);
    };

    defuse(player) {
        player.zFuseAt = 0;
        player.changeModifiers(player.zRush ? { zombieFuse: 0, speedModifier: player.modifiers.speedModifier / player.zRush } : { zombieFuse: 0 });
        player.zRush = 0;
    };

    // The modifiers packet only has a few, the rest go as JSON on the end of it: an exploding ghost's slow tick, its fuse, and the timer its
    // grenade has (the browsers throw the same grenade, so they need the same timer).
    packModifiers(data) {
        const modifiers = data.this.player?.modifiers;
        if (modifiers?.zombieBomber) Object.assign(data.extra, { zombieBomber: modifiers.zombieBomber, zombieFuse: modifiers.zombieFuse || 0, grenadeTimerModifier: modifiers.grenadeTimerModifier });
    };

    // Zombies are taken out of play when a round starts without dying; bring them back (after the head start), staggered.
    respawnIdleZombies(room, z, cfg) {
        if (z.victory || Date.now() < z.hordeReadyAt) return;
        for (const bot of z.bots) {
            if (!bot.player || bot.player.playing || bot.zombieTimer) continue;
            this.scheduleRespawn(z, bot, Math.random() * cfg.staggerSecs);
        };
    };

    // What a zombie does on top of the bots' own movement (see the preset: this is the part a gun-carrying bot does not need), in two parts:
    // zombieThink changes what the controller decided before it is applied, zombieDrive adjusts what that did to the player.

    straightGround(bot, dx, dz, reach) {
        const p = bot.player, map = bot.room.map;
        if (!map?.data) return true;
        const len = Math.hypot(dx, dz) || 1, y = Math.floor(p.y + 0.05), steps = Math.max(1, Math.ceil(reach / 0.25));
        for (let i = 0; i <= steps; i++) {
            const x = Math.floor(p.x + dx / len * reach * i / steps), z = Math.floor(p.z + dz / len * reach * i / steps);
            const column = map.data[x];
            const below = column?.[y - 1]?.[z];
            //Only an ordinary floor is safe to assume from the grid. Props, ramps and ladders go through the route's physics checks.
            if (!below?.idx || below.mesh?.colliderType !== 'full' || isBlockingCell(column?.[y]?.[z]) || isBlockingCell(column?.[y + 1]?.[z])) return false;
        };
        return true;
    };

    // A bot that has someone in sight stops following routes and just walks at them. That is fine on the level, but someone on a ledge,
    // a stair or a roof is not somewhere a straight line gets to: the zombie would stand beneath them looking up. So it only does that
    // when they are level with it and not far, and otherwise goes by route, which is what takes it up the stairs.
    zombieThink(bot, cmd) {
        const p = bot.player;

        //Wandering (see zombieDrive): going to a random spot, until it gets there or the time is up.
        const prey = cmd.engaged ? bot.combat?.target : null;
        if (bot.zWander > 0 && !(prey && Math.abs(prey.y - p.y) < 1)) { //(not while someone is right there to bite, but a zombie that can see someone it cannot reach still goes)
            cmd.engaged = false; cmd.fire = false;
            bot.zWander = Math.hypot(bot.zWanderTo.x - p.x, bot.zWanderTo.z - p.z) < 1 ? 0 : bot.zWander - 1;
            cmd.state = 'hunt';
            cmd.moveTo = bot.zWanderTo;
            return;
        };
        bot.zWander = 0;

        //A bot that has lost sight of someone goes to where it last saw them, or where it heard a shot, and only then goes looking. A zombie
        //knows where the humans are: that just sends it to an empty spot (underneath them, once they have gone up somewhere) to stand about.
        if (!cmd.engaged && (cmd.state === 'search' || cmd.state === 'investigate')) {
            const prey = bot.combat.nearestHostile(500);
            if (prey) {
                const t = prey.predicted ?? prey;
                cmd.state = 'hunt';
                cmd.moveTo = { x: t.x, y: t.y, z: t.z };
            };
            return;
        };

        const target = cmd.engaged ? bot.combat?.target : null;
        if (!target) return;

        const t = target.predicted ?? target;
        const dx = t.x - p.x, dz = t.z - p.z;
        const flat = Math.hypot(dx, dz);
        const level = Math.abs(t.y - p.y) < 1;
        if (bot.zPath > 0 && (!bot.currentPath || bot.pathSuspended)) bot.zPath--;

        //Straight at them is for when they are level, near enough, and there is ground the whole way: a gap or a drop on the way (the bots'
        //ledge guard would stop it at the edge, standing there for good, since a bot in sight never follows a route) is for the route to
        //cross, which it knows how to jump. Once it has handed over it stays handed over for a while, so a jump is not interrupted halfway.
        //Any drop counts: the bots' own guard lets a couple of blocks go, and the opening at the top of a stairwell has the stairs a
        //block or two below it to land on, so a zombie that has just climbed out would turn to face them and walk straight back down it.
        const straight = level && !(bot.zPath > 0) && flat < 14 && this.straightGround(bot, dx, dz, flat);
        if (straight) { cmd.yaw = Math.atan2(dx, dz); return; };
        if (level && !(bot.zPath > 0) && flat < 14) bot.zPath = 90; //(ticks: 1.5s) the ground ran out

        cmd.engaged = false; //so the bot follows a route to them instead
        cmd.fire = false;
        cmd.state = 'hunt';
        cmd.moveTo = { x: t.x, y: t.y, z: t.z };
    };

    zombieDrive(bot, cmd) {
        const p = bot.player;
        const last = bot.zProgress;
        //Collision can leave velocity without movement. Jumping on the spot is not progress either.
        if (!last || Math.hypot(p.x - last.x, p.climbing ? p.y - last.y : 0, p.z - last.z) > 0.3) {
            bot.zProgress = { x: p.x, y: p.y, z: p.z };
            bot.zIdle = 0;
        } else bot.zIdle = (bot.zIdle ?? 0) + 1;

        //Close to someone it cannot quite reach (they are up on something, or it is just standing there short of them): a jump now and
        //then, which is what gets a player onto a ledge or a step they were a little short of.
        const prey = bot.combat?.nearestHostile(4);
        if (prey && (!bot.currentPath?.length || bot.pathSuspended)) {
            const t = prey.predicted ?? prey;
            const near = Math.hypot(t.x - p.x, t.z - p.z);
            if (near < 3 && (t.y - p.y > 0.4 || Math.hypot(p.dx, p.dz) < 0.004) && Math.random() < 0.005) p.jump();
        };
        const goal = cmd.engaged ? bot.combat?.target : cmd.moveTo; //whoever it has in sight, or wherever the route is taking it
        if (!goal) { bot.zIdle = 0; return; };

        const dx = goal.x - p.x, dz = goal.z - p.z, dy = goal.y - p.y;
        const flat = Math.hypot(dx, dz);
        const ground = (reach) => hasGroundAhead(bot.room.map, p.x, p.y, p.z, dx, dz, { reach, maxDrop: 0 }); //something to stand on that far ahead, level with it (the bots' ledge guard, without its couple of blocks of fall)

        //Within biting range and level: walk into them. The bots' ledge guard looks a block ahead, which is past someone standing at the
        //edge of something, so look only as far as they are.
        if (cmd.engaged && flat < 2.5 && Math.abs(dy) < 1) {
            if (ground(Math.min(0.9, flat))) p.controlKeys |= CONTROL.up;
            if (flat < 0.6 && Math.abs(dy) < 0.6) { bot.zIdle = 0; return; };
        };

        //Wanting to get somewhere but not getting anywhere: following a route and out of it. The route search already goes to the closest
        //point it can reach when there is no way to them (they are on a tower, say), so this bot is standing at that point, as close as it
        //gets. Rather than stand about (or pile up with the rest of the horde on the one point), it wanders off to somewhere random nearby
        //for a while, then the route gets another go.
        if (bot.zWander > 0 || (bot.currentPath?.length && !bot.pathSuspended)) return; //the route has its own jump/replan recovery; do not replace it halfway through
        if (bot.zIdle < 120) return;
        bot.zIdle = 0;
        if (cmd.engaged) { bot.zPath = 150; bot.stopPath(); return; }; //ticks (2.5s), then until the route is finished
        this.roam(bot, 180);
    };

    roam(bot, ticks, least = 3) {
        if (bot.player.climbing) return; //(a spot level with someone halfway up a ladder is in the air: no route there, so it would hang on the ladder backing off)
        const p = bot.player, angle = Math.random() * Math.PI * 2, radius = least + Math.random() * 5;
        bot.zWanderTo = { x: p.x + Math.sin(angle) * radius, y: p.y, z: p.z + Math.cos(angle) * radius };
        bot.zWander = ticks;
    };

    // Zombies (the bots and the infected) spawn at a random spawn point with no human near it, so the horde is spread out and does not
    // appear on top of anyone. If every spawn has a human close, one of the third furthest from them.
    hordeSpawn(room, cfg) {
        const humans = [];
        iteratePlayers((other) => { if (other.team !== HORDE && other.playing && !other.isDead()) humans.push(other); });
        const spawns = (room.spawnPoints || []).flat().filter(Boolean);
        if (!spawns.length) return null;

        const clearances = new Map(spawns.map((s) => [s, humans.reduce((least, h) => Math.min(least, Math.hypot(s.x + 0.5 - h.x, s.y - h.y, s.z + 0.5 - h.z)), Infinity)]));
        const clearance = (s) => clearances.get(s); //worked out once, the sort below asks a lot
        //'near' is a fixed distance, but never more than a good part of the map: maps are small, and a human somewhere in the middle of one
        //would otherwise have every spawn 'near'
        const near = Math.min(cfg.spawnClearRadius, 0.4 * Math.max(room.map?.width ?? Infinity, room.map?.depth ?? Infinity));
        const free = spawns.filter((s) => clearance(s) > near);
        const farthest = [...spawns].sort((a, b) => clearance(b) - clearance(a)).slice(0, Math.max(1, Math.ceil(spawns.length / 3))); //if there is nowhere clear
        const choices = free.length ? free : farthest;
        const pick = choices[Math.floor(Math.random() * choices.length)];
        return { x: pick.x + 0.5, y: pick.y, z: pick.z + 0.5, yaw: Math.random() * Math.PI * 2, pitch: 0 };
    };

    scheduleRespawn(z, bot, seconds) {
        clearTimeout(bot.zombieTimer);
        bot.zombieTimer = setTimeout(() => {
            bot.zombieTimer = null;
            if (!bot.removed && z.active && !z.victory) bot.respawn();
        }, seconds * 1e3);
    };

    clearHorde(z) {
        for (const bot of z.bots) {
            clearTimeout(bot.zombieTimer);
            bot.remove();
        };
        z.bots = [];
    };
};
