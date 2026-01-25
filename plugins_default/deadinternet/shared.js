//legacyshell: basic
import { CONTROL, isClient, isServer, maxServerSlots } from "#constants";
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
            description: "Spawns some useless bots.",
            example: "1",
            warningText: "Add some test bots to the server.",
            permissionLevel: [ctx.ranksEnum.Moderator, ctx.ranksEnum.Guest, true], //later change to Moderator
            inputType: ["number", 1, 18, 1],
            executeClient: ({ player, opts, mentions }) => { },
            executeServer: async ({ player, opts, mentions }) => {
                // ctx.room.gameOptions.glitchyRoom1 = opts;
                // new ClientConstructor(ctx.room, {
                //     id: maxServerSlots + 1,
                //     nickname: "DeadInternetBot",
                //     wsId: null,
                // });
                for (let i = 0; i < opts; i++) {
                    const bot = new DeadInternetBot(ctx.room, {
                        // useOOBid: true,
                    });

                    await bot.init();

                    bot.player.changeModifiers({
                        speedModifier: Math.getRandomInt(4,6) / 10,
                    });

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
                            bot.control(CONTROL.up);
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
            }
        });
    },
};

if (isClient) DeadInternetPlugin.registerListeners(plugins);