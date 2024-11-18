//legacyshell: basic
import { isClient } from "#constants";
import Comm from "#comm";
//legacyshell: is-thirteen
import is from "is-thirteen";
//

export const samplePlugin2 = {
    registerListeners: function (pluginManager) {
        console.log("registering listeners... (sample2 plugin)");

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
            identifier: "is-thirteen",
            name: "is-thirteen",
            category: "sample",
            description: "Check if a number is thirteen.",
            example: "14",
            permissionLevel: [ctx.ranksEnum.Guest, ctx.ranksEnum.Guest, false],
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => { },
            executeServer: ({ player, opts, mentions }) => {
                var result = is(opts).thirteen();

                // console.log(opts, result);

                player.client.commandFeedback(`That number ${result ? "is" : "isn't"} thirteen.`);
            },
        });
    },
};

if (isClient) samplePlugin2.registerListeners(plugins);