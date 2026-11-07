//legacyshell: basic
import { isClient } from "#constants";
import Comm from "#comm";
//legacyshell: plugins
import { plugins } from '#plugins';
//

// Spliced into the browser bundle as well as imported by the game server: the gametype has to exist on both sides, with the same
// index. Everything else (the horde, infection, the round) is server-side and lives in index.js.

// The maps this mode is played on (the rest are left out: the horde has to be able to get about them). index.js gives each of them the
// "Zombies" mode when the maps are loaded into the database, which is what the gametype's map pool is made of.
// The two sides: humans are team 1, the horde (bots and the infected) team 2.
export const ZombiesTeams = { HUMANS: 1, HORDE: 2 };
export const ZombiesCues = ['siren', 'suddenDeath']; //the sounds the server can tell the browsers to play, by the u8 they are sent as

export const ZombiesModeMaps = ['Blue', 'Castle', 'Infected Feedlot', 'Moonbase', 'Ruins', 'Two Towers'];

// Per-room settings, read from gameOptions.plugins.zombies. A gametype (or another plugin) can change any of them.
export const ZombiesModeDefaults = {
    count: 20,              //zombie bots kept alive in the room while there are humans
    graceSecs: 30,          //humans who join after this long into a round join as zombies
    respawnSecs: 6,         //how long a killed zombie bot takes to come back
    killEggs: 2,            //eggs per zombie killed (instead of the usual per-kill reward)
    eggCap: 100,            //most kill eggs one player can earn in a round
    winEggs: 20,            //eggs for each survivor when the humans win
    streakWinEggs: 10,      //each round the humans have won in a row adds this many eggs to the win bonus
    streakCap: 10,          //...and the streak stops counting for anything (bonus, brutes, ghosts) beyond this many rounds
    streakBrutishRatio: 0.07, //...and the brutish share of the horde goes up this much per round (replacing plain zombies)
    brutishRatioMax: 0.45,  //...to at most this share
    streakBrutishPhysics: 0.1, //...and the brutish get this much faster per round
    brutishPhysicsMax: 1,   //...until they move at the plain zombies' pace
    streakGhostSpeed: 0.04, //...and ghosts get this much faster per round
    ghostSpeedMax: 0.9,     //...to at most this speed modifier (sudden death still puts the horde's pace at suddenDeathSpeed at most)
    suddenDeathSecs: 60,    //sudden death comes at the latest when this long is left
    suddenDeathSpeed: 1.15, //zombies' speed in sudden death (the speed itself, not a multiplier)
    suddenDeathReload: 1.3, //the humans' reload speed modifier in sudden death (1.2 the rest of the time: reloadSpeedModifier in the gametype)
    suddenDeathHumanSpeed: 0.2, //...and how much faster they move then (added to their speed modifier)
    weatherArc: true,       //the round plays out under a sky that darkens and a storm that builds (needs legacyweather; false leaves the weather alone)
    dayHoldSecs: 4,         //...it starts as an ordinary day for this long
    darkenSecs: 40,         //...and is a dark, stormy dusk this long after that
    victoryGapMs: 100,      //when the humans win the horde dies one after another, this far apart
    victoryHoldMs: 1500,    //...and the round ends this long after the last one goes
    spawnFailsafeSecs: 15,  //a human who has not spawned into a round this long after it started (or after they joined it) is infected
    headStartSecs: 6,       //the humans are in the round this long before the first zombie spawns
    staggerSecs: 8,         //...and the horde spawns spread over this long, rather than all at once
    spawnClearRadius: 12,   //zombies only spawn at spawn points with no human within this many blocks (at most 40% of the map's size)
    searchBudget: 1500,     //how hard a zombie looks for a way to someone (a path search gives up after this many steps: a failed one spends all of them)
    searchMaxMs: 0,        //one route search gives up (with the closest it got to) after this many ms, however many steps it has left (0 for no limit: a search cut short is a worse route, so only for a server that can't take the odd long one)
    noWayMs: 3000,          //after a search comes up short of someone, the other zombies keep the route they have rather than search for the same spot, for this long
    deadEndCap: 2,         //when there is no way to someone, the route ends as close as it got: once this many zombies are standing about there, the rest roam instead
    searchBudgetMs: 6,      //the whole horde's route searching stops for the tick after this many ms (the rest carry on with the route they have)
    zombieSpeed: 0.65,      //zombie bots' speed modifier (not much lower: how far a bot can jump depends on its speed, and a two block gap is too wide for 0.6)
    zombieResistance: 0.7,  //...and resistance (it divides damage taken: 1 is a normal player, 0.5 dies twice as fast)
    zombieColor: [88, 109, 62], //egg colour of the plain zombie bots (rgb, hands too)
    ghostRatio: 1 / 6,      //the share of the horde (1 in 6) that are ghosts instead: they float straight through walls at whoever is nearest
    ghostSpeed: 0.5,        //a ghost's speed modifier (1 is the pace of a walking player), under the zombies'
    ghostBite: 6,           //hp a ghost's touch takes (a zombie's is the team's contactDamage)
    ghostResistance: 0.7,   //...and its resistance
    bombStreak: 1,          //an exploding ghost (it replaces one of the ghosts) comes at this streak, round 2: one of them...
    bombSecondStreak: 3,    //...and a second from this streak, round 4
    bombMax: 2,             //...and never more than this many
    bombRange: 1.875,        //it lights its fuse when someone is this close (it ticks slowly the whole time, so it can be heard before that)
    bombRush: 1.3,          //...and its speed is multiplied by this from then on (it makes a dash for them)
    bombFuseMs: 3000,       //how long the fuse is at the first of them...
    bombFuseMinMs: 1800,    //...down to this by round 10
    bombIdleMs: 1200,       //the gap between its slow ticks before the fuse, at the first...
    bombIdleMinMs: 700,     //...down to this by round 10
    bombDamage: 100,        //what its blast does at point blank, falling off to nothing at 3 blocks (humans only: the horde cannot hurt itself)
    brutishRatio: 0.1,      //the share of the horde that are brutish: slow, tough, hit hard, big hands
    brutishPhysics: 0.7,    //...their physicsSpeedModifier (not speedModifier: that would throw the pathfinding off)
    brutishResistance: 3.5, //...and resistance (5x the zombies')
    brutishDamage: 1.25,    //...and how much more their bite takes than the team's contactDamage
    brutishHat: 60002,      //Zombie Eggshell (legacyshellcore; 0 for none)
    brutishColor: [120, 107, 62], //egg colour (rgb, hands too)
    smallRatio: 0.15,       //the share of the horde that are small: quick and fragile
    smallPhysics: 1.25,     //...their physicsSpeedModifier
    smallDamage: 0.5,       //...and how much less their bite takes
    smallScale: 0.5,        //...and scale (damage taken is divided by it, so this is half the health too)
    smallHat: 50031,        //Devil Horns
    smallColor: [140, 100, 114],
    ghostHat: 50244,        //the item id of the hat a ghost wears (Ghost Hat, from modernshellhats; 0 for none)
};

export const ZombiesModePlugin = {
    registerListeners: function (pluginManager) {
        this.plugins = pluginManager;

        this.plugins.on('game:GameTypesInit', this.GameTypesInit.bind(this));
        this.plugins.on('game:onPageLoadedEnd', this.onPageLoadedEnd.bind(this)); //(browser only)
        this.plugins.on('game:roomParamsUpdated', this.roomParamsUpdated.bind(this)); //(browser only)
        this.plugins.on('game:leaveGame', this.leaveGame.bind(this)); //(browser only)
        this.plugins.on('game:permissionsAfterSetup', this.permissionsAfterSetup.bind(this));
        this.plugins.on('game:LegacyShellOnMessage', this.LegacyShellOnMessage.bind(this)); //(browser only)
        this.plugins.on('game:loadSounds', this.loadSounds.bind(this)); //(browser only)
        this.plugins.on('game:grenadeThrow', this.grenadeThrow.bind(this)); //(browser only)
    },

    // The first of two packets this mode adds: to someone who has just earned eggs for a zombie, u8 how many that was and u16 how many they have
    // earned this round. Counted in the mode's own eggs (killEggs, up to eggCap), which is not what the account is paid: the services
    // multiply every payout by the account's VIP multiplier, so the balance cannot be used for it.
    permissionsAfterSetup() {
        if (Comm.Code.zombiesEggs === undefined) Comm.Add("zombiesEggs");
        if (Comm.Code.zombiesSound === undefined) Comm.Add("zombiesSound");
    },

    // The other: u8 which sound, off ZombiesCues (the siren when the horde starts spawning, the horn of sudden death, which the siren follows).
    loadSounds(data) {
        data.soundsList.push(["sound/zombies/siren.mp3", "zombies.siren"], ["sound/zombies/suddenDeath.mp3", "zombies.suddenDeath"]);
    },

    // The grenade an exploding ghost goes off with is only the blast: no pin sound, no beep, and no grenade to see (the ghost's own pin sound
    // went when its fuse was lit). The grenades are pooled, so every throw says again whether it is one of these.
    grenadeThrow(data) {
        var actor = isClient && data.this.actor, owner = data.args[0];
        if (!actor) return;
        actor.zBomb = !!(owner && owner.modifiers && owner.modifiers.zombieBomber);
        if (!actor.zBomb) return;
        var emitter = actor.soundEmitter;
        if (!emitter.zPlay) {
            emitter.zPlay = emitter.play;
            emitter.play = function () { if (!actor.zBomb) return emitter.zPlay.apply(emitter, arguments); };
        };
        this.plugins.cancel = true;
        data.result = data.run.apply(null, data.args);
        actor.mesh.setEnabled(false);
    },

    LegacyShellOnMessage(data) {
        if (isClient && data.cmd === Comm.Code.zombiesSound) {
            var cue = ZombiesCues[data.input.unPackInt8U()];
            if (cue) try { playSoundIndependent2D("zombies." + cue); } catch (e) { };
            if (cue === "suddenDeath") setTimeout(function () { try { playSoundIndependent2D("zombies.siren"); } catch (e) { }; }, 1500); //(the siren follows the horn, a moment after)
            this.plugins.cancel = true;
            return;
        };
        if (!isClient || data.cmd !== Comm.Code.zombiesEggs) return;
        var gained = data.input.unPackInt8U(), total = data.input.unPackInt16U();
        try { ZombiesUI.eggs(gained, total); } catch (e) { };
        this.plugins.cancel = true;
    },

    // The horde has no gun: an infected player's trigger does nothing (the zombies' own damage is already off, this stops the shot itself, and
    // the sound and recoil that come with it). Patched on the player class, on both sides: the browser for the one holding the trigger, the
    // server for what it will accept from anyone.
    blockFire(Player) {
        if (Player.prototype.zombiesFireBlocked) return;
        Player.prototype.zombiesFireBlocked = true;
        var infected = function (player) {
            var options = player.gameOptions;
            return !!(options && options.plugins && options.plugins.zombies && player.team === ZombiesTeams.HORDE);
        };
        var fire = Player.prototype.fire;
        Player.prototype.fire = function () { if (infected(this)) return; return fire.apply(this, arguments); };
        var pullTrigger = Player.prototype.pullTrigger;
        Player.prototype.pullTrigger = function () { if (infected(this)) return; return pullTrigger.apply(this, arguments); };
    },

    resetHuman(player) {
        player.hp = 100;
        player.grenadeCount = player.gameOptions.startingGrenades;
    },

    // ---- the browser ---------------------------------------------------------------------------------------------------------
    // The server spawns everyone when a round starts, including people sitting on the game menu. Normally you press PLAY, which also
    // takes the pointer lock and closes the menu; here nobody pressed anything, so do the same when the server spawns you.

    onPageLoadedEnd() {
        if (!isClient || this.patched) return;
        this.patched = true;
        this.blockFire(Player);

        var original = Player.prototype.respawn;
        Player.prototype.respawn = function () {
            if (this.gameOptions.plugins && this.gameOptions.plugins.zombies && this.team === ZombiesTeams.HUMANS) ZombiesModePlugin.resetHuman(this);
            var result = original.apply(this, arguments);
            if (this.id === meId && gameOptions.plugins && gameOptions.plugins.zombies) ZombiesModePlugin.enterGame();
            return result;
        };

        setInterval(function () { ZombiesModePlugin.interimTick(); }, 250);

        // What a zombie looks like (zombievisuals.js): done by wrapping the actor's own update, which draws everyone every frame, and the
        // step that sets the hands to follow the gun. Nothing for a human changes: both go straight to the originals.
        var updateActor = PlayerActor.prototype.update;
        PlayerActor.prototype.update = function () {
            var result = updateActor.apply(this, arguments);
            try {
                if (ZombieVisuals.isZombie(this)) ZombieVisuals.apply(this, arguments[0]);
                else if (this.zombieHands) ZombieVisuals.revert(this);
            } catch (e) { if (!ZombiesModePlugin.visualsFailed) { ZombiesModePlugin.visualsFailed = true; console.error("zombie look failed", e); }; };
            return result;
        };
        var handsToWeapon = PlayerActor.prototype.handsToWeaponSkeleton;
        PlayerActor.prototype.handsToWeaponSkeleton = function () {
            if (this.zombieHands && ZombieVisuals.isZombie(this)) return ZombieVisuals.poseArms(this);
            return handsToWeapon.apply(this, arguments);
        };
    },

    // The leaderboard is rebuilt for every spawn, death and score, and a horde of twenty respawning all the time makes that a few times a second
    // (every row's text and styles, and the other plugins' icons on top): in a zombies room it is done at most every quarter second instead. It is
    // wrapped here, the first time a room says it is a zombies one, so this is on the outside of the other plugins' wraps.
    throttleList() {
        if (!isClient || this.listThrottled || typeof rebuildPlayerList !== "function") return;
        this.listThrottled = true;
        var rebuild = rebuildPlayerList, last = 0, timer = null;
        rebuildPlayerList = function () {
            if (!(gameOptions && gameOptions.plugins && gameOptions.plugins.zombies)) return rebuild.apply(this, arguments);
            var wait = 250 - (Date.now() - last);
            if (wait <= 0) { last = Date.now(); return rebuild.apply(this, arguments); };
            if (!timer) timer = setTimeout(function () { timer = null; last = Date.now(); try { rebuild(); } catch (e) { }; }, wait);
        };
    },

    // Sudden death changes the humans' reload speed on the server, which the modifiers packet does not carry, so the browser's own idea of it
    // (the reload timer on the HUD) follows the room params instead.
    roomParamsUpdated(data) {
        if (!isClient) return;
        var params = data.roomParamsObj.plugins, cfg = params && params.zombies;
        if (!cfg) return;
        try { ZombiesUI.params(params); } catch (e) { }; //(before the check for me: someone who has only just joined has none yet, and still needs the countdowns)
        this.throttleList();
        if (typeof me === "undefined" || !me) return;
        me.changeModifiers({ reloadSpeedModifier: params.zombiesSuddenDeath ? cfg.suddenDeathReload : gameOptions.reloadSpeedModifier[me.team] });
    },

    // WAITING... in the middle of the screen, for anyone who has gone into the game while it is the gap between two rounds: whoever pressed
    // PLAY (the game menu is gone) or is already in play. Everyone in the room when a round ends is taken out of play, and the game does not
    // let you spawn again until the next one starts, so they are not in play yet (me.playing is false): they are put into the next round when
    // it starts.
    // Whether it is the gap comes from the server (gameOptions.plugins.zombiesInterim, sent when it starts and to anyone joining during it):
    // what this browser thinks about rounds depends on which packets it happened to be there for.
    interimTick() {
        try { ZombiesUI.tick(); } catch (e) { if (!ZombiesModePlugin.uiFailed) { ZombiesModePlugin.uiFailed = true; console.error("zombies hud failed", e); }; };
        try {
            var menu = document.getElementById("gameMenu");
            var interim = !!(gameOptions && gameOptions.plugins && gameOptions.plugins.zombies && gameOptions.plugins.zombiesInterim === true && inGame && me && (me.playing || (menu && menu.style.display === "none")));

            var waiting = document.getElementById("zombiesWaiting");
            if (!waiting) {
                if (!interim) return;
                waiting = document.createElement("div");
                waiting.id = "zombiesWaiting";
                var style = window.getComputedStyle(document.getElementById("gameClock")); //the same look as the clock, smaller
                waiting.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;text-align:center;"
                    + "font-family:" + style.fontFamily + ";font-weight:" + style.fontWeight + ";color:" + style.color + ";text-shadow:" + style.textShadow + ";font-size:1.2em";
                waiting.innerText = "WAITING...";
                (document.getElementById("game") || document.body).appendChild(waiting); //(in #game: hidden along with it)
            };
            waiting.style.display = interim ? "block" : "none";
        } catch (e) { };
    },

    // Going home with the game menu already gone (it is, once the server has spawned you) skips the one place the corner buttons come back.
    leaveGame() {
        if (!isClient) return;
        try { showCornerButtons(); } catch (e) { };
    },

    enterGame() {
        if (document.pointerLockElement) return; //pressed PLAY: the game is already doing this
        try {
            closeAlertDialog(); //the "continue to the next round?" prompt, among others
            closeSettingsMenu();
            plugins.emit("playPressed"); //(what pressing PLAY says, for the player profile and the settings to get out of the way)
            document.getElementById("help").style.display = "none";
            document.getElementById("feedback").style.display = "none";
            captureKeys(); //(the dialogs let go of them)
            escPressed = false; //losing the lock again must not read as the player pressing escape
            unfocused = true; //a click anywhere takes the lock, in case the browser refuses it without one
            canvas.requestPointerLock({ unadjustedMovement: settings.fastPollMouse });
            hideGameMenu();
            if (me && me.actor && me.actor.eye) doFirstPersonCamera(); //(hideGameMenu leaves the camera alone if this browser has not heard the round started yet)
            setTimeout(function () { unfocused = !document.pointerLockElement; escPressed = true; }, 400);
        } catch (e) { };
    },

    GameTypesInit(data) {
        data.GameTypes.push({
            shortName: "Zombies",
            longName: "Zombies",
            codeName: "zombies",
            mapPool: "Zombies", //only ZombiesModeMaps (see above); humans are team 1, the horde team 2, so they have spawns for both
            options: {
                teamsEnabled: true,
                teamSwitchMaximumDifference: -999, //nobody may switch teams: infection is one way
                timedGame: {
                    enabled: true,
                    roundLength: 180, //3 mins in seconds
                    spawnDuringInterval: false,
                },
                //team 2 is the horde: bots and infected humans alike. Infected humans cannot shoot, only bite; the bots get a weaker
                //and slower profile of their own (zombieSpeed, zombieResistance above).
                speedModifier: [1, 1.1, 1], //the humans are a little faster than normal (and than the horde)
                reloadSpeedModifier: [1.2, 1.2, 1.2], //...and reload a little faster
                damageModifier: [1, 1, 0],
                contactDamage: [0, 0, 12],
                contactCooldown: 500,
                resistanceModifier: [1, 1, 0.6], //infected humans have about 60 hp: faster and cleverer than the bots, so they break more easily
                knockbackModifier: [0, 0, 0],
                //the usual ammo and grenades, and health packs (healthpackitem) for the humans; the horde cannot pick them up
                itemsEnabled: [...data.defaultOptions.itemsEnabled, ...(data.ItemTypes.HEALTH !== undefined ? [[data.ItemTypes.HEALTH, 240, 1]] : [])],
                startingGrenades: 1,
                plugins: {
                    zombies: { ...ZombiesModeDefaults },
                },
            }
        });
    },
};

if (isClient) ZombiesModePlugin.registerListeners(plugins);
