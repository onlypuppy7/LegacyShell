//this plugin is vibecoded
import path from 'node:path';
import express from 'express';
import { AchievementService } from './services.js';
import { AchievementGame } from './game.js';

export const PluginMeta = {
    identifier: 'legacyachievements',
    name: 'LegacyAchievements',
    author: 'onlypuppy7',
    version: '1.0.7',
    descriptionShort: 'Get cracking, earn rewards',
    descriptionLong: 'Achievements, profile rewards and a little something for your trouble',
    legacyShellVersion: 661,
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        pluginInstance = this;
        if (plugins.type === 'services') this.service = new AchievementService(plugins);
        if (plugins.type === 'game') this.game = new AchievementGame(plugins);
        plugins.on('client:onStartServer', ({ app }) => app.use('/legacyachievements', express.static(path.join(thisDir, 'client'))));
        plugins.on('client:pluginSourceInsertion', ({ pluginInsertion }) => {
            for (const file of ['definitions.js', 'client.js']) pluginInsertion.files.push({ filepath: path.join(thisDir, file), position: 'after' });
        });
    };
};
