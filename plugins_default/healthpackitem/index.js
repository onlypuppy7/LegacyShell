//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: samplecommand
import { HealthPackItem } from './shared.js';
//

export const PluginMeta = {
    identifier: "healthpackitem",
    name: 'Health Pack Item',
    author: 'onlypuppy7',
    version: '1.0.0',
    descriptionShort: 'Adds a new item type which regains 50hp on collection', //displayed when loading
    descriptionLong: 'Adds a new item type which regains 50hp on collection',
    legacyShellVersion: 324, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;

        HealthPackItem.registerListeners(this.plugins);
        this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));
        this.plugins.on('client:prepareBabylon', this.prepareBabylon.bind(this));
        this.plugins.on('game:prepareBabylon', this.prepareBabylon.bind(this));
    };

    pluginSourceInsertion(data) {
        data.pluginInsertion.files.push({
            insertBefore: '\nconsole.log("inserting before... (HealthPackItem)");',
            filepath: path.join(this.thisDir, 'shared.js'),
            insertAfter: '\nconsole.log("inserting after... (HealthPackItem)!");',
            position: 'before'
        });
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
};