//

export const samplePlugin = {
    registerListeners: function (pluginManager) {
        console.log("registering listeners...");

        pluginManager.on('game:startUp', this.startUp.bind(this));
        pluginManager.on('game:permissionsAfterSetup', this.registerSampleCommand.bind(this));
    },
    
    registerSampleCommand: function (data) {
        // console.log(data);
        var thisThis = data.this;

        thisThis.newCommand({
            identifier: "sampletest",
            name: "test",
            category: "sample",
            description: "Test command.",
            example: "just run it",
            permissionLevel: [thisThis.ranksEnum.Moderator, thisThis.ranksEnum.Guest, true],
            inputType: ["string"],
            executeClient: (player, opts, mentions) => { },
            executeServer: (player, opts, mentions) => {
                thisThis.room.notify("You did it! Woohoo.", 5);
            }
        });
    },
    
    startUp: function (data) {
        console.log("Client started up");
    },
};