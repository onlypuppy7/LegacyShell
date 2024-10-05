//legacyshell: client
import ran from '#scrambled';
import Comm from '#comm';
import { ItemType, itemIdOffsets, FramesBetweenSyncs, stateBufferSize, timeout } from '#constants';
import Player from '#player';
import CatalogConstructor from '#catalog';
import extendMath from '#math';
//

let ss, catalog;
extendMath(Math);

function setSS(newSS) {
    ss = newSS;
    catalog = new CatalogConstructor(ss.items);
};

class newClient {
    constructor(room, info, ws) {
        //
        this.clientReady = false;
        this.room = room;
        this.ws = ws;
        this.lastSeen = Date.now();
        this.userData = info.userData;
        this.sessionData = info.sessionData;
        this.loggedIn = info.userData && info.sessionData;
        //
        this.account_id = this.loggedIn ? this.userData.account_id : null; //reminder this is the ID of the actual account
        this.nickname = info.nickname; //todo check this is legal length and stuff
        this.username = this.loggedIn ? this.userData.username : "";
        this.id = info.id; //place in list
        this.classIdx = info.classIdx;
        //
        this.loadout = {};
        this.colorIdx = 0;
        //

        //gun skins
        this.setEquippedItem(ItemType.Primary, info.classIdx, catalog.findItemBy8BitItemId(ItemType.Primary, info.classIdx, info.primary_item_id));
        this.setEquippedItem(ItemType.Secondary, info.classIdx, catalog.findItemBy8BitItemId(ItemType.Secondary, info.classIdx, info.secondary_item_id));
        //cosmetics
        this.setEquippedItem(ItemType.Hat, info.classIdx, catalog.findItemBy8BitItemId(ItemType.Hat, info.classIdx, info.hatId));
        this.setEquippedItem(ItemType.Stamp, info.classIdx, catalog.findItemBy8BitItemId(ItemType.Stamp, info.classIdx, info.stampId));
        this.setColorIdx(info.colorIdx);

        this.instantiatePlayer();

        // console.log("kek", info, room);
        
        var output = new Comm.Out(11); //if fixed for gameJoined, use 11
        this.packGameJoined(output);
        this.sendBuffer(output, "packGameJoined");

        ws.removeAllListeners('message');
        ws.on('message', this.onmessage.bind(this));
        ws.removeAllListeners('close');
        ws.on('close', this.onclose.bind(this));

        // console.log(!!this.room.packAllPlayers);
    };

    async onmessage(message) {
        try {
            var input = new Comm.In(message);

            this.lastSeen = Date.now(); //u can change/add to this later to exclude pings (ie idle for 5 mins)

            while (input.isMoreDataAvailable()) {
                let msg = {};
                msg.cmd = input.unPackInt8U();

                if (msg.cmd !== Comm.Code.sync) console.log(Comm.Convert(msg.cmd));

                switch (msg.cmd) {
                    case Comm.Code.clientReady:
                        if (!this.clientReady) {
                            this.clientReady = true;
    
                            var output = new Comm.Out();
                            this.room.packAllPlayers(output);
                            this.sendBuffer(output, "packAllPlayers");
                    
                            this.room.registerPlayerClient(this);
                    
                            var output = new Comm.Out();
                            this.packPlayer(output);
                            this.room.sendToAll(output);
                    
                            var output = new Comm.Out(1);
                            output.packInt8U(Comm.Code.clientReady);
                            this.sendBuffer(output, "clientReady");
                        };
                        break;
                    case Comm.Code.sync:
                        //reported by client
                        let stateIdx = input.unPackInt8U(); //be suspicious of this

                        this.adjustment = Math.diff(this.player.stateIdx, stateIdx, stateBufferSize);
                        
                        let adjustedStateIdx = Math.mod(stateIdx - this.adjustment, stateBufferSize);

                        // console.log(stateIdx, this.player.stateIdx, this.adjustment, adjustedStateIdx);

                        this.player.shotsQueued = input.unPackInt8();

                        stateIdx = adjustedStateIdx;

                        var startIdx = Math.mod(adjustedStateIdx, stateBufferSize);
                        var i;
                        for (startIdx, i = 0; i < FramesBetweenSyncs; i++) {
                            var idx = Math.mod(startIdx + i, stateBufferSize);
                            this.player.stateBuffer[idx].controlKeys = input.unPackInt8U();
                            this.player.stateBuffer[idx].yaw = input.unPackRadU();
                            this.player.stateBuffer[idx].pitch = input.unPackRad();

                            // console.log("sync:", idx, this.player.stateIdx);
                        };

                        this.player.syncStateIdx = Math.mod(stateIdx + FramesBetweenSyncs, stateBufferSize);

                        break;
                    case Comm.Code.pause:
                        this.player.resetDespawn();

                        timeout.set(() => {
                            this.player.removeFromPlay();
                            this.room.sendToAll(this.packPaused());
                        }, 3e3);
                        break;
                    case Comm.Code.requestRespawn:
                        if (Date.now() >= (this.player.lastDespawn + 5000) && !this.player.playing) {
                            const spawnPoint = this.room.getRandomSpawn(this.player);

                            this.player.respawn(spawnPoint);

                            var output = new Comm.Out(12);
                            output.packInt8U(Comm.Code.respawn);
                            output.packInt8U(this.id);
                            output.packFloat(this.player.x);
                            output.packFloat(this.player.y);
                            output.packFloat(this.player.z);
                            output.packRadU(this.player.yaw);
                            output.packRad(this.player.pitch);
                            this.room.sendToAll(output);
                        };
                        break;
                    case Comm.Code.ping:
                        var output = new Comm.Out();
                        output.packInt8(Comm.Code.ping);
                        this.sendBuffer(output);
                        break;
                }
            }

        } catch (error) {
            console.error('Error processing message:', error);
            // ws.send(JSON.stringify({ error: 'Internal server error' }));
        };
    };

    async onclose() {
        this.room.disconnectClient(this);
    };

    setEquippedItem(itemType, classIdx, item) { //itemType: stamp/hat/prim/sec, classIdx: eggk/shotgun etc
        let itemId = 0;
        if (
            item
            && this.userData // player has an account
            && (item.exclusive_for_class === classIdx) && (item.item_type_id === itemType) // item is valid
            && this.userData.ownedItemIds.includes(item.id) // item is owned
        ) { 
            itemId = item.id;
        } else { // no account, no skins! go screw yourself.
            switch (itemType) {
                case ItemType.Hat:
                    itemId = null;
                    break;
                case ItemType.Stamp:
                    itemId = null;
                    break;
                case ItemType.Primary:
                    itemId += itemIdOffsets[ItemType.Primary].base;
                    itemId += itemIdOffsets[ItemType.Primary][classIdx];
                    break;
                case ItemType.Secondary:
                    itemId += itemIdOffsets[ItemType.Secondary];
                    break;
            };
        };
        this.loadout[itemType] = catalog.findItemById(itemId);
    };

    setColorIdx(colorIdx) {
        let range = 6;
        if (this.loggedIn && !this.userData.upgradeIsExpired) range = 13;
        this.colorIdx = Math.clamp(Math.floor(colorIdx), 0, range);
    };

    instantiatePlayer() {
        this.player = new Player({
            id: this.id,
            uniqueId: this.account_id,
            nickname: this.nickname,
            classIdx: this.classIdx, // weapon class
            username: this.username,

            team: 0, //info.team,

            primaryWeaponItem: this.loadout[ItemType.Primary],
            secondaryWeaponItem: this.loadout[ItemType.Secondary],
            shellColor: this.colorIdx,
            hatItem: this.loadout[ItemType.Hat],
            stampItem: this.loadout[ItemType.Stamp],

            x: 15,
            y: 5,
            z: 5,
            dx: 0,
            dy: 0,
            dz: 0,
            yaw: 0,
            pitch: 0,

            score: 0,
            kills: 0,
            deaths: 0,
            streak: 0,
            totalKills: 0,
            totalDeaths: 0,
            bestGameStreak: 0,
            bestOverallStreak: 0,

            shield: 0,
            hp: 100,

            playing: 0,
            weaponIdx: 0, // prim/sec: 0/1 (it's Slot in #constants)

            controlKeys: 0,
            randomSeed: 0,

            upgradeProductId: this.loggedIn ? this.userData.upgradeProductId : 0,
        }, this.room.scene, this);
    };

    packPlayer(output) {
        output.packInt8U(Comm.Code.addPlayer);

        output.packInt8U(this.id);
        output.packInt32U(this.account_id);
        output.packString(this.nickname);
        output.packInt8U(this.classIdx);
        output.packString(this.username);

        output.packInt8U(this.player.team);

        output.packInt8U(catalog.get8BitItemId(this.loadout[ItemType.Primary], this.classIdx));
        output.packInt8U(catalog.get8BitItemId(this.loadout[ItemType.Secondary], this.classIdx));
        output.packInt8U(this.colorIdx);
        output.packInt8U(catalog.get8BitItemId(this.loadout[ItemType.Hat], this.classIdx));
        output.packInt8U(catalog.get8BitItemId(this.loadout[ItemType.Stamp], this.classIdx));

        output.packFloat(this.player.x);
        output.packFloat(this.player.y);
        output.packFloat(this.player.z);
        output.packFloat(this.player.dx);
        output.packFloat(this.player.dy);
        output.packFloat(this.player.dz);
        output.packRadU(this.player.yaw);
        output.packRad(this.player.pitch);

        output.packInt32U(this.player.score);
        output.packInt16U(this.player.kills);
        output.packInt16U(this.player.deaths);
        output.packInt16U(this.player.streak);
        output.packInt32U(this.player.totalKills);
        output.packInt32U(this.player.totalDeaths);
        output.packInt16U(this.player.bestGameStreak);
        output.packInt16U(this.player.bestOverallStreak);

        output.packInt8U(this.player.shield);
        output.packInt8U(this.player.hp);
        output.packInt8U(this.player.playing ? 1 : 0);
        output.packInt8U(0); //weaponIdx
        output.packInt8U(0); //controlKeys
        output.packInt16U(0); //randomSeed
        output.packInt8U(this.loggedIn ? this.userData.upgradeProductId : 0); //upgradeProductId
    };

    packSync(output) {
        output.packInt8U(Comm.Code.sync);

        let adjustedStateIdx = Math.mod(this.player.stateIdx + this.adjustment - FramesBetweenSyncs, stateBufferSize);

        // console.log("packsync", adjustedStateIdx, this.player.stateIdx, this.adjustment);

        output.packInt8U(this.id);
        output.packInt8U(adjustedStateIdx);
        // output.packInt8U(this.room.serverStateIdx);
        output.packFloat(this.player.x);
        output.packFloat(this.player.y);
        output.packFloat(this.player.z);
        output.packInt8U(this.player.climbing ? 1 : 0);

        for (var i = 0; i < FramesBetweenSyncs; i++) {
            var idx = Math.mod(this.player.stateIdx + i - FramesBetweenSyncs, stateBufferSize);
            let state = this.player.stateBuffer[idx];

            output.packInt8U(state.controlKeys);
            output.packRadU(state.yaw);
            output.packRad(state.pitch);
        };
    };

    packPaused() {
        var output = new Comm.Out(2);
        output.packInt8U(Comm.Code.pause);
        output.packInt8U(this.id);
        return output;
    };

    packGameJoined(output) {
        output.packInt8U(Comm.Code.gameJoined);

        output.packInt8U(this.id); //meId (0-17 for 18 slots)
        output.packInt8U(0); // myTeam (0 for ffa, 1-2 for teams)
        output.packInt8U(this.room.gameType); // gameType
        output.packInt16U(this.room.gameId); // gameId
        output.packInt16U(this.room.gameKey); // gameKey
        output.packInt8U(this.room.mapId); // mapIdx
        output.packInt8U(this.room.playerLimit); // playerLimit
        output.packInt8U(0); //bool // isGameOwner
    };

    sendBuffer(output, debug) { // more direct operation, prefer this.room.sendToOne
        // console.log(output, debug);
        this.ws.send(output.buffer);
    };
};

export default {
    setSS,
    newClient,
};