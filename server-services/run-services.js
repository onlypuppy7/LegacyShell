import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import util from 'node:util';

import yaml from 'js-yaml';
import sqlite3 from 'sqlite3';
import WebSocket, { WebSocketServer } from 'ws';


import rl from './ratelimit.js';
import log from '../src/coloured-logging.js';

sqlite3.verbose();

// storage for the services server. holds the DB.
fs.mkdirSync(path.join(import.meta.dirname, 'store'), { recursive: true });

const configPath = path.join(import.meta.dirname, '..', 'store', 'config.yaml');
if (!fs.existsSync(configPath)) {
    console.log('config.yaml not found, make sure you have run the main js first...');
    process.exit(1);
};

const ss = {
    rootDir: path.resolve(import.meta.dirname),
    config: yaml.load(fs.readFileSync(configPath, 'utf8')),
    packageJson: JSON.parse(fs.readFileSync(path.join(path.resolve(import.meta.dirname), '..', 'package.json'), 'utf8')),
    requests_cache: {},
    clamp: (value, min, max) => { return Math.min(Math.max(value, min), max) },
    log
};

ss.log.green('created ss object!');
ss.config.verbose && ss.log.bgGray("VERBOSE LOGGING ENABLED!!!!!!");

//init db (ooooh! sql! fancy! a REAL database! not a slow json!)
const db = new sqlite3.Database('./server-services/store/LegacyShellData.db');

db.serialize(() => {
    //USERS
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            authToken TEXT,
            kills INTEGER DEFAULT 0,
            deaths INTEGER DEFAULT 0,
            streak INTEGER DEFAULT 0,
            currentBalance INTEGER DEFAULT 1000,
            eggsSpent INTEGER DEFAULT 0,
            ownedItemIds TEXT DEFAULT '[1001,1002,1003,1004,1005,1006,2001,2002,2003,2004,2005,2006,3100,3600,3400,3800,3000]',  -- Will store as JSON string
            loadout TEXT DEFAULT '{"primaryId":[3100,3600,3400,3800],"secondaryId":[3000,3000,3000,3000],"classIdx":0,"colorIdx":0,"hatId":null,"stampId":null}',       -- Will store as JSON string
            version INTEGER DEFAULT 1,

            upgradeProductId TEXT DEFAULT NULL,
            upgradeMultiplier INTEGER DEFAULT NULL,
            upgradeAdFree BOOLEAN DEFAULT TRUE,
            upgradeExpiryDate INTEGER DEFAULT 0,

            maybeSchoolEmail INTEGER DEFAULT NULL,
            adminRoles INTEGER DEFAULT 0,
            dateCreated INTEGER DEFAULT (strftime('%s', 'now')),
            dateModified INTEGER DEFAULT (strftime('%s', 'now'))
        )
    `);

    db.run(`
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);

    db.run(`
        CREATE INDEX IF NOT EXISTS idx_users_authToken ON users(authToken);
    `);
    
    db.run(`
        CREATE TRIGGER IF NOT EXISTS update_dateModified
        AFTER UPDATE ON users
        FOR EACH ROW
        BEGIN
            UPDATE users SET dateModified = strftime('%s', 'now') WHERE id = OLD.id;
        END;
    `);

    //RATELIMITING
    db.run(`
        CREATE TABLE IF NOT EXISTS ip_requests (
            ip TEXT PRIMARY KEY,
            sensitive_count INTEGER DEFAULT 0,
            regular_count INTEGER DEFAULT 0,
            last_sensitive_reset INTEGER DEFAULT (strftime('%s', 'now')),
            last_regular_reset INTEGER DEFAULT (strftime('%s', 'now'))
        )
    `);

    //SESSIONS
    db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        user_id INTEGER UNIQUE,
        ip_address TEXT,
        dateCreated INTEGER DEFAULT (strftime('%s', 'now')),
        expires_at INTEGER
    )
    `);

    //ITEMS
    db.run(`
    CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY,
        name TEXT DEFAULT 'Unknown item',
        is_available BOOLEAN DEFAULT TRUE,
        price INTEGER DEFAULT 0,
        item_class TEXT DEFAULT 'Unknown class',
        item_type_id INTEGER DEFAULT 0,
        item_type_name TEXT DEFAULT 0,
        exclusive_for_class INTEGER,
        item_data TEXT DEFAULT '{"class":Eggk47,"meshName":"gun_eggk47"}',
        dateCreated INTEGER DEFAULT (strftime('%s', 'now')),
        dateModified INTEGER DEFAULT (strftime('%s', 'now'))
    )
    `);
    
    db.run(`
        CREATE TRIGGER IF NOT EXISTS update_dateModified_items
        AFTER UPDATE ON items
        FOR EACH ROW
        BEGIN
            UPDATE items SET dateModified = strftime('%s', 'now') WHERE id = OLD.id;
        END;
    `);

    //ITEMS (i removed some chars from ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 for ease of reading such as 0/O, 1/I)
    //i know this looks horrible, and it is. but it has to be done so that you can just insert stuff in a sql editor. please just accept this and move on w ur life.
    //remember to change the '31' value if you change the character set.
    db.run(`
    CREATE TABLE IF NOT EXISTS codes (
        key TEXT PRIMARY KEY DEFAULT (substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', abs(random()) % 31 + 1, 1) ||
                                   substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', abs(random()) % 31 + 1, 1) ||
                                   substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', abs(random()) % 31 + 1, 1) ||
                                   substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', abs(random()) % 31 + 1, 1) ||
                                   substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', abs(random()) % 31 + 1, 1) ||
                                   substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', abs(random()) % 31 + 1, 1) ||
                                   substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', abs(random()) % 31 + 1, 1) ||
                                   substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', abs(random()) % 31 + 1, 1) ||
                                   substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', abs(random()) % 31 + 1, 1) ||
                                   substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', abs(random()) % 31 + 1, 1) ||
                                   substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', abs(random()) % 31 + 1, 1) ||
                                   substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', abs(random()) % 31 + 1, 1)),
        item_ids TEXT DEFAULT '[]',
        eggs_given INTEGER DEFAULT 0,
        uses INTEGER DEFAULT 1,
        used_by TEXT DEFAULT '[]',
        dateCreated INTEGER DEFAULT (strftime('%s', 'now')),
        dateModified INTEGER DEFAULT (strftime('%s', 'now'))
    )
    `);
    
    db.run(`
        CREATE TRIGGER IF NOT EXISTS update_dateModified_codes
        AFTER UPDATE ON codes
        FOR EACH ROW
        BEGIN
            UPDATE codes SET dateModified = strftime('%s', 'now') WHERE key = OLD.key;
        END;
    `);

    //WIP! MAPS
    db.run(`
    CREATE TABLE IF NOT EXISTS maps (
        name TEXT PRIMARY KEY DEFAULT 'Unknown map',
        sun TEXT DEFAULT '{"direction":{"x":0.2,"y":1,"z":-0.3},"color":"#FFFFFF"}',
        ambient TEXT DEFAULT '#000000', --NOT USED!
        fog TEXT DEFAULT '{"density":0.1,"color":"#33334C"}', --NOT USED!
        data TEXT DEFAULT '{}',
        palette TEXT DEFAULT '[null,null,null,null,null,null,null,null,null,null]',
        render TEXT DEFAULT '{}', --NOT USED!
        width INTEGER DEFAULT -9999,
        height INTEGER DEFAULT -9999,
        depth INTEGER DEFAULT -9999,
        surfaceArea INTEGER DEFAULT 0,
        extents TEXT DEFAULT '{"x":{"max":0,"min":10000},"y":{"max":0,"min":10000},"z":{"max":0,"min":10000},"width":-9999,"height":-9999,"depth":-9999}',
        skybox TEXT DEFAULT '',
        modes TEXT DEFAULT '{"FFA":true,"Teams":true}', --NOT USED!
        availability TEXT DEFAULT 'both', --NOT USED!
        numPlayers INTEGER DEFAULT 18, --NOT USED!

        dateCreated INTEGER DEFAULT (strftime('%s', 'now')),
        dateModified INTEGER DEFAULT (strftime('%s', 'now'))
    )
    `);
    
    db.run(`
        CREATE TRIGGER IF NOT EXISTS update_dateModified_maps
        AFTER UPDATE ON maps
        FOR EACH ROW
        BEGIN
            UPDATE items SET dateModified = strftime('%s', 'now') WHERE name = OLD.name;
        END;
    `);
});

ss.log.green('account DB set up! (if it didnt exist already i suppose)');


//db stuff
ss.runQuery = util.promisify(db.run.bind(db));
ss.getOne = util.promisify(db.get.bind(db));
ss.getAll = util.promisify(db.all.bind(db));

//account stuff
const hashPassword = (data) => {
    return bcrypt.hashSync(data, ss.config.services.password_cost_factor || 10);
};

const comparePassword = async (userData, receivedPassword) => {
    try {
        console.log(receivedPassword, userData.password);
        return bcrypt.compareSync(receivedPassword, userData.password);
    } catch (error) {
        console.error(error); return "Database error.";
    };
};

const compareAuthToken = async (userData, receivedAuthToken) => {
    try {
        let success = (receivedAuthToken == userData.authToken);
        return success ? true : "Validation failed.";
    } catch (error) {
        console.error(error); return "Database error.";
    };
};

const generateToken = async (username) => {
    const newToken = crypto.randomBytes(32).toString('hex');
    ss.config.verbose && ss.log.bgBlue("services: Writing to DB: set new token "+username);
    await ss.runQuery(`UPDATE users SET authToken = ? WHERE username = ?`, [newToken, username]);
    return newToken;
};

const createAccount = async (username, password) => {
    password = hashPassword(password);
    try {
        ss.config.verbose && ss.log.bgBlue("services: Writing to DB: add new user "+username);
        await ss.runQuery(`
            INSERT INTO users (username, password)
            VALUES (?, ?)
        `, [username, password]);

        return true;
    } catch (error) {
        console.error('Error creating account:', error.code);
        return error.code;
    };
};

const getUserData = async (identifier, convertJson, retainSensitive) => {
    try {
        let user;

        if (typeof identifier === 'string') {
            ss.config.verbose && ss.log.bgCyan("services: Reading from DB: get user via username "+identifier);
            user = await ss.getOne(`SELECT * FROM users WHERE username = ?`, [identifier]);
        } else if (Number.isInteger(identifier)) {
            ss.config.verbose && ss.log.bgCyan("services: Reading from DB: get user via ID "+identifier);
            user = await ss.getOne(`SELECT * FROM users WHERE id = ?`, [identifier]);
        } else {
            ss.log.red('Invalid identifier type '+identifier);
            return null;
        };

        if (user) {
            if (convertJson) {
                user.ownedItemIds = JSON.parse(user.ownedItemIds);
                user.loadout = JSON.parse(user.loadout);
            };
            if (!retainSensitive) {
                delete user.password;
            };

            user.upgradeAdFree = !!user.upgradeAdFree;
            user.upgradeExpiryDate = user.upgradeExpiryDate || 0;
            user.upgradeIsExpired = Math.floor(Date.now() / 1000) > user.upgradeExpiryDate;
            if (user.upgradeIsExpired) user.upgradeMultiplier = null, user.upgradeProductId = null;

            // console.log('User data retrieved:', user);
            console.log('User data retrieved');
            return user;
        } else {
            console.log('User not found');
            return null;
        }
    } catch (error) {
        console.error('Error retrieving user data:', error);
        return null;
    };
};

const addItemToPlayer = async (item_id, userData, isBuying, force) => { //force is for item codes and stuff
    try {
        if (userData.ownedItemIds.includes(item_id)) return "ALREADY_OWNED";

        const item = await getItemData(item_id);

        if ((!item) || (!(force || item.is_available))) return "ITEM_NOT_FOUND";
        if (isBuying) {
            if (userData.currentBalance >= item.price) {
                userData.currentBalance -= item.price;
            } else {
                return "INSUFFICIENT_FUNDS";
            };
        };
        userData.ownedItemIds = [...userData.ownedItemIds, item_id];

        ss.config.verbose && ss.log.bgBlue("services: Writing to DB: set new balance + ownedItemIds "+userData.username);
        await ss.runQuery(`
            UPDATE users 
            SET currentBalance = ?, ownedItemIds = ?
            WHERE id = ?
        `, [userData.currentBalance, JSON.stringify(userData.ownedItemIds), userData.id]);
        return "SUCCESS"; //god, i hope
    } catch (error) {
        console.error('Error retrieving item data:', error);
        return "ITEM_NOT_FOUND";
    };
};

const doesPlayerOwnItem = async (userData, item_id, item_class) => {
    try {
        if (["Hats", "Stamps"].includes(item_class) && item_id === null) return true;
        const item = await getItemData(item_id, true);
        console.log(userData.ownedItemIds, item_id, item_class, userData.ownedItemIds.includes(item_id), item.item_class == item_class, userData.ownedItemIds.includes(item_id) && item.item_class == item_class);
        if (userData.ownedItemIds.includes(item_id) && item.item_class == item_class) return true;
        return false;
    } catch (error) {
        console.error('Error retrieving item data:', item_id, item_class, error);
        return "ITEM_NOT_FOUND";
    };
};

const getItemData = async (item_id, retainSensitive) => {
    try {
        ss.config.verbose && ss.log.bgCyan(`services: Reading from DB: get item ${item_id}`);
        const item = await ss.getOne(`SELECT * FROM items WHERE id = ?`, [item_id]);

        if (item) {
            if (!retainSensitive) {
                delete item.item_class;
                delete item.dateCreated;
                delete item.dateModified;
            };
            item.is_available = !!item.is_available;
            item.item_data = JSON.parse(item.item_data);
            return item;
        } else {
            console.log('Item not found');
            return null;
        };
    } catch (error) {
        console.error('Error retrieving item data:', error);
        return null;
    };
};

const getCodeData = async (code_key, retainSensitive) => {
    try {
        ss.config.verbose && ss.log.bgCyan(`services: Reading from DB: get code ${code_key}`);
        const code = await ss.getOne(`SELECT * FROM codes WHERE key = ?`, [code_key]);

        if (code) {
            ss.config.verbose && console.log(code);
            code.used_by = JSON.parse(code.used_by);
            code.item_ids = JSON.parse(code.item_ids);
            if (!retainSensitive) {
                delete code.uses;
                delete code.used_by;
                delete code.dateCreated;
                delete code.dateModified;
            };
            return code;
        } else {
            console.log('Code not found');
            return null;
        };
    } catch (error) {
        console.error('Error retrieving code data:', error);
        return null;
    };
};

const addCodeToPlayer = async (code_key, userData) => {
    try {
        const code = (await getCodeData(code_key, true)) || [];
        code.result = "ERROR"; //default if it fails, i guess

        if (code.used_by) { //exists
            if ((code.uses >= 1) && (!code.used_by.includes(userData.id))) {
                for (const item_id of code.item_ids) {
                    await addItemToPlayer(item_id, userData, false, true);
                };
                userData.currentBalance += code.eggs_given;

                ss.config.verbose && ss.log.bgBlue("services: Writing to DB: set new balance + ownedItemIds "+userData.username);
                await ss.runQuery(`
                    UPDATE users 
                    SET currentBalance = ?, ownedItemIds = ?
                    WHERE id = ?
                `, [userData.currentBalance, JSON.stringify(userData.ownedItemIds), userData.id]);

                code.uses -= 1;
                code.used_by = [...code.used_by, userData.id];

                ss.config.verbose && ss.log.bgBlue("services: Writing to DB: update code "+code_key);
                await ss.runQuery(`
                    UPDATE codes 
                    SET uses = ?, used_by = ?
                    WHERE key = ?
                `, [code.uses, JSON.stringify(code.used_by), code_key]);

                code.result = "SUCCESS";
            } else {
                code.result = "CODE_PREV_REDEEMED";
            };
        } else {
            console.log('Code not found');
            code.result = "CODE_NOT_FOUND";
        };

        return code;
    } catch (error) {
        console.error('Error retrieving code data:', error);
        return null;
    };
};

const getAllItemData = async (retainSensitive) => {
    try {
        ss.config.verbose && ss.log.bgCyan("services: Reading from DB: get all items");
        const items = await ss.getAll(`SELECT * FROM items`);

        if (items) {
            return items.map(item => {
                if (!retainSensitive) {
                    delete item.item_class;
                    delete item.dateCreated;
                    delete item.dateModified;
                };
                item.is_available = item.is_available === 1;
                item.item_data = JSON.parse(item.item_data);
                return item;
            });
        } else {
            console.log('Items not found');
            return null;
        };
    } catch (error) {
        console.error('Error retrieving items data:', error);
        return null;
    };
};

const getAllMapData = async (retainSensitive) => {
    try {
        ss.config.verbose && ss.log.bgCyan("services: Reading from DB: get all maps");
        const maps = await ss.getAll(`SELECT * FROM maps`);

        if (maps) {
            return maps.map(map => { // yes, m a p
                if (!retainSensitive) {
                    delete map.dateCreated;
                    delete map.dateModified;
                };
                map.sun = JSON.parse(map.sun);
                map.fog = JSON.parse(map.fog);
                map.data = JSON.parse(map.data);
                map.palette = JSON.parse(map.palette);
                map.render = JSON.parse(map.render);
                map.extents = JSON.parse(map.extents);
                map.modes = JSON.parse(map.modes);
                return map;
            });
        } else {
            console.log('Maps not found');
            return null;
        };
    } catch (error) {
        console.error('Error retrieving maps data:', error);
        return null;
    };
};

const createSession = async (user_id, ip_address) => {
    deleteAllSessionsForUser(user_id);

    const session_id = crypto.randomBytes(32).toString('hex');
    const expires_at = Math.floor(Date.now() / 1000) + (60 * (ss.config.services.session_expiry_time || 180));

    try {
        ss.config.verbose && ss.log.bgBlue("services: Writing to DB: create new session "+user_id);
        await ss.runQuery(`
            INSERT INTO sessions (session_id, user_id, ip_address, expires_at)
            VALUES (?, ?, ?, ?)
        `, [session_id, user_id, ip_address, expires_at]);
        return session_id;
    } catch (error) {
        console.error('Error creating session:', error);
        return null;
    };
};


const retrieveSession = async (session_id, ip_address) => {
    try {
        ss.config.verbose && ss.log.bgCyan("services: Reading from DB: get session for session_id " + session_id);

        const session = await ss.getOne(`
            SELECT * FROM sessions WHERE session_id = ? AND expires_at > strftime('%s', 'now')
        `, [session_id]);

        if (!session) {
            ss.log.yellow(`No valid session found for session_id: ${session_id}`);
            return null;
        };

        ss.config.verbose && console.log(session, ip_address);

        if (session.ip_address !== ip_address) {
            await deleteAllSessionsForUser(session.user_id);
            return null;
        };

        ss.log.green(`Session retrieved for session_id: ${session_id}`);
        return session;
    } catch (error) {
        console.error('Error retrieving session:', error);
        return null;
    };
};

const deleteAllSessionsForUser = async (user_id) => {
    try {
        ss.config.verbose && ss.log.bgPurple(`services: Deleting from DB: all sessions for user_id: ${user_id}`);
        await ss.runQuery(`DELETE FROM sessions WHERE user_id = ?`, [user_id]);
    } catch (error) {
        console.error('Error deleting sessions:', error);
    };
};

const cleanupExpiredSessions = async () => {
    try {
        ss.config.verbose && ss.log.bgPurple(`services: Deleting from DB: Cleaning up expired sessions`);
        await ss.runQuery(`DELETE FROM sessions WHERE expires_at < strftime('%s', 'now')`);
        ss.log.green('Expired sessions cleaned up');
    } catch (error) {
        console.error('Error cleaning up expired sessions:', error);
    }
};

setInterval(cleanupExpiredSessions, 1000 * 60 * (ss.config.services.session_cleanup_interval || 3));

const initTables = async () => {
    try {
        //ITEMS TABLE
        ss.config.verbose && ss.log.bgCyan("services: Reading from DB: count items");
        if ((await ss.getOne('SELECT COUNT(*) AS count FROM items')).count > 0) {
            ss.log.italic('No need to init items table');
        } else {
            ss.log.blue('Items table is empty. Initializing with JSON data...');
    
            const jsonDir = path.join(ss.rootDir, 'src', 'items');
            const files = fs.readdirSync(jsonDir);
            for (const file of files) {
                if (path.extname(file) === '.json') {
                    ss.log.beige(`Inserting: ${file}`);
                    const filePath = path.join(jsonDir, file);
                    const fileContent = fs.readFileSync(filePath, 'utf8');
                    const jsonData = JSON.parse(fileContent);
    
                    for (const item of jsonData) {
                        await ss.runQuery(`
                            INSERT INTO items (id, name, is_available, price, item_class, item_type_id, item_type_name, exclusive_for_class, item_data)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `, [item.id, item.name, item.is_available, item.price, path.parse(file).name, item.item_type_id, item.item_type_name, item.exclusive_for_class, JSON.stringify(item.item_data)]);
                    };
                };
            };
            ss.log.green('Items table initialized with JSON data.');
        };

        ss.log.blue('Initializing maps from JSON data...');
    
        ss.config.verbose && ss.log.bgPurple(`services: Deleting from DB: all maps`);
        await ss.runQuery('DELETE FROM maps;');

        const jsonDir = path.join(ss.rootDir, 'src', 'maps');
        const files = fs.readdirSync(jsonDir);
        for (const file of files) {
            if (path.extname(file) === '.json') {
                ss.log.beige(`Inserting: ${file}`);
                const filePath = path.join(jsonDir, file);
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const map = JSON.parse(fileContent);

                await ss.runQuery(`
                    INSERT INTO maps ( name, sun, ambient, fog, data, palette, render, width, height, depth, surfaceArea, extents, skybox, modes, availability, numPlayers, dateCreated, dateModified ) 
                    VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )
                `, [
                        map.name || 'Unknown map',
                        map.sun ? JSON.stringify(map.sun) : '{"direction":{"x":0.2,"y":1,"z":-0.3},"color":"#FFFFFF"}',
                        map.ambient || '#000000', //NOT USED!
                        map.fog ? JSON.stringify(map.fog) : '{"density":0.1,"color":"#33334C"}', //NOT USED!
                        map.data ? JSON.stringify(map.data) : '{}',
                        map.palette ? JSON.stringify(map.palette) : '[null,null,null,null,null,null,null,null,null,null]',
                        map.render ? JSON.stringify(map.render) : '{}',
                        map.width || -9999,
                        map.height || -9999,
                        map.depth || -9999,
                        map.surfaceArea || 0,
                        map.extents ? JSON.stringify(map.extents) : '{"x":{"max":0,"min":10000},"y":{"max":0,"min":10000},"z":{"max":0,"min":10000},"width":-9999,"height":-9999,"depth":-9999}',
                        map.skybox || '',
                        map.modes ? JSON.stringify(map.modes) : '{"FFA":true,"Teams":true}', //NOT USED!
                        map.availability || 'both', //NOT USED!
                        map.numPlayers || 18, //NOT USED!
                        Math.floor(Date.now() / 1000),
                        Math.floor(Date.now() / 1000)
                    ]
                );
            };
        };
        ss.log.green('Maps table initialized with JSON data.');
    } catch (error) {
        console.error('Error initializing items table:', error);
    };
};

initTables().then(() => {
    cleanupExpiredSessions();

    const port = ss.config.services.port || 13371;
    const wss = new WebSocketServer({ port: port });
    
    const standardError = async (ws) => { ws.send(JSON.stringify({ error: 'Internal server error' })); };
    
    wss.on('connection', (ws, req) => { //this here is basically our main loop

        // Apparently, WS ips die after disconnect?
        // https://stackoverflow.com/questions/12444598/why-is-socket-remoteaddress-undefined-on-end-event
    
        let ip = req.socket.remoteAddress;
    
        ws.on('message', async (message) => {
            try {
                const jsonString = message.toString('utf8');
                const msg = JSON.parse(jsonString);
                const cmdType = ss.config.services.ratelimit.sensitive.cmds.includes(msg.cmd) ? 'sensitive' : 'regular';
    
                if (ss.config.services.ratelimit.protect_ips)
                    ip = crypto.createHash('md5').update(ip).digest('hex');
    
                const isAccepted = await rl.allowRequest(ss, ip, cmdType);
                if (!isAccepted) {
                    ss.config.verbose && ss.log.red("rejected some bs from "+ip+" "+cmdType);
                    return ws.send(JSON.stringify({ error: 'Too many requests. Please try again later.' }));
                };
    
                ss.config.verbose && ss.log.dim("Received cmd: "+msg.cmd+"; type: "+cmdType), console.log(msg);

                let sessionData, userData;

                if (msg.session) {
                    sessionData = await retrieveSession(msg.session, ip);
                    try {
                        console.log(sessionData.expires_at, (Math.floor(Date.now() / 1000)))
                        if (sessionData && (sessionData.expires_at > (Math.floor(Date.now() / 1000)))) {
                            userData = await getUserData(sessionData.user_id, true);
                        };
                    } catch (error) {
                        ss.log.red("WHY IS THERE AN ERROR?? error with session -> userData");
                        console.error(error);
                    };
                };
    
                // Client commands
                switch (msg.cmd) {
                    case 'requestConfig':
                        ss.config.verbose && ss.log.bgCyan("services: Reading from DB: get max modified of items");
                        const items = await ss.getOne('SELECT MAX(dateModified) AS maxDateModified FROM items');
                        ss.config.verbose && ss.log.bgCyan("services: Reading from DB: get max modified of maps");
                        const maps = await ss.getOne('SELECT MAX(dateModified) AS maxDateModified FROM maps');

                        ss.config.verbose && console.log("items", items.maxDateModified, msg.lastItems);
                        ss.config.verbose && console.log("maps", maps.maxDateModified, maps.lastMaps);

                        ws.send(JSON.stringify(
                            {
                                ...ss.config.services.distributed_configs.client,
                                nugget_interval: ss.config.services.nugget_interval,
                                items: items.maxDateModified > msg.lastItems ? await getAllItemData() : false,
                                maps: maps.maxDateModified > msg.lastMaps ? await getAllMapData() : false,
                            }
                        ));
                        break;
                    case 'validateLogin':
                        getUserData(msg.username, true, true).then(userData => {
                            if (userData) {
                                comparePassword(userData, msg.password).then(async (isPasswordCorrect) => {
                                    if (isPasswordCorrect === true) {
                                        userData.authToken = await generateToken(msg.username);
                                        userData.session = await createSession(userData.id, ip);
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
                        getUserData(msg.username, true, true).then(userData => {
                            if (userData) {
                                compareAuthToken(userData, msg.authToken).then(async (accessGranted) => {
                                    if (accessGranted === true) {
                                        userData.authToken = await generateToken(msg.username);
                                        userData.session = await createSession(userData.id, ip);
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
                            if (!(/^[a-f0-9]{64}$/i).test(msg.password)) {
                                standardError(ws);
                                return;
                            };
                            const accountCreationResult = await createAccount(msg.username, msg.password);
                    
                            if (accountCreationResult === true) {
                                const newToken = await generateToken(msg.username);
                    
                                const userData = await getUserData(msg.username, true);
                                if (userData) {
                                    userData.session = await createSession(userData.id, ip);
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
                        } else ss.log.blue('Feedback received, no discord webhook set!:'+JSON.stringify(msg));
    
                        ws.send(JSON.stringify({ success: true }));
                        break;
                    case 'saveEquip':
                        try {
                            if (userData) {
                                // class_idx: this.classIdx
                                userData.loadout.classIdx = ss.clamp(Math.floor(msg.class_idx), 0, 3);
                                // soldier_primary_item_id:
                                if (doesPlayerOwnItem(userData, msg.soldier_primary_item_id, "Eggk47")) 
                                    userData.loadout.primaryId[0] = msg.soldier_primary_item_id;
                                // soldier_secondary_item_id
                                if (doesPlayerOwnItem(userData, msg.soldier_secondary_item_id, "Cluck9mm")) 
                                    userData.loadout.secondaryId[0] = msg.soldier_secondary_item_id;
                                // scrambler_primary_item_id
                                if (doesPlayerOwnItem(userData, msg.scrambler_primary_item_id, "DozenGauge")) 
                                    userData.loadout.primaryId[1] = msg.scrambler_primary_item_id;
                                // scrambler_secondary_item_id
                                if (doesPlayerOwnItem(userData, msg.scrambler_secondary_item_id, "Cluck9mm")) 
                                    userData.loadout.secondaryId[1] = msg.scrambler_secondary_item_id;
                                // ranger_primary_item_id: 
                                if (doesPlayerOwnItem(userData, msg.ranger_primary_item_id, "CSG1")) 
                                    userData.loadout.primaryId[2] = msg.ranger_primary_item_id;
                                // ranger_secondary_item_id
                                if (doesPlayerOwnItem(userData, msg.ranger_secondary_item_id, "Cluck9mm")) 
                                    userData.loadout.secondaryId[2] = msg.ranger_secondary_item_id;
                                // eggsploder_primary_item_id
                                if (doesPlayerOwnItem(userData, msg.eggsploder_primary_item_id, "RPEGG")) 
                                    userData.loadout.primaryId[3] = msg.eggsploder_primary_item_id;
                                // eggsploder_secondary_item_id
                                if (doesPlayerOwnItem(userData, msg.eggsploder_secondary_item_id, "Cluck9mm")) 
                                    userData.loadout.secondaryId[3] = msg.eggsploder_secondary_item_id;
                                // hat_id: updateHatId,
                                if (doesPlayerOwnItem(userData, msg.hat_id, "Hats")) 
                                    userData.loadout.hatId = msg.hat_id;
                                // stamp_id: updateStampId,
                                if (doesPlayerOwnItem(userData, msg.stamp_id, "Stamps")) 
                                    userData.loadout.stampId = msg.stamp_id;
                                // color: this.colorIdx,
                                userData.loadout.colorIdx = ss.clamp(Math.floor(msg.color), 0, userData.upgradeIsExpired ? 6 : 13); //if vip, then eep

                                ss.config.verbose && ss.log.bgBlue("services: Writing to DB: set new loadout "+userData.username) //, console.log(userData.loadout);
                                await ss.runQuery(`
                                    UPDATE users 
                                    SET loadout = ?
                                    WHERE id = ?
                                `, [JSON.stringify(userData.loadout), userData.id]);

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
                                buyingResult = await addItemToPlayer(msg.item_id, userData, true, false);
                            }; //ELSE -> achievement: how did we get here?
                        } catch (error) {
                            ss.log.red("WHY IS THERE AN ERROR??");
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
                                redeemResult = await addCodeToPlayer(msg.code, userData);
                            };
                        } catch (error) {
                            ss.log.red("WHY IS THERE AN ERROR??");
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
                                previewResult = await getCodeData(msg.code, true);
                            };
                        } catch (error) {
                            ss.log.red("WHY IS THERE AN ERROR??");
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
    
                                    ss.config.verbose && ss.log.bgBlue("services: Writing to DB: set new upgrade stuff "+userData.username) //, console.log(userData.loadout);
                                    await ss.runQuery(`
                                        UPDATE users 
                                        SET 
                                            upgradeExpiryDate = ?,
                                            upgradeAdFree = ?,
                                            upgradeMultiplier = ?,
                                            upgradeProductId = ?
                                        WHERE id = ?
                                    `, [userData.upgradeExpiryDate, userData.upgradeAdFree, userData.upgradeMultiplier, userData.upgradeProductId, userData.id]);
    
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
            } catch (error) {
                console.error('Error processing message:', error);
                standardError(ws);
            };
        });
    
        ws.on('close', () => ss.log.dim('Client disconnected'));
        ws.on('error', (error) => console.error(`WebSocket error: ${error}`));
    });
    
    console.log('WebSocket server is running on ws://localhost:' + port);
});
