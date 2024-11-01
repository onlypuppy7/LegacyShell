//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: samplecommand
import { samplePlugin2 } from './samplecommand.js';
import Comm from '#comm';
import extendMath from '#math';
//

extendMath(Math);

export const PluginMeta = {
    name: 'Glitchy Room Plugin',
    author: 'onlypuppy7',
    version: '1.0.0',
    descriptionShort: 'Causes intentional weirdness', //displayed when loading
    descriptionLong: 'Causes intentional weirdness',
    legacyShellVersion: 267, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));
        this.plugins.on('game:metaLoop', this.metaLoopHook.bind(this));
        this.plugins.on('game:clientPackSyncLoop', this.clientPackSyncLoopHook.bind(this));
        samplePlugin2.registerListeners(this.plugins);
    };

    pluginSourceInsertion(data) {
        data.pluginInsertion.files.push({
            insertBefore: '\nconsole.log("inserting before... (sample2 plugin)");',
            filepath: path.join(this.thisDir, 'samplecommand.js'),
            insertAfter: '\nconsole.log("inserting after... (sample2 plugin)!");',
            position: 'before'
        });
    };

    metaLoopHook(data) {
        var ctx = data.this;
        if (ctx.gameOptions.glitchyRoom1) {
            var output = new Comm.Out();
            output.packInt8U(Math.randomInt(0, 40));
            output.packInt8U(Math.randomInt(0, 18));
            output.packInt8U(Math.randomInt(0, 255));
            output.packInt8U(Math.randomInt(0, 255));
            output.packInt8U(Math.randomInt(0, 255));
            output.packInt8U(Math.randomInt(0, 255));
            output.packInt8U(Math.randomInt(0, 255));
            output.packInt8U(Math.randomInt(0, 255));
            output.packInt8U(Math.randomInt(0, 255));
            output.packInt8U(Math.randomInt(0, 255));
            output.packInt8U(Math.randomInt(0, 255));
            output.packInt8U(Math.randomInt(0, 255));
            ctx.sendToAll(output, "glitchedKek");
            ctx.notify("The room has been glitched!");
        };
    };

    clientPackSyncLoopHook(data) {
        var ctx = data.this;
        var room = ctx.room;
        var state = data.state;
        var output = data.output;

        if (room.gameOptions.glitchyRoom2) {
            this.plugins.cancel = true;
            output.packInt8U(state.controlKeys);
            output.packInt8U(state.yaw);
            output.packInt8U(state.pitch);
        };
    };
};