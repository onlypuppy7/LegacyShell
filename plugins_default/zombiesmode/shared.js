//legacyshell: basic
import { isClient } from "#constants";
//legacyshell: plugins
import { plugins } from '#plugins';
//

// Spliced into the browser bundle as well as imported by the game server: the gametype has to exist on both sides, with the same
// index. Everything else (the horde, infection, the round) is server-side and lives in index.js.

// The maps this mode is played on (the rest are left out: the horde has to be able to get about them). index.js gives each of them the
// "Zombies" mode when the maps are loaded into the database, which is what the gametype's map pool is made of.
export const ZombiesModeMaps = ['Blue', 'Castle', 'Dirt', 'Feedlot', 'Moonbase', 'Ruins', 'Shellville', 'Shipyard', 'Two Towers'];

// Per-room settings, read from gameOptions.plugins.zombies. A gametype (or another plugin) can change any of them.
export const ZombiesModeDefaults = {
    count: 20,              //zombie bots kept alive in the room while there are humans
    graceSecs: 30,          //humans who join after this long into a round join as zombies
    respawnSecs: 6,         //how long a killed zombie bot takes to come back
    killEggs: 2,            //eggs per zombie killed (instead of the usual per-kill reward)
    eggCap: 100,            //most kill eggs one player can earn in a round
    winEggs: 20,            //eggs for each survivor when the humans win
    suddenDeathSecs: 60,    //a lone human (or a solo player) gets this long before sudden death at the latest
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
    },

    // The horde has no gun: an infected player's trigger does nothing (the zombies' own damage is already off, this stops the shot itself, and
    // the sound and recoil that come with it). Patched on the player class, on both sides: the browser for the one holding the trigger, the
    // server for what it will accept from anyone.
    blockFire(Player) {
        if (Player.prototype.zombiesFireBlocked) return;
        Player.prototype.zombiesFireBlocked = true;
        var infected = function (player) {
            var options = player.gameOptions;
            return !!(options && options.plugins && options.plugins.zombies && player.team === 2);
        };
        var fire = Player.prototype.fire;
        Player.prototype.fire = function () { if (infected(this)) return; return fire.apply(this, arguments); };
        var pullTrigger = Player.prototype.pullTrigger;
        Player.prototype.pullTrigger = function () { if (infected(this)) return; return pullTrigger.apply(this, arguments); };
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

    // Sudden death changes the humans' reload speed on the server, which the modifiers packet does not carry, so the browser's own idea of it
    // (the reload timer on the HUD) follows the room params instead.
    roomParamsUpdated(data) {
        if (!isClient || typeof me === "undefined" || !me) return;
        var params = data.roomParamsObj.plugins, cfg = params && params.zombies;
        if (!cfg) return;
        me.changeModifiers({ reloadSpeedModifier: params.zombiesSuddenDeath ? cfg.suddenDeathReload : gameOptions.reloadSpeedModifier[me.team] });
    },

    // WAITING... in the middle of the screen, for anyone who has gone into the game while it is the gap between two rounds: whoever pressed
    // PLAY (the game menu is gone) or is already in play. Everyone in the room when a round ends is taken out of play, and the game does not
    // let you spawn again until the next one starts, so they are not in play yet (me.playing is false): they are put into the next round when
    // it starts.
    // Whether it is the gap comes from the server (gameOptions.plugins.zombiesInterim, sent when it starts and to anyone joining during it):
    // what this browser thinks about rounds depends on which packets it happened to be there for.
    interimTick() {
        try {
            var menu = document.getElementById("gameMenu");
            var interim = !!(gameOptions && gameOptions.plugins && gameOptions.plugins.zombies && gameOptions.plugins.zombiesInterim === true && inGame && me && (me.playing || (menu && menu.style.display === "none")));

            var waiting = document.getElementById("zombiesWaiting");
            if (!waiting) {
                if (!interim) return;
                waiting = document.createElement("div");
                waiting.id = "zombiesWaiting";
                var style = window.getComputedStyle(document.getElementById("gameClock")); //the same look as the clock, smaller
                waiting.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:5;text-align:center;"
                    + "font-family:" + style.fontFamily + ";font-weight:" + style.fontWeight + ";color:" + style.color + ";text-shadow:" + style.textShadow + ";font-size:1.2em";
                waiting.innerText = "WAITING...";
                document.body.appendChild(waiting);
            };
            waiting.style.display = interim ? "block" : "none";
        } catch (e) { };
    },

    enterGame() {
        if (document.pointerLockElement) return; //pressed PLAY: the game is already doing this
        try {
            escPressed = false; //losing the lock again must not read as the player pressing escape
            unfocused = true; //a click anywhere takes the lock, in case the browser refuses it without one
            canvas.requestPointerLock({ unadjustedMovement: settings.fastPollMouse });
            hideGameMenu();
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
