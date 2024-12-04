//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: samplecommand
//

export const PluginMeta = {
    identifier: "itemtooltips",
    name: 'Item ToolTips',
    author: 'onlypuppy7',
    version: '1.0.0',
    descriptionShort: 'Adds tooltips diplaying the name of an item in the shop', //displayed when loading
    descriptionLong: 'Adds tooltips diplaying the name of an item in the shop',
    legacyShellVersion: 374, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;

        this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));
    };

    pluginSourceInsertion(data) {
        data.pluginInsertion.files.push({
            insertBefore: '\nconsole.log("inserting before... (ItemToolTips)");',
            filepath: path.join(this.thisDir, 'client.js'),
            insertAfter: '\nconsole.log("inserting after... (ItemToolTips)!");',
            position: 'before'
        });
    };
};