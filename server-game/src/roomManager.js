//legacyshell: roomManager
import Comm from '#comm';
import { Worker } from 'worker_threads';
import { GameTypes, getMapPool } from '#gametypes';
import { devlog } from '#constants';
//legacyshell: servicesWs
import { ws as servicesWs } from '../start-game.js';
//legacyshell: logging
import log from 'puppylog';
//legacyshell: ss
import { ss } from '#misc';
//legacyshell: plugins
import { plugins } from '#plugins';
//

const id_length = 3; //btw you cant just modify this without also adjusting the client's code. do you ever NEED to modify this? no. just have it static.
const highestRoomID = Math.pow(36, id_length) - 1;
//possibilities:
//1:             36
//2:          1,296
//3:         46,656
//4:      1,679,616
//5:     60,466,176

export var gameInfo = {};

class newRoomManager {
    constructor() {
        (Math);
        this.rooms = new Map();
        this.workers = new Map();
        console.log(`RoomManager initialized.`, this.getUnusedID());

        this.sendInfoToServices();
        setInterval(() => {
            this.sendInfoToServices();
        }, ss.config.game.servicesInfoCollectInterval * 1e3);

        this.createRoomWorker();
    };

    getUnusedID() {
        if (this.rooms.size < (highestRoomID - 10)) { // -10 is just to be safe tbh.
            let id = this.getRandomID();
            while (this.getRoom(id)) {
                id = this.getRandomID();
            };
            return id;
        } else {
            return null; //at the limit. HOW???
        };
    };

    searchRooms(info) {
        var thisGameType = GameTypes[info.gameType];

        let roomSelection = this.rooms;
        if (info.joinType === Comm.Code.joinPublicGame) {
            roomSelection = this.getRoomsJoinable(roomSelection);
            roomSelection = this.getRoomsOfJoinType(info.joinType, roomSelection);
            if (!thisGameType) {
                thisGameType = Math.getRandomFromList(this.getAllActiveGameTypes(roomSelection));
                if (!thisGameType) {
                    thisGameType = Math.getRandomFromList(GameTypes);
                };
                info.gameType = thisGameType.value;
            };
        };

        var mapPool = thisGameType ? thisGameType.mapPool : "none";

        console.log("determined mapPool", mapPool);

        if (info.joinType === Comm.Code.createPrivateGame) {
            if (!thisGameType) {
                thisGameType = Math.getRandomFromList(GameTypes);
                info.gameType = thisGameType.value;
            };
            console.log("create game?");
            let remainingMapIds = [...ss.mapAvailability.private];
            remainingMapIds = getMapPool(remainingMapIds, mapPool, ss.maps);
            console.log(info.gameType, mapPool, remainingMapIds);
            info.mapId = remainingMapIds.includes(info.mapId) ? info.mapId : Math.getRandomFromList(remainingMapIds);
            return this.createRoom(info);
        } else if (info.joinType === Comm.Code.joinPrivateGame) {
            if (info.gameId && info.gameId > 0) {
                return this.getRoom(info.gameId);
            };
        } else if (info.joinType === Comm.Code.joinPublicGame) {
            console.log("public game");
            //this is where it gets interesting
            // console.log("joinType", info.joinType, roomSelection);
            roomSelection = this.getRoomsOfGameType(info.gameType, roomSelection);
            // console.log("gameType", info.gameType, roomSelection);
            let remainingMapIds = [...ss.mapAvailability.public];
            remainingMapIds = getMapPool(remainingMapIds, mapPool, ss.maps);
            console.log(info.gameType, mapPool, remainingMapIds);
            roomSelection.forEach((room) => {
                remainingMapIds = remainingMapIds.filter(mapId => mapId !== room.mapId);
            });
            // console.log("remainingMapIds", remainingMapIds);
            let createNew = (roomSelection.length === 0 && 1) || (Math.getRandomChance(0.1) && 2) || false; //create new, if no rooms OR in the case where some maps are not taken
            console.log("createNew", createNew, roomSelection.length);
            if (createNew) {
                info.mapId = Math.getRandomFromList(remainingMapIds);
                console.log("<3", info.mapId, info.mapId && ss.maps[info.mapId].name, remainingMapIds)
                return this.createRoom(info);
            } else {
                return Math.getRandomFromList(roomSelection);
            };
        };
        console.log("fail?");
        return null;
    };

    getRoomsJoinable(selection = this.rooms) { //player limit, or anything else
        const matchingRooms = [];
        for (const room of selection.values()) {
            if ((room.ready) && room.playerCount < room.playerLimit) {
                matchingRooms.push(room);
            };
        };
        return matchingRooms;
    };

    getRoomsOfJoinType(joinType, selection = this.rooms) { //private/public
        const matchingRooms = [];
        for (const room of selection.values()) {
            if (room.joinType === joinType) {
                matchingRooms.push(room);
            };
        };
        return matchingRooms;
    };

    getRoomsOfGameType(gameType, selection = this.rooms) { //gamemode
        const matchingRooms = [];
        for (const room of selection.values()) {
            if (room.gameType === gameType) {
                matchingRooms.push(room);
            };
        };
        return matchingRooms;
    };

    getAllActiveGameTypes(selection = this.rooms) {
        const gameTypes = [];
        for (const room of selection.values()) {
            var roomGameType = GameTypes[room.gameType];
            if (!gameTypes.includes(roomGameType)) {
                gameTypes.push(roomGameType);
            };
        };
        return gameTypes;
    };

    getRandomID() {
        return Math.getRandomInt(1, highestRoomID); //not 0. pain in the ass. 0 == false type shit
    };

    async createRoomWorker() {
        try {
            log.green("Creating another room worker in preparation...");
            this.roomWorker = new Worker(new URL('./worker.js', import.meta.url));

            this.roomWorker.postMessage(["setSS", {
                maps: ss.maps,
                items: ss.items,
                permissions: ss.permissions,
                config: ss.config,
            }]);
        } catch (e) {
            console.error("error making room worker", e);
        };
    }

    getRoomWorker() {
        const oldRoom = this.roomWorker;
        this.createRoomWorker();
        return oldRoom;
    };

    createRoom(info) {
        // info.mapId

        info.gameId = this.getUnusedID();
        // info.gameKey = Math.getRandomInt(10, Math.pow(36, 2) - 10);
        info.gameKey = 784;
        const worker = this.getRoomWorker();

        info = {
            ...info,
            locked: false,
        };

        const createdRoom = {
            ...info,
            worker,
            wsMap: new Map(),
            wsIdx: 0,
            closeAllWs: () => {
                createdRoom.wsMap.forEach(ws => {
                    try {
                        ws.close();
                        console.log("Mass closed WS connection to wsId:", ws.wsId);
                    } catch (error) { 
                        log.error("error in closeAllWs", error);
                    };
                });
            },
            terminate: () => {
                try {
                    log.info("terminating room:", createdRoom.gameId);
                    createdRoom.closeAllWs();
                    worker.terminate();
                } catch (error) {
                    log.error("error in terminate", error);
                };
            },
            bootedIps: [],
        };

        worker.on('message', (msg) => {
            try {
                const [ msgType, content, wsId ] = msg;
                var room = this.getRoom(info.gameId);
                const ws = room.wsMap.get(wsId);

                // devlog("RoomManager received message", msgType, content, wsId, msg);
    
                switch (msgType) {
                    case Comm.Worker.send: //send stuff to ws
                        ws.send(content);
                        break;
                    case Comm.Worker.close: //close stuff to ws
                        ws.close(content);
                        break;
                    case Comm.Worker.updateRoom: //update the room
                        // console.log("updateRoom received", content);
                        Object.assign(createdRoom, content);
                        // console.log(room.ready, createdRoom.ready, content);
                        // console.log(room.playerLimit, createdRoom.ready);
                        break;
                    case Comm.Worker.boot: //boot a player
                        room.bootedIps.push(ws.ip);
                        ws.close(Comm.Close.booted);
                        break;
                    case Comm.Worker.closeAllWs: //close all ws
                        room.closeAllWs();
                        break;
                    case Comm.Worker.terminate:
                        room.terminate();
                        break;
                    default:
                        break;
                };
            } catch (error) {
                log.error(error);
            };
        });

        worker.on('error', (error) => {
            try {
                createdRoom.terminate();
                log.error('The game thread for', info.gameId, "errored out, now look at this, and see below:", error);
                console.error(error);
            } catch (error) {
                log.error("Wtf? Error in worker error", error);  
            };
            // this.removeRoom(info.gameId); //unnecessary, is removed on exit
        });

        worker.on('exit', (code) => {
            try {
                console.log('Worker exited.', code, info.gameId);
                createdRoom.terminate();
                this.removeRoom(info.gameId);
            } catch (error) {
                log.error("Error in worker exit", code, error);
            };
        });

        worker.postMessage(["createRoom", info]);

        this.rooms.set(info.gameId, createdRoom);
        this.workers.set(info.gameId, worker);

        return createdRoom;
    };

    joinRoom(room, msg, ws, ip) {
        console.log("uuids", room.uuids, msg.uuid)
        if (room.bootedIps.includes(ip)) {
            ws.close(Comm.Close.booted);
        } else if (room.uuids && room.uuids.includes(msg.uuid)) {
            ws.close(Comm.Close.masterServerBusy);
        } else if (msg.session !== "" && room.sessions && room.sessions.includes(msg.session)) {
            ws.close(Comm.Close.masterServerBusy);
        } else if (room.locked) {
            ws.close(Comm.Close.locked);
        } else {
            let wsId = room.wsIdx++;
    
            ws.removeAllListeners('message');
            ws.on('message', (content)=>{
                room.worker.postMessage(["wsMessage", content, wsId]);
            });
            ws.removeAllListeners('close');
            ws.on('close', (content)=>{
                room.worker.postMessage(["wsClose", content, wsId]);
            });
            ws.wsId = wsId;
            ws.ip = ip;
    
            room.wsMap.set(wsId, ws);
    
            msg.wsId = wsId;
            // msg.ip = ip;
            room.worker.postMessage(["joinPlayer", msg]);
        };
    };

    removeRoom(id) {
        if (this.rooms.has(id)) {
            this.rooms.delete(id);
        } else {
            return null; //doesnt exist
        };
    };

    getRoom(id) {
        if (this.rooms.has(id)) {
            return this.rooms.get(id);
        } else {
            return null; //doesnt exist
        };
    };

    async sendInfoToServices() {
        function makeGameTypeArray() {
            return Array.from(GameTypes, () => 0);
        };

        Object.assign(gameInfo, {
            playerCountPublic: makeGameTypeArray(),
            playerCountPrivate: makeGameTypeArray(),
            playerCountBoth: makeGameTypeArray(),
            playerCountTotal: {
                public: 0,
                private: 0,
                both: 0,
            },

            roomCountPublic: makeGameTypeArray(),
            roomCountPrivate: makeGameTypeArray(),
            roomCountBoth: makeGameTypeArray(),
            roomCountTotal: {
                public: 0,
                private: 0,
                both: 0,
            },
            
            rooms: [],
        });
        for (const room of this.rooms.values()) {
            var roomInfo = {
                gameCode: (`${ss.thisServer}${(room.gameId).toString(36)}${(room.gameKey).toString(36)}`).toUpperCase(),
                privPublic: room.joinType === Comm.Code.joinPublicGame ? "public" : "private",
                mapName: ss.maps[room.mapId].name,
                gameMode: GameTypes[room.gameType].longName,
                
                playerNames: room.playerNames,
                gameId: room.gameId,
                gameKey: room.gameKey,
                gameType: room.gameType,
                mapId: room.mapId,
                playerCount: room.playerCount,
                playerLimit: room.playerLimit,
                joinType: room.joinType,
                ready: room.ready,
                usernames: room.usernames,
                uuids: room.uuids,
                sessions: room.sessions,
            };
            gameInfo.rooms.push(roomInfo);

            if (room.joinType === Comm.Code.joinPublicGame) {
                gameInfo.playerCountPublic[room.gameType] = (gameInfo.playerCountPublic[room.gameType] || 0) + (room.playerCount || 0);
                gameInfo.playerCountTotal.public += (room.playerCount || 0);

                gameInfo.roomCountTotal.public++;
                gameInfo.roomCountPublic[room.gameType] = (gameInfo.roomCountPublic[room.gameType] || 0) + 1;
            } else {
                gameInfo.playerCountPrivate[room.gameType] = (gameInfo.playerCountPrivate[room.gameType] || 0) + (room.playerCount || 0);
                gameInfo.playerCountTotal.private += (room.playerCount || 0);

                gameInfo.roomCountTotal.private++;
                gameInfo.roomCountPrivate[room.gameType] = (gameInfo.roomCountPrivate[room.gameType] || 0) + 1;
            };
            gameInfo.playerCountBoth[room.gameType] = (gameInfo.playerCountBoth[room.gameType] || 0) + (room.playerCount || 0);
            gameInfo.playerCountTotal.both += (room.playerCount || 0)

            gameInfo.roomCountTotal.both++;
            gameInfo.roomCountBoth[room.gameType] = (gameInfo.roomCountBoth[room.gameType] || 0) + 1;
        };
        await plugins.emit("sendGameInfo", {gameInfo});
        if (!plugins.cancel) servicesWs.send(JSON.stringify({
            cmd: 'servicesInfo',
            thisServer: ss.thisServer,
            gameInfo,
            auth_key: ss.config.game.auth_key,
        }));
    };
};

export default {
    newRoomManager,
};;