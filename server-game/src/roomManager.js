//legacyshell: roomManager
import Comm from '#comm';
import { Worker } from 'worker_threads';
import misc from '#misc';
import extendMath from '#math';
import { GameTypes, getMapPool } from '#gametypes';
//legacyshell: ss
import { ss } from '#misc';
//

const id_length = 3; //btw you cant just modify this without also adjusting the client's code. do you ever NEED to modify this? no. just have it static.
const highestRoomID = Math.pow(36, id_length) - 1;
//possibilities:
//1:             36
//2:          1,296
//3:         46,656
//4:      1,679,616
//5:     60,466,176


class newRoomManager {
    constructor() {
        (Math);
        this.rooms = new Map();
        this.workers = new Map();
        console.log(`RoomManager initialized.`, this.getUnusedID());
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

        var mapPool = thisGameType.mapPool;

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

    createRoom(info) {
        info.mapId

        info.gameId = this.getUnusedID();
        // info.gameKey = Math.getRandomInt(10, Math.pow(36, 2) - 10);
        info.gameKey = 784;
        const worker = new Worker(new URL('./worker.js', import.meta.url));

        info = {
            ...info,
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
                    } catch (error) { }
                });
            },
            bootedIps: [],
        };

        worker.on('message', (msg) => {
            try {
                const [ msgType, content, wsId ] = msg;
                var room = this.getRoom(info.gameId);
                const ws = room.wsMap.get(wsId);
    
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
                    default:
                        break;
                };
            } catch (error) {
                console.error(error);
            };
        });

        worker.on('error', (error) => {
            createdRoom.closeAllWs();
            console.error('The game thread for', info.gameId, "errored out, now look at this:", error);
            // this.removeRoom(info.gameId); //unnecessary, is removed on exit
        });

        worker.on('exit', (code) => {
            console.log('Worker exited.', info.gameId);
            this.removeRoom(info.gameId);
        });

        worker.postMessage(["setSS", {
            maps: ss.maps,
            items: ss.items,
            permissions: ss.permissions,
        }]);

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
};

export default {
    newRoomManager,
};;