//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: samplecommand
//

export const PluginMeta = {
    identifier: "modernshellhats",
    name: 'Modern Shell Hats',
    author: 'onlypuppy7',
    version: '1.0.0',
    descriptionShort: 'Adds hat models and items from current shell!', //displayed when loading
    descriptionLong: 'Adds hat models and items from current shell!',
    legacyShellVersion: 325, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;

        this.plugins.on('client:prepareBabylon', this.prepareBabylon.bind(this));
        this.plugins.on('game:prepareBabylon', this.prepareBabylon.bind(this));

        this.plugins.on('services:initTables', this.initTables.bind(this));
    };

    async prepareBabylon(data) {
        // console.log('prepareBabylon', data.filename);
        var extraBabylons = data.extraBabylons;

        const babylonPath = path.join(this.thisDir, 'models');
        const babylonFiles = fs.readdirSync(babylonPath);
        for (const file of babylonFiles) {
            if (data.filename + ".babylon" === file) {
                console.log('found', file, 'from', PluginMeta.identifier);
                extraBabylons.push({
                    filepath: path.join(this.thisDir, 'models', file),
                    overwrite: false,
                });
            };
        };
    };

    async initTables(data) { //async operation requires awaits to ensure proper order
        await data.ss.recs.insertItems(path.join(this.thisDir, 'items'));
    };
};