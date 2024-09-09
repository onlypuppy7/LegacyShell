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
            upgradeAdFree INTEGER DEFAULT NULL,
            upgradeExpiryDate TEXT DEFAULT NULL,
            upgradeIsExpired INTEGER DEFAULT NULL,
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

    //WIP! SESSIONS
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
        return success;
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
        ss.config.verbose && ss.log.bgBlue("services: Writing to DB: set new balance + ownedItemIds "+userData.username);
        await ss.runQuery(`
            UPDATE users 
            SET currentBalance = ?, ownedItemIds = ?
            WHERE id = ?
        `, [userData.currentBalance, JSON.stringify([...userData.ownedItemIds, item_id]), userData.id]);
        return "SUCCESS"; //god, i hope
    } catch (error) {
        console.error('Error retrieving item data:', error);
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
            item.is_available = item.is_available === 1;
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

const getAllItemData = async (retainSensitive) => {
    try {
        ss.config.verbose && ss.log.bgCyan("services: Reading from DB: get items");
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
        ss.config.verbose && ss.log.bgCyan(`services: Deleting from DB: all sessions for user_id: ${user_id}`);
        await ss.runQuery(`DELETE FROM sessions WHERE user_id = ?`, [user_id]);
    } catch (error) {
        console.error('Error deleting sessions:', error);
    };
};

const cleanupExpiredSessions = async () => {
    try {
        ss.config.verbose && ss.log.bgCyan("services: Cleaning up expired sessions");
        await ss.runQuery(`DELETE FROM sessions WHERE expires_at < strftime('%s', 'now')`);
        ss.log.green('Expired sessions cleaned up');
    } catch (error) {
        console.error('Error cleaning up expired sessions:', error);
    }
};

setInterval(cleanupExpiredSessions, 1000 * 60 * (ss.config.services.session_cleanup_interval || 3));

const initItemsTable = async () => {
    try {
        const countResult = await ss.getOne('SELECT COUNT(*) AS count FROM items');
        if (countResult.count > 0) {
            ss.log.italic('No need to init items table');
            return;
        };

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
    } catch (error) {
        console.error('Error initializing items table:', error);
    };
};

initItemsTable().then(() => {
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
    
                // Client commands
                switch (msg.cmd) {
                    case 'requestConfig':
                        const result = await ss.getOne('SELECT MAX(dateModified) AS maxDateModified FROM items');

                        ss.config.verbose && console.log(result.maxDateModified, msg.lastItems);

                        ws.send(JSON.stringify(
                            {
                                ...ss.config.services.distributed_configs.client,
                                items: result.maxDateModified > msg.lastItems ? await getAllItemData() : false,
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
                    case 'buy':
                        const session = await retrieveSession(msg.session, ip);
                        let buyingResult, userData = "PLAYER_NOT_FOUND";

                        try {
                            if (session) {
                                userData = await getUserData(session.user_id, true);
                                buyingResult = await addItemToPlayer(msg.item_id, userData, true, false);
                            }; //ELSE -> achievement: how did we get here?
                        } catch (error) {
                            ss.log.red("WHY IS THERE AN ERROR??");
                            console.error(error);
                            buyingResult = "ERROR";
                        };

                        // console.log({ 
                        //     result: buyingResult, //cases: SUCCESS, INSUFFICIENT_FUNDS, ALREADY_OWNED, PLAYER_NOT_FOUND, ITEM_NOT_FOUND, ERROR
                        //     current_balance: userData.currentBalance || 0,
                        //     item_id: msg.item_id,
                        // })
    
                        ws.send(JSON.stringify({ 
                            result: buyingResult, //cases: SUCCESS, INSUFFICIENT_FUNDS, ALREADY_OWNED, PLAYER_NOT_FOUND, ITEM_NOT_FOUND, ERROR
                            current_balance: userData.currentBalance || 0,
                            item_id: msg.item_id,
                        }));
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
