//basic
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
//plugin: dynamicmapblocks
import { DynamicMapBlocksPlugin } from './shared.js';
import { patchPlatformShader } from './lighting-shader.js';
//

export const PluginMeta = {
    identifier: 'dynamicmapblocks',
    name: 'dynamicmapblocks',
    author: 'onlypuppy7 (+Codex)', //NOTE! this plugin is VIBECODED.
    version: '1.0.0',
    descriptionShort: 'Moving blocks and platforms',
    descriptionLong: 'Shared platform geometry, motion and passenger transport, with block physics editing.',
    legacyShellVersion: 665,
};

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;
        if (plugins.type === 'game') DynamicMapBlocksPlugin.registerListeners(plugins);
        for (var type of ['client', 'game']) plugins.on(type + ':prepareBabylon', data => {
            if (data.filename === 'map') data.extraBabylons.push({
                filepath: path.join(thisDir, 'models', 'map.babylon'), overwrite: false, location: PluginMeta.identifier,
            });
        });
        plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));
        plugins.on('client:replacementsAfter', this.replacementsAfter.bind(this));
        plugins.on('client:shaderSources', data => patchPlatformShader(data.shaders));
        plugins.on('client:openBeforeDefault', data => {
            data.app.get('/dynamicmapblocks/lighting-profile/babylon.js', (req, res) =>
                res.sendFile(path.resolve(this.thisDir, '../../server-client/src/data/babylon.js')));
            data.app.get('/dynamicmapblocks/lighting-profile.js', (req, res) => {
                var root = path.resolve(this.thisDir, '../..');
                var shaders = { vertex: fs.readFileSync(path.join(root, 'src/shaders/standardVertexShader.glsl'), 'utf8'),
                    pixel: fs.readFileSync(path.join(root, 'src/shaders/standardPixelShader.glsl'), 'utf8') };
                patchPlatformShader(shaders);
                var source = ['motion.js', 'geometry.js', 'platforms.js', 'lighting.js', 'render.js', 'lighting-profile.js'].map(file =>
                    fs.readFileSync(path.join(this.thisDir, file), 'utf8').replace(/^import .*;\r?$/gm, '').replace(/^export /gm, '')).join('\n');
                res.type('js').send('(() => { const dmbProfileShaders = ' + JSON.stringify(shaders) + ';\n' + source + '\n})();');
            });
            data.app.use('/dynamicmapblocks', express.static(path.join(thisDir, 'client')));
        });
    };

    pluginSourceInsertion(data) {
        for (var file of ['motion.js', 'geometry.js', 'platforms.js', 'assets.js', 'disk.js', 'lighting.js', 'render.js', 'protocol.js', 'shared.js']) {
            data.pluginInsertion.files.push({ filepath: path.join(this.thisDir, file), position: 'after' });
        };
        for (var file of ['motion.js', 'geometry.js', 'platforms.js', 'disk.js', 'lighting.js', 'render.js', 'editor-state.js', 'guides.js', 'editor.js']) {
            data.pluginInsertion.files.push({ filepath: path.join(this.thisDir, file), position: 'editor' });
        };
    };

    replacementsAfter(data) {
        data.code.mapEditorHtmlContent = data.code.mapEditorHtmlContent.replace('</head>',
            '<link rel="stylesheet" href="/dynamicmapblocks/editor.css?v=' + PluginMeta.version + '">\n</head>');
    };
};
