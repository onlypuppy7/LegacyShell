//basic
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
//legacyshell: basic
import misc from '#misc';
//legacyshell: getting configs
import wsrequest from '#wsrequest';
//legacyshell: game
import WebSocket, { WebSocketServer } from 'ws';
import { Comm, CloseCode, CommCode } from '#comm';
import rm from './src/roomManager.js';
//

let ss = misc.instanciateSS(import.meta.dirname);

rm.setSS(ss);

const RoomManager = new rm.newRoomManager();

ss = {
    ...ss,
    RoomManager,
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
                            msg.gameId = input.unPackInt16(); //this is the ID of the room
                            msg.gameKey = input.unPackInt16(); //who knows what this does.
                            msg.classIdx = input.unPackInt8(); //selected weapon
                            msg.primary_item_id = input.unPackInt8(); //primary weapon skin (only accept if signed in btw)
                            msg.secondary_item_id = input.unPackInt8(); //secondary weapon skin (only accept if signed in)
                            msg.colorIdx = input.unPackInt8(); //selected colour (0-6, 8-13 if vip)
                            msg.hatId = input.unPackInt8() + 999; //reject if not logged in
                            msg.stampId = input.unPackInt8() + 1999; //reject if not logged in
                            msg.nickname = input.unPackString(); //NOT the username!
                            //additional stuff provided they are signed in
                            msg.session = input.unPackString(); //technically this is all thats rlly needed tbh
                            msg.id = input.unPackString(); //yeh this isnt even necessary
    
                            ss.config.verbose && console.log(msg, Comm.convertCode(msg.joinType), Comm.convertCode(msg.gameType));
    
                            RoomManager.searchRooms(msg);
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

//all this is retrieving the config:

let retrieved = false;

let mapsFilePath =      path.join(ss.currentDir, 'store', 'maps.json');
let serversFilePath =   path.join(ss.currentDir, 'store', 'servers.json');

async function connectWebSocket(retryCount = 0) {
    try {
        ss.log.blue('WebSocket connection opening. Requesting config information...');
        const data = await wsrequest({
            cmd: "requestConfig",
            lastMaps: Math.floor(misc.getLastSavedTimestamp(mapsFilePath)/1000),
            lastServers: Math.floor(misc.getLastSavedTimestamp(serversFilePath)/1000),
        }, ss.config.game.services_server, ss.config.game.auth_key);

        if (data) {
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

            ss.mapAvailability = {
                public: [],
                private: [],
                both: [],
            };

            for (let i = 0; i < ss.maps.length; i++) {
                let map = ss.maps[i];
                switch (map.availability) {
                    case "public":
                        ss.mapAvailability.public.push(i);
                        break
                    case "private":
                        ss.mapAvailability.private.push(i);
                        break
                    case "both":
                        ss.mapAvailability.public.push(i);
                        ss.mapAvailability.private.push(i);
                        ss.mapAvailability.both.push(i);
                        break
                };
            };

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
