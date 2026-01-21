//basic
import path from 'node:path';
import log from 'puppylog';
//

export const PluginMeta = {
    identifier: "fancygraphics",
    name: 'FancyGraphics',
    author: 'onlypuppy7',
    version: '1.0.0-wip',
    descriptionShort: 'Readds old stuff and also some new fancy options', //displayed when loading
    descriptionLong: 'Readds old stuff and also some new fancy options',
    legacyShellVersion: 561, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        if (plugins.type !== "client") {
            log.orange(`${PluginMeta.identifier} won't run on this server type.`);
            return;
        };

        pluginInstance = this;

        this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));
    };

    pluginSourceInsertion(data) {
        data.pluginInsertion.files.push({
            insertBefore: `\nconsole.log("inserting before... (${PluginMeta.name})");`,
            filepath: path.join(this.thisDir, 'client.js'),
            insertAfter: `\nconsole.log("inserting after... (${PluginMeta.name})!");`,
            position: 'before'
        });
    };
};