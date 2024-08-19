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
    log
};

ss.log.green('created ss object!');

//init db (ooooh! sql! fancy! a REAL database! not a slow json!)
const db = new sqlite3.Database('./server-services/store/LegacyShellData.db');

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            authToken TEXT,
            session TEXT DEFAULT '1234567890',
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

    db.run(`
        CREATE TABLE IF NOT EXISTS ip_requests (
            ip TEXT PRIMARY KEY,
            sensitive_count INTEGER DEFAULT 0,
            regular_count INTEGER DEFAULT 0,
            last_sensitive_reset INTEGER DEFAULT (strftime('%s', 'now')),
            last_regular_reset INTEGER DEFAULT (strftime('%s', 'now'))
        )
    `);

    //WIP!
    db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        user_id INTEGER UNIQUE,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        expires_at INTEGER
    )
    `);
});

ss.log.green('account DB set up!');


//db stuff
ss.runQuery = util.promisify(db.run.bind(db));
ss.getOne = util.promisify(db.get.bind(db));

//account stuff
const hashPassword = (data) => {
    return bcrypt.hashSync(data, ss.config.services.password_cost_factor || 10);
};

const comparePassword = async (username, receivedPassword) => {
    try {
        const result = await ss.getOne(`SELECT password FROM users WHERE username = ?`, [username]);
        if (!result) return "Username not found";
        const storedHash = result.password;
        return bcrypt.compareSync(receivedPassword, storedHash);
    } catch (error) {
        console.error(error); return "Database error.";
    };
};

const generateToken = async (username) => {
    const newToken = crypto.randomBytes(32).toString('hex');
    await ss.runQuery(`UPDATE users SET authToken = ? WHERE username = ?`, [newToken, username]);
    return newToken;
};

const compareAuthToken = async (username, receivedAuthToken) => {
    try {
        const result = await ss.getOne(`SELECT authToken FROM users WHERE username = ?`, [username]);
        if (!result) return "Username not found";
        const storedToken = result.authToken;
        let success = (storedToken == receivedAuthToken);
        if (success) await generateToken(username);
        return success;
    } catch (error) {
        console.error(error); return "Database error.";
    };
};

const createAccount = async (username, password) => {
    password = hashPassword(password);
    try {
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

const getUserData = async (username, convertJson, retainSensitive) => {
    try {
        const query = `SELECT * FROM users WHERE username = ?`;
        const user = await ss.getOne(query, [username]);

        if (user) {
            if (convertJson) {
                user.ownedItemIds = JSON.parse(user.ownedItemIds);
                user.loadout = JSON.parse(user.loadout);
            };
            if (!retainSensitive) {
                delete user.password;
            };
            console.log('User data retrieved:', user);
            return user;
        } else {
            console.log('User not found');
            return null;
        }
    } catch (error) {
        console.error('Error retrieving user data:', error);
        return null;
    }
};

const port = ss.config.services.port || 13371;
const wss = new WebSocketServer({ port: port });


wss.on('connection', (ws, req) => {
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
            if (!isAccepted) return ws.send(JSON.stringify({ error: 'Too many requests. Please try again later.' }));

            // Client commands
            switch (msg.cmd) {
                case 'validateLogin':
                    comparePassword(msg.username, msg.password).then(async (isPasswordCorrect) => {
                        if (isPasswordCorrect === true) {
                            await generateToken(msg.username);
                            getUserData(msg.username, true).then(userData => {
                                if (userData) {
                                    delete userData.password;
                                    ws.send(JSON.stringify(userData));
                                } else { //this case shouldnt happen
                                    console.log('No data found for the given username.');
                                    ws.send(JSON.stringify({ error: 'User doesn\'t exist' }));
                                };
                            }).catch((err) => {
                                console.error('Error:', err);
                                ws.send(JSON.stringify({ error: 'Database error.' }))
                            });
                        } else {
                            ws.send(JSON.stringify({ error: isPasswordCorrect }));
                        };
                    }).catch(error => {
                        console.error('Error comparing passwords:', error);
                        ws.send(JSON.stringify({ error: 'Internal server error' }));
                    });
                    break;
                case 'validateLoginViaAuthToken':
                    compareAuthToken(msg.username, msg.authToken).then(async (accessGranted) => {
                        if (accessGranted === true) {
                            await generateToken(msg.username);
                            getUserData(msg.username, true).then(userData => {
                                if (userData) {
                                    delete userData.password;
                                    ws.send(JSON.stringify(userData));
                                } else { //this case shouldnt happen
                                    console.log('No data found for the given username.');
                                    ws.send(JSON.stringify({ error: 'User doesn\'t exist' }));
                                };
                            }).catch((err) => {
                                console.error('Error:', err);
                                ws.send(JSON.stringify({ error: 'Database error.' }))
                            });
                        } else {
                            ws.send(JSON.stringify({ error: accessGranted }));
                        };
                    }).catch(error => {
                        console.error('Error comparing passwords:', error);
                        ws.send(JSON.stringify({ error: 'Internal server error' }));
                    });
                    break;
                case 'validateRegister':
                    if (msg.username.length < 3 || !/^[A-Za-z0-9?!._-]+$/.test(msg.username)) ws.send(JSON.stringify({ error: 'Invalid username.' }));
                    else if (!(/^[a-f0-9]{64}$/i).test(msg.password)) ws.send(JSON.stringify({ error: 'Internal server error' })); //not really, but if ur trying to make weird requests then im not helping you, fuck off
                    else createAccount(msg.username, msg.password).then(async (result) => {
                        if (result === true) {
                            await generateToken(msg.username);
                            getUserData(msg.username, true).then(userData => {
                                if (userData) {
                                    console.log(`Retrieved user data:`, userData);
                                    ws.send(JSON.stringify(userData));
                                } else console.log('No data found for the given username.');
                            }).catch((err) => {
                                ss.log.red('Error:', err);
                                ws.send(JSON.stringify({ error: 'Database error.' }))
                            });
                        } else {
                            if (result == 'SQLITE_CONSTRAINT') ws.send(JSON.stringify({ error: 'Username is already taken.' })); //or something, idk
                            else ws.send(JSON.stringify({ error: 'Database error.' }));
                        };
                    }).catch(err => {
                        console.error('Error:', err);
                        ws.send(JSON.stringify({ error: 'Internal server error' }));
                    });
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

                default:
                    console.log('user sent', msg.cmd || '(unknown cmd)', 'to services, not running function')
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({ error: 'Internal server error' }));
        }
    });

    ws.on('close', () => console.log('Client disconnected'));
    ws.on('error', (error) => console.error(`WebSocket error: ${error}`));
});

console.log('WebSocket server is running on ws://localhost:' + port);
