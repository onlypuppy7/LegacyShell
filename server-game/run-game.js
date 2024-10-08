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
import Comm from '#comm';
import rm from './src/roomManager.js';
//

let ss = misc.instantiateSS(import.meta.dirname);

var RoomManager;

ss = {
    ...ss,
    mapAvailability: {
        public: [],
        private: [],
        both: [],
    },
};

function startServer() {
    const RoomManager = new rm.newRoomManager();
    ss.RoomManager = RoomManager;
    rm.setSS(ss);

    const port = ss.config.game.websocket || 13372;
    const wss = new WebSocketServer({ port: port });

    wss.on('connection', (ws, req) => {

        let ip = req.socket.remoteAddress;

        try {
            ws.on('message', async (message) => {
                try {
                    var input = new Comm.In(message);
    
                    while (input.isMoreDataAvailable()) {
                        let msg = {};
                        msg.cmd = input.unPackInt8U();
                        console.log(Comm.Convert(msg.cmd));
    
                        switch (msg.cmd) {
                            case Comm.Code.joinGame:
                                msg.joinType = input.unPackInt8(); //this is private/public //Comm.Convert(input.unPackInt8())
                                msg.gameType = input.unPackInt8(); //this is the gamemode //Comm.Convert(input.unPackInt8())
                                msg.mapId = input.unPackInt8(); //selected map
                                msg.gameId = input.unPackInt16(); //this is the ID of the room
                                msg.gameKey = input.unPackInt16(); //who knows what this does.
                                msg.classIdx = input.unPackInt8(); //selected weapon
                                msg.primary_item_id = input.unPackInt8(); //primary weapon skin (only accept if signed in btw)
                                msg.secondary_item_id = input.unPackInt8(); //secondary weapon skin (only accept if signed in)
                                msg.colorIdx = input.unPackInt8(); //selected colour (0-6, 8-13 if vip)
                                msg.hatId = input.unPackInt8(); //ignore if not logged in (+999)
                                msg.stampId = input.unPackInt8(); //ignore if not logged in (+1999)
                                msg.nickname = input.unPackString(); //NOT the username!
                                //additional stuff provided they are signed in
                                msg.session = input.unPackString(); //technically this is all thats rlly needed tbh
        
                                ss.config.verbose && console.log(msg, Comm.Convert(msg.joinType), Comm.Convert(msg.gameType));
        
                                let roomFound = RoomManager.searchRooms(msg);
                                console.log("roomFound", !!roomFound);
    
                                if (roomFound) {
                                    RoomManager.joinRoom(roomFound, msg, ws);
                                } else {
                                    console.log(Comm.Close.gameNotFound);
                                    ws.close(Comm.Close.gameNotFound);
                                };
                                break
                            case Comm.Code.ping:
                                var output = new Comm.Out();
                                output.packInt8(Comm.Code.ping);
                                ws.send(output.buffer);
                                break;
                        };
                    };
    
                } catch (error) {
                    try {
                        console.error('Error processing message:', error);
                        // ws.send(JSON.stringify({ error: 'Internal server error' })); //ironically this causes the entire fucking thing to crash. so erm, dont.
                    } catch (error) {
                        //christ.
                    };
                }
            });
    
            ws.on('close', () => console.log('Client disconnected (not in a game)'));
            ws.on('error', (e) => console.error(`WebSocket error:`, e));
        } catch (error) {
            //you can shit the bed but dont crash everything
            console.error(error);
        };
    });

    console.log('WebSocket server is running on ws://localhost:' + port);
};

//all this is retrieving the config:

let retrieved = false;

let mapsFilePath =      path.join(ss.currentDir, 'store', 'maps.json');
let serversFilePath =   path.join(ss.currentDir, 'store', 'servers.json');
let itemsFilePath =     path.join(ss.currentDir, 'store', 'items.json');

async function connectWebSocket(retryCount = 0) {
    try {
        ss.log.blue('WebSocket connection opening. Requesting config information...');
        const configInfo = await wsrequest({
            cmd: "requestConfig",
            lastMaps: Math.floor(misc.getLastSavedTimestamp(mapsFilePath)/1000),
            lastServers: Math.floor(misc.getLastSavedTimestamp(serversFilePath)/1000),
            lastItems: Math.floor(misc.getLastSavedTimestamp(itemsFilePath)/1000),
        }, ss.config.game.services_server, ss.config.game.auth_key);

        if (configInfo) {
            ss.log.green('Received config information from sync server.');

            const load = function(thing, filePath) {
                if (configInfo[thing]) {
                    ss.log.blue(`[${thing}] loaded from newly retrieved json.`);
                    fs.writeFileSync(filePath, JSON.stringify(configInfo[thing]));
                    ss[thing] = configInfo[thing];
                    delete configInfo[thing];
                } else {
                    delete configInfo[thing]; //still delete the false, derp
                    if (fs.existsSync(filePath)) {
                        ss.log.italic(`[${thing}] loaded from previously saved json.`);
                        ss[thing] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    } else {
                        ss.log.red(`Shit. We're fucked. We didn't receive an [${thing}] json nor do we have one stored. FUUUU-`);
                    };
                };
            };

            load("maps", mapsFilePath);
            load("servers", serversFilePath);
            load("items", itemsFilePath);

            ss.config.game = { ...ss.config.game, ...configInfo };

            for (let i = 0; i < ss.maps.length; i++) {
                let map = ss.maps[i];
                switch (map.availability) {
                    case "public":
                        ss.mapAvailability.public.push(i);
                        break;
                    case "private":
                        ss.mapAvailability.private.push(i);
                        break;
                    case "both":
                        ss.mapAvailability.public.push(i);
                        ss.mapAvailability.private.push(i);
                        ss.mapAvailability.both.push(i);
                        break;
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
