//basic
import fs from 'node:fs';
import path from 'node:path';
import { MultiplayerMapHost } from './shared.js';
//plugin: samplecommand
//

export const PluginMeta = {
    identifier: "multiplayermaphost",
    name: 'Minerva',
    author: 'Seqsy & onlypuppy7',
    version: '1.0.0',
    descriptionShort: 'Allows for playtesting of custom maps in multiplayer', //displayed when loading
    descriptionLong: 'Allows for playtesting of custom maps in multiplayer!',
    legacyShellVersion: 335, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;

        this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));

        //MultiplayerMapHost.registerListeners(this.plugins);
        this.plugins.on("game:roomBeforeMapBuild", this.roomBeforeMapBuild);
        // this.plugins.on("game:clientGameJoinedExtraInfos", this.clientGameJoinedExtraInfosSub);
        //this.plugins.on('services:initTablesMaps', this.initTablesMaps.bind(this));
    };

    pluginSourceInsertion(data) { //minor spelling mistake jajaja
        data.pluginInsertion.files.push({
            insertBefore: '\nconsole.log("inserting before... (MultiplayerMapHost)");',
            filepath: path.join(this.thisDir, 'shared.js'),
            insertAfter: '\nconsole.log("inserting after... (MultiplayerMapHost)!");',
            position: 'before'
        });
    };

    clientGameJoinedExtraInfosSub(data) {
        //former logic: send custom map in msg to client
    };

    roomBeforeMapBuild(data) {
        //former logic: tell the game server to use custom minMap as map, overriding old

        const ctx = data.this;

        ctx.acceptCustomMaps = true;
    };
};