//this plugin is vibecoded
import path from 'node:path';
import express from 'express';
import { ss } from '#misc';
import { getPublicProfile } from './profiles.js';

export const PluginMeta = {
    identifier: "legacyprofiles",
    name: 'LegacyProfiles',
    author: 'onlypuppy7',
    version: '1.0.5',
    descriptionShort: 'Have a look at who you are cracking',
    descriptionLong: 'Player profiles, loadouts, inventories and stats',
    legacyShellVersion: 561,
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;
        pluginInstance = this;

        plugins.on('services:unhandledCommand', this.unhandledCommand.bind(this));
        plugins.on('client:onStartServer', ({ app }) => app.use('/legacyprofiles', express.static(path.join(thisDir, 'client'))));
        plugins.on('client:pluginSourceInsertion', ({ pluginInsertion }) => {
            for (const file of ['preview.js', 'client.js']) {
                pluginInsertion.files.push({ filepath: path.join(thisDir, file), position: 'after' });
            };
        });
        plugins.on('client:doReplacements', ({ code }) => {
            const anchor = 'openAlertDialog(players_by_id[playerId].name, "", {';
            const insertion = 'if (typeof LegacyProfiles !== "undefined") return LegacyProfiles.openPlayer(playerId, uniqueId);';
            if (code.legacyProfilesInserted) return;
            const start = 'list[i].addEventListener("click", function (playerId, uniqueId, username) {';
            const end = '}(player.id, player.uniqueId, player.username), false);';
            if (![anchor, start, end].every(part => code.sourceJs.includes(part))) throw new Error('LegacyProfiles: player menu insertion point not found');
            //the list is rebuilt a lot, replace the handler rather than piling them up
            code.sourceJs = code.sourceJs.replace(start, 'list[i].onclick = function (playerId, uniqueId, username) {').replace(end, '}(player.id, player.uniqueId, player.username);');
            code.sourceJs = code.sourceJs.replace(anchor, insertion + '\n                ' + anchor);
            code.legacyProfilesInserted = true;
        });
    };

    async unhandledCommand({ msg, ws }) {
        if (msg.cmd !== 'legacyprofilesGet') return;
        this.plugins.cancel = true;
        try {
            const profile = await getPublicProfile(ss, msg.account_id);
            ws.send(JSON.stringify({ legacyprofiles: profile, error: profile ? undefined : 'Player not found.' }));
        } catch (error) {
            console.error('LegacyProfiles:', error);
            ws.send(JSON.stringify({ error: 'Could not load this player. Try again in a moment.' }));
        };
    };
};
