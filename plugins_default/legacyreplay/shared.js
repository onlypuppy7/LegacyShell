//legacyshell: replay shared (runs in the game worker and in the browser bundle)
import Comm from "#comm";
import { isClient } from "#constants";
//

export const ReplayShared = {
    chunkSize: 32 * 1024,
    chunkHeaderSize: 9, //u8 code, u16 clipId, u16 idx, u16 count, u16 len

    //the server sets this (recorder.js), the client doesnt need it since the command only does anything server side
    serverClip: null,
    serverRecord: null,
    serverStop: null,

    registerListeners: function (pluginManager) {
        console.log("registering listeners... (legacyreplay)");

        this.plugins = pluginManager;

        this.plugins.on('game:permissionsAfterSetup', this.permissionsAfterSetup.bind(this));
    },

    permissionsAfterSetup: function (data) {
        Comm.Add("replayChunk"); //same trick as legacyweather, both sides add it in the same order
        Comm.Add("replayStatus"); //u8 on, u16 longest it can go in seconds
        Comm.Add("replayLive"); //to a caster: u8 0 + header json, or u8 1 + u8 type + u32 tMs + the record

        var ctx = data.this;

        ctx.newCommand({
            identifier: "clip",
            name: "clip",
            category: "replay",
            description: "Saves the last bit of the game as a replay clip.", //used as /replay clip 30 (commands are /category name)
            example: "30",
            usage: "[seconds (5 to 60, default 30)]",
            permissionLevel: [ctx.ranksEnum.Guest, ctx.ranksEnum.Guest, false], //anyone may run it, public rooms ask for a signed in account when it runs (an ordinary account has rank 0, same as a guest)
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => { },
            executeServer: ({ player, opts, mentions }) => {
                if (ReplayShared.serverClip) ReplayShared.serverClip(ctx.room, player, opts);
            }
        });

        ctx.newCommand({
            identifier: "record",
            name: "record",
            category: "replay",
            description: "Records the whole game from now, /replay stop saves it.",
            permissionLevel: [ctx.ranksEnum.Guest, ctx.ranksEnum.Guest, false],
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => { },
            executeServer: ({ player, opts, mentions }) => {
                if (ReplayShared.serverRecord) ReplayShared.serverRecord(ctx.room, player);
            }
        });

        ctx.newCommand({
            identifier: "replaystop",
            name: "stop",
            category: "replay",
            description: "Stops recording the whole game and saves it.",
            permissionLevel: [ctx.ranksEnum.Guest, ctx.ranksEnum.Guest, false],
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => { },
            executeServer: ({ player, opts, mentions }) => {
                if (ReplayShared.serverStop) ReplayShared.serverStop(ctx.room, player);
            }
        });
    },
};

if (isClient) ReplayShared.registerListeners(plugins);
