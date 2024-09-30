//legacyshell: room
import ran from '#scrambled';
import ClientConstructor from '#client';
import Comm from '#comm';
//legacyshell: getting user data
import wsrequest from '#wsrequest';
import BABYLON from "babylonjs";
//

let ss;

function setSS(newSS) {
    ss = newSS;
    ClientConstructor.setSS(ss);
};

class newRoom {
    constructor(info) {
        console.log("creating room", info.gameId);

        //scene init
        this.engine = new BABYLON.NullEngine();
        this.scene = new BABYLON.Scene(this.engine);

        this.joinType = info.joinType;
        this.gameType = info.gameType;
        this.mapId = info.mapId;
        this.gameId = info.gameId;
        this.gameKey = info.gameKey;

        this.mapJson = ss.maps[this.mapId];
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
    };

    registerPlayerClient(client) {
        this.clients[client.id] = client;
        this.players[client.id] = client.player;
    };

    getUnusedPlayerId() {
        for (let i = 0; i < this.playerLimit; i++) {
            var client = this.clients[i];
            var player = this.players[i];
            if (!(client || player)) return i;
        };
        return null;
    };

    getPlayerClient(id) {
        const client = this.clients[id];
        const player = this.players[id];
        if (client && player) return [client, player];
        else return [null, null];
    };

    packAllPlayers(output) {
        this.clients.forEach(client => {
            if (client && client.clientReady) {
                client.packPlayer(output);
            };
        });
    };
    
    //semi stolen from RTW :p (is good code)
    sendToOne(output, id) {
        // const client = this.clients[id];
        // if (client && client.clientReady) client.sendBuffer(output);

        //idk why it was done like this? there shouldnt be multiple clients with same id :< - onlypuppy7
        this.clients.forEach(client => {
            if (client.clientReady && client.id === id) client.sendBuffer(output);
        });
    };
    
    sendToOthers(output, id) {
        this.clients.forEach(client => {
            if (client.clientReady && client.id !== id) client.sendBuffer(output);
        });
    };

    sendToAll(output) {
        this.clients.forEach(client => {
            if (client.clientReady) client.sendBuffer(output, "sendToAll");
        });
    };
};

export default {
    setSS,
    newRoom,
};