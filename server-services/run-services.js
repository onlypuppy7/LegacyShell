import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import util from 'node:util';

import yaml from 'js-yaml';
import sqlite3 from 'sqlite3';
import WebSocket from 'ws';

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
    log
};

const { version } = JSON.parse(fs.readFileSync(path.join(ss.rootDir, '..', 'package.json'), 'utf8'));
ss.version = version;

ss.log.green('created ss object!');

//init db (ooooh! sql! fancy! a REAL database! not a slow json!)
const db = new sqlite3.Database('./server-services/store/accountData.db');

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            kills INTEGER DEFAULT 0,
            deaths INTEGER DEFAULT 0,
            streak INTEGER DEFAULT 0,
            currentBalance INTEGER DEFAULT 1000,
            eggsSpent INTEGER DEFAULT 0,
            ownedItemIds TEXT DEFAULT '[1001,1002,1003,1004,1005,1006,2001,2002,2003,2004,2005,2006,3100,3600,3400,3800,3000]',  -- Will store as JSON string
            loadout TEXT DEFAULT '{"primaryId":[3100,3600,3400,3800],"secondaryId":[3000,3000,3000,3000],"classIdx":0,"colorIdx":0,"hatId":null,"stampId":null}',       -- Will store as JSON string
            session TEXT DEFAULT '1234567890',
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
        CREATE TABLE IF NOT EXISTS ip_requests (
            ip TEXT PRIMARY KEY,
            sensitive_count INTEGER DEFAULT 0,
            regular_count INTEGER DEFAULT 0,
            last_sensitive_reset INTEGER DEFAULT (strftime('%s', 'now')),
            last_regular_reset INTEGER DEFAULT (strftime('%s', 'now'))
        )
    `);
});

ss.log.green('account DB set up!');

const sha256 = (data) => {
    const hash = crypto.createHash('sha256');
    hash.update(data);
    return hash.digest('hex');
};

//db stuff
const runQuery = util.promisify(db.run.bind(db));
const getOne = util.promisify(db.get.bind(db));

//account stuff
const createAccount = async (username, password) => {
    password = sha256(password);
    try {
        await runQuery(`
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
        const user = await getOne(query, [username]);

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
const wss = new WebSocket.Server({ port: port });

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

            const isAccepted = await rl.acceptRequest(ip, cmdType);
            if (!isAccepted) return ws.send(JSON.stringify({ error: 'Too many requests. Please try again later.' }));

            // Client commands
            switch (msg.cmd) {
                case 'validateLogin':
                    getUserData(msg.username, true, true).then(userData => {
                        if (userData) {
                            if (userData.password && (sha256(msg.password) == userData.password)) {
                                // console.log('yes', msg, userData)
                                delete userData.password;
                                ws.send(JSON.stringify(userData));
                            } else ws.send(JSON.stringify({ error: 'Incorrect password.' }));
                        } else {
                            console.log('No data found for the given username.');
                            ws.send(JSON.stringify({ error: 'User doesn\'t exist' }));
                        };
                    }).catch((err) => {
                        ss.log.red('Error:', err);
                        ws.send(JSON.stringify({ error: 'Database error.' }))
                    });
                    break;

                case 'validateRegister':
                    if (msg.username.length < 3 || !/^[A-Za-z0-9?!._-]+$/.test(msg.username)) ws.send(JSON.stringify({ error: 'Invalid username.' }));
                    else createAccount(msg.username, msg.password).then((result) => {
                        if (result === true) {
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
                            if (result == 'SQLITE_CONSTRAINT') ws.send(JSON.stringify({ error: 'Username is already taken.' })); //or something
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
                    } else ss.log.blue('Feedback received, no discord webhook set!:', msg);

                    ws.send(JSON.stringify({ success: true }));
                    break;

                default:
                    console.log('user sent', msg.cmd || '[[unknown cmd]]', 'to services, not running  function')
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
