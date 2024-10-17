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
        }

        this.perms = permsConfig.permissions;
        this.rankName = permsConfig.ranks;
        this.ranksEnum = {};

        Object.keys(this.rankName).forEach(i => {
            this.ranksEnum[this.rankName[i]] = Number(i);
        });

        this.commands = {};
        
        new Command(this, {
            name: "announce",
            category: "misc",
            description: "Announces a message to all players.",
            permissionLevel: this.perms.announce || [this.ranksEnum.Moderator, this.ranksEnum.Guest, true],
            executeClient: (opts) => {
                console.log(`Announcement: ${opts}`);
            },
            executeServer: (opts) => {
                // this.ss.broadcast(`Announcement: ${opts}`);
            }
        });
    };
};

class Command {
    constructor(context, { name, category, description, permissionLevel, executeClient, executeServer }) {
        if (!context.commands[category]) context.commands[category] = {};
        context.commands[category][name] = this;
        this.ctx = context; //get room w it or something

        this.name = name;
        this.category = category;
        this.description = description;
        this.permissionLevel = permissionLevel;
        this.executeClient = executeClient; //to execute on the client (immediately)
        this.executeServer = executeServer; //to execute on the server side (when received)
    };

    execute(player, opts) {
        if (this.checkPermissions(player)) {
            if (isClient) {
                this.executeClient(opts);
            } else if (context === 'server') {
                this.executeServer(opts);
            };
        } else {
            console.log("Insufficient permissions for this command.");
        };
    };

    checkPermissions(player) {
        var joinType = isClient ? joinType : this.ctx.room.joinType;
        var isPrivate = joinType !== Comm.Code.joinPrivateGame;
        var isGameOwner = player.isGameOwner;
        console.log(joinType, isPrivate, isGameOwner);
    };
};
