//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: samplecommand
import { LegacyShellCorePlugin } from './shared.js';
import Comm from '#comm';
//

export const PluginMeta = {
    identifier: "legacyshellcore",
    name: 'LegacyShellCore',
    author: 'onlypuppy7',
    version: '1.0.4',
    descriptionShort: 'Used in the public instance', //displayed when loading
    descriptionLong: 'Used in the public instance',
    legacyShellVersion: 269, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;

        LegacyShellCorePlugin.registerListeners(this.plugins);
        this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));
        
        this.plugins.on('client:prepareBabylon', this.prepareBabylon.bind(this));
        this.plugins.on('game:prepareBabylon', this.prepareBabylon.bind(this));


        this.plugins.on('client:stampImageDirs', this.stampImageDirs.bind(this));
        this.plugins.on('services:initTables', this.initTables.bind(this));
        
        this.plugins.on('game:metaLoop', this.metaLoopHook.bind(this));
        this.plugins.on('game:clientPackSyncLoop', this.clientPackSyncLoopHook.bind(this));
    };

    pluginSourceInsertion(data) {
        data.pluginInsertion.files.push({
            insertBefore: '\nconsole.log("inserting before... (LegacyShellCore)");',
            filepath: path.join(this.thisDir, 'shared.js'),
            insertAfter: '\nconsole.log("inserting after... (LegacyShellCore)!");',
            position: 'before'
        });
    };

    stampImageDirs(data) {
        var stampImageDirs = data.stampImageDirs;

        stampImageDirs.push(
            path.join(this.thisDir, 'stamps')
        );
    };

    async prepareBabylon(data) {
        // console.log('prepareBabylon', data.filename);
        var extraBabylons = data.extraBabylons;

        const babylonPath = path.join(this.thisDir, 'models');
        const babylonFiles = fs.readdirSync(babylonPath);
        for (const file of babylonFiles) {
            if (data.filename + ".babylon" === file) {
                console.log('found', file);
                extraBabylons.push({
                    filepath: path.join(this.thisDir, 'models', file),
                    overwrite: false,
                });
            };
        };
    };

    async initTables(data) { //async operation requires awaits to ensure proper order
        await data.ss.recs.insertItems(path.join(this.thisDir, 'items'));
        await data.ss.recs.insertMaps(path.join(this.thisDir, 'maps'));
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
        var state = data.state;
        var output = data.output;

        if (ctx.room.gameOptions.glitchyRoom2) {
            this.plugins.cancel = true;
            output.packInt8U(state.controlKeys);
            output.packInt8U(state.yaw);
            output.packInt8U(state.pitch);
        };
    };
};