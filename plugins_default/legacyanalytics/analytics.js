//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: analytics
import { analDB } from './index.js';
//legacyshell: logging
import log from '#coloured-logging';
//legacyshell: ss
import { ss } from '#misc';
//

const anal = {
    initDB: async (analDB) => {
        await new Promise((resolve, reject) => {
            analDB.serialize(() => {
                anal.initTables(analDB)
                    .then(resolve)
                    .catch(reject);
            });
        });
    },
    initTables: async (analDB) => {
        //PLAYER ACTIONS
        await analDB.runQuery(`
        CREATE TABLE IF NOT EXISTS player_logins (
            player_id INTEGER PRIMARY KEY DEFAULT -1,
            time INTEGER DEFAULT (strftime('%s', 'now'))
        )
        `);
        await analDB.runQuery(`
        CREATE TABLE IF NOT EXISTS player_registers (
            player_id INTEGER PRIMARY KEY DEFAULT -1,
            username INTEGER DEFAULT -1,
            time INTEGER DEFAULT (strftime('%s', 'now'))
        )
        `);
        await analDB.runQuery(`
        CREATE TABLE IF NOT EXISTS player_kills (
            player_id INTEGER PRIMARY KEY DEFAULT -1,
            kills INTEGER DEFAULT 1,
            time INTEGER DEFAULT (strftime('%s', 'now'))
        )
        `);
        await analDB.runQuery(`
        CREATE TABLE IF NOT EXISTS player_deaths (
            player_id INTEGER PRIMARY KEY DEFAULT -1,
            deaths INTEGER DEFAULT 1,
            time INTEGER DEFAULT (strftime('%s', 'now'))
        )
        `);

        //shop/items
        await analDB.runQuery(`
        CREATE TABLE IF NOT EXISTS shop_purchases (
            player_id INTEGER PRIMARY KEY DEFAULT -1,
            item_id INTEGER DEFAULT -1,
            time INTEGER DEFAULT (strftime('%s', 'now'))
        )
        `);

        log.beige('Initialised analytics tables if needed');
    },
};

export default anal;