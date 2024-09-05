import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import express from 'express';
import WebSocket from 'ws';

import log from '../src/coloured-logging.js';
import prepareModified from './prepare-modified.js';

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
    packageJson: JSON.parse(fs.readFileSync(path.join(path.resolve(import.meta.dirname), '..', 'package.json'), 'utf8')),
    log
};

ss.log.green("Created ss object!");

function startServer() {
    retrieved = true;
    try {
        ss.log.blue('Generating modified files (eg minifying shellshock.min.js)...');
        prepareModified(ss);
    } catch (error) {
        console.error('Modification failed:', error);
        process.exit(1);
    };

    const app = express();
    const port = ss.config.client.port || 13370;

    app.use(express.static(path.join(import.meta.dirname, 'store', 'client-modified'))); // server-client\store\client-modified
    app.use(express.static(path.join(import.meta.dirname, 'src', 'client-static'))); // server-client\src\client-static

    app.listen(port, () => {
        ss.log.success(`Server is running on http://localhost:${port}`);
    });
};

let retrieved = false;

function connectWebSocket(retryCount = 0) {
    const ws = new WebSocket(ss.config.client.sync_server); // Use the sync server URL from the config

    ws.on('open', function open() {
        ss.log.blue('WebSocket connection opened. Requesting config information...');
        ws.send(JSON.stringify({
            cmd: "requestConfig",
        }));
    });

    ws.on('message', function message(data) {
        ss.log.green('Received config information from sync server.');
        const configInfo = JSON.parse(data);

        ss.config.client = { ...ss.config.client, ...configInfo };
        ss.distributed_config = yaml.dump(configInfo, { indent: 4 });

        console.log(ss.distributed_config);

        if (!retrieved) startServer();
    });

    ws.on('error', function error(err) {
        ss.log.red(`WebSocket connection failed: ${err.message}. Retrying in 30 seconds... (Attempt ${retryCount + 1})`);
        setTimeout(() => {
            connectWebSocket(retryCount + 1);
        }, 30000);
    });

    ws.on('close', function close() {
        ss.log.yellow('WebSocket connection closed. Retrying in 30 seconds...');
        setTimeout(() => {
            connectWebSocket(retryCount + 1);
        }, 30000);
    });
};

connectWebSocket();