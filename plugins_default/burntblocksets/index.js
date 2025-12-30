//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: samplecommand
//

export const PluginMeta = {
    identifier: "burntblocksets",
    name: 'Burnt Block Sets',
    author: 'Burnt Apple & onlypuppy7',
    version: '1.0.0',
    descriptionShort: 'Adds custom block sets, created by Burnt Apple', //displayed when loading
    descriptionLong: 'Adds custom block sets, created by Burnt Apple',
    legacyShellVersion: 539, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;

        this.plugins.on('client:prepareBabylon', this.prepareBabylon.bind(this));
        this.plugins.on('game:prepareBabylon', this.prepareBabylon.bind(this));
    };

    async prepareBabylon(data) {
        if (data.filename !== "map") return;

        // console.log('prepareBabylon', data.filename);
        var extraBabylons = data.extraBabylons;

        const babylonPath = path.join(this.thisDir, 'models');
        const babylonFiles = fs.readdirSync(babylonPath);

        console.log({
            dataFilename: data.filename,
            babylonFiles: babylonFiles
        })
        
        for (const file of babylonFiles) {
            if (file.endsWith(".babylon")) {
                console.log('found', file, 'from', PluginMeta.identifier);
                extraBabylons.push({
                    filepath: path.join(this.thisDir, 'models', file),
                    overwrite: true,
                    location: PluginMeta.identifier,
                });
            };
        };
    };
};