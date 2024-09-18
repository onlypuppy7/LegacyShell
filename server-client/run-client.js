//basic
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
//getting configs
import WebSocket from 'ws';
//web server
import express from 'express';
//legacyshell: basic
import prepareModified from './prepare-modified.js';
import misc from '../src/shell/general/misc.js';
//

let ss = misc.instanciateSS(import.meta.dirname);

ss = {
    ...ss,
    cache: {},
};

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

    app.use(express.static(path.join(ss.currentDir, 'store', 'client-modified'))); // server-client\store\client-modified
    app.use(express.static(path.join(ss.currentDir, 'src', 'client-static'))); // server-client\src\client-static

    app.listen(port, () => {
        ss.log.success(`Server is running on http://localhost:${port}`);
    });
};

//all this is retrieving the config:

let retrieved = false;
let itemsFilePath = path.join(ss.currentDir, 'store', 'items.json');
let mapsFilePath = path.join(ss.currentDir, 'store', 'maps.json');
let serversFilePath = path.join(ss.currentDir, 'store', 'servers.json');

function connectWebSocket(retryCount = 0) {
    const ws = new WebSocket(ss.config.client.sync_server); // Use the sync server URL from the config

    ws.on('open', function open() {
        ss.log.blue('WebSocket connection opened. Requesting config information...');
        ws.send(JSON.stringify({
            cmd: "requestConfig",
            lastItems: Math.floor(misc.getLastSavedTimestamp(itemsFilePath)/1000), //well in theory, if its not in existence this returns 0 and we should get it :D
            lastMaps: Math.floor(misc.getLastSavedTimestamp(mapsFilePath)/1000), //this will always be retrieved. ignore the fact that it does that.
            lastServers: Math.floor(misc.getLastSavedTimestamp(serversFilePath)/1000),
        }));
    });

    ws.on('message', function message(data) {
        ss.log.green('Received config information from sync server.');
        const configInfo = JSON.parse(data);

        const load = function(thing, filePath) {
            if (configInfo[thing]) {
                ss.log.blue(`[${thing}] loaded from newly retrieved json.`)
                configInfo[thing] = JSON.stringify(configInfo[thing]);
                fs.writeFileSync(filePath, configInfo[thing]); //dont convert the json. there is no need.
                ss.cache[thing] = configInfo[thing];
                delete configInfo[thing];
            } else {
                ss.log.italic(`[${thing}] loaded from previously saved json.`);
                delete configInfo[thing]; //still delete the false, derp
                if (fs.existsSync(filePath)) {
                    ss.cache[thing] = fs.readFileSync(filePath, 'utf8');
                } else {
                    ss.log.red(`Shit. We're fucked. We didn't receive an [${thing}] json nor do we have one stored. FUUUU-`);
                };
            };
        };

        load("items", itemsFilePath);
        load("maps", mapsFilePath);
        load("servers", serversFilePath);

        // console.log(ss.items);

        ss.config.client = { ...ss.config.client, ...configInfo };
        ss.distributed_config = yaml.dump(configInfo, { indent: 4 }); //this is for later usage displaying for all to see

        ss.config.verbose && ss.log.info(`\n${ss.distributed_config}`);

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