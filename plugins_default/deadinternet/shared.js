//legacyshell: basic
import { isClient, isServer, maxServerSlots } from "#constants";
import Comm from "#comm";
//legacyshell: plugins
import { plugins } from '#plugins';
import { setGameOptionInMentions } from "#permissions";
import ClientConstructor from "#client";
import { DeadInternetBot } from "./index.js";
//

export const DeadInternetPlugin = {
    registerListeners: function (pluginManager) {
        console.log("registering listeners... (DeadInternetPlugin)");

        this.plugins = pluginManager;

        this.plugins.on('game:permissionsAfterSetup', this.permissionsAfterSetup.bind(this));
    },
    
    permissionsAfterSetup: function (data) {
        var ctx = data.this;

        ctx.newCommand({
            identifier: "addbot",
            isCheat: true,
            name: "add",
            category: "bots",
            description: "Spawns one useless bot.",
            example: "true",
            warningText: "This command will probably crash your game (however it's harmless).",
            permissionLevel: [ctx.ranksEnum.Moderator, ctx.ranksEnum.Guest, true],
            inputType: ["bool"],
            executeClient: ({ player, opts, mentions }) => { },
            executeServer: async ({ player, opts, mentions }) => {
                // ctx.room.gameOptions.glitchyRoom1 = opts;
                // new ClientConstructor(ctx.room, {
                //     id: maxServerSlots + 1,
                //     nickname: "DeadInternetBot",
                //     wsId: null,
                // });
                const bot = new DeadInternetBot(ctx.room, {
                    // useOOBid: true,
                });

                await bot.init();

                bot.onDeath = () => {
                    setTimeout(() => {
                        bot.respawn();
                    }, 7500);
                };

                bot.onUpdate = async () => {
                    const targetPlayer = bot.getNearestPlayer();
                    // console.log("DeadInternetBot nearest player", targetPlayer?.name);
                    if (targetPlayer) {
                        bot.lookAtPlayer(targetPlayer);
                    }
                };

                let weaponIdx = 1;
                setInterval(() => {
                    // console.log("DeadInternetBot swapping weapon", weaponIdx);
                    bot.player.swapWeapon(weaponIdx);
                    weaponIdx = (weaponIdx + 1) % 2;
                    bot.player.jump();
                }, 10e3);
            }
        });
    },
};

if (isClient) DeadInternetPlugin.registerListeners(plugins);