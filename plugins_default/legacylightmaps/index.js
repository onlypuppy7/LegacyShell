//basic
import path from 'node:path';
import { patchLightmapShader } from './shader.js';
//

//NOTE! this plugin is VIBECODED.
export const PluginMeta = {
    identifier: 'legacylightmaps',
    name: 'LegacyLightmaps',
    author: 'onlypuppy7 (+Codex)',
    version: '1.0.1',
    descriptionShort: 'Makes the map editor\'s baked lighting work in game',
    descriptionLong: 'Loads the map editor\'s RGB lightmap exports and offline preview lighting, without shading them twice.',
    legacyShellVersion: 678,
};

function replaceOnce(source, pattern, replacement) {
    if (source.split(pattern).length !== 2) throw new Error('legacylightmaps: source anchor changed: ' + pattern.slice(0, 70));
    return source.replace(pattern, () => replacement);
};

export class Plugin {
    constructor(plugins, thisDir) {
        if (plugins.type !== 'client') return;
        plugins.on('client:pluginSourceInsertion', data => {
            for (var file of ['lightmaps.js', 'client.js']) data.pluginInsertion.files.push({ filepath: path.join(thisDir, file), position: 'after' });
        });
        plugins.on('client:shaderSources', data => patchLightmapShader(data.shaders));
        plugins.on('client:replacementsBefore', data => {
            var anchor = 'mapMesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, m.data.colors);';
            data.code.sourceJs = replaceOnce(data.code.sourceJs, anchor, 'if (!LegacyLightmaps.apply(mapMesh, minMap, m.data.colors)) ' + anchor);
        });
    };
};
