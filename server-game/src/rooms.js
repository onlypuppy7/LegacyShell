//legacyshell: room
import ran from '#scrambled';
import ClientConstructor from '#client';
import Comm from '#comm';
import ColliderConstructor from '#collider';
import createLoop from '#looper';
import extendMath from '#math';
import { setSSforLoader, loadMapMeshes, buildMapData } from '#loading';
import { TickStep, stateBufferSize, FramesBetweenSyncs } from '#constants';
//legacyshell: getting user data
import wsrequest from '#wsrequest';
import BABYLON from "babylonjs";
//

let ss;
var lastTimeStamp = Date.now();

function setSS(newSS) {
    ss = newSS;
    ClientConstructor.setSS(ss);
    extendMath(Math);
};

class newRoom {
    constructor(info) {
        console.log("creating room", info.gameId);
        this.startTime = Date.now();
        this.existedFor = 0;

        this.serverStateIdx = 0;

        this.joinType = info.joinType;
        this.gameType = info.gameType;
        this.mapId = info.mapId;
        this.gameId = info.gameId;
        this.gameKey = info.gameKey;

        this.mapJson = ss.maps[this.mapId];
        this.playerLimit = this.mapJson.playerLimit || 18;        

        this.players = [];
        this.clients = [];

        //scene init
        this.engine = new BABYLON.NullEngine();
        this.scene = new BABYLON.Scene(this.engine);
        this.map = null;

        this.Collider = new ColliderConstructor(this.scene);

        //map init
        setSSforLoader(ss, this.mapJson, this.Collider);
        // this.validItemSpawns = [];

        loadMapMeshes(this.scene, () => {
            ss.config.verbose && console.log("done loadMapMeshes");
            const { map, spawnPoints, mapMeshes } = buildMapData(function (str) { ss.log.error("The following map meshes were not found:\n\n" + str + "\nTry clearing your cache and reload the page!") });
        
            this.map = map;
            this.spawnPoints = spawnPoints; //this is a [] from 0-2; conveniently lining up with ffa, team1, team2 (i think)
            this.mapMeshes = mapMeshes;

            this.Collider.setSS(ss, this.map, this.mapMeshes, this.playerLimit, this.players);

            this.updateLoopObject = createLoop(this.updateLoop.bind(this), TickStep);
            this.metaLoopObject = createLoop(this.metaLoop.bind(this), 2e3);
        });
    };

    updateLoop (delta) {
        var currentTimeStamp = Date.now();
        this.existedFor = Date.now() - this.startTime;
    
        while (lastTimeStamp < currentTimeStamp) { //repeat until catching up :shrug:
            lastTimeStamp += TickStep;
    
            // this.munitionsManager.updateLogic();
    
            //i dont understand their netcode wtf
            this.players.forEach(player => {
                // console.log("lóóp", delta, lastTimeStamp, currentTimeStamp, player.stateIdx, player.syncStateIdx);
                while (player.stateIdx !== player.syncStateIdx) {
                    player.update(1);
                    // console.log(player.x, player.y, player.z, player.controlKeys, player.stateIdx, this.serverStateIdx);
                };
            });
    
            this.serverStateIdx = Math.mod(this.serverStateIdx + 1, stateBufferSize);

            // console.log(this.serverStateIdx, FramesBetweenSyncs, this.serverStateIdx % FramesBetweenSyncs === 0)
    
            if (this.serverStateIdx % FramesBetweenSyncs === 0) {
                this.sync();
            };
        };
    };

    metaLoop (delta) {
        if (this.getPlayerCount() === 0 && this.existedFor > 5e3) {
            this.destroy();
            return;
        };
        this.clients.forEach(client => {
            client.lastSeen = Date.now() - client.lastSeenTime;
            console.log(client.id, client.lastSeen, client.clientReady);
            if ((client.lastSeen > 5e3 && !client.clientReady) || (client.lastSeen > 5 * 60e3)) client.ws.close();
        });
    };

    destroy() {
        console.log("destroy room", this.existedFor, this.gameId);
        this.updateLoopObject.stop();
        this.metaLoopObject.stop();
        this.players = null;
        this.clients = null;
        this.map = null;
        this.Collider = null;
        this.engine = null;
        this.scene = null;
        ss.RoomManager.removeRoom(this.gameId);
    };

    sync() {
        var output = new Comm.Out();
        this.clients.forEach(client => {
            client.packSync(output);
        });
        this.sendToAll(output);
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

        console.log("joining new player with assigned id:", info.id, info.nickname, this.getPlayerCount());

        new ClientConstructor.newClient(this, info, ws);

        // const client = new ClientConstructor.newClient(this, info, ws);
        // const player = client.player;
    };

    registerPlayerClient(client) {
        this.clients[client.id] = client;
        this.players[client.id] = client.player;
    };

    disconnectClient(client) {
        this.clients.splice(client.id, 1);
        this.players.splice(client.id, 1);

        var output = new Comm.Out(2);
        output.packInt8U(Comm.Code.removePlayer);
        output.packInt8U(client.id);
        this.sendToAll(output);

        console.log('Client disconnected', client.id);
    };

    getPlayerCount() {
        let count = 0;
        for (let i = 0; i < this.players.length; i++) {
            if (this.players[i]) {
                count++;
            };
        };
        return count;
    };

    getRandomSpawn(player) {
        const list = this.spawnPoints[player.team];
        const pos = ran.getRandomFromList(list);

        return {
            x: pos.x + 0.5,
            y: pos.y,
            z: pos.z + 0.5,
            yaw: Math.random() * Math.PI2,
            pitch: 0,
        };
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
    
    //semi stolen from rtw (is good code)
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