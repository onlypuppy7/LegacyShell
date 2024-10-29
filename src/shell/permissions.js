// legacyshell: permissions
import { isClient, maxServerSlots } from "#constants";
import Comm from '#comm';
//

export class PermissionsConstructor {
    constructor(newSS, room) {
        var permsConfig;

        if (isClient) {
            permsConfig = permissions;
        } else {
            this.ss = newSS;
            this.room = room;
            permsConfig = this.ss.permissions;
        };

        this.perms = permsConfig.permissions;
        this.rankName = permsConfig.ranks;
        this.ranksEnum = {};

        Object.keys(this.rankName).forEach(i => {
            this.ranksEnum[this.rankName[i]] = Number(i);
        });

        this.cmds = {};
        this.cmdsByIdentifier = {};
        
        //misc
        new Command(this, {
            identifier: "announce",
            name: "announce",
            category: "misc",
            description: "Announces a message to all players across all games.",
            example: "WASSUP",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Moderator, false],
            inputType: ["string"],
            executeClient: (player, opts) => {
                console.log(`Announcement: ${opts}`);
            },
            executeServer: (player, opts) => {
                // this.room(`Announcement: ${opts}`);
            }
        });
        new Command(this, {
            identifier: "notify",
            name: "notify",
            category: "misc",
            description: "Announces a message to all players.",
            example: "wassup",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["string"],
            executeClient: (player, opts) => {
                console.log(`notifying rn: ${opts}`);
            },
            executeServer: (player, opts) => {
                this.room.notify(opts, 5);
                // this.room(`Announcement: ${opts}`);
            }
        });
        new Command(this, {
            identifier: "scaleMe",
            name: "scaleMe",
            category: "misc",
            description: "Sets scaling for your egg.",
            example: "1.5",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["number", 0.1, 25, 0.1],
            executeClient: (player, opts) => {
                me.changeScale(opts);
            },
            executeServer: (player, opts) => {
                player.changeScale(opts);
            }
        });

        //mod
        new Command(this, {
            identifier: "boot",
            name: "boot",
            category: "mod",
            description: "Boot problematic players.",
            example: "@onlypuppy7",
            autocomplete: "@",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["number", 0, maxServerSlots - 1, 1],
            executeClient: (player, opts) => {
                var player = players[opts];
                if (player) {
                    bootPlayer(player.id, player.uniqueId);
                    devlog(`booting player: ${opts}`);
                };
            },
            executeServer: (player, opts) => { }
        });

        //room
        new Command(this, {
            identifier: "roomLimit",
            name: "limit",
            category: "room",
            description: "Set the max player limit.",
            example: "18",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["number", 1, maxServerSlots, 1],
            executeClient: (player, opts) => {
                devlog(`setting new player limit: ${opts}`);
            },
            executeServer: (player, opts) => {
                this.room.playerLimit = opts;
                this.room.updateRoomDetails();
                this.room.notify(`Player limit has been set to: ${opts}`, 5);
            }
        });
        new Command(this, {
            identifier: "warp",
            name: "warp",
            category: "room",
            description: "Change to another room.",
            example: "0SXLLS",
            permissionLevel: [this.ranksEnum.Guest, this.ranksEnum.Guest, false],
            inputType: ["string"],
            executeClient: (player, opts) => {
                if (opts.length > 5) joinGame(opts);
            },
            executeServer: (player, opts) => { }
        });
        new Command(this, {
            identifier: "warpall",
            name: "warpall",
            category: "room",
            description: "Transfer all players to another room.",
            example: "0SXLLS",
            permissionLevel: [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["string"],
            executeClient: (player, opts) => { },
            executeServer: (player, opts) => {
                if (opts.length > 5) {
                    var output = new Comm.Out();
                    output.packInt8U(Comm.Code.warp);
                    output.packString(opts);
                    this.room.sendToAll(output, "warp");
                };
            }
        });
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
    constructor(context, { identifier, name, category, description, example, usage, autocomplete, permissionLevel, inputType, executeClient, executeServer }) {
        if (!context.cmds[category]) context.cmds[category] = {};
        context.cmds[category][name] = this;
        context.cmdsByIdentifier[identifier] = this;

        this.ctx = context; //get room w it or something
        this.room = this.ctx.room;

        this.ctx.cmds = alphabetiseObjectKeys(this.ctx.cmds); //nyes
        this.ctx.cmds[category] = alphabetiseObjectKeys(this.ctx.cmds[category]);

        this.identifier = identifier;
        this.name = name;
        this.category = category;
        this.description = description;
        this.example = example;
        this.autocomplete = autocomplete || "";

        var generatedUsage;
        if (inputType[0] == "string") {
            generatedUsage = "string";
        } else if (inputType[0] == "bool") {
            generatedUsage = "true/false";
        } else if (inputType[0] == "number") {
            generatedUsage = `number (${inputType[1]}-${inputType[2]}, step ${inputType[3]})`;
        };

        this.usage = usage || generatedUsage;
        this.permissionLevel = this?.ctx?.perms?.cmds[identifier] || permissionLevel;
        this.inputType = inputType;
        this.executeClient = executeClient; //to execute on the client (immediately)
        this.executeServer = executeServer; //to execute on the server side (when received)
    };

    execute(player, opts) {
        switch (this.inputType[0]) {
            case "string": //leave as is
                break;
            case "bool": //its a bool
                opts = !!opts;
                break;
            case "number": //["number", min, max, step]
                opts = formatNumber(opts, this.inputType);
                break;
            default:
                break;
        };

        // console.log(opts);

        var permitted = this.checkPermissions(player);

        if (permitted) {
            if (isClient) {
                this.executeClient(player, opts);
            } else {
                this.executeServer(player, opts);
            };
        } else if (isClient) {
            addChat("Insufficient permissions.", null, Comm.Chat.cmd);
        } else {
            var output = new Comm.Out();
            this.room.packChat(output, "Insufficient permissions (yes, really!)", 255, Comm.Chat.cmd);
            player.client.sendToMe(output, "chat");
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