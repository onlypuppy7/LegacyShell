//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: samplecommand
//

export const PluginMeta = {
    identifier: "christmasevent",
    name: 'Christmas Event',
    author: 'onlypuppy7',
    version: '1.0.0',
    descriptionShort: 'Adds stuff for a Christmas event', //displayed when loading
    descriptionLong: 'Adds stuff for a Christmas event',
    legacyShellVersion: 374, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;

        this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));

        this.plugins.on('client:prepareBabylon', this.prepareBabylon.bind(this));
        this.plugins.on('game:prepareBabylon', this.prepareBabylon.bind(this));
        
        this.plugins.on('game:roomInitGameOptions', this.roomInitGameOptions.bind(this));
    };

    pluginSourceInsertion(data) {
        data.pluginInsertion.files.push({
            insertBefore: '\nconsole.log("inserting before... (ChristmasEvent)");',
            filepath: path.join(this.thisDir, 'client.js'),
            insertAfter: '\nconsole.log("inserting after... (ChristmasEvent)!");',
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
                    location: PluginMeta.identifier,
                });
            };
        };
    };

    async roomInitGameOptions(data) {
        if (events.currentArray.includes("christmas")) {
            var ctx = data.this
    
            ctx.gameOptions.weather.snowStormEnabled = true;
        };
    };
};