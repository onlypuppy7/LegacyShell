//legacyshell: basic
import { isClient, isServer } from "#constants";
import Comm from "#comm";
import { Rocket } from "#bullets";
import { RPEGG } from "#guns";
//legacyshell: plugins
import { plugins } from '#plugins';
import { setGameOptionInMentions } from "#permissions";
//

export const HealthPackItem = {
    registerListeners: function (pluginManager) {
        console.log("registering listeners... (HealthPackItem)");

        this.plugins = pluginManager;

        this.plugins.on('game:onMapComplete', this.onMapComplete.bind(this));
        this.plugins.on('game:AllItems', this.AllItems.bind(this));
    },

    onMapComplete(data) {
        var gameScene = data.gameScene;

        gameScene.getMeshByName("healthpack").material = gameScene.getMaterialByName("standardInstanced");
        gameScene.getMeshByName("healthpack.alt").material = gameScene.getMaterialByName("standardInstanced");
    },

    AllItems(data) {
        var AllItems = data.AllItems;

        AllItems.push({
            codeName: "HEALTH",
            mesh: "healthpack.alt", //add or remove ".alt" to change colour scheme
            name: "Health Pack",
            actor: data.ItemActor,
            poolSize: 50,
            collect: function (player, applyToWeaponIdx) {
                if (player.hp === 100) return false
                if (isServer) {
                    player.heal(50);
                };
                return true;
            }
        });
    },
};

if (isClient) HealthPackItem.registerListeners(plugins);