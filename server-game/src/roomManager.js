//legacyshell: roomManager
import ran from '#scrambled';
import Comm from '#comm';
import { Worker } from 'worker_threads';
import misc from '#misc';
//

const id_length = 3; //btw you cant just modify this without also adjusting the client's code. do you ever NEED to modify this? no. just have it static.
const highestRoomID = Math.pow(36, id_length) - 1;
//possibilities:
//1:             36
//2:          1,296
//3:         46,656
//4:      1,679,616
//5:     60,466,176

let ss;

function setSS(newSS) {
    ss = newSS;
};

class newRoomManager {
    constructor() {
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
        if (info.joinType === Comm.Code.createPrivateGame) {
            console.log("create game?");
            return this.createRoom(info);
        } else if (info.joinType === Comm.Code.joinPrivateGame) {
            if (info.gameId && info.gameId > 0) {
                return this.getRoom(info.gameId);
            };
        } else if (info.joinType === Comm.Code.joinPublicGame) {
            console.log("public game");
            //this is where it gets interesting
            let roomSelection = this.getRoomsOfJoinType(info.joinType);
            // console.log("joinType", info.joinType, roomSelection);
            roomSelection = this.getRoomsOfGameType(info.gameType);
            // console.log("gameType", info.gameType, roomSelection);
            let remainingMapIds = [...ss.mapAvailability.public];
            roomSelection.forEach((room) => {
                remainingMapIds = remainingMapIds.filter(mapId => mapId !== room.mapId);
            });
            // console.log("remainingMapIds", remainingMapIds);
            let createNew = (roomSelection.length === 0 && 1) || (ran.getRandomChance(0.1) && 2) || false; //create new, if no rooms OR in the case where some maps are not taken
            console.log("createNew", createNew, roomSelection.length);
            if (createNew) {
                info.mapId = ran.getRandomFromList(remainingMapIds);
                console.log("<3", info.mapId, info.mapId && ss.maps[info.mapId].name, remainingMapIds)
                return this.createRoom(info);
            } else {
                return ran.getRandomFromList(roomSelection);
            };
        };
        console.log("fail?");
        return null;
    };

    getRoomsOfJoinType(joinType, selection) { //private/public
        const matchingRooms = [];
        selection = selection || this.rooms;
        for (const room of selection.values()) {
            if (room.joinType === joinType) {
                matchingRooms.push(room);
            };
        };
        return matchingRooms;
    };

    getRoomsOfGameType(gameType, selection) { //gamemode
        const matchingRooms = [];
        selection = selection || this.rooms;
        for (const room of selection.values()) {
            if (room.gameType === gameType) {
                matchingRooms.push(room);
            };
        };
        return matchingRooms;
    };

    getRandomID() {
        return ran.getRandomInt(1, highestRoomID); //not 0. pain in the ass. 0 == false type shit
    };

    createRoom(info) {
        info.gameId = this.getUnusedID();
        // info.gameKey = ran.getRandomInt(10, Math.pow(36, 2) - 10);
        info.gameKey = 784;
        const worker = new Worker(new URL('./worker.js', import.meta.url));

        worker.on('message', (msg) => {
            try {
                const [ msgType, content, wsId ] = msg;
                const room = this.getRoom(info.gameId);
                const ws = room.wsMap.get(wsId);
    
                switch (msgType) {
                    case 0: //send stuff to ws
                        ws.send(content);
                        break;
                    case 1: //close stuff to ws
                        ws.close(content);
                        break;
                    default:
                        break;
                };
            } catch (error) {
                console.error(error);
            };
        });

        worker.on('error', (error) => {
            console.error('The game thread for', info.gameId, "errored out, now look at this:", error);
        });

        worker.on('exit', (code) => {
            console.log('Worker exited.', info.gameId);
            this.removeRoom(info.gameId);
        });

        worker.postMessage(["setSS", {
            maps: ss.maps,
            items: ss.items,
        }]);

        info = {
            ...info,
        };

        worker.postMessage(["createRoom", info]);

        const createdRoom = {
            ...info,
            worker,
            wsMap: new Map(),
            wsIdx: 0,
        };

        this.rooms.set(info.gameId, createdRoom);
        this.workers.set(info.gameId, worker);

        return createdRoom;
    };

    joinRoom(room, msg, ws) {
        let wsId = room.wsIdx++;

        // console.log("joining player, wsId:", wsId);

        ws.removeAllListeners('message');
        ws.on('message', (content)=>{
            room.worker.postMessage(["wsMessage", content, wsId]);
        });
        ws.removeAllListeners('close');
        ws.on('close', (content)=>{
            room.worker.postMessage(["wsClose", content, wsId]);
        });

        room.wsMap.set(wsId, ws);

        msg.wsId = wsId;
        room.worker.postMessage(["joinPlayer", msg]);
    };

    removeRoom(id) {
        this.rooms.delete(id);
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
    setSS,
    newRoomManager,
};;