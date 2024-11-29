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

var analLogs = true;
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

            this.plugins.on('services:addKill', this.addKill.bind(this));
            this.plugins.on('services:addDeath', this.addDeath.bind(this));
            this.plugins.on('services:validateLoginSuccess', this.validateLoginSuccess.bind(this));
            this.plugins.on('services:validateLoginFail', this.validateLoginFail.bind(this));
            this.plugins.on('services:validateLoginViaAuthTokenSuccess', this.validateLoginViaAuthTokenSuccess.bind(this));
            this.plugins.on('services:validateRegisterSuccess', this.validateRegisterSuccess.bind(this));
            this.plugins.on('services:validateRegisterFail', this.validateRegisterFail.bind(this));
            this.plugins.on('services:feedback', this.feedback.bind(this));
            this.plugins.on('services:buyingResult', this.buyingResult.bind(this));
            this.plugins.on('services:previewResult', this.redeemResult.bind(this));
            this.plugins.on('services:redeemResult', this.redeemResult.bind(this));
            this.plugins.on('services:tokenSuccess', this.tokenSuccess.bind(this));

            this.plugins.on('services:servicesInfoGame', this.servicesInfoGame.bind(this));
        } else {
            log.orange(`${PluginMeta.identifier} db won't run on this server type.`);
        };
    };

    async servicesInfoGame(data) {
        var gameInfo = data.gameInfo;

        // console.log(gameInfo);

        analLogs && log.bgBlue(`analytics: Writing to analDB: Adding game info ${gameInfo}`);

        await analDB.runQuery(`
        INSERT OR IGNORE INTO room_counts (public, private, both, public_gametypes, private_gametypes, both_gametypes) VALUES (?, ?, ?, ?, ?, ?)
        `, gameInfo.roomCountTotal.public, gameInfo.roomCountTotal.private, gameInfo.roomCountTotal.both, JSON.stringify(gameInfo.roomCountPublic), JSON.stringify(gameInfo.roomCountPrivate), JSON.stringify(gameInfo.roomCountBoth));

        await analDB.runQuery(`
        INSERT OR IGNORE INTO room_playercounts (public, private, both, public_gametypes, private_gametypes, both_gametypes) VALUES (?, ?, ?, ?, ?, ?)
        `, gameInfo.playerCountTotal.public, gameInfo.playerCountTotal.private, gameInfo.playerCountTotal.both, JSON.stringify(gameInfo.playerCountPublic), JSON.stringify(gameInfo.playerCountPrivate), JSON.stringify(gameInfo.playerCountBoth));

        await analDB.runQuery(`
        INSERT OR IGNORE INTO room_activerooms (rooms) VALUES (?)
        `, JSON.stringify(gameInfo.rooms));
    };

    async addKill(data) {
        var userData = data.userData;

        analLogs && log.bgBlue(`analytics: Writing to analDB: Adding kill for ${userData.account_id}`);

        await analDB.runQuery(`
        INSERT OR IGNORE INTO player_kills (player_id, kills) VALUES (?, 1)
        `, userData.account_id);
    };

    async addDeath(data) {
        var userData = data.userData;

        analLogs && log.bgBlue(`analytics: Writing to analDB: Adding death for ${userData.account_id}`);

        await analDB.runQuery(`
        INSERT OR IGNORE INTO player_deaths (player_id, deaths) VALUES (?, 1)
        `, userData.account_id);
    };

    async validateLoginSuccess(data) {
        var userData = data.userData;

        analLogs && log.bgBlue(`analytics: Writing to analDB: Adding login success for ${userData.account_id}`);

        await analDB.runQuery(`
        INSERT OR IGNORE INTO player_logins (player_id) VALUES (?)
        `, userData.account_id);
    };

    async validateLoginFail(data) {
        var msg = data.msg;
        var error = data.error;

        analLogs && log.bgBlue(`analytics: Writing to analDB: Adding login fail for ${userData.account_id} ${error}`);

        await analDB.runQuery(`
        INSERT OR IGNORE INTO player_loginfails (player_id, error) VALUES (?, ?)
        `, msg.username, error);
    };

    async validateLoginViaAuthTokenSuccess(data) {
        var userData = data.userData;

        analLogs && log.bgBlue(`analytics: Writing to analDB: Adding login via auth token success for ${userData.account_id}`);

        await analDB.runQuery(`
        INSERT OR IGNORE INTO player_tokenlogins (player_id) VALUES (?)
        `, userData.account_id);
    };

    async validateRegisterSuccess(data) {
        var userData = data.userData;

        analLogs && log.bgBlue(`analytics: Writing to analDB: Adding register success for ${userData.account_id} ${userData.username}`);

        await analDB.runQuery(`
        INSERT OR IGNORE INTO player_registers (player_id, username) VALUES (?, ?)
        `, userData.account_id, userData.username);
    };

    async validateRegisterFail(data) {
        var username = data.username;
        var error = data.error;

        analLogs && log.bgBlue(`analytics: Writing to analDB: Adding register fail for ${username}`);

        await analDB.runQuery(`
        INSERT OR IGNORE INTO player_registerfails (username, error) VALUES (?, ?)
        `, username, error);
    };

    async feedback(data) {
        var feedback = JSON.stringify(data.msg);

        analLogs && log.bgBlue(`analytics: Writing to analDB: Adding feedback ${feedback}`);

        await analDB.runQuery(`
        INSERT OR IGNORE INTO player_feedbacks (feedback) VALUES (?)
        `, feedback);
    };

    async buyingResult(data) {
        var userData = data.userData;
        var buyingResult = data.buyingResult;
        var msg = data.msg;

        analLogs && log.bgBlue(`analytics: Writing to analDB: Adding ${data.EVENT} ${buyingResult} for ${userData.account_id}`);

        if (buyingResult == "SUCCESS") {
            await analDB.runQuery(`
            INSERT OR IGNORE INTO item_purchases (player_id, item_id) VALUES (?, ?)
            `, userData.account_id, msg.item_id);
        } else {
            await analDB.runQuery(`
            INSERT OR IGNORE INTO item_purchasefails (player_id, item_id, buyingResult) VALUES (?, ?, ?)
            `, userData.account_id, msg.item_id, buyingResult);
        };
    };

    async redeemResult(data) { // and previewResult
        var userData = data.userData;
        var redeemResult = data?.redeemResult?.result || data?.canBeUsed || "idk?";
        var msg = data.msg;

        analLogs && log.bgBlue(`analytics: Writing to analDB: Adding ${data.EVENT} ${redeemResult} for ${userData.account_id}`);

        if (redeemResult == "SUCCESS" && data.EVENT !== "services:previewResult") {
            await analDB.runQuery(`
            INSERT OR IGNORE INTO item_coderedeems (player_id, username, code) VALUES (?, ?, ?)
            `, userData.account_id, userData.username, msg.code);
        } else if (redeemResult !== "SUCCESS") {
            await analDB.runQuery(`
            INSERT OR IGNORE INTO item_coderedeemfails (player_id, username, code, redeemResult) VALUES (?, ?, ?, ?)
            `, userData.account_id, userData.username, msg.code, redeemResult);
        };
    };

    async tokenSuccess(data) {
        var userData = data.userData;

        analLogs && log.bgBlue(`analytics: Writing to analDB: Adding vip success for ${userData.account_id}`);

        await analDB.runQuery(`
        INSERT OR IGNORE INTO player_vipredeems (player_id, username) VALUES (?, ?)
        `, userData.account_id, userData.username);
    };
};