//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: samplecommand
import { samplePlugin } from './samplecommand.js'
//

export const PluginMeta = {
    name: 'Glitchy Room',
    version: '1.0.0',
    descriptionShort: 'A sample plugin',
    descriptionLong: 'A sample plugin',
    legacyShellVersion: 264,
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
            insertAfter: '\nconsole.log("inserting after... (sample plugin)!");\nsamplePlugin.registerListeners(plugins);'
        });
    };

    onUnload() {
        console.log('Unloading Plugin');
    };
};