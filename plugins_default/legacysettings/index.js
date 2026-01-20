//basic
import path from 'node:path';
import { cssTemplate } from './css.js';
import log from 'puppylog';
//

export const PluginMeta = {
    identifier: "legacysettings",
    name: 'LegacySettings',
    author: 'onlypuppy7',
    version: '1.0.0-wip',
    descriptionShort: 'Revamps the existing settings and adds a framework you can build plugins off of', //displayed when loading
    descriptionLong: 'Revamps the existing settings and adds a framework you can build plugins off of',
    legacyShellVersion: 561, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        if (plugins.type !== "client") {
            log.orange(`${PluginMeta.identifier} db won't run on this server type.`);
            return;
        };

        pluginInstance = this;

        this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));
    };

    pluginSourceInsertion(data) {
        data.pluginInsertion.files.push({
            insertBefore: `\nconsole.log("inserting before... (${PluginMeta.name})");\n${cssTemplate}\n`,
            filepath: path.join(this.thisDir, 'client.js'),
            insertAfter: `\nconsole.log("inserting after... (${PluginMeta.name})!");`,
            position: 'beforebefore'
        });
    };
};