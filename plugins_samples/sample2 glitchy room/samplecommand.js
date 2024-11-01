//legacyshell: basic
import { isClient } from "#constants";
//

export const samplePlugin2 = {
    registerListeners: function (pluginManager) {
        console.log("registering listeners... (sample plugin)");

        this.plugins = pluginManager;

        this.plugins.on('game:startUp', this.startUp.bind(this));
        this.plugins.on('game:permissionsAfterSetup', this.registerSampleCommand.bind(this));
    },
    
    startUp: function (data) { //example of a listener
        console.log("Client started up");
    },
    
    registerSampleCommand: function (data) { //example of command registration
        console.log("registering sample command... (sample plugin)");
        var ctx = data.this;

        ctx.newCommand({
            identifier: "glitchyroom1",
            name: "glitch1",
            category: "room",
            description: "Glitchy room type 1:<br>Random packets every meta loop.",
            example: "true",
            permissionLevel: [ctx.ranksEnum.Moderator, ctx.ranksEnum.Guest, true],
            inputType: ["bool"],
            executeClient: (player, opts, mentions) => { },
            executeServer: (player, opts, mentions) => {
                ctx.room.gameOptions.glitchyRoom1 = opts;
            }
        });

        ctx.newCommand({
            identifier: "glitchyroom2",
            name: "glitch2",
            category: "room",
            description: "Glitchy room type 2:<br>Broken sync packets.",
            example: "true",
            permissionLevel: [ctx.ranksEnum.Moderator, ctx.ranksEnum.Guest, true],
            inputType: ["bool"],
            executeClient: (player, opts, mentions) => { },
            executeServer: (player, opts, mentions) => {
                ctx.room.gameOptions.glitchyRoom2 = opts;
            }
        });
    },
};

if (isClient) samplePlugin2.registerListeners(plugins);