//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: samplecommand
//

export const PluginMeta = {
    identifier: "vaporwaveblocks",
    name: 'Vaporwave Map Blocks',
    author: 'onlypuppy7',
    version: '1.0.0',
    descriptionShort: 'Adds map block models in a vaporwave style!', //displayed when loading
    descriptionLong: 'Adds map block models in a vaporwave style!',
    legacyShellVersion: 323, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;

        this.plugins.on('client:prepareBabylon', this.prepareBabylon.bind(this));
        this.plugins.on('game:prepareBabylon', this.prepareBabylon.bind(this));

        this.plugins.on('services:initTablesMaps', this.initTablesMaps.bind(this));
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
                    overwrite: true,
                    location: PluginMeta.identifier,
                });
            };
        };
    };
    
    async initTablesMaps(data) {
        await data.ss.recs.insertMaps(path.join(this.thisDir, 'maps')); //hopefully avoid the annoying startup crash
    };
};