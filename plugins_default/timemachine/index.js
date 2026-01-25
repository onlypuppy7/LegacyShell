//basic
import path from 'node:path';
import log from 'puppylog';
import express from 'express';
import fs from 'node:fs';
//

export const PluginMeta = {
    identifier: "timemachine",
    name: 'TimeMachine',
    author: 'onlypuppy7',
    version: '1.0.0-wip',
    descriptionShort: 'Readds old stuff from bygone versions of the game', //displayed when loading
    descriptionLong: 'Readds old stuff from bygone versions of the game',
    legacyShellVersion: 561, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        if (plugins.type !== "client") {
            log.orange(`${PluginMeta.identifier} won't run on this server type.`);
            return;
        };

        pluginInstance = this;

        this.plugins.on('client:onStartServer', this.onStartServer.bind(this));
        this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));
        
        this.plugins.on('client:prepareBabylonBefore', this.prepareBabylonBefore.bind(this));
        this.plugins.on('game:prepareBabylonBefore', this.prepareBabylonBefore.bind(this));

        this.plugins.on('client:prepareBabylon', this.prepareBabylon.bind(this));
        this.plugins.on('game:prepareBabylon', this.prepareBabylon.bind(this));
    };
    
    async onStartServer(data) {
        let app = data.app;

        app.use(express.static(path.join(this.thisDir, 'client')));
    };

    pluginSourceInsertion(data) {
        data.pluginInsertion.files.push({
            insertBefore: `\nconsole.log("inserting before... (${PluginMeta.name})");`,
            filepath: path.join(this.thisDir, 'client.js'),
            insertAfter: `\nconsole.log("inserting after... (${PluginMeta.name})!");`,
            position: 'after'
        });
    };
    
    async prepareBabylonBefore(data) {
        var baseBabylons = data.baseBabylons;

        const babylonPath = path.join(this.thisDir, 'models');
        this.babylonFiles = fs.readdirSync(babylonPath);
        // console.log(PluginMeta.identifier, 'prepareBabylonBefore', babylonPath);

        for (var file of this.babylonFiles) {
            if (!baseBabylons.includes(file)) {
                console.log('new model', file, 'from', PluginMeta.identifier);
                baseBabylons.push(file);
            };
        };
    };

    async prepareBabylon(data) {
        var extraBabylons = data.extraBabylons;

        console.log(PluginMeta.identifier, 'prepareBabylon', data.filename);
        for (const file of this.babylonFiles) {
            if (data.filename + ".babylon" === file) {
                console.log('found', file, 'from', PluginMeta.identifier);
                extraBabylons.push({
                    filepath: path.join(this.thisDir, 'models', file),
                    overwrite: (data.filename === "egg"),
                    location: PluginMeta.identifier,
                });
            };
        };
    };
};