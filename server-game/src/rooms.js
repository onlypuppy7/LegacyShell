//legacyshell: room
import ran from '#scrambled';
import ClientConstructor from '#client';
import Comm from '#comm';
//legacyshell: getting user data
import wsrequest from '#wsrequest';
//

let ss;

function setSS(newSS) {
    ss = newSS;
    ClientConstructor.setSS(ss);
};

class newRoom {
    constructor(info) {
        console.log("creating room", info.gameId);
        this.joinType = info.joinType;
        this.gameType = info.gameType;
        this.mapId = info.mapId;
        this.gameId = info.gameId;
        this.gameKey = info.gameKey;

        this.mapJson = ss.maps[this.mapId];
        console.log(this.mapId, this.mapJson);
        this.playerLimit = this.mapJson.playerLimit || 18;

        this.players = [];
        this.clients = [];
    };

    async joinPlayer(info, ws) {
        if (info.session && info.session.length > 0) {
            const response = await wsrequest({
                cmd: "getUser",
                session: info.session,
            }, ss.config.game.services_server, ss.config.game.auth_key);

            info.userData = response.userData;
            info.sessionData = response.sessionData;

            console.log(info.sessionData);
        };

        info.id = this.getUnusedPlayerId();

        console.log(info.id);

        const client = new ClientConstructor.newClient(this, info, ws);
        const player = client.player;

        var output = new Comm.Out(11); //this is FIXED. it's technically a little faster. here it's easier just cause all of these are "simple" ints.

        output.packInt8U(Comm.Code.gameJoined);

        output.packInt8U(0); //meId (0-17 for 18 slots)
        output.packInt8U(0); // myTeam (0 for ffa, 1-2 for teams)
        output.packInt8U(this.gameType); // gameType
        output.packInt16U(this.gameId); // gameId
        output.packInt16U(this.gameKey); // gameKey
        output.packInt8U(this.mapId); // mapIdx
        output.packInt8U(this.playerLimit); // playerLimit
        output.packInt8U(0); //bool // isGameOwner

        // console.log(Comm.Code.gameJoined, output.idx, output, output.buffer);

        ws.send(output.buffer);
    };

    getUnusedPlayerId() {
        for (let i = 0; i < this.playerLimit; i++) {
            var client = this.clients[i];
            var player = this.players[i];
            if (!(client || player)) return i;
        };
        return null;
    };
};

export default {
    setSS,
    newRoom,
};