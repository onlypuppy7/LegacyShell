//legacyshell: client
import misc from '#misc';
import Comm from '#comm';
import { ItemType, itemIdOffsets, FramesBetweenSyncs, stateBufferSize, TimeoutManagerConstructor, maxChatWidth, IntervalManagerConstructor, classes, devlog, CharClass } from '#constants';
import { fixStringWidth } from '#stringWidth';
import { parseMentions } from '#permissions';
import Player from '#player';
import CatalogConstructor from '#catalog';
import extendMath from '#math';
//legacyshell: getting user data
import wsrequest from '#wsrequest';
//legacyshell: logging
import log from '#coloured-logging';
//legacyshell: plugins
import { plugins } from '#plugins';
//legacyshell: ss
import { ss } from '#misc';
//legacyshell: room worker (bridge)
import { parentPort } from 'worker_threads';
//

plugins.emit('clientStartUp', {  });

let catalog;
extendMath(Math);

class newClient {
    constructor(room, info) {
        this.initClient(room, info);
        catalog = new CatalogConstructor(ss.items);
    };

    async initClient(room, info) {
        await plugins.emit('clientInit', { this: this, room, info });

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
        //
        this.uuid = info.uuid || Math.randomInt(1,4294967295);
        this.account_id = this.loggedIn ? this.userData.account_id : null; //reminder this is the ID of the actual account
        this.nickname = info.nickname; //todo check this is legal length and stuff
        this.username = this.loggedIn ? this.userData.username : "Guest_"+Math.seededRandomAlphaNumeric(5, this.uuid);
        this.id = info.id; //place in list
        this.classIdx = info.classIdx;

        // console.log(this.room.details.usernames, this.username);
        if (this?.room?.details?.usernames && this.room.details.usernames.includes(this.username)) {
            devlog("reject this silly mf", this.username);
            this.sendCloseToWs(Comm.Close.masterServerBusy);
            return;
        };
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
        // await this.applyLoadout();

        this.room.registerPlayerClient(this);

        var output = new Comm.Out(/*11*/); //if fixed for gameJoined, use 11
        this.packGameJoined(output);
        //extra info; here bc room ref
        const extraInfo = {};

        await plugins.emit("clientGameJoinedExtraInfos", {this:this, room: room, extraInfo: extraInfo});

        if (this.room.useCustomMap) {
            Object.assign(extraInfo, {
                customMinMap: this.room.minMap,
            });
        };

        output.packVeryLongString(JSON.stringify(extraInfo));
        this.sendBuffer(output, "packGameJoined"); //buffer cause not clientReady

        this.room.updateRoomDetails();

        await plugins.emit('clientInitEnd', { this: this, room, info });
    };

    async updateLoadout (classIdx, primary_item_id, secondary_item_id, colorIdx, hatId, stampId) {
        await plugins.emit('clientUpdateLoadout', { this: this, classIdx, primary_item_id, secondary_item_id, colorIdx, hatId, stampId });

        //classIdx
        this.setClassIdx(classIdx);
        //gun skins
        this.setEquippedItem(ItemType.Primary, this.classIdx, catalog.findItemBy8BitItemId(ItemType.Primary, this.classIdx, primary_item_id));
        this.setEquippedItem(ItemType.Secondary, this.classIdx, catalog.findItemBy8BitItemId(ItemType.Secondary, this.classIdx, secondary_item_id));
        //cosmetics
        this.setColorIdx(colorIdx);
        this.setEquippedItem(ItemType.Hat, this.classIdx, catalog.findItemBy8BitItemId(ItemType.Hat, this.classIdx, hatId));
        this.setEquippedItem(ItemType.Stamp, this.classIdx, catalog.findItemBy8BitItemId(ItemType.Stamp, this.classIdx, stampId));

        await plugins.emit('clientUpdateLoadoutEnd', { this: this, classIdx, primary_item_id, secondary_item_id, colorIdx, hatId, stampId });
    };

    async applyLoadout () {
        await plugins.emit('clientApplyLoadout', { this: this });

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
        await plugins.emit('clientInstantiatePlayer', { this: this });

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

        await plugins.emit('clientInstantiatePlayerEnd', { this: this });

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

        this.loggedIn = this.userData && this.sessionData;
    };

    async onmessage(message) {
        try {
            var input = new Comm.In(message);

            while (input.isMoreDataAvailable()) {
                let msg = {};
                msg.cmd = input.unPackInt8U();

                if (msg.cmd !== Comm.Code.sync && msg.cmd !== Comm.Code.syncData && msg.cmd !== Comm.Code.ping) {
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

                            var output = new Comm.Out();
                            this.room.packUpdateRoomParams(output);
                            this.room.packRoundUpdate(output);
                            output.packInt8U(Comm.Code.clientReady);
                            this.sendToMe(output, "clientReady");

                            this.room.setGameOwner();

                            var output = new Comm.Out();
                            this.room.packAllItems(output);
                            this.room.packSetGameOwner(output);
                            this.sendToMe(output, "packAllItems");

                            if (this.room.customMapFailed) {
                                this.notify("NOTICE: Loading your custom map failed, please identify the issues, somehow.", 15);
                            };
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

                        plugins.emit("CommCodeSyncEnd", {this: this, player: this.player, adjustment: this.adjustment, stateIdx, startIdx, i});

                        break;
                    case Comm.Code.pause:
                        this.pause();
                        break;
                    case Comm.Code.requestRespawn:
                        if (this.player.canRespawn() && !this.player.playing) {
                            const spawnPoint = this.room.getBestSpawn(this.player);

                            this.player.pitch = 0; //directly forward
                            this.player.yaw = (Math.random() * Math.PI * 4) - Math.PI*2;
                            //random radiant angle ^^^ (rad -> min:-2π, max: 2π;)
                            //ergo random float between 0 and 4π minus 2π (due to how Math.random works.)
                            //and NO using randomInt is NOT an option.

                            await plugins.emit("requestRespawn", {this: this, player: this.player, spawnPoint});

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
                        } else {
                            devlog("rejected respawn lmao.", this.player.canRespawn(), !this.player.playing);
                        };
                        break;
                    case Comm.Code.chat:
                        var text = input.unPackLongString();
                        text = text.replaceAll("<", "(");
                        console.log(this.player.name, "chatted:", text);

                        if (this.player.chatLineCap <= 0 && this.player.chatLineCap >= -1) {
                            this.notify("You are sending messages too quickly. Please wait a moment.");
                        } else if ("" != text) {
                            if (text.startsWith("/")) {
                                this.room.perm.inputCmd(this.player, text);
                            } else if (!this.room.censor.detect(text, true)) {
                                text = fixStringWidth(text, maxChatWidth * 1.25); // giving slight leeway to prevent cutoffs
                                var output = new Comm.Out();
                                if (text.startsWith("@")) {
                                    var {mentions} = parseMentions(text, this);
                                    if (mentions[0]) {
                                        this.room.packChat(output, text, this.id, Comm.Chat.whisper);
                                        mentions[0].forEach(player => {
                                            if (player !== this.player) this.sendToOne(output, player.id, "chat: " + text);
                                        });
                                    };
                                } else {
                                    this.room.packChat(output, text, this.id, Comm.Chat.user);
                                    this.sendToOthers(output, this.id, "chat: " + text);
                                };
                            };
                            this.player.chatLineCap -= -.75; // on client its 1.25, this is just a measure to make it more obvious to the player
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
                        await this.applyLoadout();
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
                                devlog("switching failed", this.player.team, totalPlayers, originalTeamCount);
                            };
                        };
                        break;
                    case Comm.Code.bootPlayer:
                        let id = input.unPackInt8U();
                        let client = this.room.clients[id];

                        if (this.room.perm.searchPermission("boot", this.player) && client && id !== this.player.id) {
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

    pause(time = 5e3) {
        if (this.player.canRespawn()) {
            this.player.resetDespawn(time);

            this.timeout.set(() => {
                this.player.removeFromPlay();
                this.sendToOthers(this.packPaused(), this.id, "pause");
            }, 3e3);
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
        let range = CharClass.length - 1;
        classIdx = Math.clamp(Math.floor(classIdx), 0, range);
        if (classes[this.classIdx]) this.classIdx = classIdx;
    };

    setColorIdx(colorIdx) {
        let range = 6;
        if (this.loggedIn && (this.userData.upgradeExpiryDate > Date.now() / 1000)) range = 13;
        // console.log(this.userData.upgradeExpiryDate, Date.now() / 1000)
        this.colorIdx = Math.clamp(Math.floor(colorIdx), 0, range);
    };

    commandFeedback(text) {
        var output = new Comm.Out();
        this.room.packChat(output, text, 255, Comm.Chat.cmd);
        this.sendToMe(output, "chat (cmd)");
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

        output.packInt16U(catalog.get8BitItemId(this.loadout[ItemType.Primary], this.classIdx));
        output.packInt16U(catalog.get8BitItemId(this.loadout[ItemType.Secondary], this.classIdx));
        output.packInt8U(this.colorIdx);
        output.packInt16U(catalog.get8BitItemId(this.loadout[ItemType.Hat], this.classIdx));
        output.packInt16U(catalog.get8BitItemId(this.loadout[ItemType.Stamp], this.classIdx));

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

        this.packModifiers(output);
    };

    packModifiers(output) {
        output.packInt8U(Comm.Code.setModifiers);
        output.packInt8U(this.id);
        //unsigned
        output.packInt8U(this.player.modifiers.scale * 10); //range: 0 to 25.5
        //signed
        output.packInt8(this.player.modifiers.regenModifier * 10); //range: -12.8 to 12.7
        output.packInt8(this.player.modifiers.speedModifier * 10); //range: -12.8 to 12.7
        output.packInt8(this.player.modifiers.gravityModifier * 10); //range: -12.8 to 12.7
        output.packInt8(this.player.modifiers.damageModifier * 10); //range: -12.8 to 12.7
        output.packInt8(this.player.modifiers.resistanceModifier * 10); //range: -12.8 to 12.7
        output.packInt8(this.player.modifiers.jumpBoostModifier * 10); //range: -12.8 to 12.7
    };

    async packSync(output) {
        output.packInt8U(Comm.Code.sync);

        let adjustedStateIdx = Math.mod(this.player.stateIdx + this.adjustment - FramesBetweenSyncs, stateBufferSize);

        // console.log("packsync", adjustedStateIdx, this.player.stateIdx, this.adjustment);
        await plugins.emit('clientPackSync', { this: this, output });

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

            await plugins.emit('clientPackSyncLoop', { this: this, output, state });

            if (!plugins.cancel) {
                output.packInt8U(state.controlKeys);
                output.packRadU(state.yaw);
                output.packRad(state.pitch);
            };
        };
    };

    packDataSync(output) {
        output.packInt8U(Comm.Code.syncData);

        output.packInt8U(this.id);

        output.packFloat(this.player.hp);
        // console.log("packDataSync", this.player.hp);
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

    packNotificationPacket(output, text, timeoutTime = 3) {
        output.packInt8U(Comm.Code.notification);
        output.packString(text);
        output.packInt8U(timeoutTime);
    };

    notify(text, timeoutTime = 5) {
        console.log("notify", text)
        text = text.replaceAll("<", "(");
        var output = new Comm.Out();
        this.packNotificationPacket(output, text, timeoutTime);
        this.sendToMe(output, "notification");
    };

    pickupItem (kind, weaponIdx, id) {
        this.room.itemManager.collectItem(kind, id);

        var output = new Comm.Out();
        this.room.packCollectItemPacket(output, this.id, kind, weaponIdx, id)

        this.sendToAll(output, "collectItem");

        this.room.spawnItems();
    };

    sendUpdateBalance(currentBalance) {
        var output = new Comm.Out();
        output.packInt8U(Comm.Code.updateBalance);
        output.packInt32U(currentBalance);
        this.sendToMe(output, "updateBalance");
    };

    async addKillViaServices() {
        if (this.session && this.session.length > 0) {
            var response = await wsrequest({
                cmd: "addKill",
                session: this.session,
                currentKills: this.kills,
            }, ss.config.game.services_server, ss.config.game.auth_key);

            this.sendUpdateBalance(response.currentBalance);
        };
    };

    async addEggsViaServices(eggAmount) {
        if (this.session && this.session.length > 0) {
            var response = await wsrequest({
                cmd: "addEggs",
                session: this.session,
                eggAmount,
            }, ss.config.game.services_server, ss.config.game.auth_key);

            this.sendUpdateBalance(response.currentBalance);
        };
    };

    sendBuffer(output, debug) { // more direct operation, preferred to use this.room.sendToOne
        if (!(debug.includes("sync") || debug.includes("ping") || debug.includes("dataSync"))) console.log(this.id, debug, output.idx);
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
        parentPort.postMessage([Comm.Worker.send, msg, this.wsId]);
    };

    sendCloseToWs(msg) {
        parentPort.postMessage([Comm.Worker.close, msg, this.wsId]);
    };

    sendBootToWs(msg) {
        parentPort.postMessage([Comm.Worker.boot, msg, this.wsId]);
    };
};

export default {
    newClient,
};
