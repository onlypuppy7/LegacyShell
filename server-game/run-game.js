//ss object
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import WebSocket, { WebSocketServer } from 'ws';

import log from '../src/coloured-logging.js';

// temporary storage for the game server. currently unused, but good to have. for now.
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

const port = ss.config.game.websocket || 13372;
const wss = new WebSocketServer({ port: port });

wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        try {
            console.log("msg", message);
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
