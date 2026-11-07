//basic
import path from 'node:path';
//

//NOTE! this plugin is VIBECODED.
export const PluginMeta = {
    identifier: "francium",
    name: 'Francium',
    author: 'onlypuppy7 (+Codex)',
    version: '1.7.2',
    descriptionShort: 'Cuts rendering work and simplifies map visuals.',
    descriptionLong: 'Filters meshes per camera, simplifies map visuals, suppresses redundant HUD writes, skips empty sprites, prepares shader variants, indexes material users and runs a scripted local benchmark.',
    legacyShellVersion: 677,
};

export class Plugin {
    constructor(plugins, thisDir) {
        if (plugins.type !== "client") return;
        this.thisDir = thisDir;
        plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));
        plugins.on('client:replacementsBefore', this.replacementsBefore.bind(this));
    };

    pluginSourceInsertion(data) {
        ['hud.js', 'materials.js', 'particles.js', 'warmup.js', 'map.js', 'scenario.js', 'benchmark.js', 'client.js'].forEach(file => {
            data.pluginInsertion.files.push({
                filepath: path.join(this.thisDir, file),
                position: file === 'hud.js' ? 'beforebefore' : 'before'
            });
        });
    };

    replacementsBefore(data) {
        const replacement = data.replacementsBefore.find(item => item.pattern.source === 'LEGACYSHELLPLUGINSBEFORE');
        if (!replacement) return;
        const loop = /const loop = \(\) => \{\s*this\.update\(\);\s*requestAnimationFrame\(loop\);\s*\};\s*requestAnimationFrame\(loop\);/g;
        if ((replacement.insertion.match(loop) || []).length === 1) {
            replacement.insertion = replacement.insertion.replace(loop, 'FranciumHud.watchDebug(this);');
        };
    };
};
