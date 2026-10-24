//legacyshell: basic
import { devlog, isClient, isServer, iteratePlayers } from "#constants";
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

        this.plugins.on('game:LegacyShellOnMessage', this.LegacyShellOnMessage.bind(this));
        this.plugins.on('game:clientGameJoinedExtraInfos', this.clientGameJoinedExtraInfos.bind(this));
        this.plugins.on('game:clientOnExtraGameInfo', this.clientOnExtraGameInfo.bind(this));
        this.plugins.on('game:onPageLoadedEnd', this.onPageLoadedEnd.bind(this));
    },

    eggColors: {}, //client: colours that came before their player did

    //server: sets a player's egg to an exact rgb (0-255), no arguments goes back to their loadout colour
    setEggColor: function (player, r, g, b) {
        var reset = r === undefined;
        player.eggColor = reset ? null : [r, g, b];

        var output = new Comm.Out();
        output.packInt8U(Comm.Code.setEggColor);
        output.packInt8U(player.id);
        output.packInt8U(reset ? 0 : 1);
        output.packInt8U(reset ? 0 : r);
        output.packInt8U(reset ? 0 : g);
        output.packInt8U(reset ? 0 : b);
        player.client.room.sendToAll(output, null, "setEggColor");
    },

    applyEggColor(id, rgb) {
        var player = players_by_id[id];
        if (!player) return this.eggColors[id] = rgb;
        player.eggColor = rgb;
        if (player.actor) player.actor.setShellColor(player.shellColor);
    },

    LegacyShellOnMessage(data) {
        if (isServer) return;
        if (data.cmd !== Comm.Code.setEggColor) return;
        var input = data.input;
        var id = input.unPackInt8U();
        var set = input.unPackInt8U();
        var rgb = [input.unPackInt8U(), input.unPackInt8U(), input.unPackInt8U()];
        this.applyEggColor(id, set ? rgb : null);
        plugins.cancel = true;
    },

    clientGameJoinedExtraInfos(data) {
        var colors = {};
        iteratePlayers((player) => { if (player.eggColor) colors[player.id] = player.eggColor });
        if (Object.keys(colors).length) data.extraInfo.eggColors = colors;
    },

    clientOnExtraGameInfo(data) {
        var colors = data.extraInfo.eggColors || {};
        for (var id in colors) this.applyEggColor(Number(id), colors[id]);
    },

    onPageLoadedEnd() {
        if (!isClient || this.eggColorPatched) return;
        this.eggColorPatched = true;

        var setShellColor = PlayerActor.prototype.setShellColor;
        PlayerActor.prototype.setShellColor = function () {
            var result = setShellColor.apply(this, arguments);
            var player = this.player;
            if (LegacyShellCorePlugin.eggColors[player.id]) {
                player.eggColor = LegacyShellCorePlugin.eggColors[player.id];
                delete LegacyShellCorePlugin.eggColors[player.id];
            };
            if (player.eggColor) {
                var color = new BABYLON.Color3(player.eggColor[0] / 255, player.eggColor[1] / 255, player.eggColor[2] / 255);
                this.bodyMesh.colorMult = color;
                this.hands.colorMult = color;
            };
            return result;
        };
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
                plugins: { //legacyweather's state - a thunderstorm at night
                    weather: {
                        rain: 0.8,
                        storm: 0.8,
                    },
                    time: "night",
                },
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
        Comm.Add("setEggColor");
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