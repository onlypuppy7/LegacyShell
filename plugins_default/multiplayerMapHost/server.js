//basic
import fs from 'node:fs';
import path from 'node:path';
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

    this.plugins.on("game:roomBeforeMapBuild", this.beforeMapBuildSub);
    //this.plugins.on('services:initTablesMaps', this.initTablesMaps.bind(this));

  };

  beforeMapBuildSub(event){
    if(event.info.useCustomMap){
      try{
        const customMapP = JSON.parse(event.info.customMap);
        event.this.minMap = customMapP;
      } catch(e){
        console.log(e);
        console.log("err in custom map parsing, looks like we don't go custom.");
      }
    }
  }



};
