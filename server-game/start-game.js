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
import rm from '#roomManager';
import { getMapsByAvailabilityAsInts, GameTypes, getMapPool } from '#gametypes';
//legacyshell: logging
import log from '#coloured-logging';
//legacyshell: ss
import { ss } from '#misc';
//legacyshell: plugins
import { plugins } from '#plugins';
import { prepareBabylons } from '#prepare-babylons';
//

//i know its called start, even though it should be the other way round. please excuse this.
//i just didnt want to break old configs for the perpetual wrapper.

export default async function run () {

    Object.assign(ss, {
        mapAvailability: {
            public: [],
            private: [],
            both: [],
        },
    });

    await plugins.emit(`${'onLoad'}`, { ss }); //annoyed yet?

    prepareBabylons(path.join(ss.currentDir, 'store', 'models'));

    function startServer() {
        const RoomManager = new rm.newRoomManager();
        ss.RoomManager = RoomManager;

        const port = ss.config.game.port || 13372;
        const wss = new WebSocketServer({ port: port });

        wss.on('connection', (ws, req) => {

            let ip = req.socket.remoteAddress;

            if (!ss.config.game.closed) try {
                ws.on('message', async (message) => {
                    try {
                        var input = new Comm.In(message);
        
                        while (input.isMoreDataAvailable()) {
                            let msg = {};
                            msg.cmd = input.unPackInt8U();
                            console.log(Comm.Convert(msg.cmd));
        
                            switch (msg.cmd) {
                                case Comm.Code.joinGame:
                                    msg.joinType = input.unPackInt8U(); //this is private/public //Comm.Convert(input.unPackInt8())
                                    msg.gameType = input.unPackInt8U(); //this is the gamemode //Comm.Convert(input.unPackInt8())
                                    msg.mapId = input.unPackInt8U(); //selected map
                                    msg.gameId = input.unPackInt16U(); //this is the ID of the room
                                    msg.gameKey = input.unPackInt16U(); //who knows what this does.
                                    msg.classIdx = input.unPackInt8U(); //selected weapon
                                    msg.primary_item_id = input.unPackInt8U(); //primary weapon skin (only accept if signed in btw)
                                    msg.secondary_item_id = input.unPackInt8U(); //secondary weapon skin (only accept if signed in)
                                    msg.colorIdx = input.unPackInt8U(); //selected colour (0-6, 8-13 if vip)
                                    msg.hatId = input.unPackInt8U(); //ignore if not logged in (+999)
                                    msg.stampId = input.unPackInt8U(); //ignore if not logged in (+1999)
                                    msg.nickname = input.unPackString(); //NOT the username!
                                    msg.uuid = input.unPackInt32U();
                                    //additional stuff provided they are signed in
                                    msg.session = input.unPackString(); //technically this is all thats rlly needed tbh

                                    // msg.gameType = GameTypes[msg.gameType] ? msg.gameType : 0;

                                    ss.config.verbose && console.log(msg, Comm.Convert(msg.joinType), Comm.Convert(msg.gameType));
            
                                    let roomFound = RoomManager.searchRooms(msg);
                                    console.log("roomFound", !!roomFound);
        
                                    if (roomFound) {
                                        // console.log(roomFound.ready, roomFound.playerCount, roomFound.playerLimit);
                                        if ((roomFound.ready) && roomFound.playerCount >= roomFound.playerLimit) {
                                            console.log("Comm.Close.gameFull");
                                            ws.close(Comm.Close.gameFull);
                                        } else {
                                            RoomManager.joinRoom(roomFound, msg, ws, ip);
                                        };
                                    } else {
                                        console.log("Comm.Close.gameNotFound");
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

        ss.config.game.closed && log.bgRed('Server is running in closed mode.');
        log.success('WebSocket server is running on ws://localhost:' + port);
    };

    //all this is retrieving the config:

    let retrieved = false;
    let offline = false;

    let mapsFilePath =      path.join(ss.currentDir, 'store', 'maps.json');
    let serversFilePath =   path.join(ss.currentDir, 'store', 'servers.json');
    let itemsFilePath =     path.join(ss.currentDir, 'store', 'items.json');

    async function connectWebSocket(retryCount = 0) {
        nextTimeout = Math.min(nextTimeout + 5e3, 30e3);

        try {
            log.blue('WebSocket connection opening. Requesting config information...');
            await wsrequest({
                cmd: "requestConfig",
                lastMaps: Math.floor(misc.getLastSavedTimestamp(mapsFilePath)/1000),
                lastServers: Math.floor(misc.getLastSavedTimestamp(serversFilePath)/1000),
                lastItems: Math.floor(misc.getLastSavedTimestamp(itemsFilePath)/1000),
            }, ss.config.game.services_server, ss.config.game.auth_key, (event) => {
                let response = event.data;
                var configInfo = JSON.parse(response);

                if (configInfo) {
                    if (!retrieved) {
                        log.green('Received config information from sync server.');
                        offline = false;
            
                        const load = function(thing, filePath) {
                            if (configInfo[thing]) {
                                log.blue(`[${thing}] loaded from newly retrieved json.`);
                                fs.writeFileSync(filePath, JSON.stringify(configInfo[thing]));
                                ss[thing] = configInfo[thing];
                                delete configInfo[thing];
                            } else {
                                delete configInfo[thing]; //still delete the false, derp
                                if (fs.existsSync(filePath)) {
                                    log.italic(`[${thing}] loaded from previously saved json.`);
                                    ss[thing] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                                } else {
                                    log.red(`Shit. We're fucked. We didn't receive an [${thing}] json nor do we have one stored. FUUUU-`);
                                };
                            };
                        };
            
                        load("maps", mapsFilePath);
                        load("servers", serversFilePath);
                        load("items", itemsFilePath);
                
                        delete configInfo.distributed_client;
            
                        configInfo = { ...configInfo, ...configInfo.distributed_game };
                        delete configInfo.distributed_game;
                
                        configInfo = { ...configInfo, ...configInfo.distributed_all };
                        delete configInfo.distributed_all;
                
                        Object.assign(ss, {
                            permissions: configInfo.permissions,
                        })
                        delete configInfo.permissions;
            
                        ss.config.game = { ...ss.config.game, ...configInfo };

                        ss.mapAvailability = getMapsByAvailabilityAsInts(ss.maps);
            
                        retrieved = true;
                        // console.log(ss.permissions);
                        startServer();
                    } else {
                        if ((configInfo.servicesMeta.startTime > ss.config.game.servicesMeta.startTime) && ss.isPerpetual) {
                            console.log("Services server restarted, restarting...");
                            process.exit(1337);
                        };
                        offline = false;
                    };
                } else {
                    if (!retrieved) {
                        log.yellow(`Config retrieval failed. Retrying in ${nextTimeout / 1e3} seconds...`);
                        setTimeout(() => {
                            connectWebSocket(retryCount + 1);
                        }, nextTimeout);
                    };
                };

                return true;
            }, (event) => {
                console.log("damn, it closed. that sucks.");

                if (!offline) {
                    nextTimeout = 1e3;
                    offline = true;
                };

                if (retrieved) {
                    log.yellow(`Services server offline. Retrying in ${nextTimeout / 1e3} seconds...`);
                    setTimeout(() => {
                        connectWebSocket(retryCount + 1);
                    }, nextTimeout);
                };
            });
        } catch (err) {
            if (!retrieved) {
                log.red(`WebSocket connection failed: ${err.message}. Retrying in ${nextTimeout / 1e3} seconds... (Attempt ${retryCount + 1})`);
                setTimeout(() => {
                    connectWebSocket(retryCount + 1);
                }, nextTimeout);
            };
        };
    };

    var nextTimeout = 0;
    connectWebSocket();
};