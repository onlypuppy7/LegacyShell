//basic
import path from 'node:path';
import express from 'express';
//plugin: legacyreplay
import { ReplayShared } from './shared.js';
import { Recorder } from './recorder.js';
import { ReplayCast } from './cast.js';
//

export const PluginMeta = {
    identifier: "legacyreplay",
    name: 'LegacyReplay',
    author: 'onlypuppy7 (+Claude)', //NOTE! this plugin is VIBECODED.
    version: '0.2.8',
    descriptionShort: 'Replays, camera angles and highlight reels', //displayed when loading
    descriptionLong: 'Records rooms on the game server, /clip saves the last bit as a replay. See DESIGN.md for where it is going.',
    legacyShellVersion: 656, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;

        ReplayShared.registerListeners(this.plugins);
        if (this.plugins.type === 'game') {
            Recorder.registerListeners(this.plugins);
            ReplayCast.registerListeners(this.plugins);
        };
        if (this.plugins.type === 'services') {
            import('./storage.js').then((m) => m.ReplayStorage.registerListeners(this.plugins));
            import('./signing.js').then((m) => m.ReplaySigning.registerListeners(this.plugins));
            import('./adminStorage.js').then((m) => m.ReplayAdmin.registerListeners(this.plugins));
        };
        this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));
        //a Replays tab in the admin panel, if there is one
        this.plugins.on('client:adminTabs', (data) => data.tabs.push({ script: '/legacyreplay-admin/tab.js' }));
        this.plugins.on('client:onStartServer', (data) => data.app.use('/legacyreplay-admin', express.static(path.join(this.thisDir, 'admin'))));
    };

    pluginSourceInsertion(data) {
        //order matters: the format first (pure), then the shared command, then the client bits that use them
        var files = ['format.js', 'shared.js', 'client.js', 'views.js', 'director.js', 'session.js', 'cameras.js', 'reel.js', 'fx.js', 'audio.js', 'editor.js', 'mux.js', 'hud.js', 'export.js', 'live.js', 'spectate.js', 'viewer.js'];
        files.forEach((file, i) => {
            data.pluginInsertion.files.push({
                insertBefore: i === 0 ? '\nconsole.log("inserting before... (LegacyReplay)");' : '',
                filepath: path.join(this.thisDir, file),
                insertAfter: i === files.length - 1 ? '\nconsole.log("inserting after... (LegacyReplay)!");' : '',
                position: 'before'
            });
        });
    };
};
