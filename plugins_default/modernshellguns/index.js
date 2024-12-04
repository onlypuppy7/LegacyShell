//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: samplecommand
import { devlog } from '#isClientServer';
//

export const PluginMeta = {
    identifier: "modernshellguns",
    name: 'Modern Shell Guns',
    author: 'onlypuppy7',
    version: '1.0.0',
    descriptionShort: 'Adds gun models and items from current shell!', //displayed when loading
    descriptionLong: 'Adds gun models and items from current shell!',
    legacyShellVersion: 356, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;

        this.plugins.on('client:prepareBabylon', this.prepareBabylon.bind(this));
        this.plugins.on('game:prepareBabylon', this.prepareBabylon.bind(this));

        this.plugins.on('client:prepareBabylonExtra', this.prepareBabylonExtra.bind(this));
        this.plugins.on('game:prepareBabylonExtra', this.prepareBabylonExtra.bind(this));

        this.plugins.on('services:initTablesStart', this.initTablesStart.bind(this));
        this.plugins.on('services:initTablesBefore', this.initTablesBefore.bind(this));
    };

    async prepareBabylon(data) {
        // console.log('prepareBabylon', data.filename);
        var extraBabylons = data.extraBabylons;

        const babylonPath = path.join(this.thisDir, 'models');
        const babylonFiles = fs.readdirSync(babylonPath);
        for (const file of babylonFiles) {
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

    async prepareBabylonExtra(data) {
        var extraBabylonData = data.extraBabylonData;
        var item = data.item;
        var filename = data.filename;
        var babylon = data.baseBabylon;  

        // console.log('prepareBabylonExtra', filename, item.location);

        //rename meshes
        if (item.location === PluginMeta.identifier) {
            for (const mesh of extraBabylonData.meshes) {
                var renames = {
                    "gun_eggk47": "gun_eggk47_modern",
                    "gun_dozenGauge": "gun_dozenGauge_modern",
                    "gun_csg1": "gun_csg1_modern",
                    "gun_rpegg": "gun_rpegg_modern",
                    "gun_cluck9mm": "gun_cluck9mm_modern",
                };

                if (renames.hasOwnProperty(mesh.name)) {
                    mesh.name = renames[mesh.name];
                    mesh.id = mesh.name;
                    devlog('renamed', mesh.name);
                };
            };
        };
    };

    async initTablesStart(data) { //this way we force the reinsertion of the default items, allowing us to add in the new items BEFORE the default items hence not overwriting them
        await data.ss.runQuery(`DROP TABLE IF EXISTS items`);
    
        await data.ss.recs.initDB(data.ss.db);
    };

    async initTablesBefore(data) { //async operation requires awaits to ensure proper order
        await data.ss.recs.insertItems(path.join(this.thisDir, 'items'));
    };
};