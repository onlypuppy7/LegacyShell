//legacyshell: basic
import { isClient, isServer } from "#constants";
//legacyshell: plugins
import { plugins } from '#plugins';
//

export const ClassicSkyboxPlugin = {
    registerListeners: function (pluginManager) {
        console.log("registering listeners... (ClassicSkyboxPlugin)");

        this.plugins = pluginManager;
    },
};

if (isClient) ClassicSkyboxPlugin.registerListeners(plugins);