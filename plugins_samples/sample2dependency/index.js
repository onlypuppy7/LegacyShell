//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: samplecommand
import { samplePlugin2 } from './samplecommand.js';
//

export const PluginMeta = {
    identifier: "sample2dependency",
    name: '"Essential" Sample Plugin',
    author: 'onlypuppy7',
    version: '1.0.0',
    descriptionShort: 'Very important (real)', //displayed when loading
    descriptionLong: 'Very important (real)',
    legacyShellVersion: 269, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));
        samplePlugin2.registerListeners(this.plugins);
    };

    pluginSourceInsertion(data) {
        data.pluginInsertion.files.push({
            insertBefore: '\nconsole.log("inserting before... (sample2 plugin)");',
            filepath: path.join(this.thisDir, 'samplecommand.js'),
            insertAfter: '\nconsole.log("inserting after... (sample2 plugin)!");',
            position: 'before'
        });
    };
};