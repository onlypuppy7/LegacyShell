//basic
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
//legacyshell: basic
import extendMath from '#math';
//legacyshell: database
import sqlite3 from 'sqlite3'; //db
import util from 'node:util';
import crypto from 'node:crypto'; //passwds
//legacyshell: services
import WebSocket, { WebSocketServer } from 'ws';
import rl from '#ratelimit';
import accs from '#accountManagement';
import sess from '#sessionManagement';
import recs from '#recordsManagement';
import backups from '#backups';
//legacyshell: logging
import log from '#coloured-logging';
//legacyshell: ss
import { ss } from '#misc';
//legacyshell: plugins
import { plugins } from '#plugins';
//

//i know its called start, even though it should be the other way round. please excuse this.
//i just didnt want to break old configs for the perpetual wrapper.

export default async function run () {
    var dbPath = path.join(ss.rootDir, 'server-services', 'store', 'LegacyShellData.db');
    var backupPath = path.join(ss.rootDir, 'server-services', 'store', 'backups');
    
    //init db (ooooh! sql! fancy! a REAL database! not a slow json!)
    const db = new sqlite3.Database(dbPath);
    
    Object.assign(ss, {
        requests_cache: {},
        db,
        accs,
        sess,
        recs,
        //db stuff
        runQuery:   util.promisify(db.run.bind(db)),
        getOne:     util.promisify(db.get.bind(db)),
        getAll:     util.promisify(db.all.bind(db)),
        //other paths
        dbPath,
        backupPath
    });
    
    extendMath(Math);
    
    recs.initDB(ss.db);
    
    log.green('Account DB set up! (if it didnt exist already i suppose)');

    plugins.emit('servicesOnLoad', { ss });
    
    //account stuff
    
    setInterval(sess.cleanupExpiredSessions, 1e3 * 60 * (ss.config.services.session_cleanup_interval || 3));
    
    setInterval(backups.createBackup, 1e3 * 60 * 60 * (ss.config.services.backups.interval || 1));
    backups.createBackup();
    
    const initTables = async () => {
        try {
            //ITEMS TABLE
            ss.config.verbose && log.bgCyan("services: Reading from DB: perform outdated items check");
            await recs.performConversionCheck();

            ss.config.verbose && log.bgCyan("services: Reading from DB: count items");
            if ((await ss.getOne('SELECT COUNT(*) AS count FROM items')).count > 0) {
                log.italic('No need to init items table');
            } else {
                log.blue('Items table is empty. Initializing with JSON data...');
        
                await recs.insertItems();
                
                log.green('Items table initialized with JSON data.');
            };
    
            log.blue('Initializing maps from JSON data...');
        
            ss.config.verbose && log.bgPurple(`services: Deleting from DB: all maps`);
            await ss.runQuery('DELETE FROM maps;');

            await recs.insertMaps();
    
            log.green('Maps table initialized with JSON data.');

            await plugins.emit('initTables', { ss });
        } catch (error) {
            console.error('Error initializing items table:', error);
        };
    };
    
    initTables().then(() => {
        sess.cleanupExpiredSessions();
    
        const port = ss.config.services.port || 13371;
        const wss = new WebSocketServer({ port: port });
        
        const standardError = async (ws) => { ws.send(JSON.stringify({ error: 'Internal server error' })); };
        
        wss.on('connection', (ws, req) => { //this here is basically our main loop
    
            // Apparently, WS ips die after disconnect?
            // https://stackoverflow.com/questions/12444598/why-is-socket-remoteaddress-undefined-on-end-event
        
            let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.connection.remoteAddress;
        
            ws.on('message', async (message) => {
                try {
                    const jsonString = message.toString('utf8');
                    const msg = JSON.parse(jsonString);
                    let cmdType = 'regular';
                    ss.config.services.ratelimit.sensitive.cmds.includes(msg.cmd) && (cmdType = 'sensitive');
                    const auth_commands = [
                        "getUser", //modify this i guess
                        "addKill",
                        "addDeath",
                    ];
                    auth_commands.includes(msg.cmd) && (cmdType = 'auth_required');
                    
                    ss.config.verbose && log.dim("Received cmd: "+msg.cmd+"; type: "+cmdType), console.log(msg);
    
                    if (ss.config.services.ratelimit.protect_ips)
                        ip = crypto.createHash('md5').update(ip).digest('hex');
    
                    let isAccepted;
    
                    if (msg.auth_key) {
                        isAccepted = await accs.getAuthKeyData(msg.auth_key); //bypass RL
                        if (isAccepted) log.special('Found auth key '+isAccepted.name);
                        else log.red('Invalid auth key');
                    } else if (cmdType == 'auth_required') {
                        isAccepted = false;
                    } else {
                        isAccepted = await rl.allowRequest(ss, ip, cmdType);
                    };
        
                    if (!isAccepted) {
                        ss.config.verbose && log.red("rejected some bs from "+ip+" "+cmdType);
                        return ws.send(JSON.stringify({ error: 'Too many requests. Please try again later.' }));
                    };
        
                    let sessionData, userData;
    
                    if (msg.session) {
                        sessionData = await sess.retrieveSession(msg.session, ip, msg.auth_key);
                        try {
                            // console.log(sessionData);
                            // console.log(sessionData.expires_at, (Math.floor(Date.now() / 1000)));
                            if (sessionData && sessionData?.expires_at && (sessionData.expires_at > (Math.floor(Date.now() / 1000)))) {
                                userData = await accs.getUserData(sessionData.user_id, true);
                            };
                        } catch (error) {
                            log.red("WHY IS THERE AN ERROR?? error with session -> userData");
                            console.error(error);
                        };
                    };
        
                    // Sync commands
                    if (msg.cmd == "requestConfig") {
                        ss.config.verbose && log.bgCyan("services: Reading from DB: get max modified of items");
                        const items = await ss.getOne('SELECT MAX(dateModified) AS maxDateModified FROM items');
                        ss.config.verbose && log.bgCyan("services: Reading from DB: get max modified of maps");
                        const maps = await ss.getOne('SELECT MAX(dateModified) AS maxDateModified FROM maps');
                        ss.config.verbose && log.bgCyan("services: Reading from DB: get max modified of game_servers");
                        const game_servers = await ss.getOne('SELECT MAX(dateModified) AS maxDateModified FROM game_servers');
    
                        let timeNow = Math.floor(Date.now()/1000);
                        ss.config.verbose && console.log("TIME NOW", timeNow);
                        ss.config.verbose && console.log("items", items.maxDateModified, msg.lastItems);
                        ss.config.verbose && console.log("maps", maps.maxDateModified, msg.lastMaps);
                        ss.config.verbose && console.log("game_servers", game_servers.maxDateModified, msg.lastServers);
    
                        let response = {
                            distributed_all: ss.config.distributed_all,
                            distributed_client: ss.config.distributed_client,
                            distributed_game: ss.config.distributed_game,
    
                            permissions: ss.config.distributed_permissions,
    
                            nugget_interval: ss.config.services.nugget_interval,
                            servicesMeta: {
                                versionEnum: ss.versionEnum,
                                versionHash: ss.versionHash,
                                startTime: ss.startTime,
                            },
                        };
    
                        // console.log(ss.config.distributed_client);
    
                        if (msg.lastItems !== undefined)    response.items  = items.maxDateModified         > msg.lastItems     ? await recs.getAllItemData()            : false;
                        if (msg.lastMaps !== undefined)     response.maps   = maps.maxDateModified          > msg.lastMaps      ? await recs.getAllMapData()             : false;
                        if (msg.lastServers !== undefined)  response.servers= game_servers.maxDateModified  > msg.lastServers   ? await recs.getAllGameServerData()      : false;
    
                        ws.send(JSON.stringify( response ));
                    } else if (ss.config.distributed_all.closed !== true) {
                        switch (msg.cmd) {
                            // Game server commands
                            case 'getUser':
                                ws.send(JSON.stringify({
                                    sessionData,
                                    userData
                                }));
                                break;
                            case 'addKill':
                                var multiplier = 1;
                                if (userData.upgradeExpiryDate * 1000 > Date.now()) multiplier = userData.upgradeMultiplier;
                                console.log("egg multiplier", multiplier);
    
                                userData.currentBalance += (10 * multiplier);
                                userData.kills += 1;
                                userData.streak = Math.max(msg.currentKills, userData.streak || 0);
    
                                ss.config.verbose && log.bgBlue("services: Writing to DB: set new balance + kills + streak "+userData.username);
                                await ss.runQuery(`
                                    UPDATE users 
                                    SET currentBalance = ?, kills = ?, streak = ?
                                    WHERE account_id = ?
                                `, [userData.currentBalance, userData.kills, userData.streak, userData.account_id]);
    
                                ws.send(JSON.stringify({
                                    currentBalance: userData.currentBalance,
                                    kills: userData.kills, //i dont think we really need this for anything, but doesnt hurt to show something happened
                                    streak: userData.streak
                                }));
                                break;
                            case 'addDeath':
                                userData.deaths += 1;
    
                                ss.config.verbose && log.bgBlue("services: Writing to DB: set new deaths "+userData.username);
                                await ss.runQuery(`
                                    UPDATE users 
                                    SET deaths = ?
                                    WHERE account_id = ?
                                `, [userData.deaths, userData.account_id]);
    
                                ws.send(JSON.stringify({
                                    deaths: userData.deaths, //again, i dont think we really need this for anything
                                }));
                                break;
                            // Client commands
                            case 'validateLogin':
                                accs.getUserData(msg.username, true, true).then(userData => {
                                    if (userData) {
                                        accs.comparePassword(userData, msg.password).then(async (isPasswordCorrect) => {
                                            if (isPasswordCorrect === true) {
                                                userData.authToken = await accs.generateToken(msg.username);
                                                userData.session = await sess.createSession(userData.account_id, ip);
                                                delete userData.password;
                                                ws.send(JSON.stringify(userData));
                                            } else {
                                                ss.config.services.protect_usernames ? ws.send(JSON.stringify({ error: "Username or password is incorrect." })) : ws.send(JSON.stringify({ error: "Password is incorrect." }));
                                            };
                                        }).catch(error => {
                                            console.error('Error comparing passwords:', error);
                                            standardError(ws);
                                        });
                                    } else {
                                        console.log('No data found for the given username.');
                                        ss.config.services.protect_usernames ? ws.send(JSON.stringify({ error: "Username or password is incorrect." })) : ws.send(JSON.stringify({ error: "User doesn't exist" }));
                                    };
                                }).catch((err) => {
                                    console.error('Error:', err);
                                    ws.send(JSON.stringify({ error: 'Database error.' }))
                                });
                                break;
                            case 'validateLoginViaAuthToken':
                                accs.getUserData(msg.username, true, true).then(userData => {
                                    if (userData) {
                                        accs.compareAuthToken(userData, msg.authToken).then(async (accessGranted) => {
                                            if (accessGranted === true) {
                                                userData.authToken = await accs.generateToken(msg.username);
                                                userData.session = await sess.createSession(userData.account_id, ip);
                                                delete userData.password;
                                                ws.send(JSON.stringify(userData));
                                            } else {
                                                ws.send(JSON.stringify({ error: accessGranted }));
                                            };
                                        }).catch(error => {
                                            console.error('Error comparing passwords:', error);
                                            standardError(ws);
                                        });
                                    } else { //this case shouldnt happen
                                        console.log('No data found for the given username.');
                                        ws.send(JSON.stringify({ error: 'User doesn\'t exist' }));
                                    };
                                }).catch((err) => {
                                    console.error('Error:', err);
                                    ws.send(JSON.stringify({ error: 'Database error.' }))
                                });
                            break;
                            case 'validateRegister':
                                try {
                                    if (msg.username.length < 3 || !/^[A-Za-z0-9?!._-]+$/.test(msg.username)) {
                                        ws.send(JSON.stringify({ error: 'Invalid username.' }));
                                        return;
                                    };
                                    var reserved = [
                                        'admin',
                                        'moderator',
                                        'guest',
                                        'unknown',
                                        'player',
                                        'undefined'
                                    ];
                                    reserved.forEach(reservedName => {
                                        if (msg.username.toLowerCase().includes(reservedName)) {
                                            ws.send(JSON.stringify({ error: 'Reserved username: '+reservedName }));
                                            return;
                                        };
                                    });
    
                                    if (!(/^[a-f0-9]{64}$/i).test(msg.password)) {
                                        standardError(ws);
                                        return;
                                    };
                                    const accountCreationResult = await accs.createAccount(msg.username, msg.password);
                            
                                    if (accountCreationResult === true) {
                                        const newToken = await accs.generateToken(msg.username);
                            
                                        const userData = await accs.getUserData(msg.username, true);
                                        if (userData) {
                                            userData.session = await sess.createSession(userData.account_id, ip);
                                            userData.authToken = newToken;
                                            ws.send(JSON.stringify(userData));
                                        } else {
                                            console.log('No data found for the given username.');
                                            ws.send(JSON.stringify({ error: 'Database error.' }));
                                        };
                                    } else {
                                        if (accountCreationResult === 'SQLITE_CONSTRAINT') {
                                            ws.send(JSON.stringify({ error: 'Username is already taken.' }));
                                        } else {
                                            ws.send(JSON.stringify({ error: 'Database error.' }));
                                        };
                                    };
                                } catch (error) {
                                    console.error('Error in validateRegister:', error);
                                    standardError(ws);
                                };
                                break;
                            case 'feedback':
                                if (ss.config.services.feedback && ss.config.services.feedback.length > 10) {
                                    const formData = new FormData();
            
                                    const jsonBlob = new Blob([Object.entries(msg).map(([key, value]) => `${key}: ${value}`).join('\n')], { type: 'text/plain' });
                                    formData.append('file', jsonBlob, 'stats.txt');
            
                                    formData.append('payload_json', JSON.stringify({
                                        username: 'LegacyShell Feedback',
                                        avatar_url: msg.url + 'favicon.ico',
                                        allowed_mentions: { parse: [] },
                                        embeds: [{ description: `> from ${msg.email}\n\n${msg.comments}` }]
                                    }));
            
                                    fetch(ss.config.services.feedback, { method: 'POST', body: formData });
                                } else log.blue('Feedback received, no discord webhook set!:'+JSON.stringify(msg));
            
                                ws.send(JSON.stringify({ success: true }));
                                break;
                            case 'saveEquip':
                                try {
                                    if (userData) {
                                        // class_idx: this.classIdx
                                        userData.loadout.classIdx = Math.clamp(Math.floor(msg.class_idx), 0, 3);
                                        // soldier_primary_item_id:
                                        if (accs.doesPlayerOwnItem(userData, msg.soldier_primary_item_id, "Eggk47")) 
                                            userData.loadout.primaryId[0] = msg.soldier_primary_item_id;
                                        // soldier_secondary_item_id
                                        if (accs.doesPlayerOwnItem(userData, msg.soldier_secondary_item_id, "Cluck9mm")) 
                                            userData.loadout.secondaryId[0] = msg.soldier_secondary_item_id;
                                        // scrambler_primary_item_id
                                        if (accs.doesPlayerOwnItem(userData, msg.scrambler_primary_item_id, "DozenGauge")) 
                                            userData.loadout.primaryId[1] = msg.scrambler_primary_item_id;
                                        // scrambler_secondary_item_id
                                        if (accs.doesPlayerOwnItem(userData, msg.scrambler_secondary_item_id, "Cluck9mm")) 
                                            userData.loadout.secondaryId[1] = msg.scrambler_secondary_item_id;
                                        // ranger_primary_item_id: 
                                        if (accs.doesPlayerOwnItem(userData, msg.ranger_primary_item_id, "CSG1")) 
                                            userData.loadout.primaryId[2] = msg.ranger_primary_item_id;
                                        // ranger_secondary_item_id
                                        if (accs.doesPlayerOwnItem(userData, msg.ranger_secondary_item_id, "Cluck9mm")) 
                                            userData.loadout.secondaryId[2] = msg.ranger_secondary_item_id;
                                        // eggsploder_primary_item_id
                                        if (accs.doesPlayerOwnItem(userData, msg.eggsploder_primary_item_id, "RPEGG")) 
                                            userData.loadout.primaryId[3] = msg.eggsploder_primary_item_id;
                                        // eggsploder_secondary_item_id
                                        if (accs.doesPlayerOwnItem(userData, msg.eggsploder_secondary_item_id, "Cluck9mm")) 
                                            userData.loadout.secondaryId[3] = msg.eggsploder_secondary_item_id;
                                        // hat_id: updateHatId,
                                        if (accs.doesPlayerOwnItem(userData, msg.hat_id, "Hat")) 
                                            userData.loadout.hatId = msg.hat_id;
                                        // stamp_id: updateStampId,
                                        if (accs.doesPlayerOwnItem(userData, msg.stamp_id, "Stamps")) 
                                            userData.loadout.stampId = msg.stamp_id;
                                        // color: this.colorIdx,
                                        userData.loadout.colorIdx = Math.clamp(Math.floor(msg.color), 0, userData.upgradeIsExpired ? 6 : 13); //if vip, then eep
        
                                        ss.config.verbose && log.bgBlue("services: Writing to DB: set new loadout "+userData.username) //, console.log(userData.loadout);
                                        await ss.runQuery(`
                                            UPDATE users 
                                            SET loadout = ?
                                            WHERE account_id = ?
                                        `, [JSON.stringify(userData.loadout), userData.account_id]);
        
                                        ws.send(JSON.stringify({ 
                                            result: "success",
                                        }));
                                    };
                                } catch (error) {
                                    console.error(error);
                                    standardError(ws);
                                };
                                break;
                            case 'buy':
                                let buyingResult = "PLAYER_NOT_FOUND";
        
                                try {
                                    if (userData) {
                                        buyingResult = await accs.addItemToPlayer(msg.item_id, userData, true, false);
                                    }; //ELSE -> achievement: how did we get here?
                                } catch (error) {
                                    log.red("WHY IS THERE AN ERROR??");
                                    console.error(error);
                                    buyingResult = "ERROR";
                                };
            
                                ws.send(JSON.stringify({ 
                                    result: buyingResult, //cases: SUCCESS, INSUFFICIENT_FUNDS, ALREADY_OWNED, PLAYER_NOT_FOUND, ITEM_NOT_FOUND, ERROR
                                    current_balance: userData.currentBalance || 0,
                                    item_id: msg.item_id,
                                }));
                                break;
                            case 'redeem':
                                let redeemResult = [];
        
                                try {
                                    if (userData) {
                                        redeemResult = await accs.addCodeToPlayer(msg.code, userData);
                                    };
                                } catch (error) {
                                    log.red("WHY IS THERE AN ERROR??");
                                    console.error(error);
                                };
        
                                console.log(redeemResult);
            
                                ws.send(JSON.stringify({ 
                                    result: redeemResult.result || "ERROR", //cases: SUCCESS, CODE_PREV_REDEEMED, CODE_NOT_FOUND, ERROR
                                    // error: !redeemResult.item_ids,
        
                                    item_ids: redeemResult.item_ids || [],
                                    eggs_given: redeemResult.eggs_given || 0,
                                }));
                                break;
                            case 'preview':
                                let previewResult = [];
        
                                try {
                                    if (userData) {
                                        previewResult = await recs.getCodeData(msg.code, true);
                                    };
                                } catch (error) {
                                    log.red("WHY IS THERE AN ERROR??");
                                    console.error(error);
                                };
        
                                let canBeUsed = previewResult ? (previewResult.uses > 0 ? (previewResult.used_by.includes(userData.id) ? "CODE_PREV_REDEEMED" : "SUCCESS") : "CODE_PREV_REDEEMED") : "CODE_NOT_FOUND";
                                console.log(canBeUsed, previewResult);
        
                                if (canBeUsed !== "SUCCESS") previewResult = [];
            
                                ws.send(JSON.stringify({ 
                                    result: canBeUsed, //cases: SUCCESS, CODE_PREV_REDEEMED, CODE_NOT_FOUND, ERROR
        
                                    item_ids: previewResult.item_ids || [],
                                    eggs_given: previewResult.eggs_given || 0,
                                    uses: previewResult.uses || 0,
                                }));
                                break;
                            case 'checkBalance':
                                if (userData) {
                                    ws.send(JSON.stringify({ current_balance: userData.currentBalance }));
                                } else {
                                    standardError(ws);
                                };
                                break;
                            case 'getUpgrade':
                                if (userData) {
                                    ss.config.verbose && console.log({
                                        upgradeProductId: userData.upgradeProductId,
                                        multiplier: userData.upgradeMultiplier,
                                        hideAds: userData.upgradeAdFree,
                                        isExpired: userData.upgradeIsExpired,
                                    });
                                    ws.send(JSON.stringify({
                                        upgradeProductId: userData.upgradeProductId,
                                        multiplier: userData.upgradeMultiplier,
                                        hideAds: userData.upgradeAdFree,
                                        isExpired: userData.upgradeIsExpired,
                                    }));
                                    // ws.send(JSON.stringify({
                                    //     upgradeProductId: 1,
                                    //     multiplier: 2,
                                    //     hideAds: true,
                                    //     isExpired: false,
                                    // }));
                                } else {
                                    standardError(ws);
                                };
                                break;
                            case 'token': //this initiates the nugget "game" thing
                                if (userData) {
                                    let oneHour = Math.floor(Date.now() / 1000) + (60*60);
                                    if (userData.upgradeIsExpired) {
                                        ss.config.verbose && console.log(userData.upgradeExpiryDate, (userData.upgradeExpiryDate + (ss.config.services.nugget_interval * 60 * 60)), Math.floor(Date.now() / 1000), (userData.upgradeExpiryDate + (ss.config.services.nugget_interval * 60 * 60)) < Math.floor(Date.now() / 1000));
                                        if ((userData.upgradeExpiryDate + (ss.config.services.nugget_interval * 60 * 60)) < Math.floor(Date.now() / 1000)) {
                                            userData.upgradeExpiryDate = oneHour; //set it to one hour.
                                            userData.upgradeAdFree = true;
                                            userData.upgradeMultiplier = 2;
                                            userData.upgradeProductId = 1; //actually, idk what these ids correspond to. but it seems fine when its at 1.
            
                                            ss.config.verbose && log.bgBlue("services: Writing to DB: set new upgrade stuff "+userData.username) //, console.log(userData.loadout);
                                            await ss.runQuery(`
                                                UPDATE users 
                                                SET 
                                                    upgradeExpiryDate = ?,
                                                    upgradeAdFree = ?,
                                                    upgradeMultiplier = ?,
                                                    upgradeProductId = ?
                                                WHERE account_id = ?
                                            `, [userData.upgradeExpiryDate, userData.upgradeAdFree, userData.upgradeMultiplier, userData.upgradeProductId, userData.account_id]);
            
                                            ws.send(JSON.stringify({
                                                token: 1, //sure. go with it.
                                            }));
                                        } else {
                                            console.log("Please wait to unlock again.");
                                            ws.send(JSON.stringify({ error: "Please wait to unlock again.", }));
                                        };
                                    } else {
                                        console.log("User already has VIP.");
                                        ws.send(JSON.stringify({ error: "User already has VIP.", }));
                                    };
                                } else {
                                    standardError(ws);
                                };
                                break;
            
                            default:
                                console.log('user sent', msg.cmd || '(unknown cmd)', 'to services, not running function')
                                break;
                        };
                    }
                } catch (error) {
                    console.error('Error processing message:', error);
                    standardError(ws);
                };
            });
        
            ws.on('close', () => log.dim('Client disconnected'));
            ws.on('error', (error) => console.error(`WebSocket error: ${error}`));
        });
    
        ss.config.distributed_all.closed && log.bgRed('Server is running in closed mode.');
        log.success('WebSocket server is running on ws://localhost:' + port);
    });
};