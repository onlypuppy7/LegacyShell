//ss object
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import WebSocket from 'ws';

import log from '../src/coloured-logging.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// temporary storage for the game server. currently unused, but good to have. for now.
fs.mkdirSync(path.join(__dirname, 'store'), { recursive: true });

const configPath = path.join(__dirname, '..', 'store', 'config.yaml');
if (!fs.existsSync(configPath)) {
    console.log('config.yaml not found, make sure you have run the main js first...');
    process.exit(1);
};

const ss = {
    rootDir: path.resolve(__dirname),
    config: yaml.load(fs.readFileSync(configPath, 'utf8')),
    packageJson: JSON.parse(fs.readFileSync(path.join(path.resolve(__dirname), '..', 'package.json'), 'utf8')),
    log
};

ss.log.green('created ss object!');

const port = ss.config.services.websocket || 13372;
const wss = new WebSocket.Server({ port: port });

wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        try {
            const jsonString = message.toString('utf8');
            const msg = JSON.parse(jsonString);

            console.log(msg);

            // Client commands
            switch (msg.cmd) {
                case 'validateLogin':
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

    ws.on('close', () => console.log('Client disconnected'));
    ws.on('error', (e) => console.error(`WebSocket error:`, e));
});

console.log('WebSocket server is running on ws://localhost:' + port);
