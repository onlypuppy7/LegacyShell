//basic
import fs from 'node:fs';
import path from 'node:path';
import { MultiplayerMapHost } from './client.js';
//plugin: samplecommand
//

export const PluginMeta = {
    identifier: "multiplayermaphost",
    name: 'Minerva',
    author: 'Seqsy',
    version: '0.9.1',
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

        this.plugins.on('client:pluginSourceInsertion', this.onFuckYouInsertion.bind(this));

        //MultiplayerMapHost.registerListeners(this.plugins);
        this.plugins.on("game:roomBeforeMapBuild", this.beforeMapBuildSub);
        this.plugins.on("game:clientGameJoinedExtraInfos", this.clientGameJoinedExtraInfosSub);
        //this.plugins.on('services:initTablesMaps', this.initTablesMaps.bind(this));

    };

    onFuckYouInsertion(data) { //minor spelling mistake jajaja
        data.pluginInsertion.files.push({
            insertBefore: '\nconsole.log("inserting before... (fuck you)");',
            filepath: path.join(this.thisDir, 'client.js'),
            insertAfter: '\nconsole.log("inserting after... (fuck you)!");',
            position: 'before'
        });
    };

    clientGameJoinedExtraInfosSub(event) {
        console.log("received extra info " + event.extraInfo);
        if (event.this.room.useCustomMap) {
            event.extraInfo.useCustomMap = true;
            event.extraInfo.minMap = event.this.room.minMap;
        };
    };

    beforeMapBuildSub(event) {
        console.log("beforeMapBuild");
        console.log(event);
        const extraParams = event.info.extraParams;
        if (extraParams.customMinMap) {
            try {
                const customMapP = extraParams.customMinMap;
                event.this.minMap = customMapP;
                event.this.useCustomMap = true;
                console.log("told room to use custom map. ye. ")
            } catch (e) {
                console.log(e);
                console.log("err in custom map parsing, looks like we don't go custom.");
            };
        };
    };
};