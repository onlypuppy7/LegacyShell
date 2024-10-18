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
        
        new Command(this, {
            name: "announce",
            category: "misc",
            description: "Announces a message to all players across all games.",
            permissionLevel: this.perms.announce || [this.ranksEnum.Moderator, this.ranksEnum.Moderator, false],
            inputType: ["string"],
            executeClient: (opts) => {
                console.log(`Announcement: ${opts}`);
            },
            executeServer: (opts) => {
                // this.room(`Announcement: ${opts}`);
            }
        });
        new Command(this, {
            name: "notify",
            category: "misc",
            description: "Announces a message to all players.",
            permissionLevel: this.perms.notify || [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["string"],
            executeClient: (opts) => {
                console.log(`notifying rn: ${opts}`);
            },
            executeServer: (opts) => {
                this.room.notify(opts, 5);
                // this.room(`Announcement: ${opts}`);
            }
        });
        new Command(this, {
            name: "limit",
            category: "room",
            description: "Set the max player limit.",
            permissionLevel: this.perms.roomlimit || [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["number", 1, maxServerSlots, 1],
            executeClient: (opts) => {
                devlog(`setting new player limit: ${opts}`);
            },
            executeServer: (opts) => {
                this.room.playerLimit = opts;
                this.room.updateRoomDetails();
                this.room.notify(`Player limit has been set to: ${opts}`, 5);
            }
        });
        new Command(this, {
            name: "warp",
            category: "room",
            description: "Change to another room.",
            permissionLevel: this.perms.warp || [this.ranksEnum.Guest, this.ranksEnum.Guest, false],
            inputType: ["string"],
            executeClient: (opts) => {
                if (opts.length > 5) joinGame(opts);
            },
            executeServer: (opts) => { }
        });
        new Command(this, {
            name: "warpall",
            category: "room",
            description: "Transfer all players to another room.",
            permissionLevel: this.perms.warpall || [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["string"],
            executeClient: (opts) => { },
            executeServer: (opts) => {
                if (opts.length > 5) {
                    var output = new Comm.Out();
                    output.packInt8U(Comm.Code.warp);
                    output.packString(opts);
                    this.room.sendToAll(output, "warp");
                };
            }
        });
        new Command(this, {
            name: "boot",
            category: "mod",
            description: "Boot problematic players.",
            permissionLevel: this.perms.boot || [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["number", 0, maxServerSlots - 1, 1],
            executeClient: (opts) => {
                var player = players[opts];
                if (player) {
                    bootPlayer(player.id, player.uniqueId);
                    devlog(`booting player: ${opts}`);
                };
            },
            executeServer: (opts) => { }
        });
    };

    inputCmd (player, text) {
        // console.log(player, text);

        if (text.startsWith("/")) text = text.replace("/", "");

        var category, name;
        [category, text] = splitFirst(text, " ");
        [name, text] = splitFirst(text, " ");

        this.parseCmd(player, category, name, text);
    };

    parseCmd (player, category, name, opts) {
        if (this.cmds && this.cmds[category] && this.cmds[category][name]) {
            const cmd = this.cmds[category][name];
            // console.log(opts, cmd);
            cmd.execute(player, opts);
        };
    };
};

class Command {
    constructor(context, { name, category, description, permissionLevel, inputType, executeClient, executeServer }) {
        if (!context.cmds[category]) context.cmds[category] = {};
        context.cmds[category][name] = this;
        this.ctx = context; //get room w it or something
        this.room = this.ctx.room;

        this.name = name;
        this.category = category;
        this.description = description;
        this.permissionLevel = permissionLevel;
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

        if (this.checkPermissions(player)) {
            if (isClient) {
                this.executeClient(opts);
            } else {
                this.executeServer(opts);
            };
            return true;
        } else if (isClient) {
            addChat("Insufficient permissions.", null, Comm.Chat.cmd);
            return false;
        } else {
            var output = new Comm.Out();
            this.room.packChat(output, "Insufficient permissions (yes, really!)", 255, Comm.Chat.cmd);
            player.client.sendToMe(output, "chat");
            return false;
        };
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