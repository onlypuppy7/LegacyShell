//legacyshell: basic
import { isClient, isServer } from "#constants";
import Comm from "#comm";
import { Rocket } from "#bullets";
import { RPEGG } from "#guns";
//legacyshell: plugins
import { plugins } from '#plugins';
import { setGameOptionInMentions } from "#permissions";
//

export const LegacyShellCorePlugin = {
    registerListeners: function (pluginManager) {
        console.log("registering listeners... (LegacyShellCorePlugin)");

        this.plugins = pluginManager;

        this.plugins.on('game:canJump', this.canJump.bind(this));
        this.plugins.on('game:GameTypesInit', this.GameTypesInit.bind(this));
        this.plugins.on('game:fireCluck9mm', this.fireCluck9mm.bind(this));

        this.plugins.on('game:permissionsAfterSetup', this.registerSampleCommand.bind(this));
    },

    fireCluck9mm(data) {
        var ctx = data.this;
        var player = ctx.player;

        if (player.gameOptions.plugins.pistolrpg[player.team]) {
            plugins.cancel = true;
            var pos = data.pos;
            var dir = data.dir;
            Rocket.fire(ctx.player, pos, dir, RPEGG);
        };
    },

    GameTypesInit(data) {
        var defaultOptions = data.defaultOptions;

        Object.assign(defaultOptions.plugins, {
            infinijump: [false, false, false],
            pistolrpg: [false, false, false],
        });

        var GameTypes = data.GameTypes;
        var ItemTypes = data.ItemTypes;

        GameTypes[0].shortName = "FFA (Classic)";
        GameTypes[0].longName = "Free For All (Classic)";

        GameTypes[1].shortName = "Teams (Classic)";
        GameTypes[1].longName = "Teams (Classic)";

        GameTypes.push({
            shortName: "FFA (Timed)",
            longName: "Free For All (Timed)",
            codeName: "timedffa",
            mapPool: "FFA",
            options: {
                timedGame: {
                    enabled: true,
                    roundLength: 150, //2.5 mins in seconds
                },
            }
        });

        GameTypes.push({
            shortName: "Teams (Timed)",
            longName: "Teams (Timed)",
            codeName: "timedteams",
            mapPool: "Teams",
            options: {
                teamsEnabled: true,
                timedGame: {
                    enabled: true,
                    roundLength: 150, //2.5 mins in seconds
                },
            }
        });

        GameTypes.push({
            shortName: "Scale Shift",
            longName: "Scale Shift",
            codeName: "scale",
            mapPool: "Scale",
            options: {
                teamsEnabled: true,
                scale: [
                    1, //ffa
                    0.4, //team1
                    2, //team2
                ],
                gravityModifier: [
                    1, //ffa
                    1, //team1
                    0.5, //team2
                ],
                regenModifier: [
                    1, //ffa
                    2, //team1
                    0.25, //team2
                ],
                teamSwitchMaximumDifference: 1,
            }
        });

        GameTypes.push({
            shortName: "Lifesteal",
            longName: "Lifesteal",
            codeName: "lifestealffa", //used for creation of GameType enum
            mapPool: "FFA", //the pool of maps to use. helps with avoiding having to assign game types to maps retroactively when making a new game mode
            options: {
                itemsEnabled: [ //itemType enum, spawn per how much surface area, minimum
                    [ItemTypes.AMMO, 35, 4],
                    [ItemTypes.GRENADE, 75, 5],
                ],
                regenModifier: [
                    .5, //ffa
                    .5, //team1
                    .5, //team2
                ],
                lifesteal: [
                    0.5, //ffa
                    0.5, //team1
                    0.5, //team2
                ],
            }
        });

        GameTypes.push({
            shortName: "Apocalypse",
            longName: "Apocalypse",
            codeName: "apocalypseffa", //used for creation of GameType enum
            mapPool: "FFA", //the pool of maps to use. helps with avoiding having to assign game types to maps retroactively when making a new game mode
            options: {
                itemsEnabled: [ //itemType enum, spawn per how much surface area, minimum
                    [ItemTypes.AMMO, 35, 4],
                    [ItemTypes.GRENADE, 75, 5],
                    [ItemTypes.HEALTH, 75, 3], //make them rare
                ],
                weather: {
                    rainEnabled: true,
                    stormEnabled: true,
                },
                time: "night",
                regenModifier: [
                    -.5, //ffa
                    -.5, //team1
                    -.5, //team2
                ],
                lifesteal: [
                    0.5, //ffa
                    0.5, //team1
                    0.5, //team2
                ],
            }
        });

        GameTypes.push({
            shortName: "Hiroshima",
            longName: "Hiroshima (Meme)",
            codeName: "hiroshimaffa", //used for creation of GameType enum
            mapPool: "Hiroshima", //the pool of maps to use. helps with avoiding having to assign game types to maps retroactively when making a new game mode
            options: {
                scale: [
                    2, //ffa
                    2, //team1
                    2, //team2
                ],
                speedModifier: [
                    4, //ffa
                    4, //team1
                    4, //team2
                ],
                plugins: {
                    infinijump: [true, true, true],
                    pistolrpg: [true, true, true],
                },
            }
        });
    },
    
    registerSampleCommand: function (data) {
        console.log("registering sample command... (sample plugin)");
        var ctx = data.this;

        //cheats
        ctx.newCommand({
            identifier: "glitchyroom1",
            isCheat: true,
            name: "glitch1",
            category: "cheats",
            description: "Glitchy room type 1:<br>Random packets every meta loop.",
            example: "true",
            warningText: "This command will probably crash your game (however it's harmless).",
            permissionLevel: [ctx.ranksEnum.Moderator, ctx.ranksEnum.Guest, true],
            inputType: ["bool"],
            executeClient: ({ player, opts, mentions }) => { },
            executeServer: ({ player, opts, mentions }) => {
                ctx.room.gameOptions.glitchyRoom1 = opts;
            }
        });
        ctx.newCommand({
            identifier: "glitchyroom2",
            isCheat: true,
            name: "glitch2",
            category: "cheats",
            description: "Glitchy room type 2:<br>Broken sync packets.",
            example: "true",
            warningText: "This command will probably crash your game (however it's harmless).",
            permissionLevel: [ctx.ranksEnum.Moderator, ctx.ranksEnum.Guest, true],
            inputType: ["bool"],
            executeClient: ({ player, opts, mentions }) => { },
            executeServer: ({ player, opts, mentions }) => {
                ctx.room.gameOptions.glitchyRoom2 = opts;
            }
        });
        ctx.newCommand({
            identifier: "infinijump",
            isCheat: true,
            name: "infinijump",
            category: "cheats",
            description: "Enable/disable infinite jumping.",
            example: "@a true (only use group mentions)",
            autocomplete: "@",
            mentionTypes: {group: true},
            usage: "[@group] bool",
            permissionLevel: [ctx.ranksEnum.Moderator, ctx.ranksEnum.Guest, true],
            inputType: ["bool"],
            executeClient: ({ player, opts, mentions }) => { },
            executeServer: ({ player, opts, mentions, mentionsLiteral }) => {
                if (!setGameOptionInMentions(player, mentions, mentionsLiteral, "infinijump", opts, ctx.room.gameOptions.plugins)) {
                    player.client.commandFeedback(`Use a group mention like @a to set this option.`);
                };
            }
        });
        ctx.newCommand({
            identifier: "pistolrpg",
            isCheat: true,
            name: "pistolrpg",
            category: "cheats",
            description: "Enable/disable pistol RPG.",
            example: "@a true (only use group mentions)",
            autocomplete: "@",
            mentionTypes: {group: true},
            usage: "[@group] bool",
            permissionLevel: [ctx.ranksEnum.Moderator, ctx.ranksEnum.Guest, true],
            inputType: ["bool"],
            executeClient: ({ player, opts, mentions }) => { },
            executeServer: ({ player, opts, mentions, mentionsLiteral }) => {
                if (!setGameOptionInMentions(player, mentions, mentionsLiteral, "pistolrpg", opts, ctx.room.gameOptions.plugins)) {
                    player.client.commandFeedback(`Use a group mention like @a to set this option.`);
                };
            }
        });
    },

    canJump(data) {
        var ctx = data.this;
        var canJump = data.canJump;

        if (ctx.gameOptions.plugins.infinijump[ctx.team]) {
            canJump[0] = true
        };
    },
};

if (isClient) LegacyShellCorePlugin.registerListeners(plugins);