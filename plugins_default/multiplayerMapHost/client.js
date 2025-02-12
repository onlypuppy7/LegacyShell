//legacyshell: basic
import { devlog, isClient, isServer } from "#constants";
import { iterateXYZ } from "#loading";
//legacyshell: plugins
import { plugins } from '#plugins';
//

export const MultiplayerMapHost = {
    registerListeners: function (pluginManager) {
        console.log("registering listeners... (ChristmasEvent)");

        this.plugins = pluginManager;

        this.plugins.on('game:encloseRenderPageFunc', this.encloseRenderPageFunc.bind(this));
        this.plugins.on('game:clearItemButtons', this.clearItemButtons.bind(this));
    },



};

if (isClient) MultiplayerMapHost.registerListeners(plugins);
