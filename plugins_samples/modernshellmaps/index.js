//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: samplecommand
//

export const PluginMeta = {
    identifier: "modernshellmaps",
    name: 'Modern Shell Maps',
    author: 'onlypuppy7',
    version: '1.0.0',
    descriptionShort: 'Adds maps back from current shell!', //displayed when loading
    descriptionLong: 'Adds maps back from current shell!',
    legacyShellVersion: 335, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;


        this.plugins.on('services:initTablesMaps', this.initTablesMaps.bind(this));
    };

    async initTablesMaps(data) { //async operation requires awaits to ensure proper order
        await data.ss.recs.insertMaps(path.join(this.thisDir, 'maps'));
    };
};