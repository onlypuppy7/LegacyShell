//legacyshell: room
import ClientConstructor from '#client';
import Comm from '#comm';
import ColliderConstructor from '#collider';
import createLoop from '#looper';
import extendMath from '#math';
import { setParamsforLoader, loadMapMeshes, buildMapData } from '#loading';
import { TickStep, stateBufferSize, FramesBetweenSyncs, MAP, devlog, chatCooldown, NextRoundTimeout } from '#constants';
import { GameTypes } from '#gametypes';
import { ItemTypes } from '#items';
import { MunitionsManagerConstructor } from '#munitionsManager';
import { ItemManagerConstructor } from '#itemManager';
import { PermissionsConstructor } from '#permissions';
import BABYLON from "babylonjs";
import { censor } from "#censor";
//legacyshell: logging
import log from '#coloured-logging';
//legacyshell: plugins
import { plugins } from '#plugins';
//legacyshell: room worker (bridge)
import { parentPort } from 'worker_threads';
//

plugins.emit('roomLoading', {});

// let ss; //sorry.

export class newRoom {
    constructor(info, ss) {
        plugins.emit('roomInit', {this: this});

        extendMath(Math);

        plugins.emit('roomSetSS', {ss});

        this.lastTimeStamp = Date.now();
        console.log("creating room", info.gameId);
        this.startTime = Date.now();
        this.existedFor = 0;
        this.gameOwner = null;

        this.wsToClient = {};

        this.serverStateIdx = 0;

        this.joinType = info.joinType; console.log(this.joinType)
        this.gameType = info.gameType;
        this.gameOptions = JSON.parse(JSON.stringify(GameTypes[this.gameType].options)); //create copy of object
        console.log("gameOptions", this.gameOptions);
        console.log(GameTypes[this.gameType]);
        this.mapId = info.mapId;
        this.gameId = info.gameId;
        this.gameKey = info.gameKey;

        // this.items = info.items;
        this.mapJson = ss.maps[this.mapId];
        this.playerLimit = this.mapJson.playerLimit || 18;
        this.maxAmmo = Math.ceil(this.mapJson.surfaceArea / 25);
        this.maxGrenades = Math.ceil(this.mapJson.surfaceArea / 65);
        console.log("maxitems:", this.maxAmmo, this.maxGrenades)

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

        //permissions, censor
        this.perm = new PermissionsConstructor(this);
        this.censor = censor;

        //map init
        setParamsforLoader(this.mapJson, this.Collider);
        this.validItemSpawns = [];

        //timed rounds
        this.setRoundTimeout();

        loadMapMeshes(this.scene, () => {
            ss.config.verbose && console.log("done loadMapMeshes");
            const { map, spawnPoints, mapMeshes } = buildMapData(function (str) { log.error("The following map meshes were not found:\n\n" + str + "\nTry clearing your cache and reload the page!") });

            this.map = map;
            this.spawnPoints = spawnPoints; //this is a [] from 0-2; conveniently lining up with ffa, team1, team2 (i think)
            this.mapMeshes = mapMeshes;

            this.Collider.setParams(this.map, this.mapMeshes, this.playerLimit, this.players);

            this.updateLoopObject = createLoop(this.updateLoop.bind(this), TickStep);
            this.metaLoopObject = createLoop(this.metaLoop.bind(this), 2e3);
            this.updateRoomDetailsLoopObject = createLoop(this.updateRoomDetails.bind(this), 30e3);

            this.getValidItemSpawns();
            this.spawnItemsLoopObject = createLoop(this.spawnItems.bind(this), 30e3); //just in case, i guess?

            plugins.emit('roomInitEnd', {this: this});
        });
    };

    sendWsToClient(type, content, wsId) {
        const client = this.wsToClient[wsId];
        plugins.emit('roomWsMessage', {this: this, client, type, content});
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

    setRoundTimeout() {
        if (this.gameOptions.timedGame.enabled) {
            this.roundLength = this.gameOptions.timedGame.roundLength;
            this.roundEndTime = Date.now() + (this.roundLength * 1e3);
            this.nextRoundTime = this.roundLength * 1e3;
            this.timeoutForNextRound = NextRoundTimeout * 1e3;
            this.roundRestartTime = this.roundEndTime + this.timeoutForNextRound;
    
            console.log("roundLength", this.roundLength);
            console.log("roundEndTime", this.roundEndTime);
            console.log("nextRoundTime", this.nextRoundTime);
            console.log("timeoutForNextRound", this.timeoutForNextRound);
            console.log("roundRestartTime", this.roundRestartTime);
    
            var output = new Comm.Out(1);
            output.packInt8U(Comm.Code.roundStart);
            this.sendToAll(output, null, "roundStart");
    
            this.resetGame();
            
            this.roundTimeout = setTimeout(() => {
                this.endRound();
            }, this.nextRoundTime);
        } else {
            this.roundEndTime = 0;
            this.roundLength = 0;
            this.nextRoundTime = 0;
        };
    };

    endRound() {
        clearTimeout(this.roundTimeout);

        console.log(`Round ended. Starting new round in ${NextRoundTimeout} seconds.`);

        var output = new Comm.Out();
        this.packRoundEnd(output);
        this.sendToAll(output, null, "roundEnd");

        setTimeout(() => {
            this.pauseAllClients(this.timeoutForNextRound - 3e3);
        }, 3e3);

        setTimeout(() => {
            console.log("New round starting now!");
            this.setRoundTimeout();
        }, this.timeoutForNextRound);
    };

    packRoundEnd(output) {
        plugins.emit('packRoundEnd', {this: this, output});
        output.packInt8U(Comm.Code.roundEnd);
        output.packInt16U(this.roundLength); //length of the round (in seconds)
        plugins.emit('packRoundEndEnd', {this: this, output});
    };

    packRoundUpdate(output) {
        plugins.emit('packRoundUpdate', {this: this, output});
        output.packInt8U(Comm.Code.roundUpdate);
        output.packInt16U(this.roundLength); //length of the round (in seconds)
        output.packInt32U(Math.max(0, this.roundEndTime - Date.now())); //time to end the round (in ms)
        output.packInt32U(Math.max(0, this.roundRestartTime - Date.now())); //time to wait before next round starts (in ms)
        plugins.emit('packRoundUpdateEnd', {this: this, output});
    };

    resetGame() {
        for (var i = 0; i < this.playerLimit; i++) {
            var player = this.players[i];
            if (player) {
                player.removeFromPlay();
                player.score = 0;
                player.kills = 0;
                player.deaths = 0;
                player.streak = 0;
                player.bestGameStreak = 0;
            };
        };
    };

    pauseAllClients(time = 5e3) {
        this.clients.forEach(client => { client.pause(time); });
    };

    updateRoomDetails() {
        this.details = this.getPlayerCount(undefined, true);
        plugins.emit('roomDetailsUpdated', {this: this, details: this.details});

        // devlog(details);

        parentPort.postMessage([Comm.Worker.updateRoom, {
            ready: true,
            playerLimit: this.playerLimit,
            playerCount: this.details.count,
            usernames: this.details.usernames,
            uuids: this.details.uuids,
            sessions: this.details.sessions,
        }]);

        plugins.emit('roomDetailsUpdatedEnd', {this: this, details: this.details});
    };

    updateRoomParamsForClients() {
        var output = new Comm.Out();
        this.packUpdateRoomParams(output);
        this.sendToAll(output, null, "updateRoomParams");
    };

    packUpdateRoomParams(output) {
        plugins.emit('packUpdateRoomParams', {this: this, output});
        output.packInt8U(Comm.Code.updateRoomParams);
        var gameOptions = {
            cheatsEnabled: this.gameOptions.cheatsEnabled,
        };
        output.packString(JSON.stringify(gameOptions));
        plugins.emit('packUpdateRoomParamsEnd', {this: this, output});
    };

    enableCheats() {
        this.gameOptions.cheatsEnabled = true;
        this.updateRoomParamsForClients();
    };

    async updateLoop (delta) {
        var currentTimeStamp = Date.now();
        this.existedFor = Date.now() - this.startTime;
        plugins.emit('roomUpdate', {this: this, delta, currentTimeStamp});

        while (this.lastTimeStamp < currentTimeStamp) { //repeat until catching up :shrug:
            this.lastTimeStamp += TickStep;

            this.munitionsManager.update(1);

            //i dont understand their netcode wtf
            this.players.forEach(player => {
                plugins.emit('playerUpdate', {this: this, player, delta, currentTimeStamp});
                // console.log("lóóp", delta, this.lastTimeStamp, currentTimeStamp, player.stateIdx, player.syncStateIdx);
                while (player.stateIdx !== player.syncStateIdx) {
                    player.chatLineCap = Math.min(player.chatLineCap + 1 / (chatCooldown * 4), 3); //3 lines per second (idk why 4 works)
                    plugins.emit('playerStateUpdate', {this: this, player, delta, currentTimeStamp});
                    player.update(1);
                    // console.log(player.x, player.y, player.z, player.controlKeys, player.stateIdx, this.serverStateIdx);
                };
            });

            plugins.emit('roomStateUpdate', {this: this, delta, currentTimeStamp});

            this.serverStateIdx = Math.mod(this.serverStateIdx + 1, stateBufferSize);

            // console.log(this.serverStateIdx, FramesBetweenSyncs, this.serverStateIdx % FramesBetweenSyncs === 0)

            if (this.serverStateIdx % FramesBetweenSyncs === 0) {
                plugins.emit('roomSync', {this: this});
                await this.sync();
            };
        };
    };

    metaLoop(fromDisconnect) {
        // console.log("metaLoop", this.getPlayerCount(), this.existedFor, fromDisconnect);
        plugins.emit('metaLoop', {this: this, fromDisconnect});
        if (this.getPlayerCount() === 0 && (fromDisconnect === true || this.existedFor > 5e3)) {
            this.destroy();
            return;
        };
        this.clients.forEach(client => {
            plugins.emit('metaLoopClients', {this: this, client, fromDisconnect});

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
        plugins.emit('roomDestroy', {this: this});

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

        parentPort.close();

        process.exit(0);
    };

    async sync() {
        var output = new Comm.Out();
        await plugins.emit('clientSync', {this: this, output});
        for (const client of this.clients) {
            if (client) {
                await plugins.emit('clientSyncLoop', { this: this, client, output });
                if (!plugins.cancel) {
                    await client.packSync(output);
                };
            };
        };
        await plugins.emit('clientSyncEnd', {this: this, output});
        if (!plugins.cancel) this.sendToAll(output, null, "sync");
    };

    async joinPlayer(info) {
        info.id = this.getUnusedPlayerId();
        plugins.emit('joinPlayer', {this: this, info});

        console.log(info.wsId, "joining new player with assigned id:", info.id, info.nickname, this.getPlayerCount());

        this.wsToClient[info.wsId] = new ClientConstructor.newClient(this, info);

        // const client = new ClientConstructor.newClient(this, info, ws);
        // const player = client.player;
    };

    registerPlayerClient(client) {
        plugins.emit('registerPlayerClient', {this: this, client});
        this.clients[client.id] = client;
        this.players[client.id] = client.player;
    };

    disconnectClient(client) {
        plugins.emit('disconnectClient', {this: this, client});
        client.timeout.clearAll();
        client.interval.clearAll();

        delete this.clients[client.id];
        delete this.players[client.id];

        var output = new Comm.Out(2);
        output.packInt8U(Comm.Code.removePlayer);
        output.packInt8U(client.id);
        this.sendToAll(output, null, "removePlayer");

        console.log('Client disconnected', client.id);

        this.setGameOwner();
        this.updateRoomDetails();

        this.metaLoop(true);
    };

    getPlayerCount(team, extraDetails) {
        let count = 0;
        let uuids = [];
        let usernames = [];
        let sessions = [];

        for (let i = 0; i < this.players.length; i++) {
            var player = this.players[i];
            if (player) {
                if (!(typeof(team) == "number" && team !== player.team)) {
                    count++;
                    uuids.push(player.client.uuid);
                    sessions.push(player.client.session);
                    usernames.push(player.client.username);
                    plugins.emit('getPlayerCountLoop', {this: this, count, uuids, usernames, sessions, player, extraDetails});
                };
            };
        };

        plugins.emit('getPlayerCount', {this: this, count, uuids, usernames, sessions, extraDetails});
        
        return extraDetails ? {count, uuids, usernames} : count;
    };

    getOldestClient() {
        let oldestClient = null;
        let oldestTime = 9e99;
        for (let i = 0; i < this.clients.length; i++) {
            var client = this.clients[i];
            if (client) {
                plugins.emit('getOldestClientLoop', {this: this, client, oldestClient, oldestTime});
                if (client.joinedTime < oldestTime) {
                    oldestClient = client;
                    oldestTime = client.joinedTime;
                };
            };
        };
        plugins.emit('getOldestClient', {this: this, oldestClient});
        return oldestClient;
    };

    packSetGameOwner (output) {
        plugins.emit('packSetGameOwner', {this: this, output});
        if (this.gameOwner) {
            plugins.emit('packSetGameOwnerFound', {this: this, output});
            output.packInt8U(Comm.Code.setGameOwner);
            output.packInt8U(this.gameOwner.id);
        };
    };

    setGameOwner() {
        // devlog("pls find a new owner pls 1", this.joinType, Comm.Code.createPrivateGame);
        plugins.emit('setGameOwner', {this: this});
        if (this.joinType === Comm.Code.createPrivateGame) {
            plugins.emit('setGameOwnerPrivate', {this: this});
            // devlog("pls find a new owner pls 2");
            var newOwner = this.getOldestClient();
            if (newOwner) {
                devlog("found new owner", newOwner.id);
                if (this.gameOwner !== newOwner) {
                    plugins.emit('setGameOwnerNew', {this: this, newOwner});
                    this.gameOwner = newOwner;
                    var output = new Comm.Out(2);
                    this.packSetGameOwner(output);
                    this.sendToAll(output, null, "setGameOwner");
                };
                this.players.forEach((player)=>{
                    player.isGameOwner = player.id === this.gameOwner.player.id;
                });
            } else {
                devlog("didnt new owner");
            };
        };
    };

    getRandomSpawn(player) {
        const list = this.spawnPoints[player.team];
        const pos = Math.getRandomFromList(list);
        plugins.emit('getRandomSpawn', {this: this, player, list, pos});

        return {
            x: pos.x + 0.5,
            y: pos.y,
            z: pos.z + 0.5,
            yaw: Math.random() * Math.PI2,
            pitch: 0,
        };
    };

    getBestSpawn(player) {
        if (this.getPlayerCount() < 2) return this.getRandomSpawn(player);
        plugins.emit('getBestSpawn', {this: this, player});

        const list = this.spawnPoints[player.team];
        let best = false;
        let bestDistance = -1; //bestDistance should be as big as possible

        list.forEach((spwn) => {
            const spawnPos = new BABYLON.Vector3(spwn.x, spwn.y, spwn.z);
            let smallestDistance = -1;

            plugins.emit('getBestSpawnLoop', {this: this, player, spwn, spawnPos, smallestDistance});

            this.players.forEach((play) => {
                if (
                    (player.team !== 0 && play.team === player.team) || //team check
                    !play.playing || //playing check
                    play.isDead() //is playing
                ) return;
                const playPos = new BABYLON.Vector3(play.x, play.y, play.z);
                const dist = BABYLON.Vector3.Distance(spawnPos, playPos);
                if (dist < smallestDistance || smallestDistance === -1) smallestDistance = dist;
            });
            if (smallestDistance > bestDistance || bestDistance === -1) { //kinda unneccesary bc -1 will always be smaller than smallestDistance but eh
                best = spwn;
                bestDistance = smallestDistance;
            };
        });

        plugins.emit('getBestSpawnEnd', {this: this, player, best, bestDistance});

        // console.log("best spawn", best, bestDistance);

        if (bestDistance === -1) return this.getRandomSpawn(player);
        return {
            x: best.x + 0.5,
            y: best.y,
            z: best.z + 0.5,
            yaw: Math.random() * Math.PI2,
            pitch: 0,
        };
    };

    getValidItemSpawns = function () { 
        let data = this.map.data;
        plugins.emit('getValidItemSpawns', {this: this, data});
        for (var x = 0; x < data.length; x++) {
            for (var y = 0; y < data[x].length; y++) {
                for (var z = 0; z < data[x][y].length; z++) {
                    if (
                        this.itemManager.checkPosition(x, y, z, this.map) == MAP.blank &&
                        this.itemManager.checkBelow(x, y, z, this.map) == MAP.block
                    ) {
                        plugins.emit('getValidItemSpawnsLoop', {this: this, x, y, z});
                        this.validItemSpawns.push([x, y, z]);
                    };
                };
            };
        };

        // console.log(this.validItemSpawns);
        this.validItemSpawns = Math.shuffleArray(this.validItemSpawns);
        // console.log(this.validItemSpawns);

        plugins.emit('getValidItemSpawnsEnd', {this: this});

        console.log('Finished loading item spawns!');
    };

    notify(text, timeoutTime = 5) {
        this.clients.forEach(client => {
            if (client.clientReady) {
                plugins.emit('notify', {this: this, client, text, timeoutTime});
                client.notify(text, timeoutTime);
            };
        });
    };

    packChat(output, text, id = 255, chatType = Comm.Chat.user) {
        plugins.emit('packChat', {this: this, output, text, id, chatType});
        output.packInt8U(Comm.Code.chat);
        output.packInt8U(chatType);
        output.packInt8U(id);
        output.packString(text);
        plugins.emit('packChatEnd', {this: this, output, text, id, chatType});
    };

    packSpawnItemPacket(output, id, kind, x, y, z) {
        plugins.emit('packSpawnItemPacket', {this: this, output, id, kind, x, y, z});
        output.packInt8U(Comm.Code.spawnItem);
        output.packInt16U(id);
        output.packInt8U(kind);
        output.packInt16U(x*2);
        output.packInt16U(y*10);
        output.packInt16U(z*2);
        plugins.emit('packSpawnItemPacketEnd', {this: this, output, id, kind, x, y, z});
    };

    packCollectItemPacket(output, playerId, kind, index, id) {
        plugins.emit('packCollectItemPacket', {this: this, output, playerId, kind, index, id});
        output.packInt8U(Comm.Code.collectItem);
        output.packInt8U(playerId);
        output.packInt8U(kind);
        output.packInt8U(index);
        output.packInt16U(id);
        plugins.emit('packCollectItemPacketEnd', {this: this, output, playerId, kind, index, id});
    };

    packAllItems (output) {
        let pools = this.itemManager.pools;
        plugins.emit('packAllItems', {this: this, output, pools});
        for (let i = 0; i < pools.length; i++) {
            let pool = pools[i];

            pool.forEachActive((item) => {
                plugins.emit('packAllItemsLoop', {this: this, output, item, i});
                this.packSpawnItemPacket(output, item.id, i, item.x, item.y, item.z);
            });
        };
    };

    spawnItems() {
        let pools = this.itemManager.pools;
        var output = new Comm.Out();

        plugins.emit('spawnItems', {this: this, pools, output});

        for (let i = 0; i < pools.length; i++) {
            let pool = pools[i];
            let maximum = 0;
            this.gameOptions.itemsEnabled.forEach((itemOptions)=>{
                if (itemOptions[0] === i) {
                    maximum = Math.ceil(this.mapJson.surfaceArea / itemOptions[1]);
                    maximum = Math.clamp(maximum, itemOptions[2], pool.originalSize);
                };
            });

            plugins.emit('spawnItemsLoop', {this: this, pool, i, maximum, output});

            while (pool.numActive < maximum) {
                var pos = this.getItemSpawnFromQueue();

                var x = pos[0] + 0.5;
                var y = pos[1] + 0.1;
                var z = pos[2] + 0.5;

                plugins.emit('spawnItemsLoopSpawn', {this: this, pool, i, maximum, output, x, y, z});

                devlog("item type", i, "current active", pool.numActive, "max", maximum);
                // devlog(id, pos);

                var item = this.itemManager.spawnItem(null, i, x, y, z);

                plugins.emit('spawnItemsLoopSpawnEnd', {this: this, pool, i, maximum, output, x, y, z, item});

                this.packSpawnItemPacket(output, item.id, i, x, y, z);
            };
        };

        plugins.emit('spawnItemsEnd', {this: this, pools, output});

        if (output.idx > 0) this.sendToAll(output, null, "spawnItem");
    };

    getItemSpawnFromQueue() { //this is a queue, so it will rotate the positions
        var pos = this.validItemSpawns[0];
        
        plugins.emit('getItemSpawnFromQueue', {this: this, pos});
        
        this.validItemSpawns.push(this.validItemSpawns.shift());

        plugins.emit('getItemSpawnFromQueueEnd', {this: this, pos});

        return pos;
    };

    getUnusedPlayerId() {
        plugins.emit('getUnusedPlayerId', {this: this});
        
        for (let i = 0; i < this.playerLimit; i++) {
            var client = this.clients[i];
            var player = this.players[i];
            // console.log(i, !!client, !!player);

            plugins.emit('getUnusedPlayerIdLoop', {this: this, i, client, player});

            if (!(client || player)) return i;
        };
        return null;
    };

    getPreferredTeam() {
        plugins.emit('getPreferredTeam', {this: this});
        
        if (!this.gameOptions.teamsEnabled) {
            return 0;
        } else {
            var team1Count = this.getPlayerCount(1);
            var team2Count = this.getPlayerCount(2);

            plugins.emit('getPreferredTeamEnd', {this: this, team1Count, team2Count});

            return team1Count > team2Count ? 2 : 1;
        };
    };

    getPlayerClient(id) {
        const client = this.clients[id];
        const player = this.players[id];
        plugins.emit('getPlayerClient', {this: this, client, player});
        if (client && player) return [client, player];
        else return [null, null];
    };

    packAllPlayers(output) {
        plugins.emit('packAllPlayers', {this: this, output});
        this.clients.forEach(client => {
            if (client && client.clientReady) {
                console.log("packing", client.id, client.player.name) // ayo
                plugins.emit('packAllPlayersLoop', {this: this, output, client});
                client.packPlayer(output);
            };
        });
    };

    //semi stolen from rtw (is good code)
    sendToOne(output, fromId, toId, debug) {
        const client = this.clients[toId];
        plugins.emit('sendToOne', {this: this, output, fromId, toId, debug});
        if (client && client.clientReady) {
            plugins.emit('sendToOneFound', {this: this, output, fromId, toId, debug});
            client.sendBuffer(output, "sendToOne: " + debug + " | from " + fromId);
        };

        // //idk why it was done like this? there shouldnt be multiple clients with same id :<
        // this.clients.forEach(client => {
        //     if (client.clientReady && client.id === fromId) client.sendBuffer(output, "sendToOne: " + debug + " | from " + fromId);
        // });
    };

    sendToOthers(output, fromId, debug) {
        plugins.emit('sendToOthers', {this: this, output, fromId, debug});
        this.clients.forEach(client => {
            plugins.emit('sendToOthersLoop', {this: this, client, output, fromId, debug});
            if (client.clientReady && client.id !== fromId) {
                plugins.emit('sendToOthersLoopFound', {this: this, client, output, fromId, debug});
                client.sendBuffer(output, "sendToOthers: " + debug + " | from " + fromId);
            };
        });
    };

    sendToAll(output, fromId, debug) {
        plugins.emit('sendToAll', {this: this, output, fromId, debug});
        this.clients.forEach(client => {
            plugins.emit('sendToAllLoop', {this: this, client, output, fromId, debug});
            if (client.clientReady) {
                plugins.emit('sendToAllLoopFound', {this: this, client, output, fromId, debug});
                client.sendBuffer(output, "sendToAll: " + debug + " | from " + fromId);
            };
        });
    };
};

plugins.emit('roomLoaded', {newRoom});

export default {
    newRoom,
};