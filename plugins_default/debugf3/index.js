//basic
import path from 'node:path';
//plugin: debugf3
//

export const PluginMeta = {
    identifier: "debugf3",
    name: 'Debug F3',
    author: 'onlypuppy7 (+Claude)', //NOTE! this plugin is VIBECODED.
    version: '1.0.1',
    descriptionShort: 'Minecraft style F3 debug screen', //displayed when loading
    descriptionLong: 'Press F3 in game for a Minecraft style debug overlay: fps, ping, coordinates, facing, targeted block, memory and graphics info.',
    legacyShellVersion: 654, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;

        this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));
    };

    pluginSourceInsertion(data) {
        data.pluginInsertion.files.push({
            insertBefore: '\nconsole.log("inserting before... (DebugF3)");',
            filepath: path.join(this.thisDir, 'client.js'),
            insertAfter: '\nconsole.log("inserting after... (DebugF3)!");',
            position: 'before'
        });
    };
};
