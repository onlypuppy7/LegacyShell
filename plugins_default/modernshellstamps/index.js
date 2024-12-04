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

        this.plugins.on('services:initTablesStart', this.initTablesStart.bind(this));
        this.plugins.on('services:initTablesBefore', this.initTablesBefore.bind(this));
    };

    async stampImageDirs(data) {
        var stampImageDirs = data.stampImageDirs;

        stampImageDirs.push(
            path.join(this.thisDir, 'stamps')
        );
    };

    async initTablesStart(data) { //this way we force the reinsertion of the default items, allowing us to add in the new items BEFORE the default items hence not overwriting them
        await data.ss.runQuery(`DROP TABLE IF EXISTS items`);
    
        await data.ss.recs.initDB(data.ss.db);
    };

    async initTablesBefore(data) { //async operation requires awaits to ensure proper order
        await data.ss.recs.insertItems(path.join(this.thisDir, 'items'));
    };
};