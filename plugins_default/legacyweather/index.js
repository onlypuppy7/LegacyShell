//basic
import path from 'node:path';
//plugin: legacyweather
import { LegacyWeatherPlugin } from './shared.js';
//legacyshell: web server
import express from 'express';
//

export const PluginMeta = {
    identifier: "legacyweather",
    name: 'LegacyWeather',
    author: 'onlypuppy7',
    version: '1.0.0',
    descriptionShort: 'The day/night and rain/storm/snowstorm weather system, plus the /time and weather admin commands.',
    descriptionLong: 'The day/night and rain/storm/snowstorm weather system, plus the /time and weather admin commands. Moved out of core into a plugin - see README.md.',
    legacyShellVersion: 609,
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;

        LegacyWeatherPlugin.registerListeners(this.plugins);
        this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));
        this.plugins.on('client:onStartServer', this.onStartServer.bind(this));
    };

    async onStartServer(data) {
        let app = data.app;

        app.use(express.static(path.join(this.thisDir, 'client')));
    };

    pluginSourceInsertion(data) {
        data.pluginInsertion.files.push({
            insertBefore: '\nconsole.log("inserting before... (LegacyWeather)");',
            filepath: path.join(this.thisDir, 'shared.js'),
            insertAfter: '\nconsole.log("inserting after... (LegacyWeather)!");',
            position: 'before'
        });
    };
};
