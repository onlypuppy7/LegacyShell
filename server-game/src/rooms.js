//legacyshell: room
import ran from '#scrambled';
import ClientConstructor from '#client';
import Comm from '#comm';
import ColliderConstructor from '#collider';
import createLoop from '#looper';
import extendMath from '#math';
import { setSSforLoader, loadMapMeshes, buildMapData } from '#loading';
import { TickStep, stateBufferSize, FramesBetweenSyncs } from '#constants';
import { MunitionsManagerConstructor } from '#munitionsManager';
import { ItemManagerConstructor, MAP } from '#itemManager';
import BABYLON from "babylonjs";
//

let ss;

function setSS(newSS, parentPort) {
    ss = newSS;
    ClientConstructor.setSS(ss);
    extendMath(Math);
};

class newRoom {
    constructor(info) {
        this.lastTimeStamp = Date.now();
        console.log("creating room", info.gameId);
        this.startTime = Date.now();
        this.existedFor = 0;

        this.wsToClient = {};

        this.serverStateIdx = 0;

        this.joinType = info.joinType;
        this.gameType = info.gameType;
        this.mapId = info.mapId;
        this.gameId = info.gameId;
        this.gameKey = info.gameKey;

        // this.items = info.items;
        this.mapJson = ss.maps[this.mapId];
        this.playerLimit = this.mapJson.playerLimit || 18;
        this.maxAmmo = Math.ceil(this.playerLimit * 1.5);

        this.players = [];
        this.clients = [];
        this.items = {};

        //scene init
        this.engine = new BABYLON.NullEngine();
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.room = this;
        this.map = null;

        //collider init (kinda)
        this.Collider = new ColliderConstructor(this.scene);

        //pools init
        this.munitionsManager = new MunitionsManagerConstructor(this.scene);
        this.itemManager = new ItemManagerConstructor();

        //map init
        setSSforLoader(ss, this.mapJson, this.Collider);
        this.validItemSpawns = [];

        loadMapMeshes(this.scene, () => {
            ss.config.verbose && console.log("done loadMapMeshes");
            const { map, spawnPoints, mapMeshes } = buildMapData(function (str) { ss.log.error("The following map meshes were not found:\n\n" + str + "\nTry clearing your cache and reload the page!") });

            this.map = map;
            this.spawnPoints = spawnPoints; //this is a [] from 0-2; conveniently lining up with ffa, team1, team2 (i think)
            this.mapMeshes = mapMeshes;

            this.Collider.setSS(ss, this.map, this.mapMeshes, this.playerLimit, this.players);

            this.updateLoopObject = createLoop(this.updateLoop.bind(this), TickStep);
            this.metaLoopObject = createLoop(this.metaLoop.bind(this), 2e3);

            this.getValidItemSpawns();
            this.spawnItems();

            setInterval(() => this.spawnItems(), 30000);
        });
    };

    sendWsToClient(type, content, wsId) {
        const client = this.wsToClient[wsId];
        if (client) {
            switch (type) {
                case "wsMessage":
                    client.onmessage(content);
                    break;
                case "wsClose":
                    client.onclose(content);
                    break;
                default:
                    break;
            }
        };
    };

    updateLoop(delta) {
        var currentTimeStamp = Date.now();
        this.existedFor = Date.now() - this.startTime;

        while (this.lastTimeStamp < currentTimeStamp) { //repeat until catching up :shrug:
            this.lastTimeStamp += TickStep;

            this.munitionsManager.update(1);

            //i dont understand their netcode wtf
            this.players.forEach(player => {
                // console.log("lóóp", delta, this.lastTimeStamp, currentTimeStamp, player.stateIdx, player.syncStateIdx);
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

    metaLoop(fromDisconnect) {
        // console.log("metaLoop", this.getPlayerCount(), this.existedFor, fromDisconnect);
        if (this.getPlayerCount() === 0 && (fromDisconnect === true || this.existedFor > 5e3)) {
            this.destroy();
            return;
        };
        this.clients.forEach(client => {
            client.lastSeenDelta = Date.now() - client.player.lastActivity;
            client.lastPingDelta = Date.now() - client.lastPingTime;

            // console.log(client.id, client.clientReady);
            // console.log("lastSeenDelta", client.lastSeenDelta, "lastPingDelta", client.lastPingDelta);

            if (client.lastPingDelta > 10e3) { // kick if over 10 secs since last connection
                client.sendCloseToWs();
            };
            if (client.lastSeenDelta > 5 * 60e3) { // kick if idle for 5 mins
                client.sendCloseToWs();
            };
        });
    };

    destroy() {
        console.log("destroy room", this.existedFor, this.gameId);

        //most of this is redundant now, but eh.
        try {
            this.players = null;
            this.clients = null;
            this.map = null;
            this.Collider = null;
            this.engine = null;
            this.scene = null;
            this.updateLoopObject.stop();
            this.metaLoopObject.stop();
        } catch (error) { } //possible that some wasnt initted, or something

        ss.parentPort.close();
        process.exit(0);
    };

    sync() {
        var output = new Comm.Out();
        this.clients.forEach(client => {
            client.packSync(output);
        });
        this.sendToAll(output, "sync");
    };

    async joinPlayer(info) {
        info.id = this.getUnusedPlayerId();

        console.log(info.wsId, "joining new player with assigned id:", info.id, info.nickname, this.getPlayerCount());

        this.wsToClient[info.wsId] = new ClientConstructor.newClient(this, info);

        // const client = new ClientConstructor.newClient(this, info, ws);
        // const player = client.player;
    };

    registerPlayerClient(client) {
        this.clients[client.id] = client;
        this.players[client.id] = client.player;
    };

    disconnectClient(client) {
        client.timeout.clearAll();
        client.interval.clearAll();

        delete this.clients[client.id];
        delete this.players[client.id];

        var output = new Comm.Out(2);
        output.packInt8U(Comm.Code.removePlayer);
        output.packInt8U(client.id);
        this.sendToAll(output);

        console.log('Client disconnected', client.id);

        this.metaLoop(true);
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

    getValidItemSpawns = function () {
        let data = this.map.data;
        for (var x = 0; x < data.length; x++) {
            for (var y = 0; y < data[x].length; y++) {
                for (var z = 0; z < data[x][y].length; z++) {
                    if (
                        this.itemManager.checkPosition(x, y, z, this.map) == MAP.blank &&
                        this.itemManager.checkBelow(x, y, z, this.map) == MAP.block
                    ) this.validItemSpawns.push([x, y, z]);
                }
            }
        }
        console.log('Finished loading item spawns!');
    }

    spawnPacket(kind, x, y, z) {
        let data = {
            id: this.itemManager.allocateId(),
            kind: kind,
            x: x,
            y: y,
            z: z
        }

        let spawnPacket = new Comm.Out();
        spawnPacket.packInt8(Comm.Code.spawnItem);
        spawnPacket.packInt16(data.id);
        spawnPacket.packInt8(data.kind);
        spawnPacket.packFloat(data.x + 0.5);
        spawnPacket.packFloat(data.y);
        spawnPacket.packFloat(data.z + 0.5);

        this.itemManager.items.push(data);

        return spawnPacket;
    }

    spawnItems() {
        for (const dat of this.validItemSpawns) {
            if (this.itemManager.items.length >= this.maxAmmo) return;

            if (Math.floor((Math.random() * 50)) == 4) {
                if (Math.floor((Math.random() * 5)) == 3) this.sendToAll(this.spawnPacket(1, dat[0], dat[1], dat[2]));
                else this.sendToAll(this.spawnPacket(0, dat[0], dat[1], dat[2]));
            }
        };
    }

    getUnusedPlayerId() {
        for (let i = 0; i < this.playerLimit; i++) {
            var client = this.clients[i];
            var player = this.players[i];
            console.log(i, !!client, !!player)
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
                console.log("packing", client.id, client.player.name) // ayo
                client.packPlayer(output);
            };
        });
    };

    //semi stolen from rtw (is good code)
    sendToOne(output, fromId, toId, debug) {
        const client = this.clients[toId];
        if (client && client.clientReady) client.sendBuffer(output, "sendToOne: " + debug + " | from " + fromId);

        // //idk why it was done like this? there shouldnt be multiple clients with same id :<
        // this.clients.forEach(client => {
        //     if (client.clientReady && client.id === fromId) client.sendBuffer(output, "sendToOne: " + debug + " | from " + fromId);
        // });
    };

    sendToOthers(output, fromId, debug) {
        this.clients.forEach(client => {
            if (client.clientReady && client.id !== fromId) client.sendBuffer(output, "sendToOthers: " + debug + " | from " + fromId);
        });
    };

    sendToAll(output, fromId, debug) {
        this.clients.forEach(client => {
            if (client.clientReady) client.sendBuffer(output, "sendToAll: " + debug + " | from " + fromId);
        });
    };
};

export default {
    setSS,
    newRoom,
};