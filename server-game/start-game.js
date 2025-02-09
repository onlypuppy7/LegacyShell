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
import events from '#events';
//

//i know its called start, even though it should be the other way round. please excuse this.
//i just didnt want to break old configs for the perpetual wrapper.

export var ws;

export default async function run () {
    Object.assign(ss, {
        mapAvailability: {
            public: [],
            private: [],
            both: [],
        },
    });

    await plugins.emit(`${'onLoad'}`, { ss }); //annoyed yet?

    await prepareBabylons(path.join(ss.currentDir, 'store', 'models'));

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
                                    msg.primary_item_id = input.unPackInt16U(); //primary weapon skin (only accept if signed in btw)
                                    msg.secondary_item_id = input.unPackInt16U(); //secondary weapon skin (only accept if signed in)
                                    msg.colorIdx = input.unPackInt8U(); //selected colour (0-6, 8-13 if vip)
                                    msg.hatId = input.unPackInt16U(); //ignore if not logged in (+999)
                                    msg.stampId = input.unPackInt16U(); //ignore if not logged in (+1999)
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

    let mapsFilePath      = path.join(ss.currentDir, 'store', 'maps.json');
    let serversFilePath   = path.join(ss.currentDir, 'store', 'servers.json');
    let itemsFilePath     = path.join(ss.currentDir, 'store', 'items.json');

    async function connectWebSocket(retryCount = 0) {
        nextTimeout = Math.min(nextTimeout + 3e3, 30e3);

        try {
            log.blue('WebSocket connection opening. Requesting config information...');
            await wsrequest({
                cmd: "requestConfig",
                serverType: "game",
                lastMaps: Math.floor(misc.getLastSavedTimestamp(mapsFilePath)/1000),
                lastServers: Math.floor(misc.getLastSavedTimestamp(serversFilePath)/1000),
                lastItems: Math.floor(misc.getLastSavedTimestamp(itemsFilePath)/1000),
            }, ss.config.game.services_server, ss.config.game.auth_key, async (event, wsP) => {
                let response = event.data;
                var msg = JSON.parse(response);
                ws = wsP;

                ss.config.verbose && (!msg.cmd == "servicesInfo") && (log.dim("Received cmd: "+msg.cmd), msg.cmd !== "requestConfig" && console.log(msg));

                await plugins.emit('connectWebSocketMessage', { this: this, ss, msg });

                if (!plugins.cancel) switch (msg.cmd) {
                    case "requestConfig":
                        if (!retrieved) {
                            log.green('Received config information from sync server.');
                            offline = false;

                            await plugins.emit("requestConfigReceived", {msg});
                
                            const load = function(thing, filePath) {
                                if (msg[thing]) {
                                    log.blue(`[${thing}] loaded from newly retrieved json.`);
                                    fs.writeFileSync(filePath, JSON.stringify(msg[thing]));
                                    ss[thing] = msg[thing];
                                    delete msg[thing];
                                } else {
                                    delete msg[thing]; //still delete the false, derp
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
                    
                            delete msg.distributed_client;
                
                            msg = { ...msg, ...msg.distributed_game };
                            delete msg.distributed_game;
                    
                            msg = { ...msg, ...msg.distributed_all };
                            delete msg.distributed_all;
                    
                            ss.config.servicesMeta = msg.servicesMeta;
                            delete msg.servicesMeta;

                            ss.config.restartTime = msg.restartTime;
                            delete msg.restartTime;
                    
                            Object.assign(ss, {
                                permissions: msg.permissions,
                                events: msg.events,
                            });
                            delete msg.permissions;
                            delete msg.events;
                
                            ss.config.game = { ...ss.config.game, ...msg };

                            ss.mapAvailability = getMapsByAvailabilityAsInts(ss.maps);

                            ss.thisServer = msg.yourServer;
                
                            retrieved = true;
                            // console.log(ss.permissions);
                            startServer();
                        } else {
                            if ((msg.servicesMeta.startTime > ss.config.servicesMeta.startTime) && ss.isPerpetual) {
                                console.log("Services server restarted, restarting...");
                                process.exit(1337);
                            };
                            offline = false;
                        };
                        break;
                    case "servicesInfo":
                        
                        break;
                    default:
                        log.error(`Unknown command received: ${msg.cmd}`);
                        break;
                };
                
                
                // } else {
                //     if (!retrieved) {
                //         log.yellow(`Config retrieval failed. Retrying in ${nextTimeout / 1e3} seconds...`);
                //         setTimeout(() => {
                //             connectWebSocket(retryCount + 1);
                //         }, nextTimeout);
                //     };
                // };

                return true;
            }, (event) => {
                console.log("damn, it closed. that sucks.");

                if (!offline) {
                    nextTimeout = 2e3;
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