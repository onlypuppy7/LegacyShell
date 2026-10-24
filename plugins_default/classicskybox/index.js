//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: samplecommand
import { ClassicSkyboxPlugin } from './shared.js';
//

export const PluginMeta = {
    identifier: "classicskybox",
    name: 'Classic Skybox',
    author: 'onlypuppy7 (+Claude)', //initial work by onlypuppy7, finished by claude lol
    version: '1.0.1',
    descriptionShort: 'Adds the procedural "classic" and "classic-alpha" skyboxes from early versions', //displayed when loading
    descriptionLong: 'Attempt at readding the skybox and mountains seen in alpha versions',
    legacyShellVersion: 269, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;

        ClassicSkyboxPlugin.registerListeners(this.plugins);
        this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));
        this.plugins.on('client:doReplacements', this.doReplacements.bind(this));
        
        this.plugins.on('client:prepareBabylonBefore', this.prepareBabylonBefore.bind(this));
        this.plugins.on('game:prepareBabylonBefore', this.prepareBabylonBefore.bind(this));

        this.plugins.on('client:prepareBabylon', this.prepareBabylon.bind(this));
        this.plugins.on('game:prepareBabylon', this.prepareBabylon.bind(this));
    };

    doReplacements(data) { //adds the names to the map editor's skybox dropdown
        for (var replacement of data.replacements) {
            if (replacement.pattern?.source !== "LEGACYSHELLSKYBOXES") continue;
            var skyboxes = new Set(JSON.parse(replacement.insertion));
            skyboxes.add("classic").add("classic-alpha");
            replacement.insertion = JSON.stringify([...skyboxes].sort());
        };
    };

    pluginSourceInsertion(data) {
        data.pluginInsertion.files.push({
            insertBefore: '\nconsole.log("inserting before... (ClassicSkyboxPlugin)");',
            filepath: path.join(this.thisDir, 'shared.js'),
            insertAfter: '\nconsole.log("inserting after... (ClassicSkyboxPlugin)!");',
            position: 'before'
        });

        data.pluginInsertion.files.push({
            insertBefore: '\nconsole.log("inserting before... (ClassicSkyboxPlugin)");',
            filepath: path.join(this.thisDir, 'src', 'babylonExtensions.js'),
            insertAfter: '\nconsole.log("inserting after... (ClassicSkyboxPlugin)!");',
            position: 'after'
        });
    };

    async prepareBabylonBefore(data) {
        var baseBabylons = data.baseBabylons;

        const babylonPath = path.join(this.thisDir, 'models');
        this.babylonFiles = fs.readdirSync(babylonPath);

        for (var file of this.babylonFiles) {
            if (!baseBabylons.includes(file)) {
                console.log('new model', file, 'from', PluginMeta.identifier);
                baseBabylons.push(file);
            };
        };
    };

    async prepareBabylon(data) {
        var extraBabylons = data.extraBabylons;

        // console.log('prepareBabylon', data.filename);
        for (const file of this.babylonFiles) {
            if (data.filename + ".babylon" === file) {
                console.log('found', file, 'from', PluginMeta.identifier);
                extraBabylons.push({
                    filepath: path.join(this.thisDir, 'models', file),
                    overwrite: false,
                    location: PluginMeta.identifier,
                });
            };
        };
    };
};