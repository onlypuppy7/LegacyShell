//legacyshell: roomManager
import ran from '#scrambled';
import { Comm, CloseCode, CommCode } from '#comm';
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
        if (info.gameId && info.gameId > 0) {
            return getRoom(info.gameId);
        } else {
            if (info.joinType === CommCode.joinPublicGame) {
                console.log("public game");
                //this is where it gets interesting
                let roomSelection = this.getRoomsOfJoinType(info.joinType);
                roomSelection = this.getRoomsOfGameType(info.gameType);
                let remainingMapIds = [...ss.mapAvailability.public];
                roomSelection.forEach((room) => {
                    remainingMapIds = remainingMapIds.filter(mapId => mapId !== room.mapId);
                });
                if (remainingMapIds.length === 0) {
                    let createNew = (roomSelection.length === 0) || ran.getRandomChance(0.3); //create new
                    if (createNew) {

                    }
                } else {

                };
            } else if (info.joinType === CommCode.joinPrivateGame) {
                console.log("private game");
                this.createRoom(info);
            };
        };
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

    createRoom(id, roomData) {
        if (this.rooms.has(id)) {
            console.log(`Room with ID ${id} already exists.`);
            return null;
        } else {
            //code here please!
        };
    };

    removeRoom(id) {
        this.getRoom(id).destroy();
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
};