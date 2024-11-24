//legacyshell: basic
import { isClient } from "#constants";
//

export const samplePlugin = {
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
            identifier: "sampletest",
            name: "test",
            category: "sample",
            description: "Test command.",
            example: "just run it",
            permissionLevel: [ctx.ranksEnum.Moderator, ctx.ranksEnum.Guest, true],
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => { },
            executeServer: ({ player, opts, mentions }) => {
                ctx.room.notify("You did it! Woohoo.", 5);
            }
        });
    },
};

if (isClient) samplePlugin.registerListeners(plugins);