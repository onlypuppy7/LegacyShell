//basic
import path from 'node:path';
//plugin: legacyweather
import { LegacyWeatherPlugin } from './shared.js';
import { patchStandardShader } from './weatherShader.js';
//legacyshell: web server
import express from 'express';
//

export const PluginMeta = {
    identifier: "legacyweather",
    name: 'LegacyWeather',
    author: 'onlypuppy7 (+Claude)', //NOTE! most of this plugin is VIBECODED.
    version: '2.1.0',
    descriptionShort: 'Layered rain/storm/snow weather and time of day, with smooth transitions and /weather and /time commands.',
    descriptionLong: 'Independent rain, storm and snow layers (each a 0-1 intensity or an object of tunable parts), wind and time of day, blended smoothly on the client. See README.md.',
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
        this.plugins.on('client:shaderSources', this.shaderSources.bind(this));
    };

    async onStartServer(data) {
        let app = data.app;

        app.use(express.static(path.join(this.thisDir, 'client')));
    };

    shaderSources(data) {
        patchStandardShader(data.shaders); //wet surfaces, puddles and lightning flash in the shared map/player shader
    };

    pluginSourceInsertion(data) {
        //order matters: state first (pure), then the client renderer, then the shared listeners/commands
        var files = ['weatherState.js', 'render.js', 'shared.js'];
        files.forEach((file, i) => {
            data.pluginInsertion.files.push({
                insertBefore: i === 0 ? `
console.log("inserting before... (LegacyWeather)");` : '',
                filepath: path.join(this.thisDir, file),
                insertAfter: i === files.length - 1 ? `
console.log("inserting after... (LegacyWeather)!");` : '',
                position: 'before'
            });
        });
    };
};
