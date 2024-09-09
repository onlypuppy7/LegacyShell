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

    app.use(express.static(path.join(ss.rootDir, 'store', 'client-modified'))); // server-client\store\client-modified
    app.use(express.static(path.join(ss.rootDir, 'src', 'client-static'))); // server-client\src\client-static

    app.listen(port, () => {
        ss.log.success(`Server is running on http://localhost:${port}`);
    });
};

function getLastSavedTimestamp(filePath) {
    try {
        const stats = fs.statSync(filePath);
        return stats.mtimeMs;
    } catch (error) {
        ss.log.yellow('Error getting file timestamp. It probably doesn\'t exist... yet!'); //it just doesnt exist. who cares LMAO
        return 0;
    };
};

let retrieved = false;
let itemsFilePath = path.join(ss.rootDir, 'store', 'items.json');

function connectWebSocket(retryCount = 0) {
    const ws = new WebSocket(ss.config.client.sync_server); // Use the sync server URL from the config

    ws.on('open', function open() {
        ss.log.blue('WebSocket connection opened. Requesting config information...');
        ws.send(JSON.stringify({
            cmd: "requestConfig",
            lastItems: Math.floor(getLastSavedTimestamp(itemsFilePath)/1000), //well in theory, if its not in existence this returns 0 and we should get it :D
        }));
    });

    ws.on('message', function message(data) {
        ss.log.green('Received config information from sync server.');
        const configInfo = JSON.parse(data);

        if (configInfo.items) {
            ss.log.blue("Items loaded from newly retrieved json.")
            configInfo.items = JSON.stringify(configInfo.items);
            fs.writeFileSync(itemsFilePath, configInfo.items); //dont convert the json. there is no need.
            ss.items = configInfo.items;
            delete configInfo.items;
        } else {
            ss.log.italic("Items loaded from previously saved json.");
            delete configInfo.items; //still delete the false, derp
            if (fs.existsSync(itemsFilePath)) {
                ss.items = fs.readFileSync(itemsFilePath, 'utf8');
            } else {
                ss.log.red("Shit. We're fucked. We didn't receive an items json nor do we have one stored. FUUUU-");
            };
        };

        // console.log(ss.items);

        ss.config.client = { ...ss.config.client, ...configInfo };
        ss.distributed_config = yaml.dump(configInfo, { indent: 4 }); //this is for later usage displaying for all to see

        ss.config.verbose && console.log(ss.distributed_config);

        startServer();
    });

    ws.on('error', function error(err) {
        if (!retrieved) {
            ss.log.red(`WebSocket connection failed: ${err.message}. Retrying in 30 seconds... (Attempt ${retryCount + 1})`);
            setTimeout(() => {
                connectWebSocket(retryCount + 1);
            }, 30000);
        };
    });

    ws.on('close', function close() {
        if (!retrieved) {
            ss.log.yellow('WebSocket connection closed. Retrying in 30 seconds...');
            setTimeout(() => {
                connectWebSocket(retryCount + 1);
            }, 30000);
        };
    });
};

connectWebSocket();