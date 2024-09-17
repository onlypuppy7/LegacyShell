//ss object
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import WebSocket, { WebSocketServer } from 'ws';

import log from '../src/coloured-logging.js';
import { Comm, CloseCode, CommCode } from '../src/comm.js';

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
    log,
};

ss.log.green('created ss object!');

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
let mapsFilePath = path.join(ss.rootDir, 'store', 'maps.json');
let serversFilePath = path.join(ss.rootDir, 'store', 'servers.json');

function connectWebSocket(retryCount = 0) {
    const ws = new WebSocket(ss.config.game.services_server); // Use the services server URL from the config or something

    ws.on('open', function open() {
        ss.log.blue('WebSocket connection opened. Requesting config information...');
        ws.send(JSON.stringify({
            cmd: "requestConfig",
            auth_key: ss.config.game.auth_key,
            lastMaps: Math.floor(getLastSavedTimestamp(mapsFilePath)/1000),
            lastServers: Math.floor(getLastSavedTimestamp(serversFilePath)/1000),
        }));
    });

    ws.on('message', function message(data) {
        ss.log.green('Received config information from sync server.');
        const configInfo = JSON.parse(data);

        console.log(configInfo);

        const load = function(thing, filePath) {
            if (configInfo[thing]) {
                ss.log.blue(`[${thing}] loaded from newly retrieved json.`)
                configInfo[thing] = JSON.stringify(configInfo[thing]);
                fs.writeFileSync(filePath, configInfo[thing]); //dont convert the json. there is no need.
                ss[thing] = configInfo[thing];
                delete configInfo[thing];
            } else {
                ss.log.italic(`[${thing}] loaded from previously saved json.`);
                delete configInfo[thing]; //still delete the false, derp
                if (fs.existsSync(filePath)) {
                    ss[thing] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                } else {
                    ss.log.red(`Shit. We're fucked. We didn't receive an [${thing}] json nor do we have one stored. FUUUU-`);
                };
            };
        };

        load("maps", mapsFilePath);
        load("servers", serversFilePath);

        console.log(ss.servers);

        ss.config.game = { ...ss.config.game, ...configInfo };

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

async function wsRequest(payload) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(ss.config.game.services_server);
        ws.onopen = function() {
            ws.send({
                ...payload,
                auth_key: ss.config.game.auth_key,
            });
        };
        ws.onmessage = function(event) {
            resolve(event.data);
            ws.close();
        };
        ws.onerror = function(error) {
            reject('WebSocket error: ' + error.message);
        };
    });
};

function startServer() {
    const port = ss.config.game.websocket || 13372;
    const wss = new WebSocketServer({ port: port });

    wss.on('connection', (ws, req) => {

        let ip = req.socket.remoteAddress;

        ws.on('message', async (message) => {
            try {
                var input = Comm.input(message);

                while (input.isMoreDataAvailable()) {
                    let msg = {};
                    msg.cmd = input.unPackInt8U();
                    console.log(Comm.convertCode(msg.cmd));

                    if (msg.cmd == CommCode.joinGame) {
                        msg.joinType = input.unPackInt8(); //this is private/public //Comm.convertCode(input.unPackInt8())
                        msg.gameType = input.unPackInt8(); //this is the gamemode //Comm.convertCode(input.unPackInt8())
                        msg.mapId = input.unPackInt8(); //selected map
                        msg.gameId = input.unPackInt16(); 
                        msg.gameKey = input.unPackInt16();
                        msg.classIdx = input.unPackInt8();
                        msg.primary_item_id = input.unPackInt8();
                        msg.secondary_item_id = input.unPackInt8();
                        msg.colorIdx = input.unPackInt8();
                        msg.hatId = input.unPackInt8() + 999;
                        msg.stampId = input.unPackInt8() + 1999;
                        msg.nickname = input.unPackString();

                        msg.session = input.unPackString();
                        msg.id = input.unPackString();

                        ss.config.verbose && console.log(msg, Comm.convertCode(msg.joinType), Comm.convertCode(msg.gameType));

                        if (msg.joinType == "joinPublicGame") {

                        } else if (msg.joinType == "joinPrivateGame") {

                        };
                    };
                }

            } catch (error) {
                console.error('Error processing message:', error);
                ws.send(JSON.stringify({ error: 'Internal server error' }));
            }
        });

        ws.on('close', () => console.log('Client disconnected'));
        ws.on('error', (e) => console.error(`WebSocket error:`, e));
    });

    console.log('WebSocket server is running on ws://localhost:' + port);
};

connectWebSocket();
