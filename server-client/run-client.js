//basic
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
//legacyshell: basic
import misc from '#misc';
//legacyshell: getting configs
import wsrequest from '#wsrequest';
//legacyshell: web server
import express from 'express';
import prepareModified from '#prepare-modified';
//

let ss = misc.instantiateSS(import.meta.dirname);

ss = {
    ...ss,
    cache: {},
    misc,
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
    app.use(express.static(path.join(ss.rootDir, 'src', 'shared-static'))); // src\shared-static
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

async function connectWebSocket(retryCount = 0) {
    try {
        ss.log.blue('WebSocket connection opening. Requesting config information...');
        const configInfo = await wsrequest({
            cmd: "requestConfig",
                lastItems: Math.floor(misc.getLastSavedTimestamp(itemsFilePath)/1000), //well in theory, if its not in existence this returns 0 and we should get it :D
                lastMaps: Math.floor(misc.getLastSavedTimestamp(mapsFilePath)/1000),
                lastServers: Math.floor(misc.getLastSavedTimestamp(serversFilePath)/1000),
        }, ss.config.client.sync_server);

        if (configInfo) {
            ss.log.green('Received config information from sync server.');
    
            const load = function(thing, filePath) {
                if (configInfo[thing]) {
                    ss.log.blue(`[${thing}] loaded from newly retrieved json.`)
                    configInfo[thing] = JSON.stringify(configInfo[thing]);
                    fs.writeFileSync(filePath, configInfo[thing]); //dont convert the json. there is no need.
                    ss.cache[thing] = configInfo[thing];
                    delete configInfo[thing];
                } else {
                    delete configInfo[thing]; //still delete the false, derp
                    if (fs.existsSync(filePath)) {
                        ss.log.italic(`[${thing}] loaded from previously saved json.`);
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
        } else {
            if (!retrieved) {
                ss.log.yellow('Config retrieval failed. Retrying in 30 seconds...');
                setTimeout(() => {
                    connectWebSocket(retryCount + 1);
                }, 30000);
            };
        };
        
    } catch (err) {
        if (!retrieved) {
            ss.log.red(`WebSocket connection failed: ${err.message}. Retrying in 30 seconds... (Attempt ${retryCount + 1})`);
            setTimeout(() => {
                connectWebSocket(retryCount + 1);
            }, 30000);
        };
    };
};

connectWebSocket();