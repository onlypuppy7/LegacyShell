//basic
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
//getting configs
import WebSocket, { WebSocketServer } from 'ws';
//legacyshell: basic
import misc from '../src/shell/general/misc.js';
//legacyshell: game
import { Comm, CloseCode, CommCode } from '../src/shell/comm.js';
import { MapManager } from './src/mapManager.js';
//

let ss = misc.instanciateSS(import.meta.dirname);

let retrieved = false;
let mapsFilePath = path.join(ss.currentDir, 'store', 'maps.json');
let serversFilePath = path.join(ss.currentDir, 'store', 'servers.json');

function connectWebSocket(retryCount = 0) {
    const ws = new WebSocket(ss.config.game.services_server); // Use the services server URL from the config or something

    ws.on('open', function open() {
        ss.log.blue('WebSocket connection opened. Requesting config information...');
        ws.send(JSON.stringify({
            cmd: "requestConfig",
            auth_key: ss.config.game.auth_key,
            lastMaps: Math.floor(misc.getLastSavedTimestamp(mapsFilePath)/1000),
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

                    switch (msg.cmd) {
                        case CommCode.joinGame:
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
                            break
                        case CommCode.ping:
                            var packet = Comm.output();
                            packet.packInt8(Comm.ping);
                            ws.send(packet.buffer);
                            break;
                    }
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
