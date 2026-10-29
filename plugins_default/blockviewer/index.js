//basic
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
//plugin: blockviewer
//

export const PluginMeta = {
    identifier: 'blockviewer',
    name: 'Block Viewer',
    author: 'onlypuppy7 (+Codex)', //NOTE! this plugin is VIBECODED.
    version: '1.0.6',
    descriptionShort: 'Map editor block and collision viewer',
    descriptionLong: 'Map editor block viewer with collision, stats and read-only Babylon/GLB imports. Client server only.',
    legacyShellVersion: 665,
};

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        if (this.plugins.type !== 'client') return;

        this.plugins.on('client:openBeforeDefault', this.openBeforeDefault.bind(this));
        this.plugins.on('client:replacementsAfter', this.replacementsAfter.bind(this));
    };

    openBeforeDefault(data) {
        data.app.use('/blockviewer', express.static(path.join(this.thisDir, 'client')));
    };

    replacementsAfter(data) {
        data.code.mapEditorJs += '\n' + fs.readFileSync(path.join(this.thisDir, 'client', 'viewer.js'), 'utf8');
        data.code.mapEditorHtmlContent = data.code.mapEditorHtmlContent.replace('</head>',
            '<link rel="stylesheet" href="/blockviewer/viewer.css?v=' + PluginMeta.version + '">\n</head>');
    };
};
