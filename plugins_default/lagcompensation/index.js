//this plugin is vibecoded
import { wrapShots, listen } from './lagcomp.js';

export const PluginMeta = {
    identifier: 'lagcompensation',
    name: 'LagCompensation',
    author: 'onlypuppy7 (+Claude)',
    version: '1.0.1',
    descriptionShort: 'Shots are checked against where you saw them, not where they are now',
    descriptionLong: 'Rewinds the players a laggy shooter can hit to where they were on the shooter\'s screen when they fired, based on their ping. Capped so nobody can reach too far back. Tweak per room with gameOptions.plugins.lagcomp.',
    legacyShellVersion: 673,
};

export class Plugin {
    constructor(plugins, thisDir) {
        if (plugins.type !== 'game') return;
        wrapShots();
        listen(plugins);
    };
};
