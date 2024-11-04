//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: samplecommand
import { LegacyShellCorePlugin } from './shared.js';
//

export const PluginMeta = {
    name: 'LegacyShellCore',
    author: 'onlypuppy7',
    version: '1.0.3',
    descriptionShort: 'Used in the public instance', //displayed when loading
    descriptionLong: 'Used in the public instance',
    legacyShellVersion: 269, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));
        this.plugins.on('client:prepareBabylon', this.prepareBabylon.bind(this));
        this.plugins.on('services:initTables', this.initTables.bind(this));

        LegacyShellCorePlugin.registerListeners(this.plugins);
    };

    pluginSourceInsertion(data) {
        data.pluginInsertion.files.push({
            insertBefore: '\nconsole.log("inserting before... (LegacyShellCore)");',
            filepath: path.join(this.thisDir, 'shared.js'),
            insertAfter: '\nconsole.log("inserting after... (LegacyShellCore)!");',
            position: 'before'
        });
    };

    prepareBabylon(data) {
        // console.log('prepareBabylon', data.filename);
        var extraBabylons = data.extraBabylons;

        const babylonPath = path.join(this.thisDir, 'models');
        const babylonFiles = fs.readdirSync(babylonPath);
        babylonFiles.forEach((file) => {
            if (data.filename + ".babylon" === file) {
                // console.log('found', file);
                extraBabylons.push({
                    filepath: path.join(this.thisDir, 'models', file),
                    overwrite: false,
                });
            };
        });
    };

    async initTables(data) { //async operation requires awaits to ensure proper order
        await data.ss.recs.insertItems(path.join(this.thisDir, 'items'));
        await data.ss.recs.insertMaps(path.join(this.thisDir, 'maps'));
    };
};