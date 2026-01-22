import path from 'node:path';
import express from 'express';
//

export const PluginMeta = {
    identifier: "whatsapptheme",
    name: 'WhatsAppTheme',
    author: 'onlypuppy7',
    version: '1.0.0',
    descriptionShort: 'A little demonstration theme', //displayed when loading
    descriptionLong: 'A little demonstration theme',
    legacyShellVersion: 562, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;

        this.plugins.on('client:onStartServer', this.onStartServer.bind(this));
        this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));
    };

    async onStartServer(data) {
        let app = data.app;

        app.use(express.static(path.join(this.thisDir, 'client')));
    };
        
    pluginSourceInsertion(data) {
        data.pluginInsertion.files.push({
            insertBefore: `\nconsole.log("inserting before... (${PluginMeta.name})");\n`,
            filepath: path.join(this.thisDir, 'client.js'),
            insertAfter: `\nconsole.log("inserting after... (${PluginMeta.name})!");`,
            position: 'after'
        });
    };
};