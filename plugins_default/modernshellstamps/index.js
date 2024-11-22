//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: samplecommand
//

export const PluginMeta = {
    identifier: "modernshellstamps",
    name: 'Modern Shell Stamps',
    author: 'onlypuppy7',
    version: '1.0.0',
    descriptionShort: 'Adds stamps from current shell!', //displayed when loading
    descriptionLong: 'Adds stamps from current shell!',
    legacyShellVersion: 334, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;

        this.plugins.on('client:stampImageDirs', this.stampImageDirs.bind(this));
        this.plugins.on('services:initTables', this.initTables.bind(this));
    };

    async stampImageDirs(data) {
        var stampImageDirs = data.stampImageDirs;

        stampImageDirs.push(
            path.join(this.thisDir, 'stamps')
        );
    };

    async initTables(data) { //async operation requires awaits to ensure proper order
        await data.ss.recs.insertItems(path.join(this.thisDir, 'items'));
    };
};