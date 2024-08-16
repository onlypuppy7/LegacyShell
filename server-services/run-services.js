//ss object
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const log = require('../src/coloured-logging.js');
//libraries
const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const util = require('util');
//other scripts

//storage
fs.mkdirSync(path.join(__dirname, 'store'), { recursive: true });
//##### START CREATE SS OBJECT
const ss = {};
//ss.config
const configPath = path.join(__dirname, '..', 'store', 'config.yaml');
if (!fs.existsSync(configPath)) {
    console.log('config.yaml not found, make sure you have run the main js first...');
    process.exit(1);
};
ss.config = yaml.load(fs.readFileSync(configPath, 'utf8'));
//ss.rootDir
ss.rootDir = path.resolve(ss.rootDir || __dirname);
//ss.packageJson
const packageJsonPath = path.join(ss.rootDir, '..', 'package.json');
ss.packageJson = require(packageJsonPath);
//ss.log
ss.log = log;
ss.log.green("Created ss object!");
// console.log(ss.config.services.ratelimit.sensitive);
//##### END CREATE SS OBJECT


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
ss.log.green("account data DB set up!");

const sha256 = (data) => {
    const hash = crypto.createHash('sha256');
    hash.update(data);
    return hash.digest('hex');
};

//db stuff
const runQuery = util.promisify(db.run.bind(db));
const getAll = util.promisify(db.all.bind(db));
const getOne = util.promisify(db.get.bind(db));

//ratelimiting
const addRequest = async (ip, type) => {
    const now = Math.floor(Date.now() / 1000);

    let result = await getOne(`
        SELECT * FROM ip_requests WHERE ip = ?
    `, [ip]);

    if (!result) {
        await runQuery(`
            INSERT INTO ip_requests (ip) VALUES (?)
        `, [ip]);
        result = { sensitive_count: 0, regular_count: 0 };
    }

    let { sensitive_count, regular_count, last_sensitive_reset, last_regular_reset } = result;

    //reset counts, if necessary
    if (now - last_sensitive_reset > (ss.config.services.ratelimit.sensitive.reset_interval || 5 * 60)) { // reset sensitive count every 5 minutes
        sensitive_count = 0;
        await runQuery(`
            UPDATE ip_requests
            SET sensitive_count = 0, last_sensitive_reset = ?
            WHERE ip = ?
        `, [now, ip]);
    };
    if (now - last_regular_reset > (ss.config.services.ratelimit.regular.reset_interval || 60)) { // reset regular count every 1 minute
        regular_count = 0;
        await runQuery(`
            UPDATE ip_requests
            SET regular_count = 0, last_regular_reset = ?
            WHERE ip = ?
        `, [now, ip]);
    };

    //update with new counts
    if (type === 'sensitive') {
        sensitive_count++;
        await runQuery(`
            UPDATE ip_requests
            SET sensitive_count = ?
            WHERE ip = ?
        `, [sensitive_count, ip]);
    } else if (type === 'regular') {
        regular_count++;
        await runQuery(`
            UPDATE ip_requests
            SET regular_count = ?
            WHERE ip = ?
        `, [regular_count, ip]);
    };

    return { sensitive_count: sensitive_count, regular_count: regular_count };
};

const acceptRequest = async (ip, type) => {
    const counts = await addRequest(ip, type);

    console.log(counts);

    if (type === 'sensitive' && counts.sensitive_count >= (ss.config.services.ratelimit.sensitive.max_count || 5)) {
        return false;
    } else if (type === 'regular' && counts.regular_count >= (ss.config.services.ratelimit.regular.max_count || 10)) {
        return false;
    };

    return true;
};


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

//start ws
let port = ss.config.services.port || 13371;
const wss = new WebSocket.Server({ port: port });
wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        try {
            const jsonString = message.toString('utf8');
            const msg = JSON.parse(jsonString);
            const ip = ws._socket.remoteAddress; // Get the IP address of the client
            const cmdType = ss.config.services.ratelimit.sensitive.cmds.includes(msg.cmd) ? "sensitive" : "regular";

            console.log(cmdType, msg);

            const isAccepted = await acceptRequest(ip, cmdType);

            if (!isAccepted) {
                ws.send(JSON.stringify({ error: 'Too many requests. Please try again later.' }));
                return;
            };

            // Client commands
            switch (msg.cmd) {
                case "validateLogin":
                    getUserData(msg.username, true, true)
                        .then(userData => {
                            if (userData) {
                                // console.log("hm", userData.password, sha256(msg.password), userData.password);
                                if (userData.password && (sha256(msg.password) == userData.password)) {
                                    // console.log("yes", msg, userData)
                                    delete userData.password;
                                    ws.send(JSON.stringify(userData));
                                } else {
                                    // console.log("no", msg, userData)
                                    ws.send(JSON.stringify({ error: 'Incorrect password.' }));
                                };
                            } else {
                                console.log('No data found for the given username.');
                                ws.send(JSON.stringify({ error: 'User doesn\'t exist' }));
                            };
                        }).catch((err) => {
                            ss.log.red('Error:', err);
                            ws.send(JSON.stringify({ error: 'Database error.' }))
                        });
                    break;
                case "validateRegister":
                    if (msg.username.length < 3 || !/^[A-Za-z0-9?!._-]+$/.test(msg.username)) ws.send(JSON.stringify({ error: 'Invalid username.' }));
                    else createAccount(msg.username, msg.password)
                        .then((result) => {
                            if (result === true) {
                                getUserData(msg.username, true)
                                    .then(userData => {
                                        if (userData) {
                                            console.log(`Retrieved user data:`, userData);
                                            ws.send(JSON.stringify(userData));
                                        } else {
                                            console.log('No data found for the given username.');
                                        }
                                    }).catch((err) => {
                                        ss.log.red('Error:', err);
                                        ws.send(JSON.stringify({ error: 'Database error.' }))
                                    });
                            } else {
                                if (result == "SQLITE_CONSTRAINT") ws.send(JSON.stringify({ error: 'Username is already taken.' })); //or something
                                else ws.send(JSON.stringify({ error: 'Database error.' }));
                            };
                        }).catch(err => {
                            console.error('Error:', err);
                            ws.send(JSON.stringify({ error: 'Internal server error' }));
                        });
                    break;
                case "feedback":
                    if (ss.config.services.feedback && ss.config.services.feedback.length > 10) {
                        const formData = new FormData();

                        const jsonBlob = new Blob([Object.entries(msg).map(([key, value]) => `${key}: ${value}`).join('\n')], { type: 'text/plain' });
                        formData.append('file', jsonBlob, 'stats.txt');

                        formData.append('payload_json', JSON.stringify({
                            username: 'LegacyShell Feedback',
                            avatar_url: msg.url + 'favicon.ico',
                            allowed_mentions: {
                                parse: []
                            },
                            embeds: [{
                                description: `> from ${msg.email}\n\n${msg.comments}`
                            }]
                        }));

                        fetch(ss.config.services.feedback, {
                            method: 'POST',
                            body: formData
                        });
                    } else
                        ss.log.blue("Feedback received, no discord webhook set!:", msg);

                    ws.send(JSON.stringify({ success: true }));
                    break;
                default:
                    console.log("user sent", msg.cmd || "[[unknown cmd]]", "to services, not running  function")
                    break;
            }

            // Server commands (privileged)
        } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({ error: 'Internal server error' }));
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error: ${error}`);
    });
});

console.log('WebSocket server is running on ws://localhost:' + port);
