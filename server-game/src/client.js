//legacyshell: client
import ran from '#scrambled';
import Comm from '#comm';
import { ItemType, itemIdOffsets, FramesBetweenSyncs, stateBufferSize, TimeoutManagerConstructor, maxChatWidth, IntervalManagerConstructor, classes, devlog } from '#constants';
import { fixStringWidth } from '#stringWidth';
import Player from '#player';
import CatalogConstructor from '#catalog';
import extendMath from '#math';
//legacyshell: getting user data
import wsrequest from '#wsrequest';
//

let ss, catalog;
extendMath(Math);

function setSS(newSS) {
    ss = newSS;
    catalog = new CatalogConstructor(ss.items);
};

class newClient {
    constructor(room, info) {
        this.initClient(room, info);
    };

    async initClient(room, info) {
        this.ss = ss;
        //
        this.session = info.session;
        await this.updateUserData();
        // console.log(info.nickname, this.userData)
        //
        this.timeout = new TimeoutManagerConstructor();
        this.interval = new IntervalManagerConstructor();
        this.clientReady = false;
        this.room = room;
        this.wsId = info.wsId;
        this.joinedTime = Date.now();
        this.loggedIn = this.userData && this.sessionData;
        //
        this.account_id = this.loggedIn ? this.userData.account_id : null; //reminder this is the ID of the actual account
        this.nickname = info.nickname; //todo check this is legal length and stuff
        this.username = this.loggedIn ? this.userData.username : "";
        this.id = info.id; //place in list
        this.classIdx = info.classIdx;
        //
        this.loadout = {};
        this.colorIdx = 0;
        this.catalog = catalog;
        //
        this.lastPingTime = Date.now();
        //

        this.updateLoadout(
            info.classIdx,
            info.primary_item_id,
            info.secondary_item_id,
            info.colorIdx,
            info.hatId,
            info.stampId
        );
        await this.instantiatePlayer();
        // this.applyLoadout();

        this.room.registerPlayerClient(this);
        
        var output = new Comm.Out(11); //if fixed for gameJoined, use 11
        this.packGameJoined(output);
        this.sendBuffer(output, "packGameJoined"); //buffer cause not clientReady

        this.room.updateRoomDetails();
    };

    async updateLoadout (classIdx, primary_item_id, secondary_item_id, colorIdx, hatId, stampId) {
        //classIdx
        this.setClassIdx(classIdx);
        //gun skins
        this.setEquippedItem(ItemType.Primary, this.classIdx, catalog.findItemBy8BitItemId(ItemType.Primary, this.classIdx, primary_item_id));
        this.setEquippedItem(ItemType.Secondary, this.classIdx, catalog.findItemBy8BitItemId(ItemType.Secondary, this.classIdx, secondary_item_id));
        //cosmetics
        this.setColorIdx(colorIdx);
        this.setEquippedItem(ItemType.Hat, this.classIdx, catalog.findItemBy8BitItemId(ItemType.Hat, this.classIdx, hatId));
        this.setEquippedItem(ItemType.Stamp, this.classIdx, catalog.findItemBy8BitItemId(ItemType.Stamp, this.classIdx, stampId));
    };

    applyLoadout () {
        this.player.changeCharacter(
            this.classIdx,
            this.loadout[ItemType.Primary],
            this.loadout[ItemType.Secondary],
            this.colorIdx,
            this.loadout[ItemType.Hat],
            this.loadout[ItemType.Stamp],
        );
    };

    async instantiatePlayer() {
        this.player = new Player({
            id: this.id,
            uniqueId: this.account_id,
            nickname: this.nickname,
            classIdx: this.classIdx, // weapon class
            username: this.username,
            adminRoles: this.loggedIn ? this.userData.adminRoles : 0,

            team: this.room.getPreferredTeam(), //info.team,

            primaryWeaponItem: this.loadout[ItemType.Primary],
            secondaryWeaponItem: this.loadout[ItemType.Secondary],
            shellColor: this.colorIdx,
            hatItem: this.loadout[ItemType.Hat],
            stampItem: this.loadout[ItemType.Stamp],

            x: 0,
            y: 0,
            z: 0,
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

        // console.log("upgradeProductId", this.userData.upgradeProductId, this.loggedIn ? this.userData.upgradeProductId : 0);
    };

    async updateUserData() {
        var response;

        if (this.session && this.session.length > 0) {
            response = await wsrequest({
                cmd: "getUser",
                session: this.session,
            }, ss.config.game.services_server, ss.config.game.auth_key);
            // console.log(this.userData);
        };

        this.userData = response?.userData || null;
        this.sessionData = response?.sessionData || null;
    };

    async onmessage(message) {
        try {
            var input = new Comm.In(message);

            while (input.isMoreDataAvailable()) {
                let msg = {};
                msg.cmd = input.unPackInt8U();

                if (msg.cmd !== Comm.Code.sync && msg.cmd !== Comm.Code.ping) {
                    this.player.lastActivity = Date.now(); //excludes pings (ie idle for 5 mins)
                    console.log(this.id, "received:", Comm.Convert(msg.cmd));
                };

                switch (msg.cmd) {
                    case Comm.Code.clientReady:
                        if (!this.clientReady) {
                            this.clientReady = true;

                            // console.log()
    
                            var output = new Comm.Out();
                            this.room.packAllPlayers(output);
                            this.sendToMe(output, "packAllPlayers");
                    
                            var output = new Comm.Out();
                            this.packPlayer(output);
                            this.sendToAll(output, "packThisPlayer (ready/joined)");
                    
                            var output = new Comm.Out(1);
                            output.packInt8U(Comm.Code.clientReady);
                            this.sendToMe(output, "clientReady");

                            this.room.setGameOwner();

                            var output = new Comm.Out();
                            this.room.packAllItems(output);
                            this.room.packSetGameOwner(output);
                            this.sendToMe(output, "packAllItems");
                        };
                        break;
                    case Comm.Code.sync:
                        //reported by client
                        let stateIdx = input.unPackInt8U(); //be suspicious of this

                        this.adjustment = Math.diff(this.player.stateIdx, stateIdx, stateBufferSize);

                        // console.log(`rec: ${stateIdx}, cli: ${this.player.stateIdx}, dif: ${this.adjustment}`);

                        this.player.shotsQueued = input.unPackInt8();

                        var startIdx = Math.mod(this.player.stateIdx, stateBufferSize);
                        var i;
                        for (startIdx, i = 0; i < FramesBetweenSyncs; i++) {
                            var idx = Math.mod(startIdx + i, stateBufferSize);
                            this.player.stateBuffer[idx].controlKeys = input.unPackInt8U();
                            this.player.stateBuffer[idx].yaw = input.unPackRadU();
                            this.player.stateBuffer[idx].pitch = input.unPackRad();

                            // console.log("sync:", idx, this.player.stateIdx);
                        };

                        this.player.syncStateIdx = Math.mod(this.player.stateIdx + FramesBetweenSyncs, stateBufferSize);

                        break;
                    case Comm.Code.pause:
                        this.player.resetDespawn();

                        this.timeout.set(() => {
                            this.player.removeFromPlay();
                            this.sendToOthers(this.packPaused(), this.id, "pause");
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
                            this.sendToAll(output, "respawn");
                        };
                        break;
                    case Comm.Code.chat:
                        var text = input.unPackString();
                        console.log(this.player.name, "chatted:", text);

                        if (text.startsWith("/")) {
                            this.room.perm.inputCmd(this.player, text);
                        } else {
                            text = fixStringWidth(text, maxChatWidth);
                            if ("" != text && text.indexOf("<") < 0) { //todo, ratelimiting, censoring
                                var output = new Comm.Out();
                                output.packInt8U(Comm.Code.chat);
                                output.packInt8U(this.id);
                                output.packString(text);
                                this.sendToOthers(output, this.id, "chat: " + text);
                            };
                        };
                        break;
                    case Comm.Code.reload: 
                        this.player.reload();
                        break;
                    case Comm.Code.swapWeapon: 
                        var idx = input.unPackInt8U();
                        this.player.swapWeapon(idx);
                        break;
                    case Comm.Code.changeCharacter:
                        var newClassIdx = input.unPackInt8U();
                        var primaryWeaponItem = input.unPackInt8U();
                        var secondaryWeaponItem = input.unPackInt8U();
                        var shellColor = input.unPackInt8U();
                        var hatId = input.unPackInt8U();
                        var stampId = input.unPackInt8U();

                        await this.updateUserData();
                        this.updateLoadout(
                            newClassIdx,
                            primaryWeaponItem,
                            secondaryWeaponItem,
                            shellColor,
                            hatId,
                            stampId
                        );
                        this.applyLoadout();
                        break;
                    case Comm.Code.throwGrenade: 
                        var grenadeThrowPower = input.unPackFloat();
                        console.log("throwing a grenade", grenadeThrowPower);
                        this.player.queueGrenade(grenadeThrowPower);
                        break;
                    case Comm.Code.switchTeam:
                        if (this.room.gameOptions.teamsEnabled) {
                            var totalPlayers = this.room.getPlayerCount();
                            var originalTeamCount = this.room.getPlayerCount(this.player.team);
                            var switchAccepted = (totalPlayers - (originalTeamCount * 2)) < this.room.gameOptions.teamSwitchMaximumDifference;
                            // devlog("total", totalPlayers);
                            // devlog("on your team", originalTeamCount);
                            // devlog("switching allowed", switchAccepted);

                            if (switchAccepted) {
                                var toTeam = this.player.team === 1 ? 2 : 1;
                                this.player.switchTeam(toTeam);
                            } else {
                                var output = new Comm.Out(1);
                                output.packInt8U(Comm.Code.switchTeamFail);
                                this.sendToMe(output, "switchTeamFail");
                            };
                        };
                        break;
                    case Comm.Code.bootPlayer:
                        let id = input.unPackInt8U();
                        let client = this.room.clients[id];

                        if (this.room.perm.cmds.mod.boot.checkPermissions(this.player) && client && id !== this.player.id) {
                            client.sendBootToWs();
                        };
                        break;
                    case Comm.Code.ping:
                        this.pingLevelInt = Math.clamp(input.unPackInt8U(), 0, 3);
                        // console.log(this.nickname, "new pingLevelInt", this.pingLevelInt)
                        var output = new Comm.Out();
                        output.packInt8U(Comm.Code.ping);
                        this.sendToMe(output, "ping");
                        this.lastPingTime = Date.now();
                        break;
                };
            };

        } catch (error) {
            console.error('Error processing message:', error);
        };
    };

    async onclose() {
        this.room.disconnectClient(this);
    };

    setEquippedItem(itemType, classIdx, item) { //itemType: stamp/hat/prim/sec, classIdx: eggk/shotgun etc
        let itemId = 0;

        // console.log("verifying item");
        // console.log(item, !!this.userData);
        // console.log(item.exclusive_for_class, classIdx);
        // console.log(item.item_type_id, itemType);
        // this.userData && console.log(this.userData.ownedItemIds, item.id, this.userData.ownedItemIds.includes(item.id));

        if (
            item
            && this.userData // player has an account
            && (item.exclusive_for_class === classIdx || ItemType.Hat === itemType || ItemType.Stamp === itemType) && (item.item_type_id === itemType) // item is valid
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

    setClassIdx(classIdx) {
        let range = 3;
        classIdx = Math.clamp(Math.floor(classIdx), 0, range);
        if (classes[this.classIdx]) this.classIdx = classIdx;
    };

    setColorIdx(colorIdx) {
        let range = 6;
        if (this.loggedIn && (this.userData.upgradeExpiryDate > Date.now() / 1000)) range = 13;
        // console.log(this.userData.upgradeExpiryDate, Date.now() / 1000)
        this.colorIdx = Math.clamp(Math.floor(colorIdx), 0, range);
    };

    packPlayer(output) {
        output.packInt8U(Comm.Code.addPlayer);

        output.packInt8U(this.id);
        output.packInt32U(this.account_id);
        output.packString(this.nickname);
        output.packInt8U(this.classIdx);
        output.packString(this.username);
        output.packInt8U(this.player.adminRoles);

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
        output.packInt8U(this.player.weaponIdx); //weaponIdx
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
        output.packFloat(this.player.dx);
        output.packFloat(this.player.dy);
        output.packFloat(this.player.dz);
        output.packInt8U(this.player.climbing ? 1 : 0);
        output.packInt8U(this.pingLevelInt);
        // console.log(this.id, this.pingLevelInt)

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
        output.packInt8U(this.player.team); // myTeam (0 for ffa, 1-2 for teams)
        output.packInt8U(this.room.gameType); // gameType
        output.packInt16U(this.room.gameId); // gameId
        output.packInt16U(this.room.gameKey); // gameKey
        output.packInt8U(this.room.mapId); // mapIdx
        output.packInt8U(this.room.playerLimit); // playerLimit
        output.packInt8U(0); //bool // isGameOwner
    };
    
    pickupItem (kind, weaponIdx, id) {
        this.room.itemManager.collectItem(kind, id);

        var output = new Comm.Out();
        this.room.packCollectItemPacket(output, this.id, kind, weaponIdx, id)

        this.sendToAll(output, "collectItem");

        this.room.spawnItems();
    };

    sendBuffer(output, debug) { // more direct operation, prefer this.room.sendToOne
        if (!(debug.includes("sync") || debug.includes("ping"))) console.log(this.id, output.idx, debug);
        this.sendMsgToWs(output.buffer);
    };

    sendToMe (output, debug) {
        this.room.sendToOne(output, this.id, this.id, debug);
    };

    sendToOne (output, toId, debug) {
        this.room.sendToOne(output, this.id, toId, debug);
    };

    sendToOthers (output, debug) {
        this.room.sendToOthers(output, this.id, debug);
    };

    sendToAll (output, debug) {
        this.room.sendToAll(output, this.id, debug);
    };

    sendMsgToWs(msg) {
        ss.parentPort.postMessage([Comm.Worker.send, msg, this.wsId]);
    };

    sendCloseToWs(msg) {
        ss.parentPort.postMessage([Comm.Worker.close, msg, this.wsId]);
    };

    sendBootToWs(msg) {
        ss.parentPort.postMessage([Comm.Worker.boot, msg, this.wsId]);
    };
};

export default {
    setSS,
    newClient,
};