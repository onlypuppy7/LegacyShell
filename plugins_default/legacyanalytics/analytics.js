//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: analytics
import { analDB } from './index.js';
//legacyshell: logging
import log from 'puppylog';
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
        //ROOMS
        await analDB.runQuery(`
        CREATE TABLE IF NOT EXISTS room_counts (
            public INTEGER DEFAULT 0,
            private INTEGER DEFAULT 0,
            both INTEGER DEFAULT 0,

            public_gametypes TEXT DEFAULT "[]",
            private_gametypes TEXT DEFAULT "[]",
            both_gametypes TEXT DEFAULT "[]",

            time INTEGER DEFAULT (strftime('%s', 'now'))
        )
        `);
        await analDB.runQuery(`
        CREATE TABLE IF NOT EXISTS room_playercounts (
            public INTEGER DEFAULT 0,
            private INTEGER DEFAULT 0,
            both INTEGER DEFAULT 0,

            public_gametypes TEXT DEFAULT "[]",
            private_gametypes TEXT DEFAULT "[]",
            both_gametypes TEXT DEFAULT "[]",

            time INTEGER DEFAULT (strftime('%s', 'now'))
        )
        `);
        await analDB.runQuery(`
        CREATE TABLE IF NOT EXISTS room_activerooms (
            rooms TEXT DEFAULT "[]",

            time INTEGER DEFAULT (strftime('%s', 'now'))
        )
        `);
        //PLAYER ACTIONS
        await analDB.runQuery(`
        CREATE TABLE IF NOT EXISTS player_logins (
            player_id INTEGER DEFAULT -1,
            time INTEGER DEFAULT (strftime('%s', 'now'))
        )
        `);
        await analDB.runQuery(`
        CREATE TABLE IF NOT EXISTS player_loginfails (
            player_username TEXT DEFAULT "user?",
            error TEXT DEFAULT "error?",
            time INTEGER DEFAULT (strftime('%s', 'now'))
        )
        `);
        await analDB.runQuery(`
        CREATE TABLE IF NOT EXISTS player_tokenlogins (
            player_id INTEGER DEFAULT -1,
            time INTEGER DEFAULT (strftime('%s', 'now'))
        )
        `);
        await analDB.runQuery(`
        CREATE TABLE IF NOT EXISTS player_registers (
            player_id INTEGER DEFAULT -1,
            username TEXT DEFAULT "user?",
            time INTEGER DEFAULT (strftime('%s', 'now'))
        )
        `);
        await analDB.runQuery(`
        CREATE TABLE IF NOT EXISTS player_registerfails (
            username TEXT DEFAULT "user?",
            error TEXT DEFAULT "error?",
            time INTEGER DEFAULT (strftime('%s', 'now'))
        )
        `);
        await analDB.runQuery(`
        CREATE TABLE IF NOT EXISTS player_vipredeems (
            player_id INTEGER DEFAULT -1,
            username TEXT DEFAULT "user?",
            time INTEGER DEFAULT (strftime('%s', 'now'))
        )
        `);
        await analDB.runQuery(`
        CREATE TABLE IF NOT EXISTS player_kills (
            player_id INTEGER DEFAULT -1,
            kills INTEGER DEFAULT 1,
            time INTEGER DEFAULT (strftime('%s', 'now'))
        )
        `);
        await analDB.runQuery(`
        CREATE TABLE IF NOT EXISTS player_deaths (
            player_id INTEGER DEFAULT -1,
            deaths INTEGER DEFAULT 1,
            time INTEGER DEFAULT (strftime('%s', 'now'))
        )
        `);
        await analDB.runQuery(`
        CREATE TABLE IF NOT EXISTS player_feedbacks (
            feedback TEXT DEFAULT "feedback?",
            time INTEGER DEFAULT (strftime('%s', 'now'))
        )
        `);

        //shop/items
        await analDB.runQuery(`
        CREATE TABLE IF NOT EXISTS item_purchases (
            player_id INTEGER DEFAULT -1,
            item_id INTEGER DEFAULT -1,
            time INTEGER DEFAULT (strftime('%s', 'now'))
        )
        `);
        await analDB.runQuery(`
        CREATE TABLE IF NOT EXISTS item_purchasefails (
            player_id INTEGER DEFAULT -1,
            item_id INTEGER DEFAULT -1,
            buyingResult TEXT DEFAULT "buyingResult?",
            time INTEGER DEFAULT (strftime('%s', 'now'))
        )
        `);
        await analDB.runQuery(`
        CREATE TABLE IF NOT EXISTS item_coderedeems (
            player_id INTEGER DEFAULT -1,
            username TEXT DEFAULT "user?",
            code TEXT DEFAULT "code?",
            time INTEGER DEFAULT (strftime('%s', 'now'))
        )
        `);
        await analDB.runQuery(`
        CREATE TABLE IF NOT EXISTS item_coderedeemfails (
            player_id INTEGER DEFAULT -1,
            username TEXT DEFAULT "user?",
            code TEXT DEFAULT "code?",
            redeemResult TEXT DEFAULT "redeemResult?",
            time INTEGER DEFAULT (strftime('%s', 'now'))
        )
        `);

        log.beige('Initialised analytics tables if needed');
    },
};

export default anal;