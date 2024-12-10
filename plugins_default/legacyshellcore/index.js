//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: samplecommand
import { LegacyShellCorePlugin } from './shared.js';
import Comm from '#comm';
import { devlog } from '#constants';
//

export const PluginMeta = {
    identifier: "legacyshellcore",
    name: 'LegacyShellCore',
    author: 'onlypuppy7',
    version: '1.0.4',
    descriptionShort: 'Used in the public instance', //displayed when loading
    descriptionLong: 'Used in the public instance',
    legacyShellVersion: 269, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;

        LegacyShellCorePlugin.registerListeners(this.plugins);
        this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));
        
        this.plugins.on('client:prepareBabylonBefore', this.prepareBabylonBefore.bind(this));
        this.plugins.on('game:prepareBabylonBefore', this.prepareBabylonBefore.bind(this));

        this.plugins.on('client:prepareBabylon', this.prepareBabylon.bind(this));
        this.plugins.on('game:prepareBabylon', this.prepareBabylon.bind(this));

        this.plugins.on('client:stampImageDirs', this.stampImageDirs.bind(this));
        this.plugins.on('services:initTables', this.initTables.bind(this));
        this.plugins.on('services:initTablesMaps', this.initTablesMaps.bind(this));

        this.plugins.on('services:eventsInit', this.eventsInit.bind(this));
        
        this.plugins.on('game:metaLoop', this.metaLoopHook.bind(this));
        this.plugins.on('game:clientPackSyncLoop', this.clientPackSyncLoopHook.bind(this));

        this.plugins.on('services:insertMaps', this.insertMaps.bind(this));
    };

    async eventsInit(data) {
        var events = data.events;
        events.push({
            name: '_legacyshellcore',
            start: "01-01",
            duration: "999w",
            data: {
                shop: {
                    perm: [ //items that are always in the shop
                    ], 
                    temp: [ //items that are only in the shop for the duration of the event; functionally the same as perm but is used to denote elsewhere that these items are temporary
                    ],
        
                    tier1pool: [ //one item from this list will be chosen if chance is met
                        "Promotional",
                        "Snek",
                        "Infernal",
                    ],
        
                    tier2pool: [ //one (tier2count) item from this list will always be chosen
                        "Pixel",
                        "Eggwalker",
                        "EggyCash",
                        "Clouds",
                        "Merc",
                        "League",
                    ],
                    tier2count: 3,
        
                    tier3pool: [ //five (tier3count) items from this list will always be chosen
                        "Mobile",
                        "eggyp",
                        "Meme",
                        "Food",
                        "Eggolorian",
                        "StPatricksDay",
                        "Kart",
                        "Sports2",
                        "Mayan",
                        "RaidLand",
                        "Rockstar",
                        "Music",
                        "Galeggsy",
                        "Summer",
                        "Pencil",
                        "Paintbrush",
                        "Drops",
                        "NukeZone",
                        "RotR",
                        "Memphis",
                        "Steampunk",
                        "Rainbow",
                        "Bugs",
                        "Funghi",
                        "Racer",
                        "Pencil2",
                        "Drops2",
                        "Drops3",
                        "Drops4",
                        "Drops5",
                        "Drops6",
                        "Drops7",
                        "Rotten",
                        "Wero",
                        "Sbros",
                    ],
                    tier3count: 8,
                }
            },
        });
    };

    pluginSourceInsertion(data) {
        data.pluginInsertion.files.push({
            insertBefore: '\nconsole.log("inserting before... (LegacyShellCore)");',
            filepath: path.join(this.thisDir, 'shared.js'),
            insertAfter: '\nconsole.log("inserting after... (LegacyShellCore)!");',
            position: 'before'
        });
    };

    async stampImageDirs(data) {
        var stampImageDirs = data.stampImageDirs;

        stampImageDirs.push(
            path.join(this.thisDir, 'stamps')
        );
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

    async initTables(data) { //async operation requires awaits to ensure proper order
        await data.ss.recs.insertItems(path.join(this.thisDir, 'items'));
    };

    async initTablesMaps(data) {
        await data.ss.recs.insertMaps(path.join(this.thisDir, 'maps')); //hopefully avoid the annoying startup crash
    };

    metaLoopHook(data) {
        var ctx = data.this;
        if (ctx.gameOptions.glitchyRoom1) {
            var output = new Comm.Out();
            output.packInt8U(Math.randomInt(0, 40));
            output.packInt8U(Math.randomInt(0, 18));
            output.packInt8U(Math.randomInt(0, 255));
            output.packInt8U(Math.randomInt(0, 255));
            output.packInt8U(Math.randomInt(0, 255));
            output.packInt8U(Math.randomInt(0, 255));
            output.packInt8U(Math.randomInt(0, 255));
            output.packInt8U(Math.randomInt(0, 255));
            output.packInt8U(Math.randomInt(0, 255));
            output.packInt8U(Math.randomInt(0, 255));
            output.packInt8U(Math.randomInt(0, 255));
            output.packInt8U(Math.randomInt(0, 255));
            ctx.sendToAll(output, "glitchedKek");
            ctx.notify("The room has been glitched!");
        };
    };

    clientPackSyncLoopHook(data) {
        var ctx = data.this;
        var state = data.state;
        var output = data.output;

        if (ctx.room.gameOptions.glitchyRoom2) {
            this.plugins.cancel = true;
            output.packInt8U(state.controlKeys);
            output.packInt8U(state.yaw);
            output.packInt8U(state.pitch);
        };
    };

    async insertMaps(data) { //better than modifying the maps directly
        var map = data.map;

        devlog('insertMaps', map.name);

        let hiroshimaMaps = [
            "Ruins",
            // "Shellville", //actually it sucks for hiroshima
            "Shipyard",
        ];

        if (hiroshimaMaps.includes(map.name)) {
            if (map.modes) {
                map.modes.Hiroshima = true;
            } else {
                map.modes = {
                    FFA: true,
                    Teams: true,
                    Hiroshima: true,
                };
            };
        };
    };
};