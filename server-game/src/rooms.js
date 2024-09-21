//legacyshell: roomManager
import ran from '#scrambled';
import { Comm, DynamicComm, CloseCode, CommCode } from '#comm';
//

let ss;

function setSS(newSS) {
    ss = newSS;
};

class newRoom {
    constructor(info) {
        console.log("creating room", info.gameId);
        this.joinType = info.joinType;
        this.gameType = info.gameType;
        this.mapId = info.mapId;
        this.gameKey = info.gameKey;

        this.mapJson = ss.maps[this.mapId];
        this.playerLimit = this.mapJson.playerLimit || 18;

        this.players = new Map();
        this.clients = new Map();
    };

    joinPlayer(info, ws) {
        // const client = new ClientConstructor(info, ws);

        var output = Comm.output(3 + 4 + 3);

        output.packInt8U(0); //meId
        output.packInt8U(0); // myTeam
        output.packInt8U(this.gameType); // gameType
        output.packInt16U(this.gameId); // gameId
        output.packInt16U(this.gameKey); // gameKey
        output.packInt8U(this.mapId); // mapIdx
        output.packInt8U(this.playerLimit); // playerLimit
        output.packInt8U(1); //bool // isGameOwner

        console.log(output);

        ws.send(output.buffer);
    };
};

export default {
    setSS,
    newRoom,
};