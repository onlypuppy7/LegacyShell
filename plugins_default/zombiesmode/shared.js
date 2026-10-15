//legacyshell: basic
import { isClient } from "#constants";
//legacyshell: plugins
import { plugins } from '#plugins';
//

// Spliced into the browser bundle as well as imported by the game server: the gametype has to exist on both sides, with the same
// index. Everything else (the horde, infection, the round) is server-side and lives in index.js.

// Per-room settings, read from gameOptions.plugins.zombies. A gametype (or another plugin) can change any of them.
export const ZombiesModeDefaults = {
    count: 20,              //zombie bots kept alive in the room while there are humans
    graceSecs: 30,          //humans who join after this long into a round join as zombies
    respawnSecs: 6,         //how long a killed zombie bot takes to come back
    killEggs: 2,            //eggs per zombie killed (instead of the usual per-kill reward)
    eggCap: 100,            //most kill eggs one player can earn in a round
    winEggs: 20,            //eggs for each survivor when the humans win
    suddenDeathSecs: 60,    //a lone human (or a solo player) gets this long before sudden death at the latest
    suddenDeathSpeed: 1.4,  //zombies' speed is multiplied by this in sudden death
    surgeSpeed: 1.5,        //...and by this on top for surgeSecs after each lightning strike (needs legacyweather's storm; 1 = off)
    surgeSecs: 2,
    headStartSecs: 6,       //the humans are in the round this long before the first zombie spawns
    staggerSecs: 8,         //...and the horde spawns spread over this long, rather than all at once
    spawnClearRadius: 12,   //zombies only spawn at spawn points with no human within this many blocks (at most 40% of the map's size)
    searchBudget: 5000,     //how hard a zombie looks for a way to someone (a path search gives up after this many steps)
    zombieSpeed: 0.55,      //zombie bots' speed modifier
    zombieResistance: 1,    //...and resistance (it divides damage taken: 1 is a normal player, 0.5 dies twice as fast)
};

export const ZombiesModePlugin = {
    registerListeners: function (pluginManager) {
        this.plugins = pluginManager;

        this.plugins.on('game:GameTypesInit', this.GameTypesInit.bind(this));
        this.plugins.on('game:onPageLoadedEnd', this.onPageLoadedEnd.bind(this)); //(browser only)
    },

    // ---- the browser ---------------------------------------------------------------------------------------------------------
    // The server spawns everyone when a round starts, including people sitting on the game menu. Normally you press PLAY, which also
    // takes the pointer lock and closes the menu; here nobody pressed anything, so do the same when the server spawns you.

    onPageLoadedEnd() {
        if (!isClient || this.patched) return;
        this.patched = true;

        var original = Player.prototype.respawn;
        Player.prototype.respawn = function () {
            var result = original.apply(this, arguments);
            if (this.id === meId && gameOptions.plugins && gameOptions.plugins.zombies) ZombiesModePlugin.enterGame();
            return result;
        };
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
            mapPool: "Teams", //humans are team 1, the horde team 2, so it needs maps with spawns for both
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
                damageModifier: [1, 1, 0],
                contactDamage: [0, 0, 15],
                contactCooldown: 500,
                contactReach: 0.5, //zombies stop about a block short of someone, so a touch counts from a bit further than usual
                resistanceModifier: [1, 1, 0.75], //infected humans have about 75 hp
                knockbackModifier: [0, 0, 0],
                startingGrenades: 1,
                plugins: {
                    zombies: { ...ZombiesModeDefaults },
                },
            }
        });
    },
};

if (isClient) ZombiesModePlugin.registerListeners(plugins);
