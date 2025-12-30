//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: samplecommand
//

export const PluginMeta = {
    identifier: "burntblocksets",
    name: 'Burnt Block Sets',
    author: 'Burnt Apple & onlypuppy7',
    version: '1.0.0',
    descriptionShort: 'Adds custom block sets, created by Burnt Apple', //displayed when loading
    descriptionLong: 'Adds custom block sets, created by Burnt Apple',
    legacyShellVersion: 539, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;

        this.plugins.on('client:prepareBabylon', this.prepareBabylon.bind(this));
        this.plugins.on('game:prepareBabylon', this.prepareBabylon.bind(this));
    };

    async prepareBabylon(data) {
        if (data.filename !== "map") return;

        // console.log('prepareBabylon', data.filename);
        var extraBabylons = data.extraBabylons;

        const babylonPath = path.join(this.thisDir, 'models');
        const babylonFiles = fs.readdirSync(babylonPath);
        
        for (const file of babylonFiles) {
            if (file.endsWith(".babylon")) {
                console.log('found', file, 'from', PluginMeta.identifier);

                //the below is actually fucking useless but i spent like 10 minutes on it so its staying
                /*
                let babylonData = JSON.parse(fs.readFileSync(path.join(this.thisDir, 'models', file), 'utf8'));

                const fileBaseName = file.replace('.babylon', '').replaceAll(' ', '_').toLowerCase();

                const updatedMaterials = {};

                //iterate over all materials and append a tag to differentiate the materials from other plugins
                if (babylonData.materials) {
                    for (const material of babylonData.materials) {
                        const newMaterialName = `${material.name}__${PluginMeta.identifier}__${fileBaseName}`;

                        updatedMaterials[material.name] = newMaterialName;

                        material.name = newMaterialName;
                        material.id = newMaterialName;
                    }
                }

                //iterate over all meshes and update the material names to differentiate them from other plugins
                if (babylonData.meshes) {
                    for (const mesh of babylonData.meshes) {
                        if (mesh.materialId && updatedMaterials[mesh.materialId]) {
                            mesh.materialId = updatedMaterials[mesh.materialId];
                        }
                    }
                }

                */

                extraBabylons.push({
                    filepath: path.join(this.thisDir, 'models', file),
                    overwrite: true,
                    location: PluginMeta.identifier,
                    // babylonData: babylonData,
                });
            };
        };
    };
};