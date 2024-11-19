//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: samplecommand
import { samplePlugin } from './samplecommand.js';
//

export const PluginMeta = {
    identifier: "sample1cmd",
    name: 'Sample Command Plugin',
    author: 'onlypuppy7',
    version: '1.0.0',
    descriptionShort: 'A sample plugin', //displayed when loading
    descriptionLong: 'A sample plugin',
    legacyShellVersion: 266, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export class Plugin {
    constructor(pluginManager, thisDir) {
        this.pluginManager = pluginManager;
        this.thisDir = thisDir;

        pluginManager.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));
        samplePlugin.registerListeners(this.pluginManager);
    };

    pluginSourceInsertion(data) {
        data.pluginInsertion.files.push({
            insertBefore: '\nconsole.log("inserting before... (sample plugin)");',
            filepath: path.join(this.thisDir, 'samplecommand.js'),
            insertAfter: '\nconsole.log("inserting after... (sample plugin)!");',
            position: 'before'
        });
    };
};