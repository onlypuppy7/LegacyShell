//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: analytics
import anal from './analytics.js';
import sqlite3 from 'sqlite3';
import util from 'node:util';
//legacyshell: logging
import log from '#coloured-logging';
//legacyshell: ss
import { ss } from '#misc';
//legacyshell: plugins
import { plugins } from '#plugins';
//

export const PluginMeta = {
    identifier: "legacyanalytics",
    name: 'LegacyAnalytics',
    author: 'onlypuppy7',
    version: '1.0.0',
    descriptionShort: 'Keeps logs of things so you don\'t have to', //displayed when loading
    descriptionLong: 'Keeps logs of things so you don\'t have to',
    legacyShellVersion: 338, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export var analDB;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;

        if (plugins.type === "services") {
            const analDBpath = path.join(this.thisDir, 'store');
            
            if (!fs.existsSync(analDBpath)) {
                fs.mkdirSync(analDBpath, { recursive: true });
            };
    
            analDB = new sqlite3.Database(path.join(analDBpath, 'LegacyShellAnalytics.db'));
    
            Object.assign(analDB, {
                //db stuff
                runQuery:   util.promisify(analDB.run.bind(analDB)),
                getOne:     util.promisify(analDB.get.bind(analDB)),
                getAll:     util.promisify(analDB.all.bind(analDB)),
            });
    
            anal.initDB(analDB);
        } else {
            log.orange(`${PluginMeta.identifier} won't run on this server type.`);
        };
    };
};