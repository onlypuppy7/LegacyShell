//basic
import path from 'node:path';
//plugin: zombiesmode
import { ZombiesModePlugin, ZombiesModeDefaults } from './shared.js';
import { DeadInternetBot, registerPreset } from '../deadinternet/index.js';
import { hasGroundAhead } from '../deadinternet/combat.js';
//legacyshell
import { iteratePlayers, CONTROL } from '#constants';
import Comm from '#comm';
//

export const PluginMeta = {
    identifier: "zombiesmode",
    name: 'ZombiesMode',
    author: 'onlypuppy7',
    version: '1.1.0',
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

const HUMANS = 1;
const HORDE = 2;

// One per room (a worker only has one, but the plugin is also loaded on the main thread, which has none).
const states = new WeakMap();

function isZombieRoom(room) {
    return !!room?.gameOptions?.plugins?.zombies;
}

function settings(room) {
    return { ...ZombiesModeDefaults, ...room.gameOptions.plugins.zombies };
}

function getState(room) {
    let z = states.get(room);
    if (!z) {
        z = {
            roundKey: null,         //room.roundEndTime of the round being played: changes when a new round starts
            active: false,          //a round is being played (not the gap between two)
            roundStart: 0,
            hordeReadyAt: 0,        //zombies start spawning at this time (the humans get a head start); 0 = not worked out yet
            humansAtStart: 0,       //most humans seen at once early in the round (or the first ones, if nobody was here at the start)
            suddenDeath: false,
            winner: null,           //'humans' | 'zombies', set when the round is ended early
            bots: [],               //DeadInternetBots making up the horde
            filling: false,         //fillHorde() is running
            eggs: new Map(),        //player id -> kill eggs earned this round
            savedEnv: null,         //weather and time as they were before the round changed them
            victory: false,         //the humans have won and the horde is being put down: nothing comes back, nothing bites
            timerKey: null,         //which round the round-end timer has been taken over for
            envStage: 0,            //how far through the round's sky it is: 0 day, 1 darkening, 2 getting darker still, 3 sudden death
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

// A line in the room's chat, from the server (green): for the small things. room.notify is the big pop-up, kept for the moments that matter.
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
        this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));

        this.plugins.on('game:metaLoop', this.metaLoop.bind(this));
        this.plugins.on('game:playerUpdate', this.playerUpdate.bind(this));
        this.plugins.on('game:resetGamePlayer', this.resetGamePlayer.bind(this));
        this.plugins.on('game:packRoundEnd', this.packRoundEnd.bind(this));
        this.plugins.on('game:onPlayerDeath', this.onPlayerDeath.bind(this));
        this.plugins.on('game:clientInstantiatePlayerEnd', this.clientInstantiatePlayerEnd.bind(this));
        this.plugins.on('game:requestRespawn', this.requestRespawn.bind(this));
        this.plugins.on('game:scoreKillEggs', this.scoreKillEggs.bind(this));
        this.plugins.on('game:roomDestroy', this.roomDestroy.bind(this));
        this.plugins.on('game:thunderStrike', this.thunderStrike.bind(this));
        this.plugins.on('game:itemsLoaded', this.itemsLoaded.bind(this));
        this.plugins.on('game:packUpdateRoomParams', this.packUpdateRoomParams.bind(this));
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
            return;
        };
        if (!z.hordeReadyAt) z.hordeReadyAt = now + cfg.headStartSecs * 1e3; //somebody has just turned up: the same head start again

        const humans = activeHumans(z);
        if (humans.length > z.humansAtStart && (now - z.roundStart <= cfg.graceSecs * 1e3 || z.humansAtStart === 0)) z.humansAtStart = humans.length;

        this.fillHorde(room, z, cfg);
        this.respawnIdleZombies(room, z, cfg);

        //a player on their own gets sudden death towards the end instead, as there is no "last one left" moment
        if (!z.suddenDeath && z.humansAtStart === 1 && room.roundEndTime - now <= cfg.suddenDeathSecs * 1e3) this.startSuddenDeath(room, z, cfg);

        this.checkWin(room, z, cfg);
    };

    // Every tick, every player. Notes who has been in play this round, and infects anyone who then drops out of play without dying:
    // that is what leaving through the menu does (the game takes you out of play a few seconds after you press escape).
    playerUpdate(data) {
        const player = data.player;
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
    };

    // In sudden death every lightning strike makes the horde lunge for a moment.
    thunderStrike(data) {
        const room = data.room;
        if (!isZombieRoom(room)) return;
        const z = getState(room);
        const cfg = settings(room);
        if (!z.active || !z.suddenDeath || cfg.surgeSpeed <= 1) return;

        iteratePlayers((player) => {
            if (player.team !== HORDE || player.zombieSurge || !player.playing) return;
            player.zombieSurge = cfg.surgeSpeed;
            player.changeModifiers({ speedModifier: player.modifiers.speedModifier * cfg.surgeSpeed });
            setTimeout(() => this.endSurge(player), cfg.surgeSecs * 1e3);
        });
    };

    endSurge(player) {
        if (!player.zombieSurge) return;
        player.changeModifiers({ speedModifier: player.modifiers.speedModifier / player.zombieSurge });
        player.zombieSurge = 0;
    };

    // Tells the browsers whether it is the gap between two rounds (in the room params, which everyone gets on joining and whenever they
    // change). The browser cannot work this out for itself reliably: what it knows about rounds depends on which packets it happened to be there for.
    packUpdateRoomParams(data) {
        const room = data.this;
        if (!isZombieRoom(room)) return;
        room.gameOptions.plugins.zombiesInterim = !getState(room).active && room.roundEndTime <= Date.now() && room.roundRestartTime > Date.now();
    };

    // Health packs (the healthpackitem plugin, enabled for this gamemode in shared.js) are for the humans: the horde walks over them.
    itemsLoaded(data) {
        const health = data.AllItems[data.ItemTypes.HEALTH];
        if (!health || health.zombiesWrapped) return;
        health.zombiesWrapped = true;
        const collect = health.collect;
        health.collect = function (player, applyToWeaponIdx) {
            if (isZombieRoom(player.room) && player.team === HORDE) return false;
            return collect.call(this, player, applyToWeaponIdx);
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
        z.suddenDeath = false;
        z.winner = null;
        z.eggs = new Map();
        z.envStage = 0;
        z.victory = false;
        room.updateRoomParamsForClients(); //(the interim is over)
        iteratePlayers((player) => { //the last round's victory switched the bite off for whoever was left
            if (player.team === HORDE) player.changeModifiers({ contactDamage: room.gameOptions.contactDamage[HORDE] });
        });

        const cfg = settings(room);
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

        for (const bot of z.bots) { //no zombies coming back during the gap between rounds
            clearTimeout(bot.zombieTimer);
            bot.zombieTimer = null;
        };

        if (winner === 'humans') {
            chat(room, `The humans survived! (${survivors.length} left)`);
            for (const player of survivors) {
                if (!player.gameOptions.cheatsEnabled) player.client.addEggsViaServices(cfg.winEggs);
            };
        } else if (winner === 'zombies') {
            chat(room, 'The horde wins. Nobody is left.');
        };

        this.restoreEnvironment(room, z);
        room.updateRoomParamsForClients(); //(the interim begins)
        console.log(`[zombiesmode] round over: ${winner ?? 'no winner'}`);
    };

    // The round timer has run out (this replaces the room's own, which would end the round on the spot). If there are humans left they
    // have won: the horde is put down, one after another, and only then does the round end.
    roundTimeUp(room) {
        const z = getState(room);
        const cfg = settings(room);
        if (!z.active || z.winner || z.victory || activeHumans(z).length === 0) return room.endRound();

        z.victory = true;
        const survivors = activeHumans(z);
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

    // ---- infection ---------------------------------------------------------------------------------------------------------

    infect(room, z, player, how = '') {
        player.switchTeam(HORDE); //the horde's team options (bite, no gun, a bit under full health) apply from here
        if (z.suddenDeath) this.speedUp(player, settings(room));
        chat(room, `${player.name} ${how ? how + ' and ' : ''}was infected`);
    };

    // ---- sudden death ------------------------------------------------------------------------------------------------------

    startSuddenDeath(room, z, cfg) {
        if (z.suddenDeath) return;
        z.suddenDeath = true;

        if (cfg.weatherArc) this.environment(room, z, cfg, Date.now());

        iteratePlayers((player) => { if (player.team === HORDE) this.speedUp(player, cfg); });

        room.notify('SUDDEN DEATH: the horde is faster now', 8);
        console.log('[zombiesmode] sudden death');
    };

    // Everyone on the horde goes to cfg.suddenDeathSpeed, whatever they were at (the bots and the infected differ). Remembered as the factor it
    // took, so it can be taken off again (and a lightning surge on top of it, which is also a factor, comes off the same way).
    speedUp(player, cfg) {
        if (player.zombieSpeedUp) return;
        const base = player.modifiers.speedModifier / (player.zombieSurge || 1);
        player.zombieSpeedUp = cfg.suddenDeathSpeed / base;
        player.changeModifiers({ speedModifier: player.modifiers.speedModifier * player.zombieSpeedUp });
    };

    // ---- the sky ---------------------------------------------------------------------------------------------------------------
    // Written to legacyweather's state (gameOptions.plugins.weather / .time, both in its own format; without that plugin they are only
    // values nobody reads). The clients blend between what they are sent over transitionSecs, so a few updates make a smooth round-long arc:
    // an ordinary day, then within darkenSecs a dark, stormy dusk, then slowly on towards night with the storm building, and in sudden
    // death a downpour with lightning every second or two.

    setSky(room, weather, time) {
        room.gameOptions.plugins.weather = { wind: { strength: 0.5, direction: 70 }, ...weather };
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
                    { rain: 0.9, storm: { intensity: 1, lightning: 4, flash: 2.5, thunder: 1, distance: 55, front: 0.6 }, wind: { strength: 1.6, direction: 70 }, transitionSecs: 6 },
                    { preset: 'night', sky: 0.06, transitionSecs: 6 });
            };
        } else if (z.envStage === 0 && elapsed >= cfg.dayHoldSecs) {
            z.envStage = 1;
            this.setSky(room,
                { rain: 0.5, storm: { intensity: 0.75, lightning: 0.6, thunder: 0.8, distance: 90 }, wind: { strength: 0.6, direction: 70 }, transitionSecs: cfg.darkenSecs },
                { preset: 'twilight', transitionSecs: cfg.darkenSecs });
        } else if (z.envStage === 1 && elapsed >= cfg.dayHoldSecs + cfg.darkenSecs) {
            z.envStage = 2; //from here to nearly the end of the round: a little darker, the storm a little stronger
            const secs = Math.max(10, Math.round(room.roundLength - elapsed - 10));
            this.setSky(room,
                { rain: 0.65, storm: { intensity: 0.9, lightning: 1.2, thunder: 0.9, distance: 80 }, wind: { strength: 0.9, direction: 70 }, transitionSecs: secs },
                { preset: 'night', transitionSecs: secs });
        };
    };

    restoreEnvironment(room, z) {
        iteratePlayers((player) => {
            this.endSurge(player);
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

                const bot = new DeadInternetBot(room, { combat: { difficulty: 'zombie', speed: cfg.zombieSpeed, resistance: cfg.zombieResistance } });
                await bot.init();
                bot.startCombatAI(); //(this is what applies the bot's combat speed, damage and resistance to the player)
                //exactly the zombie speed: the bots each get a few percent either way, which is within the same pathfinding speed bucket, so the
                //jumps it has verified for the one are not quite right for the other, and the slower of the two lands short of a wide gap
                bot.player.changeModifiers({ speedModifier: cfg.zombieSpeed });
                //when there is no way to someone, the route it settles for is the closest point the search got to, so a bigger search budget than the
                //bots' default (which is sized for a target that can be reached) gets it a lot closer
                const pathTo = bot.pathTo.bind(bot);
                bot.pathTo = (target, opts = {}) => pathTo(target, { maxExpansions: cfg.searchBudget, ...opts });
                const applyCombat = bot.applyCombat.bind(bot);
                bot.applyCombat = (cmd, delta) => { this.zombieThink(bot, cmd); applyCombat(cmd, delta); this.zombieDrive(bot, cmd); };
                bot.onDeath = () => { //replaces the default respawn so the delay can be cut short or cancelled with the round
                    bot.combat?.reset();
                    this.scheduleRespawn(z, bot, cfg.respawnSecs);
                };
                z.bots.push(bot);
                if (cfg.staggerSecs > 0) await sleep(cfg.staggerSecs * 1e3 / cfg.count);
            };
        } catch (error) {
            console.error('[zombiesmode] could not spawn a zombie:', error);
        } finally {
            z.filling = false;
        };
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

    // A bot that has someone in sight stops following routes and just walks at them. That is fine on the level, but someone on a ledge,
    // a stair or a roof is not somewhere a straight line gets to: the zombie would stand beneath them looking up. So it only does that
    // when they are level with it and not far, and otherwise goes by route, which is what takes it up the stairs.
    zombieThink(bot, cmd) {
        const p = bot.player;

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

        const dx = target.x - p.x, dz = target.z - p.z;
        const flat = Math.hypot(dx, dz);
        const level = Math.abs(target.y - p.y) < 1;
        if (bot.zPath > 0) bot.zPath--;

        //Straight at them is for when they are level, near enough, and there is ground the whole way: a gap or a drop on the way (the bots'
        //ledge guard would stop it at the edge, standing there for good, since a bot in sight never follows a route) is for the route to
        //cross, which it knows how to jump. Once it has handed over it stays handed over for a while, so a jump is not interrupted halfway.
        const straight = level && !(bot.zPath > 0) && flat < 14 && hasGroundAhead(bot.room.map, p.x, p.y, p.z, dx, dz, { reach: Math.min(0.9, flat) });
        if (straight) return;
        if (level && !(bot.zPath > 0) && flat < 14) bot.zPath = 90; //(ticks: 1.5s) the ground ran out

        const t = target.predicted ?? target;
        cmd.engaged = false; //so the bot follows a route to them instead
        cmd.fire = false;
        cmd.state = 'hunt';
        cmd.moveTo = { x: t.x, y: t.y, z: t.z };
    };

    zombieDrive(bot, cmd) {
        const p = bot.player;
        const goal = cmd.engaged ? bot.combat?.target : cmd.moveTo; //whoever it has in sight, or wherever the route is taking it
        if (!goal) { bot.zIdle = 0; bot.zSwarm = 0; return; };

        const dx = goal.x - p.x, dz = goal.z - p.z, dy = goal.y - p.y;
        const flat = Math.hypot(dx, dz);
        const ground = (reach) => hasGroundAhead(bot.room.map, p.x, p.y, p.z, dx, dz, { reach }); //something to stand on that far ahead (the bots' ledge guard)

        //Within biting range and level: walk into them. The bots' ledge guard looks a block ahead, which is past someone standing at the
        //edge of something, so look only as far as they are.
        if (cmd.engaged && flat < 2.5 && Math.abs(dy) < 1) {
            bot.zIdle = 0; bot.zSwarm = 0;
            if (ground(Math.min(0.9, flat))) p.controlKeys |= CONTROL.up;
            return;
        };

        //Wanting to get somewhere but not getting anywhere. Straight at someone in sight and blocked (a gap, a wall): the route takes over for
        //a while. Following a route and out of it (no way to them, or only to the closest point it found, so they are on a tower, say): walk
        //straight at them and jump at whatever is in the way, so the horde piles up against the foot of it instead of standing about.
        if (!bot.zSwarm) {
            bot.zIdle = Math.hypot(p.dx, p.dz) < 0.004 ? (bot.zIdle ?? 0) + 1 : 0;
            if (bot.zIdle < 20) return;
            bot.zIdle = 0;
            if (cmd.engaged) { bot.zPath = 150; return; }; //ticks (2.5s)
            bot.zSwarm = 90; //ticks (1.5s), then the route gets another go
        };
        bot.zSwarm--;

        if (flat < 0.6) return;
        if (!(dy < -0.5 || ground(0.9))) return; //not off an edge, unless they are down there
        p.yaw = Math.atan2(dx, dz);
        p.controlKeys = CONTROL.up;
        if (bot.zSwarm % 45 === 0) p.jump();
    };

    // Zombies (the bots and the infected) spawn at a random spawn point with no human near it, so the horde is spread out and does not
    // appear on top of anyone. If every spawn has a human close, one of the third furthest from them.
    hordeSpawn(room, cfg) {
        const humans = [];
        iteratePlayers((other) => { if (other.team !== HORDE && other.playing && !other.isDead()) humans.push(other); });
        const spawns = (room.spawnPoints || []).flat().filter(Boolean);
        if (!spawns.length) return null;

        const clearance = (s) => humans.reduce((least, h) => Math.min(least, Math.hypot(s.x + 0.5 - h.x, s.y - h.y, s.z + 0.5 - h.z)), Infinity);
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
