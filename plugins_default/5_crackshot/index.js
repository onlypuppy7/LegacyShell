//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: crackshot
import Comm from '#comm';
import { devlog } from '#constants';
import { CrackshotPlugin } from './shared.js';
//legacyshell: web server
import express from 'express';
//

export const PluginMeta = {
    identifier: "5_crackshot",
    name: 'Crackshot',
    author: 'onlypuppy7',
    version: '1.0.0',
    descriptionShort: 'Adds 0.20.0\'s Crackshot into the game. The 5 is for ordering.', //displayed when loading
    descriptionLong: 'Adds 0.20.0\'s Crackshot into the game. The 5 is for ordering.',
    legacyShellVersion: 498, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;

        CrackshotPlugin.registerListeners(this.plugins);

        this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));
        this.plugins.on('client:onStartServer', this.onStartServer.bind(this));
        
        this.plugins.on('client:prepareBabylonBefore', this.prepareBabylonBefore.bind(this));
        this.plugins.on('game:prepareBabylonBefore', this.prepareBabylonBefore.bind(this));

        this.plugins.on('client:prepareBabylon', this.prepareBabylon.bind(this));
        this.plugins.on('game:prepareBabylon', this.prepareBabylon.bind(this));

        this.plugins.on('services:initTables', this.initTables.bind(this));

        CrackshotPlugin.constantsFinished();
        CrackshotPlugin.reachedEnd();
    };
    
    async onStartServer(data) {
        let app = data.app;

        app.use(express.static(path.join(this.thisDir, 'client')));
    };
    
    
    async initTables(data) { //async operation requires awaits to ensure proper order
        await data.ss.recs.insertItems(path.join(this.thisDir, 'items'));
    };
    
    pluginSourceInsertion(data) {
        data.pluginInsertion.files.push({
            insertBefore: '\nconsole.log("inserting before... (Crackshot)");',
            filepath: path.join(this.thisDir, 'shared.js'),
            insertAfter: '\nconsole.log("inserting after... (Crackshot)!");',
            position: 'before'
        });
    };

    async prepareBabylonBefore(data) {
        var baseBabylons = data.baseBabylons;

        const babylonPath = path.join(this.thisDir, 'models');
        this.babylonFiles = fs.readdirSync(babylonPath);

        for (var file of this.babylonFiles) {
            if (!baseBabylons.includes(file)) {
                console.log('new model', file, 'from', PluginMeta.identifier);
                baseBabylons.push(file);
            };
        };
    };

    async prepareBabylon(data) {
        var extraBabylons = data.extraBabylons;

        // console.log('prepareBabylon', data.filename);
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