//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: crackshot
import Comm from '#comm';
import { devlog } from '#constants';
//legacyshell: web server
import express from 'express';
//

export const PluginMeta = {
    identifier: "zaxoniuscustomguns",
    name: 'Zaxonius Custom Guns',
    author: 'Zaxonius & onlypuppy7',
    version: '1.0.0',
    descriptionShort: 'Adds Zaxonius\' Crackshot into the game.', //displayed when loading
    descriptionLong: 'Adds Zaxonius\' Crackshot into the game.',
    legacyShellVersion: 498, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;
        
        this.plugins.on('client:prepareBabylonBefore', this.prepareBabylonBefore.bind(this));
        this.plugins.on('game:prepareBabylonBefore', this.prepareBabylonBefore.bind(this));

        this.plugins.on('client:prepareBabylon', this.prepareBabylon.bind(this));
        this.plugins.on('game:prepareBabylon', this.prepareBabylon.bind(this));

        this.plugins.on('services:initTables', this.initTables.bind(this));
    };
    
    
    async initTables(data) { //async operation requires awaits to ensure proper order
        await data.ss.recs.insertItems(path.join(this.thisDir, 'items'));
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
                    // overwrite: (data.filename === "egg"),
                    overwrite: true,
                    location: PluginMeta.identifier,
                    attemptFixSkeleton: true,
                });
            };
        };
    };
};