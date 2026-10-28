//this plugin is vibecoded
import path from 'node:path';
import express from 'express';
import { ss } from '#misc';
import { getPublicProfile } from './profiles.js';
import sess from '#sessionManagement';
import { initProfilePreferences, saveProfilePreferences } from './preferences.js';

export const PluginMeta = {
    identifier: "legacyprofiles",
    name: 'LegacyProfiles',
    author: 'onlypuppy7',
    version: '1.0.31',
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
        plugins.on('services:initTables', () => initProfilePreferences(ss.db));
        plugins.on('client:onStartServer', ({ app }) => app.use('/legacyprofiles', express.static(path.join(thisDir, 'client'))));
        plugins.on('client:pluginSourceInsertion', ({ pluginInsertion }) => {
            for (const file of ['ranks.js', 'preview.js', 'client.js']) {
                pluginInsertion.files.push({ filepath: path.join(thisDir, file), position: 'after' });
            };
        });
    };

    async unhandledCommand({ msg, ws, ip }) {
        if (!['legacyprofilesGet', 'legacyprofilesSave'].includes(msg.cmd)) return;
        this.plugins.cancel = true;
        try {
            let username = msg.username;
            if (msg.cmd === 'legacyprofilesSave') {
                if (typeof msg.session !== 'string' || !msg.session) throw new Error('Sign in to edit your profile.');
                const session = await sess.retrieveSession(msg.session, ip, false);
                if (!session) throw new Error('Your session expired. Please sign in again.');
                username = saveProfilePreferences(ss.db, session.user_id, msg.preferences);
            };
            const profile = await getPublicProfile(ss, username);
            ws.send(JSON.stringify({ legacyprofiles: profile, error: profile ? undefined : 'Player not found.' }));
        } catch (error) {
            console.error('LegacyProfiles:', error);
            ws.send(JSON.stringify({ error: msg.cmd === 'legacyprofilesSave' && !error.code ? error.message : 'Could not load this player. Try again in a moment.' }));
        };
    };
};
