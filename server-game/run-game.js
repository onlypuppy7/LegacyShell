//ss object
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import WebSocket from 'ws';

import log from '../src/coloured-logging.js';

//storage
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

ss.log.green("Created ss object!");

//start ws
let port = ss.config.services.websocket || 13372;
const wss = new WebSocket.Server({ port: port });
wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        try {
            const jsonString = message.toString('utf8');
            const msg = JSON.parse(jsonString);

            console.log(msg);

            // Client commands
            switch (msg.cmd) {
                case "validateLogin":
                    break;
                default:
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

console.log('WebSocket server is running on ws://localhost:'+port);
