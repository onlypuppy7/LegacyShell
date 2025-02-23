// legacyshell: permissions
import { isClient, maxServerSlots, Team } from "#constants";
import Comm from '#comm';
import wsrequest from '#wsrequest';
//legacyshell: ss
import { ss } from '#misc';
//legacyshell: plugins
import { plugins } from '#plugins';
//

//(server-only-start)
//(server-only-end)

export class PermissionsConstructor {
    constructor(room) {
        var permsConfig;

        if (isClient) {
            permsConfig = permissions;
        } else {
            this.room = room;
            permsConfig = ss.permissions;
        };

        this.perms = permsConfig.permissions;
        this.rankName = permsConfig.ranks;
        this.ranksEnum = {};

        Object.keys(this.rankName).forEach(i => {
            this.ranksEnum[this.rankName[i]] = Number(i);
        });

        this.cmds = {};
        this.cmdsByIdentifier = {};
        
        //change
        this.newCommand({
            identifier: "gravity",
            isCheat: true,
            name: "gravity",
            category: "change",
            description: "Sets gravity for players.",
            example: "0.5",
            autocomplete: "@",
            usage: "[@mention] number (-12 to 12, step 0.1)",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["number", -12, 12, 0.1],
            executeClient: ({ player, opts, mentions }) => {
                forEachMentionInMentions(mentions, (player) => {
                    player.changeModifiers({gravityModifier: opts});
                });
            },
            executeServer: ({ player, opts, mentions, mentionsLiteral }) => {
                setGameOptionInMentions(player, mentions, mentionsLiteral, "gravityModifier", opts);
            }
        });
        this.newCommand({
            identifier: "knockback",
            isCheat: true,
            name: "knockback",
            category: "change",
            description: "Sets knockback for players.",
            example: "1",
            autocomplete: "@",
            usage: "[@mention] number (-12 to 12, step 0.1)",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["number", -12, 12, 0.1],
            executeClient: ({ player, opts, mentions }) => {
                forEachMentionInMentions(mentions, (player) => {
                    player.changeModifiers({knockbackModifier: opts});
                });
            },
            executeServer: ({ player, opts, mentions, mentionsLiteral }) => {
                setGameOptionInMentions(player, mentions, mentionsLiteral, "knockbackModifier", opts);
            }
        });
        this.newCommand({
            identifier: "speed",
            isCheat: true,
            name: "speed",
            category: "change",
            description: "Sets speed for players.",
            example: "3",
            autocomplete: "@",
            usage: "[@mention] number (-12 to 12, step 0.1)",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["number", -12, 12, 0.1],
            executeClient: ({ player, opts, mentions }) => {
                forEachMentionInMentions(mentions, (player) => {
                    player.changeModifiers({speedModifier: opts});
                });
            },
            executeServer: ({ player, opts, mentions, mentionsLiteral }) => {
                setGameOptionInMentions(player, mentions, mentionsLiteral, "speedModifier", opts);
            }
        });
        this.newCommand({
            identifier: "regen",
            isCheat: true,
            name: "regen",
            category: "change",
            description: "Sets regen rate for players.",
            example: "0.5",
            autocomplete: "@",
            usage: "[@mention] number (-12 to 12, step 0.1)",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["number", -12, 12, 0.1],
            executeClient: ({ player, opts, mentions }) => {
                forEachMentionInMentions(mentions, (player) => {
                    player.changeModifiers({regenModifier: opts});
                });
            },
            executeServer: ({ player, opts, mentions, mentionsLiteral }) => {
                setGameOptionInMentions(player, mentions, mentionsLiteral, "regenModifier", opts);
            }
        });
        this.newCommand({
            identifier: "damage",
            isCheat: true,
            name: "damage",
            category: "change",
            description: "Sets damage modifiers for players.",
            example: "0.5",
            autocomplete: "@",
            usage: "[@mention] number (-12 to 12, step 0.1)",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["number", -12, 12, 0.1],
            executeClient: ({ player, opts, mentions }) => {
                forEachMentionInMentions(mentions, (player) => {
                    player.changeModifiers({damageModifier: opts});
                });
            },
            executeServer: ({ player, opts, mentions, mentionsLiteral }) => {
                setGameOptionInMentions(player, mentions, mentionsLiteral, "damageModifier", opts);
            }
        });
        this.newCommand({
            identifier: "resistance",
            isCheat: true,
            name: "resistance",
            category: "change",
            description: "Sets resistance modifiers for players.",
            example: "0.5",
            autocomplete: "@",
            usage: "[@mention] number (-12 to 12, step 0.1)",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["number", -12, 12, 0.1],
            executeClient: ({ player, opts, mentions }) => {
                forEachMentionInMentions(mentions, (player) => {
                    player.changeModifiers({resistanceModifier: opts});
                });
            },
            executeServer: ({ player, opts, mentions, mentionsLiteral }) => {
                setGameOptionInMentions(player, mentions, mentionsLiteral, "resistanceModifier", opts);
            }
        });
        this.newCommand({
            identifier: "jumpBoost",
            isCheat: true,
            name: "jumpBoost",
            category: "change",
            description: "Sets jump boost for players.",
            example: "0.5",
            autocomplete: "@",
            usage: "[@mention] number (-12 to 12, step 0.1)",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["number", -12, 12, 0.1],
            executeClient: ({ player, opts, mentions }) => {
                forEachMentionInMentions(mentions, (player) => {
                    player.changeModifiers({jumpBoostModifier: opts});
                });
            },
            executeServer: ({ player, opts, mentions, mentionsLiteral }) => {
                setGameOptionInMentions(player, mentions, mentionsLiteral, "jumpBoostModifier", opts);
            }
        });
        this.newCommand({
            identifier: "scale",
            isCheat: true,
            name: "scale",
            category: "change",
            description: "Sets scaling for players.",
            example: "1.5",
            autocomplete: "@",
            usage: "[@mention] number (0.1 to 25, step 0.1)",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["number", 0.1, 25, 0.1],
            executeClient: ({ player, opts, mentions }) => {
                forEachMentionInMentions(mentions, (player) => {
                    player.changeScale(opts);
                });
            },
            executeServer: ({ player, opts, mentions, mentionsLiteral }) => {
                setGameOptionInMentions(player, mentions, mentionsLiteral, "scale", opts);
            }
        });
        this.newCommand({
            identifier: "lifesteal",
            isCheat: true,
            name: "lifesteal",
            category: "change",
            description: "Multiplier for how much health to give back from damage.",
            example: "@a 1.5 (only use group mentions)",
            autocomplete: "@",
            mentionTypes: {group: true},
            usage: "[@group] number (-10 to 10, step 0.1)",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["number", -10, 10, 0.1],
            executeClient: ({ player, opts, mentions }) => {},
            executeServer: ({ player, opts, mentions, mentionsLiteral }) => {
                if (!setGameOptionInMentions(player, mentions, mentionsLiteral, "lifesteal", opts)) {
                    player.client.commandFeedback(`Use a group mention like @a to set this option.`);
                };
            }
        });

        //admin
        this.newCommand({
            identifier: "announce",
            name: "announce",
            category: "admin",
            description: "Sets the homescreen text.",
            example: "WASSUP",
            permissionLevel: [this.ranksEnum.Admin, this.ranksEnum.Admin, false],
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => {
                console.log(`Announcement: ${opts}`);
            },
            executeServer: ({ player, opts, mentions }) => {
                wsrequest({
                    cmd: "setAnnouncement",
                    announcement: opts,
                }, ss.config.game.services_server, ss.config.game.auth_key);
            }
        });

        //mod
        this.newCommand({
            identifier: "boot",
            name: "boot",
            category: "mod",
            description: "Boot problematic players.",
            example: "@onlypuppy7",
            autocomplete: "@",
            usage: "[@mention] (multiple mentions supported)",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["string"], //0, maxServerSlots - 1, 1
            executeClient: ({ player, opts, mentions }) => {
                forEachMentionInMentions(mentions, (player) => {
                    bootPlayer(player.id, player.username);
                    devlog(`booting player: ${opts}`);
                });
            },
            executeServer: ({ player, opts, mentions }) => { }
        });

        //room
        this.newCommand({
            identifier: "notify",
            name: "notify",
            category: "room",
            description: "Announces a message to all players.",
            example: "wassup",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => {
                console.log(`notifying rn: ${opts}`);
            },
            executeServer: ({ player, opts, mentions }) => {
                // console.log(`notifying rn: ${opts}`);
                this.room.notify(opts, 5);
            }
        });
        this.newCommand({
            identifier: "enableCheats",
            name: "enableCheats",
            category: "room",
            description: "Enable/disable cheats.",
            example: "true",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["bool"],
            executeClient: ({ player, opts, mentions }) => {},
            executeServer: ({ player, opts, mentions }) => {
                if (this.room.gameOptions.cheatsEnabled !== opts) {
                    if (!opts) {
                        player.client.commandFeedback(`Cheats cannot be disabled once enabled.`);
                    } else {
                        this.room.enableCheats();
                        this.room.notify(`Notice: Cheats have been enabled.`, 5);
                    };
                };
            },
        });
        this.newCommand({
            identifier: "roomLimit",
            name: "limit",
            category: "room",
            description: "Set the max player limit.",
            example: "18",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["number", 1, maxServerSlots, 1],
            executeClient: ({ player, opts, mentions }) => {
                devlog(`setting new player limit: ${opts}`);
            },
            executeServer: ({ player, opts, mentions }) => {
                this.room.playerLimit = opts;
                this.room.updateRoomDetails();
                this.room.notify(`Player limit has been set to: ${opts}`, 5);
            }
        });
        this.newCommand({
            identifier: "warp",
            name: "warp",
            category: "room",
            description: "Change to another room.",
            example: "0SXLLS",
            permissionLevel: [this.ranksEnum.Guest, this.ranksEnum.Guest, false],
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => {
                if (opts.length > 5) joinGame(opts);
            },
            executeServer: ({ player, opts, mentions }) => { }
        });
        this.newCommand({
            identifier: "warpall",
            name: "warpall",
            category: "room",
            description: "Transfer all players to another room.",
            example: "0SXLLS",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => { },
            executeServer: ({ player, opts, mentions }) => {
                if (opts.length > 5) {
                    var output = new Comm.Out();
                    output.packInt8U(Comm.Code.warp);
                    output.packString(opts);
                    this.room.sendToAll(output, "warp");
                };
            }
        });
        this.newCommand({
            identifier: "gameoptions",
            name: "gameoptions",
            category: "room",
            description: "View current game options.",
            example: "(no input needed)",
            permissionLevel: [this.ranksEnum.Guest, this.ranksEnum.Guest, false],
            inputType: ["bool"],
            executeClient: ({ player, opts, mentions }) => {},
            executeServer: ({ player, opts, mentions }) => {
                player.client.commandFeedback(JSON.stringify(this.room.gameOptions));
            },
        });
        this.newCommand({
            identifier: "roominfo",
            name: "info",
            category: "room",
            description: "View current room's info.",
            example: "(no input needed)",
            permissionLevel: [this.ranksEnum.Guest, this.ranksEnum.Guest, false],
            inputType: ["bool"],
            executeClient: ({ player, opts, mentions }) => {},
            executeServer: ({ player, opts, mentions }) => {
                player.client.commandFeedback(JSON.stringify({
                    ready: true,
                    playerLimit: this.room.playerLimit,
                    playerCount: this.room.details.count,
                    
                    joinType: this.room.joinType,
                    gameType: this.room.gameType,
                    mapId: this.mapId,
                    gameId: this.room.gameId,
                    gameKey: this.room.gameKey,
                    locked: this.room.locked,
                }).replaceAll(',"',', "'));
            },
        });
        this.newCommand({
            identifier: "lock",
            name: "lock",
            category: "room",
            description: "Prevent any new players from joining your room.",
            example: "true",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["bool"],
            executeClient: ({ player, opts, mentions }) => {},
            executeServer: ({ player, opts, mentions }) => {
                this.room.locked = opts;
                if (opts) {
                    var hasMoved = this.room.joinType !== Comm.Code.createPrivateGame ? " and moved into private pool" : "";
                    this.room.joinType = Comm.Code.createPrivateGame;
                    player.client.commandFeedback(`Room locked${hasMoved}.`);
                } else {
                    player.client.commandFeedback(`Room unlocked.`);
                };
                this.room.updateRoomDetails();
            },
        });
        this.newCommand({
            identifier: "isPublic",
            name: "isPublic",
            category: "room",
            description: "Change this room's visibility.",
            example: "true",
            usage: "true: public, false: private",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Moderator, false],
            inputType: ["bool"],
            executeClient: ({ player, opts, mentions }) => {},
            executeServer: ({ player, opts, mentions }) => {
                if (this.room.locked && opts) {
                    player.client.commandFeedback(`Room locked: can't make public.`);
                } else {
                    this.room.joinType = opts ? Comm.Code.joinPublicGame : Comm.Code.createPrivateGame;
                    if (opts) {
                        player.client.commandFeedback(`Room moved to public pool.`);
                    } else {
                        player.client.commandFeedback(`Room made private/invite only.`);
                    };
                    this.room.updateRoomDetails();
                };
            },
        });

        //rounds
        this.newCommand({
            identifier: "roundsEnable",
            name: "enable",
            category: "rounds",
            description: "Enable/disable rounds.",
            example: "true",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["bool"],
            executeClient: ({ player, opts, mentions }) => {
                var changed = gameOptions.timedGame.enabled != opts;
                gameOptions.timedGame.enabled = opts;
            },
            executeServer: ({ player, opts, mentions }) => {
                this.room.notify(`Rounds have been ${opts ? "enabled" : "disabled"}.`, 5);

                var changed = this.room.gameOptions.timedGame.enabled != opts;
                this.room.gameOptions.timedGame.enabled = opts;

                if (changed) {
                    this.room.endRound();
                    this.room.setRoundTimeout()
                    
                    var output = new Comm.Out();
                    this.room.packRoundUpdate(output);
                    this.room.sendToAll(output, "roundUpdate");
                };
            },
        });
        this.newCommand({
            identifier: "roundsLength",
            name: "length",
            category: "rounds",
            description: "Set the length of rounds in seconds.",
            example: "150 (2.5 mins)\n300 (5 mins)",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["number", 1, 60 * 60, 1],
            executeClient: ({ player, opts, mentions }) => {},
            executeServer: ({ player, opts, mentions }) => {
                if (this.room.gameOptions.timedGame.enabled) {
                    this.room.gameOptions.timedGame.roundLength = opts;
                    this.room.roundLength = opts;
                    
                    var output = new Comm.Out();
                    this.room.packRoundUpdate(output);
                    this.room.sendToAll(output, "roundUpdate");

                    player.client.commandFeedback(`Rounds will now be ${opts} secs long. Use /rounds skip to proceed now.`);
                } else {
                    player.client.commandFeedback(`Rounds are not enabled.`);
                };
            },
        });
        this.newCommand({
            identifier: "roundsSkip",
            name: "skip",
            category: "rounds",
            description: "Skip to the end of this round.",
            example: "(no input needed)",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => {},
            executeServer: ({ player, opts, mentions }) => { 
                if (this.room.gameOptions.timedGame.enabled) {
                    this.room.notify(`Round skipped early...`, 5);
                    this.room.endRound();
                } else {
                    player.client.commandFeedback(`Rounds are not enabled.`);
                };
            },
        });

        //time
        this.newCommand({
            identifier: "timeDay",
            name: "day",
            category: "time",
            description: "Set time to day (default).",
            example: "(no input needed)",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => {},
            executeServer: ({ player, opts, mentions }) => {
                var changed = this.room.gameOptions.time != "day";
                this.room.gameOptions.time = "day";

                if (changed) {
                    this.room.notify(`Time has been updated to day.`, 5);
                    this.room.updateRoomParamsForClients();
                };
            },
        });
        this.newCommand({
            identifier: "timeNight",
            name: "night",
            category: "time",
            description: "Set time to night.",
            example: "(no input needed)",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => {},
            executeServer: ({ player, opts, mentions }) => {
                var changed = this.room.gameOptions.time != "night";
                this.room.gameOptions.time = "night";

                if (changed) {
                    this.room.notify(`Time has been updated to night.`, 5);
                    this.room.updateRoomParamsForClients();
                };
            },
        });

        //weather
        this.newCommand({
            identifier: "rainEnabled",
            name: "rain",
            category: "weather",
            description: "Enable/disable rainy weather.",
            example: "true",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["bool"],
            executeClient: ({ player, opts, mentions }) => {},
            executeServer: ({ player, opts, mentions }) => {
                var changed = this.room.gameOptions.weather.rainEnabled != opts;
                this.room.gameOptions.weather.rainEnabled = opts;

                if (changed) {
                    this.room.notify(`Rain has been ${opts ? "enabled" : "disabled"}.`, 5);
                    this.room.updateRoomParamsForClients();
                };
            },
        });
        this.newCommand({
            identifier: "stormEnabled",
            name: "storm",
            category: "weather",
            description: "Enable/disable stormy weather.",
            example: "true",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["bool"],
            executeClient: ({ player, opts, mentions }) => {},
            executeServer: ({ player, opts, mentions }) => {
                var changed = this.room.gameOptions.weather.stormEnabled != opts;
                this.room.gameOptions.weather.stormEnabled = opts;

                if (changed) {
                    this.room.notify(`Stormy weather has been ${opts ? "enabled" : "disabled"}.`, 5);
                    this.room.updateRoomParamsForClients();
                };
            },
        });
        this.newCommand({
            identifier: "snowStormEnabled",
            name: "snowstorm",
            category: "weather",
            description: "Enable/disable the snowstorm.",
            example: "true",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["bool"],
            executeClient: ({ player, opts, mentions }) => {},
            executeServer: ({ player, opts, mentions }) => {
                var changed = this.room.gameOptions.weather.snowStormEnabled != opts;
                this.room.gameOptions.weather.snowStormEnabled = opts;

                if (changed) {
                    this.room.notify(`Snowstorm has been ${opts ? "enabled" : "disabled"}.`, 5);
                    this.room.updateRoomParamsForClients();
                };
            },
        });


        plugins.emit('permissionsAfterSetup', { this: this });
    };

    newCommand (options) {
        new Command(this, options);
    };

    inputCmd (player, text) {
        // console.log(player, text);

        if (text.startsWith("/")) text = text.replace("/", "");

        var category, name;
        [category, text] = splitFirst(text, " ");
        [name, text] = splitFirst(text, " ");

        return this.parseCmd(player, category, name, text);
    };

    parseCmd (player, category, name, opts) {
        if (this.cmds && this.cmds[category] && this.cmds[category][name]) {
            const cmd = this.cmds[category][name];
            // console.log(opts, cmd);
            return cmd.execute(player, opts);
        };
        return false;
    };

    getAvailableCmds (player) {
        let result = {};
        result.structure = {}
        result.cats = [];

        Object.keys(this.cmds).forEach(cat => {
            var category = this.cmds[cat];
            Object.keys(category).forEach(name => {
                var cmd = category[name];
                if (cmd.checkPermissions(player)) {
                    if (!result.structure[cat]) {
                        result.structure[cat] = [];
                        result.cats.push(cat);
                    };
                    result.structure[cat].push(name);
                };
            });
        });

        return result;
    };

    searchCmd (identifier) {
        return this.cmdsByIdentifier[identifier] || false;
    };

    searchCmdByCategory (category, name) {
        return this.cmds[category] && this.cmds[category][name] || false;
    };

    searchPermission (identifier, player) {
        var cmd = this.searchCmd(identifier);
        return cmd ? cmd.checkPermissions(player) : false;
    };
};

class Command {
    constructor(context, { identifier, isCheat, name, category, description, example, usage, autocomplete, mentionTypes, warningText, permissionLevel, inputType, executeClient, executeServer }) {
        if (!context.cmds[category]) context.cmds[category] = {};
        context.cmds[category][name] = this;
        context.cmdsByIdentifier[identifier] = this;

        this.ctx = context; //get room w it or something
        this.room = this.ctx.room;

        this.ctx.cmds = alphabetiseObjectKeys(this.ctx.cmds); //nyes
        this.ctx.cmds[category] = alphabetiseObjectKeys(this.ctx.cmds[category]);

        this.identifier = identifier;
        this.isCheat = isCheat || false;
        this.name = name;
        this.category = category;
        this.description = description;
        this.example = example;
        this.autocomplete = autocomplete || "";
        this.mentionTypes = mentionTypes || {player: true, group: true};
        this.warningText = warningText || "";
        if (isCheat) {
            if (this.warningText !== "") this.warningText += "<br>";
            this.warningText += "This command is a cheat.";
        };

        var generatedUsage;
        if (inputType[0] == "string") {
            generatedUsage = "string";
        } else if (inputType[0] == "bool") {
            generatedUsage = "true/false";
        } else if (inputType[0] == "number") {
            generatedUsage = `number (${inputType[1]} to ${inputType[2]}, step ${inputType[3]})`;
        };

        this.usage = usage || generatedUsage;
        this.permissionLevel = this?.ctx?.perms?.cmds && this.ctx.perms.cmds[identifier] ? this.ctx.perms.cmds[identifier] : permissionLevel;
        this.inputType = inputType;
        this.executeClient = executeClient; //to execute on the client (immediately)
        this.executeServer = executeServer; //to execute on the server side (when received)
    };

    execute(player, rawInput) {
        var opts = rawInput;
        var parts = rawInput.split(" ");

        opts = parts.filter(part => !part.startsWith("@")).join(" ");

        switch (this.inputType[0]) {
            case "string": //leave as is
                break;
            case "bool": //its a bool
                opts = opts.toLowerCase();
                opts = !(opts.startsWith("f") || opts.startsWith("0"));
                break;
            case "number": //["number", min, max, step]
                opts = formatNumber(opts, this.inputType);
                break;
            default:
                break;
        };

        // console.log(rawInput, opts);

        var permitted = this.checkPermissions(player);

        var thisCheatsEnabled = isClient ? (playOffline || gameOptions.cheatsEnabled) : this.ctx.room.gameOptions.cheatsEnabled;

        if (this.isCheat && !thisCheatsEnabled) {
            permitted = false;
            var text = "Cheats are disabled. Enable them with /room enableCheats true.";
            if (isClient) {
                addChat(text, null, Comm.Chat.cmd);
            } else {
                player.client.commandFeedback(text);
            };
        } else if (permitted) {
            var {mentions, mentionsLiteral} = parseMentions(parts, this, player);

            // console.log(mentions);

            if (isClient) {
                this.executeClient({player, opts, mentions, mentionsLiteral});
            } else {
                this.executeServer({player, opts, mentions, mentionsLiteral});
            };
        } else if (isClient) {
            addChat("Insufficient permissions.", null, Comm.Chat.cmd);
        } else {
            player.client.commandFeedback("Insufficient permissions (yes, really!)");
        };

        return permitted;
    };

    checkPermissions(player) {
        player = player || (isClient && me) || null;

        if (!player) return false;

        var thisJoinType = isClient ? joinType : this.room.joinType;
        var isPrivate = thisJoinType !== Comm.Code.joinPublicGame;
        var isGameOwner = !!player.isGameOwner;
        var adminRoles = player.adminRoles || 0;

        var bypassingPerm = adminRoles >= this.permissionLevel[0];
        var privsPerm     = adminRoles >= this.permissionLevel[1];
        var requireOwner  = this.permissionLevel[2];

        // console.log(thisJoinType, isPrivate, isGameOwner);

        if (bypassingPerm) return true;
        else if (isPrivate && (privsPerm && (requireOwner ? isGameOwner : true))) return true;
        else return false;
    };
};

function formatNumber (input, params) {
    input = Number(input);
    if (typeof(params[1]) == "number") input = Math.max(params[1], input);
    if (typeof(params[2]) == "number") input = Math.min(params[2], input);
    if (typeof(params[3]) == "number") input = Math.round(input / params[3]) * params[3];
    return input;
};

function splitFirst(str, delimiter) {
    const index = str.indexOf(delimiter);
    
    if (index === -1) { //return full if delimiter is borked
        return [str, ''];
    };
    
    const firstPart = str.slice(0, index);
    const rest = str.slice(index + delimiter.length);
    
    return [firstPart, rest];
};

function alphabetiseObjectKeys(obj) {
    return Object.keys(obj).sort().reduce((acc, key) => (acc[key] = obj[key], acc), {});
};

export function forEachMentionInMentions (mentions, callback) {
    mentions.forEach(mention => {
        mention.forEach(player => {
            // console.log(`mentioned: ${player.username}`);
            if (player) callback(player);
        });
    });
};

export function setGameOptionInMentions(player, mentions, mentionsLiteral, key, value, gameOptions) {
    var changed = false;
    var team = player.team;
    var opposingTeam = team == 1 ? 2 : 1;
    var room = player.room;
    gameOptions = gameOptions || room.gameOptions;

    mentionsLiteral.forEach(mentionLiteral => {
        switch (mentionLiteral) {
            case "@a":
                gameOptions[key] = [value, value, value];
                changed = true;
                room.notify(`Game option ${key} has been set to: ${value} for everyone`, 5);
                return; //only one mentionLiteral can be used
            case "@t":
                gameOptions[key][team] = value;
                changed = true;
                room.notify(`Game option ${key} has been set to: ${value} for team ${Team[team]}`, 5);
                return;
            case "@o":
                gameOptions[key][opposingTeam] = value;
                changed = true;
                room.notify(`Game option ${key} has been set to: ${value} for team ${Team[opposingTeam]}`, 5);
                return;
            default:
                break;
        };
    });

    if (changed) {
        room.updateRoomParamsForClients();
    };
    
    if (mentions) {
        forEachMentionInMentions(mentions, (player) => {
            if (player[key] !== undefined) player.changeModifiers({[key]: value});
            player.client.commandFeedback(`Your ${key.replace("Modifier"," modifier")} has been set to: ${value}`);
        });
    };

    return changed;
};

export function parseMentions (parts, context, player) {
    var mentions = [];
    var mentionsLiteral = [];

    var playersList = isClient ? players : context.room.players;
    var mePlayer = isClient ? me : context.player || player;

    if (typeof parts == "string") parts = parts.split(" ");

    parts.forEach(part => {
        if (part.startsWith("@")) {
            // console.log(`mention: ${part}`);
            mentionsLiteral.push(part);
            switch (part) {
                case "@m":
                    mentions.push([mePlayer]);
                    break;
                case "@a":
                    mentions.push(playersList);
                    break;
                case "@t":
                    var mention = [];
                    playersList.forEach(player => {
                        if (player.team == mePlayer.team) mention.push(player);
                    });
                    mentions.push(mention);
                    break;
                case "@o":
                    var mention = [];
                    playersList.forEach(player => {
                        if (player.team != mePlayer.team) mention.push(player);
                    });
                    mentions.push(mention);
                    break;
                default:
                    var username = part.slice(1);
                    playersList.forEach(player => {
                        if (player.username == username) mentions.push([player]);
                    });
                break;
            };
        };
    });

    return {mentions, mentionsLiteral};
};