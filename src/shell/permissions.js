// legacyshell: permissions
import { isClient } from "#constants";
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
            description: "Announces a message to all players.",
            permissionLevel: this.perms.announce || [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["string"],
            executeClient: (opts) => {
                console.log(`Announcement: ${opts}`);
            },
            executeServer: (opts) => {
                // this.ss.broadcast(`Announcement: ${opts}`);
            }
        });
        new Command(this, {
            name: "limit",
            category: "room",
            description: "Set the max player limit.",
            permissionLevel: this.perms.announce || [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            inputType: ["number", 1, 50, 1],
            executeClient: (opts) => {
                console.log(`setting new player limit: ${opts}`);
            },
            executeServer: (opts) => {
                // this.ss.broadcast(`Announcement: ${opts}`);
            }
        });
    };
};

class Command {
    constructor(context, { name, category, description, permissionLevel, inputType, executeClient, executeServer }) {
        if (!context.cmds[category]) context.cmds[category] = {};
        context.cmds[category][name] = this;
        this.ctx = context; //get room w it or something

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

        console.log(opts);

        if (this.checkPermissions(player)) {
            if (isClient) {
                this.executeClient(opts);
            } else {
                this.executeServer(opts);
            };
        } else {
            console.log("Insufficient permissions for this command.");
        };
    };

    checkPermissions(player) {
        var thisJoinType = isClient ? joinType : this.ctx.room.joinType;
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