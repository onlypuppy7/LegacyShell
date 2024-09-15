import { spawn } from 'child_process';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

import log from '../src/coloured-logging.js';

// optional passing of args instead of the yaml (warning cancer do not use)

// let passed = process.argv[2];
// try {
//     passed = atob(passed);
//     passed = JSON.parse(passed);
// } catch (error) {
//     console.log(error);
//     passed = {};
// };
// passed = (typeof passed == 'object' && !Array.isArray(passed)) ? passed : {}; //idk what all this is for

const configPath = path.join(import.meta.dirname, '..', 'store', 'config.yaml');
if (!fs.existsSync(configPath)) {
    console.log('config.yaml not found, make sure you have run the main js first...');
    process.exit(1);
};

const ss = {
    rootDir: path.join(import.meta.dirname, '..'),
    config: yaml.load(fs.readFileSync(configPath, 'utf8')),
    packageJson: JSON.parse(fs.readFileSync(path.join(path.resolve(import.meta.dirname), '..', 'package.json'), 'utf8')),
    log
};

let server_type = process.argv[2].replace("--","");

let passed = ss.config.perpetual[server_type];

const options = {
    //process
    process_cmd:            passed.process_cmd              || "idk lol",
    //daily restart
    dailyrestart_enable:    passed.dailyrestart_enable      || false,
    dailyrestart_time:      passed.dailyrestart_time        || "4:00",
    //file logging
    logfile_enable:         passed.logfile_enable           || true,
    logfile_location:       path.join(ss.rootDir, "store", "logs", server_type), //no editing kek
    //webhook logging
    webhook_url:            passed.webhook_url              || "", //false or empty is disabled
    webhook_username:       passed.webhook_username         || "Webhook", //eg "LegacyShell: Client Server"
    webhook_avatar:         passed.webhook_avatar           || "https://cdn.onlypuppy7.online/legacyshell/client.png", //eg "https://cdn.onlypuppy7.online/legacyshell/client.png"
    webhook_ping_user:      passed.webhook_ping_user        || false, //this might flood your shit
    webhook_ping_role:      passed.webhook_ping_role        || false,
};

// console.log(process.argv, passed);

const getTimestamp = (noBrackets) => {
    const now = new Date();
    const day = now.getDate().toString().padStart(2, '0');
    const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Months are zero-indexed
    const year = now.getFullYear().toString().slice(-2); // Get last two digits of the year
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    
    return noBrackets ? `${day}-${month}-${year}_${hours}-${minutes}-${seconds}` : `[${day}-${month}-${year} ${hours}:${minutes}:${seconds}]`;
};

const stripAnsi = (str) => {
    return str.replace(/\x1B[[(?);]{0,2}(;?\d)*./g, '');
};

let logQueue = [];
let queuedChunks = [];
let maxMessageLength = 1900;
let messagesSent = 0;

const logSend = (msg) => {
    msg = `${getTimestamp()} ${msg}`;
    ss.log.muted(msg);
    appendLog(msg);
};

const logNoSend = (msg) => {
    msg = `${getTimestamp()} ${msg}`;
    ss.log.muted(msg);
    appendLog(msg, true);
};

fs.mkdirSync(options.logfile_location, { recursive: true });
const logFilePath = path.join(options.logfile_location, `${server_type}_${getTimestamp(true)}.log`);
fs.mkdirSync(path.dirname(logFilePath), { recursive: true });  // Ensure the directory exists

const appendLog = (msg, noSend) => {
    msg = stripAnsi(msg);
    (!noSend) && logQueue.push(msg);
    fs.appendFile(logFilePath, `${msg}\n`, (err) => {
        if (err) {
            console.error(`Failed to write to log file: ${err.message}`);
        };
    });
};

logSend("Logfiles will be sent to: "+logFilePath);

function divideString(str, chunkSize) {
    let result = [];
    for (let i = 0; i < str.length; i += chunkSize) {
        result.push(str.slice(i, i + chunkSize));
    };
    return result;
};

let webhookInterval;
let runningProcess = null;
let restartScheduled = false;

const sendLogsToWebhook = () => {
    while (logQueue.length > 0) {
        let msg = logQueue.shift();
        if (msg.length > maxMessageLength) {
            let msgs = divideString(msg, maxMessageLength);
            logQueue = [
                ...msgs,
                ...logQueue
            ];
            // console.log("exceeded", logQueue, queuedChunks);
        } else {
            let lastChunk = queuedChunks[0] || "";
            let newMessage = `\n${msg}`;
            let newChunk = lastChunk + newMessage;
            if (newChunk.length > maxMessageLength) {
                queuedChunks.unshift(newMessage);
                // console.log("new chunk");
            } else {
                queuedChunks[0] = newChunk;
                // console.log("old chunk");
            };
        };
    };

    // console.log(queuedChunks.length, logQueue, queuedChunks)
    if (queuedChunks.length > 0) {
        logNoSend(`Sending log chunk to webhook...`);

        fetch(options.webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username: options.webhook_username,
                avatar_url: options.webhook_avatar,
                content: `${queuedChunks[queuedChunks.length - 1].slice(0, 2000)} (${messagesSent%1000})`, //just in case #_#
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to send logs: ${response.statusText}`);
            };
            logNoSend(`Logs successfully sent to webhook. ${messagesSent}`);
            queuedChunks.pop(); messagesSent++;
        })
        .catch(err => {
            logNoSend(`Error sending logs to webhook: ${JSON.stringify(err.message)}`);
        });
    };
    const randomDelay = (15 - Math.min(queuedChunks.length, 7) + Math.floor(Math.random() * 8) - 4) * 1000; // +/- 4 seconds randomization
    clearInterval(webhookInterval);
    webhookInterval = setInterval(sendLogsToWebhook, randomDelay);
};

const startProcess = () => {
    if (runningProcess) {
        logSend(`Stopping previous process...`);
        runningProcess.kill('SIGINT');
    }

    logSend(`Starting process: ${options.process_cmd}`);
    
    runningProcess = spawn('node', [options.process_cmd], {
        stdio: ['inherit', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: 'true' },
    });

    runningProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(Boolean);
        lines.forEach(line => {
            const log = `${getTimestamp()} ${line}`;
            process.stdout.write(`${log}\n`); // color and timestamp
            appendLog(log);
        });
    });

    runningProcess.stderr.on('data', (data) => {
        const lines = data.toString().split('\n').filter(Boolean);
        lines.forEach(line => {
            const log = `${getTimestamp()} ERROR: ${line}`;
            process.stderr.write(`${log}\n`); // color and timestamp
            appendLog(log);
        });
    });

    runningProcess.on('exit', (code, signal) => {
        if (signal === 'SIGINT') {
            logSend(`Process terminated manually.`);
            return;
        };
        let pingUser = options.webhook_ping_user ? ` <@${options.webhook_ping_user}>` : "";
        let pingRole = options.webhook_ping_role ? ` <@&${options.webhook_ping_role}>` : "";
        logSend(`Process exited with code ${code}. Restarting...${pingUser}${pingRole}`);
        setTimeout(() => {
            startProcess();
        }, 5000);
    });
};

const autoRestart = () => {
    if (options.dailyrestart_enable) {
        if (restartScheduled) {
            logSend(`Restart already scheduled.`);
            return;
        };
    
        const now = new Date();
        const [restartHour, restartMinute] = options.dailyrestart_time.split(':').map(Number);
        const nextRestart = new Date();
        nextRestart.setHours(restartHour, restartMinute, 0, 0);
        
        let timeUntilRestart = nextRestart - now;
        if (timeUntilRestart <= 0) {
            timeUntilRestart += 24 * 60 * 60 * 1000;
        };
    
        logSend(`Scheduled restart in ${Math.floor(timeUntilRestart / 1000 / 60)} minutes.`);
        restartScheduled = true;
    
        setTimeout(() => {
            logSend(`Auto-restarting process.`);
            startProcess();
            restartScheduled = false;
        }, timeUntilRestart);
    };
};

//this is just a big piece of shit to test message splitting. uncomment to rape discord
// logSend(("e").repeat(4000));

logSend(`Started with options: ${JSON.stringify(options)}\n`);

if (options.webhook_url && options.webhook_url.length > 0) {
    logSend("Logs will be sent to webhook every ~15 seconds.");
    webhookInterval = setInterval(sendLogsToWebhook, 15000);
} else {
    logSend("Logs won't be sent to webhook, as no URL was provided.");
};

startProcess();
autoRestart();
