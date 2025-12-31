//legacyshell: player
import BABYLON from "babylonjs";
import { stateBufferSize, isClient, isServer, CONTROL, devlog, serverlog, iteratePlayers } from '#constants';
import { ItemTypes, AllItems } from '#items';
import { getMunitionsManager } from '#bullets';
import Comm from '#comm';
//legacyshell: adding kills and deaths (literally tracking ur every move the government is watching yuo)
import wsrequest from '#wsrequest';
//legacyshell: logging
import log from '#coloured-logging';
//legacyshell: ss
import { ss } from '#misc';
//legacyshell: plugins
import { plugins } from '#plugins';
//

//(server-only-start)
const wsSend = function (output, CommCode) {
    console.log("wtf?", CommCode); //case that shouldnt exist
};

let Collider = null;
let mapMeshes = null;
let map = null;

let meId = -100;
//(server-only-end)

// [LS] Player CONSTRUCTOR
class Player {
    constructor(data, scene, client) {
        if (client) {
            this.client = client;
            this.room = this.client.room;
            this.Collider = this.room.Collider;
            this.mapMeshes = this.room.mapMeshes;
            this.map = this.room.map;
            this.minMap = this.room.minMap;
            this.gameOptions = this.room.gameOptions;
        } else {
            this.Collider = Collider;
            this.mapMeshes = mapMeshes;
            this.map = map;
            this.minMap = minMap;
            this.gameOptions = gameOptions;
        };

        this.isGameOwner = false;
        this.id = data.id;
        this.uniqueId = data.uniqueId;
        this.name = data.name || data.nickname; //fyi this is a bad
        this.classIdx = data.classIdx;
        this.username = data.username !== "" ? data.username : "Guest";
        this.adminRoles = data.adminRoles;
        this.team = data.team;
        this.primaryWeaponItem = data.primaryWeaponItem;
        this.secondaryWeaponItem = data.secondaryWeaponItem;
        this.shellColor = data.shellColor;
        this.hatItem = data.hatItem;
        this.stampItem = data.stampItem;
        this.x = data.x;
        this.y = data.y;
        this.z = data.z;
        this.dx = data.dx;
        this.dy = data.dy;
        this.dz = data.dz;
        this.controlKeys = data.controlKeys;
        this.yaw = data.yaw;
        this.pitch = data.pitch;
        this.score = data.score;
        this.kills = data.kills;
        this.deaths = data.deaths;
        this.streak = data.streak;
        this.score = data.score;
        this.totalKills = data.totalKills;
        this.totalDeaths = data.totalDeaths;
        this.bestGameStreak = data.bestGameStreak;
        this.bestOverallStreak = data.bestOverallStreak;
        this.shield = data.shield;
        this.hp = data.hp;
        this.playing = data.playing;
        this.weaponIdx = data.weaponIdx;
        this.upgradeProductId = data.upgradeProductId;
        this.isGameOwner = data.isGameOwner;
        this.scene = scene;
        this.corrected = {
            dx: 0,
            dy: 0,
            dz: 0,
            pitch: 0,
            yaw: 0
        };
        this.corrections = 0;
        this.hackDetected = data.hackDetected;
        this.rofCountdown = 0;
        this.triggerPulled = false;
        this.shotsQueued = 0;
        this.reloadsQueued = 0;
        this.roundsToReload = 0;
        this.recoilCountdown = 0;
        this.reloadCountdown = 0;
        this.swapWeaponCountdown = 0;
        this.weaponSwapsQueued = 0;
        this.equipWeaponIdx = this.weaponIdx;
        this.shotSpread = 0;
        this.randomSeed = data.randomSeed;
        this.grenadeCount = this.gameOptions.startingGrenades;
        this.grenadeCapacity = 3;
        this.grenadeCountdown = 0;
        this.grenadesQueued = 0;
        this.jumping = false;
        this.lastTouchedGround = 1;
        this.climbing = false;
        this.climbingCell = {
            x: 0,
            z: 0,
            ry: 0
        };
        this.bobble = 0;
        this.stateIdx = 0;
        this.syncStateIdx = 0;
        this.respawnTargetTime = 0;
        this.pauseTargetTime = 0;
        this.ready = false;
        this.chatLineCap = 3;
        this.respawnQueued = false;
        if (isClient) this.actor = new PlayerActor(this);
        this.stateBuffer = [];
        for (var i = 0; i < stateBufferSize; i++) {
            this.stateBuffer.push({
                delta: 0,
                yaw: data.yaw,
                pitch: data.pitch,
                fire: false,
                jumping: false,
                climbing: false,
                x: data.x,
                y: data.y,
                z: data.z,
                dx: data.dx,
                dy: data.dy,
                dz: data.dz,
                controlKeys: data.controlKeys
            });
        };
        this.changeWeaponLoadout(this.primaryWeaponItem, this.secondaryWeaponItem);
        this.jumps = 0;
        this.maxJumps = 1;
        // console.log(this.minMap);
        if (this.minMap?.extents && this.minMap.extents.maxJumps !== undefined) {
            let maxJumps = this.minMap.extents.maxJumps;
            if (maxJumps !== "") this.maxJumps = Number(maxJumps);
        };
        this.isFalling = false;

        var respawnTime = 0;
        if (isServer && this.betweenRounds()) {
            let maxTime = this.gameOptions.timedGame.spawnDuringInterval ? this.room.roundEndTime + 5e3 : this.room.roundRestartTime;
            respawnTime = Math.max(0, maxTime - Date.now());
            // console.log("respawnTime", respawnTime, this.gameOptions.timedGame.spawnDuringInterval);
        };
        this.resetDespawn(respawnTime);

        this.jumpHeld = false;
        this.lastActivity = Date.now();

        this.modifiers = {};
        this.setDefaultModifiers(true);
    };
    setDefaultModifiers(init) {
        this.changeModifiers({
            gravityModifier: this.gameOptions.gravityModifier[this.team],
            speedModifier: this.gameOptions.speedModifier[this.team],
            regenModifier: this.gameOptions.regenModifier[this.team],
            damageModifier: this.gameOptions.damageModifier[this.team],
            resistanceModifier: this.gameOptions.resistanceModifier[this.team],
            jumpBoostModifier: this.gameOptions.jumpBoostModifier[this.team],
            scale: this.gameOptions.scale[this.team],
            knockbackModifier: this.gameOptions.knockbackModifier[this.team],
        }, init);
    };
    changeScale (newScale, init) {
        devlog("setting scale:", newScale);
        this.modifiers.scale = newScale;
        if (this.actor) {
            this.actor.mesh.scaling.set(newScale, newScale, newScale);

            var scale = Math.max(newScale, 0.15); //prevents NaN
            this.actor.playbackRate = 1.16107 - (0.239878 * Math.log((2.20821 * scale) - 0.251099)); //hm yes, this is a good formula
            // this.actor.bodyMesh.position.y = 0.32 * newScale;
        };
        this.sendModifiers(init);
    };
    changeModifiers(modifiers, init) { //a little less disorganized but it works for this purpose
        Object.assign(this.modifiers, modifiers);

        if (modifiers.scale !== undefined) this.changeScale(modifiers.scale, init);

        this.sendModifiers(init);
    };
    sendModifiers(init) {
        if (isServer && !init) {
            var output = new Comm.Out();
            this.client.packModifiers(output);
            this.client.sendToAll(output, "setModifiers");
        };
    };
    changeWeaponLoadout(primaryWeaponItem, secondaryWeaponItem) {
        if (this.actor && this.weapons) {
            this.weapons[0].actor.dispose();
            this.weapons[1].actor.dispose();
        };
        this.primaryWeaponItem = primaryWeaponItem;
        this.secondaryWeaponItem = secondaryWeaponItem;
        this.weapons = [primaryWeaponItem.instantiateNew(this), secondaryWeaponItem.instantiateNew(this)];
        this.weapon = this.weapons[this.weaponIdx];
        if (this.actor) {
            this.weapon.actor.equip();
        };
    };
    update(delta, resim) {
        var dx = 0;
        var dy = 0;
        var dz = 0;

        if (this.y < -3 && isServer && this.hp > 0) {
            devlog("[player fell out of the world]");
            this.hit(10000, this, 0, 0);
        };

        if (!resim && this.actor && this.id == meId) {
            this.stateBuffer[this.stateIdx].controlKeys = this.controlKeys;
            this.stateBuffer[this.stateIdx].yaw = this.yaw;
            this.stateBuffer[this.stateIdx].pitch = this.pitch;
        };
        if (!this.actor || this.id != meId) {
            var idx = this.stateIdx;
            if (this.actor && this.id != meId) {
                idx = Math.min(idx, FramesBetweenSyncs - 1);
            };
            this.controlKeys = this.stateBuffer[idx].controlKeys;
            this.yaw = this.stateBuffer[idx].yaw;
            this.pitch = this.stateBuffer[idx].pitch;
        };

        if (isServer && ((!this.canRespawn()) || this.betweenRounds())) this.controlKeys = 0;

        if (isClient && this.betweenRounds()) this.controlKeys = 0;

        // devlog(this.name, this.stateIdx, this.controlKeys, this.x.toFixed(2), this.y.toFixed(2), this.z.toFixed(2), this.dx.toFixed(2), this.dy.toFixed(2), this.dz.toFixed(2), this.yaw.toFixed(2), this.pitch.toFixed(2));

        // serverlog(this.weapon.ammo.rounds, this.weapon.ammo.store);

        if (this.controlKeys & CONTROL.left) {
            this.lastActivity = Date.now();
            dx -= Math.cos(this.yaw);
            dz += Math.sin(this.yaw);
        };

        if (this.controlKeys & CONTROL.right) {
            this.lastActivity = Date.now();
            dx += Math.cos(this.yaw);
            dz -= Math.sin(this.yaw);
        };

        if (this.controlKeys & CONTROL.up) {
            this.lastActivity = Date.now();
            if (this.climbing) {
                dy += 1;
            } else {
                dx += Math.sin(this.yaw);
                dz += Math.cos(this.yaw);
            };
        };

        if (this.controlKeys & CONTROL.down) {
            this.lastActivity = Date.now();
            if (this.climbing) {
                dy -= 1;
            } else {
                dx -= Math.sin(this.yaw);
                dz -= Math.cos(this.yaw);
            };
        };

        if (isServer) {
            let itemManager = this.room.itemManager;
            let pools = itemManager.pools;

            for (let i = 0; i < pools.length; i++) {
                let pool = pools[i];

                pool.forEachActive((item) => {
                    if ( //collision
                        (Math.round(this.x * 2) / 2) == (item.x) &&
                        Math.round(this.y) == Math.round(item.y) &&
                        (Math.round(this.z * 2) / 2) == (item.z)
                    ) {
                        var itemCollected = this.collectItem(i, this.weaponIdx);
                        // console.log("could collect?", itemCollected, i, this.weaponIdx);
                        if (itemCollected) {
                            this.client.pickupItem(i, this.weaponIdx, item.id);
                        };
                    };
                })
            };
        };

        if ((this.controlKeys & CONTROL.jump) && (0 < this.lastTouchedGround && Date.now() > this.lastTouchedGround + 100)) {
            this.lastActivity = Date.now();
            if (!this.jumpHeld) {
                this.jump();
                this.jumpHeld = true;
            };
        } else this.jumpHeld = false;

        // serverlog({x: this.x, y: this.y, z: this.z}, {dx: this.dx, dy: this.dy, dz: this.dz}, {yaw: this.yaw, pitch: this.pitch});

        if (this.climbing) {
            this.setJumping(false);
            var pdy = this.dy;
            if (this.corrections) {
                pdy += this.corrected.dy / 6;
                this.corrections--
            };
            this.dy += .014 * dy * delta;
            var ndy = .5 * (this.dy + pdy) * delta;
            this.y += ndy;
            this.dy *= Math.pow(.5, delta);
            var cx = Math.floor(this.climbingCell.x);
            var cy = Math.floor(this.y + 1e-4);
            var cz = Math.floor(this.climbingCell.z);

            if (0 == this.climbingCell.ry || this.climbingCell.ry, cy >= this.map.height) {
                this.climbing = false;
            } else {
                var cell = this.getOccupiedCell(cx, cy, cz);
                if (!(cell.idx && this.mapMeshes[cell.idx].colliderType === "ladder" && cell.ry === this.climbingCell.ry)) {
                    this.y = Math.round(this.y);
                    this.climbing = false;
                };
            };

            if (this.collidesWithMap()) {
                if (0 < ndy && .3 < this.y % 1) {
                    this.y -= ndy;
                    this.dy *= .5;
                } else {
                    ndy < 0 && (this.y -= ndy, this.dy *= .5, this.climbing = false)
                };
            };
        } else {
            var deltaVector = new BABYLON.Vector3(dx, dy, dz).normalize();
            var pdx = this.dx;
            var pdz = (pdy = this.dy, this.dz);

            if (this.corrections) {
                pdx += this.corrected.dx / 6;
                this.jumping || (pdy += this.corrected.dy / 6);
                pdz += this.corrected.dz / 6, this.corrections--;
            };

            if (this.jumping && this.jumps === 0) {
                if (!this.isFalling) this.jumps++;
                this.isFalling = true;
            } else {
                this.isFalling = false;
            };

            // console.log(dx, dy, dz, deltaVector, delta);

            this.dx += .007 * deltaVector.x * delta;
            this.dz += .007 * deltaVector.z * delta;
            this.dy -= .003 * delta * (this.modifiers.gravityModifier || 1);
            this.dy = Math.clamp(this.dy, -.2, .2);

            var ndx = .5 * (this.dx + pdx) * delta;
            var ndz = (ndy = .5 * (this.dy + pdy) * delta, .5 * (this.dz + pdz) * delta);

            this.moveX(ndx * this.modifiers.speedModifier, delta);
            this.moveZ(ndz * this.modifiers.speedModifier, delta);
            this.moveY(ndy, delta)
        };
        if (!resim) {
            if (0 < this.shield && this.playing) {
                this.shield -= delta;
                if (0 != dx || 0 != dy || this.shield <= 0) {
                    this.disableShield();
                };
            };
            var speed = Math.length3(this.dx, this.dy, this.dz);
            if (this.actor && this.id == meId) {
                speed *= 0.75;
            };
            if (this.climbing || this.jumping) {
                speed *= 2;
            };

            this.bobble = (this.bobble + 7 * speed) % Math.PI2;
            this.settleWeapon(speed, delta);
            if (this.weapon) {
                this.weapon.update(delta)
            };
            // console.log("patrascru", this.playing, this.isDead(), this.canRespawn(), this.hp);
            if (0 < this.hp && this.playing) {
                this.setHp(Math.min(100, this.hp + .05 * delta * this.modifiers.regenModifier)); //regenning, you can put `* -2` or something here to simulate hunger, or something
            };
            if (0 < this.swapWeaponCountdown) {
                this.shotSpread = this.weapon.subClass.shotSpreadIncrement;
                this.swapWeaponCountdown -= delta;
                if (this.swapWeaponCountdown) {
                    if (this.actor) {
                        this.id == meId && reticle.show();
                    } else {
                        this.swapWeaponCountdown = 0;
                        this.weaponIdx = this.equipWeaponIdx;
                        this.weapon = this.weapons[this.weaponIdx];
                    };
                };
            };
            if (0 < this.reloadCountdown) {
                this.shotSpread = this.weapon.subClass.shotSpreadIncrement;
                this.reloadCountdown -= delta;
                if (this.reloadCountdown <= 0) {
                    this.reloadCountdown = 0;
                    this.reloaded();
                };
            };
            if (0 < this.rofCountdown) {
                this.rofCountdown = Math.max(this.rofCountdown - delta, 0);
            };
            if (0 < this.recoilCountdown) {
                this.recoilCountdown = Math.max(this.recoilCountdown - delta, 0);
            };
            if (0 < this.grenadeCountdown) {
                this.grenadeCountdown -= delta;
                if (this.grenadeCountdown <= 0 && 0 < this.grenadesQueued && !this.actor) {
                    this.throwGrenade();
                };
            };
            var oldMethod = false; //new method might be better
            if (this.actor) { //client
                if (!this.triggerPulled) this.controlKeys ^= this.controlKeys & CONTROL.fire;
                this.id == meId && this.triggerPulled && this.fire();
            } else if (oldMethod ? 0 < this.shotsQueued : this.controlKeys & CONTROL.fire) { //server, old/new method
                this.lastActivity = Date.now();
                this.fire();
                devlog("fire");
            };
            this.stateBuffer[this.stateIdx].x = this.x;
            this.stateBuffer[this.stateIdx].y = this.y;
            this.stateBuffer[this.stateIdx].z = this.z;
            this.stateBuffer[this.stateIdx].dx = this.dx;
            this.stateBuffer[this.stateIdx].dy = this.dy;
            this.stateBuffer[this.stateIdx].dz = this.dz;
            this.stateIdx = Math.mod(this.stateIdx + 1, stateBufferSize);
        };
        this.dx *= Math.pow(.8, delta);
        this.dz *= Math.pow(.8, delta);
        if (!this.actor || this.id !== meId) {
            if (this.reloadsQueued > 0) {
                this.reload();
            };
            if (this.weaponSwapsQueued > 0) {
                this.swapWeapon(this.equipWeaponIdx);
            };
        };
    };
    disableShield() { //shield is NOT the powerup, it is the spawning in protection!
        this.shield = 0;
        if (this.actor) { // client/server differentiation stuff
            this.actor.bodyMesh.renderOverlay = false;
            this.actor.hands.renderOverlay = false;
        };
    };
    enableShield() {
        this.shield = 120;
        if (this.actor) { // client/server differentiation stuff
            this.actor.bodyMesh.renderOverlay = true;
            this.actor.hands.renderOverlay = true;
        };
    };
    resetStateBuffer() {
        for (var i = 0; i < stateBufferSize; i++) {
            this.stateBuffer[i] = {
                delta: 0,
                yaw: this.yaw,
                pitch: this.pitch,
                fire: false,
                jump: false,
                jumping: false,
                climbing: false,
                x: this.x,
                y: this.y,
                z: this.z,
                dx: 0,
                dy: 0,
                dz: 0,
                controlKeys: 0
            };
        };
    };
    moveX(ndx, delta) {
        var old_x = this.x;
        this.x += ndx;
        var collide = this.collidesWithMap();
        if (collide) {
            var old_y = this.y;
            this.y += Math.abs(ndx) + .01 * delta;
            if (this.collidesWithMap()) {
                this.x = old_x;
                this.dx *= .5;
                this.y = old_y;
            } else {
                this.dx *= .92;
            };
            this.lookForLadder(collide);
        };
    };
    moveZ(ndz, delta) { //fuck this function
        var old_z = this.z;
        this.z += ndz;
        var collide = this.collidesWithMap();
        if (collide) {
            var old_y = this.y;
            this.y += Math.abs(ndz) + .01 * delta;
            if (this.collidesWithMap()) {
                this.z = old_z;
                this.dz *= .5;
                this.y = old_y;
            } else {
                this.dz *= .92;
            };
            this.lookForLadder(collide); //oh yeah its just sooo simple right so easy
        }
    };
    moveY(ndy, delta) {
        var old_y = this.y;
        this.y += ndy;
        if (this.collidesWithMap()) {
            if (ndy < 0) {
                if (this.actor && this.id == meId && 0 == this.lastTouchedGround) {
                    this.lastTouchedGround = Date.now();
                };
                this.setJumping(false);
                this.jumps = 0;
            };
            this.y = old_y;
            this.dy *= .5;

            var cx = Math.floor(this.x);
            var cz = Math.floor(this.z);

            var cell = this.getOccupiedCell(cx, Math.floor(this.y - 0.5), cz);
            var cellAbove = this.getOccupiedCell(cx, Math.floor(this.y + 0.5), cz);
            if (cell) {
                var mesh = cell.mesh;
                if (mesh) {
                    if (Math.length2(cx + 0.5 - this.x, cz + 0.5 - this.z) < 0.3) {
                        this.onStandOnBlock(mesh);
                    };
                    //could always add more stuff here... like an elevator or something
                    //not a trampoline though, that would be too much
                    //maybe a trampoline
                    //or a trampoline
                    //or a trampoline
                    //ok maybe a trampoline
                    //or a trampoline
                    //but not a trampoline
                    //other than a trampoline, we could add a trampoline
                    //or a trampoline
                    //other than a trampoline, it could be a trampoline, but not a trampoline, it could be a trampoline, however it could not be a trampoline
                };
            };
            if (cellAbove) {
                var mesh = cellAbove.mesh;
                if (mesh) {
                    if (Math.length2(cx + 0.5 - this.x, cz + 0.5 - this.z) < 0.3) {
                        this.onStandOnTile(mesh);
                    };
                };
            };
        } else {
            if (0 == this.jumping) this.setJumping(true);
        };
    };
    onStandOnBlock(mesh) {
        if (mesh.name == "jump-pad" && this.canJump()) {
            this.jumps++;
            this.y += 0.26;
            this.dy = 0.13; //approx 3 blocks in height
            this.setJumping(true);
        };
        plugins.emit("onStandOnBlock", {mesh, this: this});
    };
    onStandOnTile(mesh) {
        plugins.emit("onStandOnTile", {mesh, this: this});
    };
    canJump() {
        var canJump = [((!this.jumping) || (this.jumps < this.maxJumps)) | this.climbing]; //so that plugins can mess with it
        if (!canJump[0]) {
            this.y -= .2;
            this.collidesWithMap() && (canJump[0] = true);
            this.y += .2;
        };
        plugins.emit("canJump", { this: this, canJump });
        return canJump[0];
    };
    jump() {
        if (this.climbing) {
            this.dy = 0.03;
            this.climbing = false;
            this.setJumping(true);
            return true;
        };

        if (this.canJump()) {
            this.jumps++;
            this.dy = 0.06 * this.modifiers.jumpBoostModifier;
            this.setJumping(true);
            return !(this.lastTouchedGround === 0);
        };

        return false;
    };
    setJumping(jumping) {
        this.jumping = jumping;
        this.stateBuffer[this.stateIdx].jumping = jumping;
    };
    snapshotAmmo() {
        this.ammoSnapshots = this.ammoSnapshots || {};
        this.ammoSnapshots[this.classIdx] = JSON.parse(JSON.stringify(this.weapon.ammo));
    };
    restoreAmmoSnapshot() {
        let snapshot = this.ammoSnapshots[this.classIdx];
        if (snapshot) this.weapon.ammo = snapshot;
    };
    changeCharacter(newClassIdx, primaryWeaponItem, secondaryWeaponItem, shellColor, hatItem, stampItem) {
        this.snapshotAmmo();
        var itemChanged = function (oldItem, newItem) {
            return oldItem && !newItem || !oldItem && newItem || null !== oldItem && null !== newItem && oldItem.id !== newItem.id
        };
        if (newClassIdx !== this.classIdx || primaryWeaponItem.id !== this.primaryWeaponItem.id || secondaryWeaponItem.id !== this.secondaryWeaponItem.id || shellColor !== this.shellColor || itemChanged(hatItem) || itemChanged(stampItem)) {
            var output;
            this.classIdx = newClassIdx;
            this.primaryWeaponItem = primaryWeaponItem;
            this.secondaryWeaponItem = secondaryWeaponItem;
            this.shellColor = shellColor;
            this.hatItem = hatItem;
            this.stampItem = stampItem;

            if (this.actor) {
                this.actor.setShellColor(shellColor);
                if (this.id == meId) {
                    var output = new Comm.Out();
                    output.packInt8U(Comm.Code.changeCharacter);
                    output.packInt8U(newClassIdx);
                    output.packInt16U(catalog.get8BitItemId(primaryWeaponItem, newClassIdx));
                    output.packInt16U(catalog.get8BitItemId(secondaryWeaponItem, newClassIdx));
                    output.packInt8U(shellColor);
                    output.packInt16U(catalog.get8BitItemId(hatItem, newClassIdx));
                    output.packInt16U(catalog.get8BitItemId(stampItem, newClassIdx));
                    wsSend(output, "changeCharacter");
                } else {
                    this.actor.wearHat(this.hatItem);
                    this.actor.applyStamp(this.stampItem);
                };
            } else { //server code woohoo!
                var output = new Comm.Out();
                output.packInt8(Comm.Code.changeCharacter);
                output.packInt8(this.id);
                output.packInt8(newClassIdx);
                output.packInt16(this.client.catalog.get8BitItemId(primaryWeaponItem, newClassIdx));
                output.packInt16(this.client.catalog.get8BitItemId(secondaryWeaponItem, newClassIdx));
                output.packInt8(shellColor);
                output.packInt16(this.client.catalog.get8BitItemId(hatItem, newClassIdx));
                output.packInt16(this.client.catalog.get8BitItemId(stampItem, newClassIdx));
                this.client.sendToOthers(output, "changeCharacter");
            };

            this.changeWeaponLoadout(primaryWeaponItem, secondaryWeaponItem)
        };
        if (!this.gameOptions.rearmOnRespawn) this.restoreAmmoSnapshot();
    };
    swapWeapon(idx) {
        var output;
        if (this.actor && this.id != meId || this.canSwapOrReload() && idx < 2) {
            this.equipWeaponIdx = idx;
            this.releaseTrigger();
            this.swapWeaponCountdown = this.weapon.stowWeaponTime + this.weapons[idx].equipTime;
            if (this.actor) {
                this.id == meId && reticle.hide();
                this.weapon.actor.stow();
                if (this.id == meId) {
                    (output = new Comm.Out(2)).packInt8(Comm.Code.swapWeapon);
                    output.packInt8(idx);
                    wsSend(output, "swapWeapon");
                };
            } else {
                this.swapWeaponCountdown *= .9;
                this.weaponSwapsQueued--;
                (output = new Comm.Out(3, true)).packInt8(Comm.Code.swapWeapon);
                output.packInt8(this.id);
                output.packInt8(idx);
                this.client.sendToOthers(output.buffer, this.id);
            };
        };
    };
    switchTeam(toTeam) {
        this.team = toTeam;
        this.score = 0;
        this.kills = 0;
        this.streak = 0;
        this.bestGameStreak = 0;

        this.setDefaultModifiers();

        if (isClient) {
            iteratePlayers(player => {
                player.actor?.updateTeam();
            });
            rebuildPlayerList();
        } else {
            var output = new Comm.Out(3);
            output.packInt8U(Comm.Code.switchTeam);
            output.packInt8U(this.id);
            output.packInt8U(toTeam);
            this.client.sendToAll(output, "switchTeam");
        };
    };
    collectItem(kind, applyToWeaponIdx) {
        return AllItems[kind].collect(this, applyToWeaponIdx);
    };
    isSteady() {
        const readySSelected = isServer ? this.weapon.subClass.readySpread * 1.5 : this.weapon.subClass.readySpread;
        //idk if 1.3 is too much or not enough; Should do the job though. - op7: make that 1.5.
        return !this.weapon.subClass.readySpread ||
            5 * readySSelected >= this.shotSpread + this.weapon.subClass.accuracy;
    };
    isAtReady(scoped) {
        return (!this.betweenRounds()) && !(!(this.playing && this.weapon && this.reloadCountdown <= 0 && this.swapWeaponCountdown <= 0 && this.grenadeCountdown <= 0) || this.actor && 0 != grenadePowerUp);
    };
    settleWeapon(speed = 0, delta = 1) {
        var stillSettleFactor = 1 + ((this.weapon.subClass.stillSettleSpeed - 1) / (1 + (speed * 100)));
        this.shotSpread += Math.floor(150 * speed * delta);
        var settleFactor = Math.pow(this.weapon.subClass.accuracySettleFactor, delta);
        this.shotSpread = Math.max(this.shotSpread * settleFactor - 4 * stillSettleFactor * (1 - settleFactor), 0);

        // console.log(this.shotSpread, speed, delta);
    };
    canSwapOrReload() {
        let recoilLeniency = isServer ? 6 : 0; //bigger value means more leniency to people fast reloading.

        let value = (!this.betweenRounds()) && !(!(this.playing && this.weapon && this.recoilCountdown <= recoilLeniency && this.reloadCountdown <= 0 && this.swapWeaponCountdown <= 0 && this.grenadeCountdown <= 0 && this.shotsQueued <= 0) || this.actor && 0 != grenadePowerUp)
        console.log(value);
        console.log(!this.betweenRounds());
        console.log(this.playing, !!this.weapon, this.recoilCountdown, this.recoilCountdown <= 0);
        console.log(this.reloadCountdown, this.reloadCountdown <= 0, this.swapWeaponCountdown, this.swapWeaponCountdown <= 0);
        console.log(this.grenadeCountdown, this.grenadeCountdown <= 0, this.shotsQueued,  this.shotsQueued <= 0);
        return value;
    };
    fire() {
        if (0 < this.shield) {
            this.releaseTrigger();
        } else if (this.isAtReady() && this.rofCountdown <= 0) {
            if (0 < this.weapon.ammo.rounds && this.isSteady()) {
                if (this.actor) {
                    this.actor.fire()
                } else {
                    this.recoilCountdown *= .9;
                    this.rofCountdown *= .9;
                    this.shotsQueued--;
                };

                this.weapon.fire();

                this.weapon.ammo.rounds--;
                this.recoilCountdown = this.weapon.subClass.recoil;
                this.rofCountdown = this.weapon.subClass.rof;
                this.shotSpread += this.weapon.subClass.shotSpreadIncrement;
                if (this.actor && this.id == meId) {
                    this.shotsQueued++;
                    this.controlKeys |= CONTROL.fire;
                    this.stateBuffer[this.stateIdx].controlKeys = this.controlKeys;
                };
                if (0 == this.weapon.subClass.automatic) {
                    this.releaseTrigger();
                };
                if (this.actor && this.id == meId) {
                    updateAmmoUi();
                };
            } else {
                this.weapon.actor && (this.weapon.actor.dryFire(), this.releaseTrigger());
            };
        };
    };
    pullTrigger() {
        if (1 == grenadePowerUp && me.grenadeCountdown <= 0) {
            this.cancelGrenade();
        } else if (this.isAtReady() && this.rofCountdown <= 0) {
            if (this.weapon.ammo.rounds > 0) {
                if (this.isSteady()) {
                    this.triggerPulled = true;
                    this.fire();
                } else {
                    this.weapon.actor.denyFire();
                };
            } else {
                if (0 < this.weapon.ammo.store) {
                    this.reload();
                } else {
                    this.weapon.actor.dryFire();
                };
            };
        };
    };
    releaseTrigger() {
        this.triggerPulled = false;
    };
    reload() {
        if (this.actor && this.id != meId) {
            this.weapon.actor.reload();
        } else if (this.weapon.ammo.rounds != this.weapon.ammo.capacity && 0 != this.weapon.ammo.store && this.canSwapOrReload()) {
            var output;
            var rounds = Math.min(Math.min(this.weapon.ammo.capacity, this.weapon.ammo.reload) - this.weapon.ammo.rounds, this.weapon.ammo.store);
            this.roundsToReload = rounds;
            if (this.actor) {
                this.weapon.actor.reload();
                this.releaseTrigger();
                (output = new Comm.Out(1)).packInt8(Comm.Code.reload);
                wsSend(output, "reload");
                // this.weapon.ammo.store -= rounds;
            } else { //yay server code
                output = new Comm.Out(2, true);
                output.packInt8U(Comm.Code.reload);
                output.packInt8U(this.id);
                this.client.sendToOthers(output.buffer, this.id, "reload");

                output = new Comm.Out();
                output.packInt8U(Comm.Code.reload);
                output.packInt8U(this.id);
                output.packInt8U(this.weapon.ammo.rounds);
                output.packInt8U(this.weapon.ammo.store);
                output.packInt8U(this.roundsToReload);
                this.client.sendToMe(output, "reload");

                this.reloadsQueued--;
            };
            if (this.weapon.ammo.rounds == 0) {
                this.reloadCountdown = this.weapon.longReloadTime;
            } else {
                this.reloadCountdown = this.weapon.shortReloadTime;
            };
        };
    };
    reloaded() {
        console.log("reloaded", this.roundsToReload);
        this.weapon.ammo.rounds += this.roundsToReload;
        this.weapon.ammo.store -= this.roundsToReload;
        if (this.actor) {
            this.id == meId && updateAmmoUi();
        };
    };
    queueGrenade(throwPower) {
        this.grenadesQueued++;
        this.grenadeThrowPower = Math.clamp(throwPower, 0, 1);
        this.grenadeCountdown = 20;
        this.actor || (this.grenadeCountdown *= .9);
    };
    cancelGrenade() {
        grenadePowerUp = false;
        me.grenadeCountdown = 30;
        this.id == meId && (document.getElementById("grenadeThrowContainer").style.visibility = "hidden");
        this.actor && (this.actor.gripBone._frozen = false);
    };
    throwGrenade() {
        if (0 < this.shield) this.disableShield();
        if (this.actor) {
            var output = new Comm.Out(3);
            output.packInt8(Comm.Code.throwGrenade);
            output.packFloat(Math.clamp(grenadeThrowPower, 0, 1));
            wsSend(output, "throwGrenade");
            me.grenadeCountdown = 80;
            this.actor.reachForGrenade();
        } else if (this.isAtReady() && 0 < this.grenadeCount) { //yay server code
            this.grenadeCount--;
            this.grenadesQueued--;
            this.grenadeCountdown = 72;
            this.grenadeCountdown = 1;

            var output;
            var rotMat = BABYLON.Matrix.RotationYawPitchRoll(this.yaw, this.pitch, 0);
            var vec = BABYLON.Matrix.Translation(0, .1, 1).multiply(rotMat).getTranslation();
            var posMat = BABYLON.Matrix.Translation(0, -.05, .2);
            var pos = (posMat = (posMat = posMat.multiply(rotMat)).add(BABYLON.Matrix.Translation(this.x, this.y + Math.max(0.25, 0.3 * this.modifiers.scale), this.z))).getTranslation();
            var speed = .13 * this.grenadeThrowPower + .08;

            vec.x *= speed;
            vec.y *= speed;
            vec.z *= speed;
            pos.x = Math.floor(300 * pos.x) / 300;
            pos.y = Math.floor(300 * pos.y) / 300;
            pos.z = Math.floor(300 * pos.z) / 300;
            vec.x = Math.floor(300 * vec.x) / 300;
            vec.y = Math.floor(300 * vec.y) / 300;
            vec.z = Math.floor(300 * vec.z) / 300;

            var output = new Comm.Out(14);
            output.packInt8(Comm.Code.throwGrenade);
            output.packInt8(this.id);
            output.packFloat(pos.x);
            output.packFloat(pos.y);
            output.packFloat(pos.z);
            output.packFloat(vec.x);
            output.packFloat(vec.y);
            output.packFloat(vec.z);

            this.client.sendToAll(output, "throwGrenade");
            getMunitionsManager(this).throwGrenade(this, pos, vec);
        };
    };
    betweenRounds() {
        return isClient ? betweenRounds : this.room.betweenRounds();
    };
    resetDespawn(respawnTime = 5000, offset = 0) {
        if (this.betweenRounds() && this.gameOptions.timedGame.spawnDuringInterval) respawnTime = 4e3;

        this.lastDespawn = Date.now() + offset;
        this.nextRespawn = this.lastDespawn + respawnTime;
    };
    canRespawn() {
        let can = (
            (this.betweenRounds() && this.gameOptions.timedGame.spawnDuringInterval)  ||
            (Date.now() >= this.nextRespawn)
        );
        return can;
    };
    removeFromPlay() {
        this.playing = false;
        this.controlKeys = 0;
        this.shotSpread = 0;
        this.jumping = false;
        this.climbing = false;
        if (this.actor) {
            this.actor.removeFromPlay();
            if (this.id == meId) {
                reticle.hide();
                scope.hide();
                camera.fov = 1.25;
                grenadePowerUp = false;
                document.getElementById("grenadeThrowContainer").style.visibility = "hidden";
            };
        };
    };
    scoreKill(killedPlayer, noEggs) {
        this.kills++;
        this.totalKills++;
        this.streak++;
        this.bestGameStreak = Math.max(this.bestGameStreak, this.streak);
        this.bestOverallStreak = Math.max(this.bestOverallStreak, this.streak);
        this.score = this.streak;

        if (isServer && !noEggs) { //do request to add eggs here
            if (killedPlayer && this.id !== killedPlayer.id) {
                this.client.addKillViaServices();
            };
        };
    };
    knockback(originalDamage, dx, dz) {
        let kb = originalDamage * 0.01 * this.modifiers.knockbackModifier;
        let explosion = originalDamage > 100;
        
        let kbX = dx * kb
        let kbZ = dz * kb
        let kbY = kb * (explosion ? 10 : 0.2);

        this.dx += kbX;
        this.dy += kbY;
        this.dz += kbZ;

        devlog("knockback:", originalDamage, kb, dx, dz, kbX, kbZ, kbY, explosion);
    };
    hit (damage, firedPlayer, dx, dz, noHeal = false, originalDamage) {
        if (this.isDead() || (!this.playing)) return;
        if (this.team === 0 ? false : (this.team === firedPlayer.team && this.id !== firedPlayer.id)) return;

        damage = Math.ceil((damage / this.modifiers.resistanceModifier) / this.modifiers.scale);

        damage = Math.min(damage, this.hp + 1); //no overkill, also no ridiculous healing from nades

        if (firedPlayer && firedPlayer.id !== this.id && !noHeal) {
            var multiplier = this.gameOptions.lifesteal[firedPlayer.team];
            console.log("lifesteal multiplier", multiplier, damage, damage * multiplier);
            firedPlayer.heal(damage * multiplier, this, dx, dz);
            this.firedPlayer = firedPlayer;
        };

        var firedPlayerId = firedPlayer ? firedPlayer.id : null;

        if (damage > this.hp) { //no powerups in this version so whatever
            this.die(firedPlayerId);
            firedPlayer.scoreKill(this);
        } else {
            // console.log("who REALLY fired?", firedPlayer.id, firedPlayer.name)
            this.setHp(this.hp - damage, firedPlayerId);

            var output = new Comm.Out();
            output.packInt8U(Comm.Code.hitMe);
            output.packInt8U(this.hp);
            output.packFloat(dx);
            output.packFloat(dz);
            output.packInt16U(Math.floor(originalDamage / 10)); //kb
            this.client.sendToMe(output, "hitMe");

            var output = new Comm.Out();
            output.packInt8U(Comm.Code.hitThem);
            output.packInt8U(this.id);
            output.packInt8U(this.hp);
            output.packFloat(dx);
            output.packFloat(dz);
            output.packInt16U(Math.floor(originalDamage / 10)); //kb
            this.client.sendToOthers(output, "hitThem");

            this.knockback(originalDamage, dx, dz);
        };
    };
    heal (health, damagedPlayer = this, dx = 0, dz = 0) {
        if (this.isDead() || (!this.playing) || health == 0) return;

        if (health >= 0) {
            this.setHp(this.hp + health, this.id);
            if (isServer) {
                var output = new Comm.Out();
                output.packInt8U(Comm.Code.heal);
                output.packInt8U(this.id);
                output.packInt8U(this.hp);
                this.client.sendToAll(output, "heal");
            };
        } else {
            this.hit(-health, damagedPlayer, dx, dz, true);
        };
    };
    die (firedId) {
        this.score = 0;
        this.streak = 0;
        this.deaths++;
        this.totalDeaths++;
        this.hp = 0;
        this.playing = false;
        this.removeFromPlay()

        if (isServer) {
            var output = new Comm.Out();
            output.packInt8U(Comm.Code.die);
            output.packInt8U(this.id);
            output.packInt8U(firedId);
            output.packInt8U(5);
            this.client.sendToAll(output, "die");

            (async () => {
                if (this.client.session && this.client.session.length > 0) {
                    var response = await wsrequest({
                        cmd: "addDeath",
                        session: this.client.session,
                    }, ss.config.game.services_server, ss.config.game.auth_key);
                };
            })();
        };
    };
    setHp(newHp, firedId) {
        // console.log("setHp", newHp, firedId, !!this.firedPlayer);

        this.hp = Math.clamp(newHp, 0, 100);

        if (this.hp <= 0 && this.playing) {
            if (firedId === undefined) {
                if (this.firedPlayer) {
                    this.die(this.firedPlayer.id);
                    this.firedPlayer.scoreKill(this);
                } else {
                    this.die(this.id);
                };
            } else {
                this.die(firedId);
            };
            this.firedPlayer = null;
        };
    };
    respawn(newPos) {
        this.x = newPos.x;
        this.y = newPos.y;
        this.z = newPos.z;
        this.yaw = newPos.yaw || this.yaw;
        this.pitch = newPos.pitch || this.pitch;
        this.firedPlayer = null;

        //grrrr alr I'll do 4 indent instead of 2. GRRRRRRRRR
        this.weaponIdx = 0; //switch to primary weapon.
        //resetWeaponState is called later anyway, so no need to change any other var.
        //TODO: make this behaviour changeable. See commit message for more (Seq 29. 11. 2k24)

        this.respawnQueued = false;
        this.playing = true;
        if (this.hp <= 0) {
            this.hp = 100;
            this.resetWeaponState(!this.gameOptions.rearmOnRespawn);
        } else {
            //FYI: this is not original behaviour! originally ammo does not come back (so was true)...
            //switching weapons to another then back would give inifinite ammo, so thats pointless, kek...
            this.resetWeaponState(!this.gameOptions.rearmOnRespawn); //true
        };
        this.resetStateBuffer();
        if (this.actor) {
            if (this.id == meId) {
                viewingPlayerId = meId;
                startBGM();
            };
            this.actor.mesh.position.x = newPos.x;
            this.actor.mesh.position.y = newPos.y;
            this.actor.mesh.position.z = newPos.z;
            this.actor.restoreToPlay();
            this.weapon.equip();
            if (this.id == viewingPlayerId) {
                shake = 0;
                reticle.show();
                updateAmmoUi();
            };
        };
        this.enableShield();
    };
    resetWeaponState(dontReload) {
        this.rofCountdown = 0;
        this.shotsQueued = 0;
        this.reloadsQueued = 0;
        this.recoilCountdown = 0;
        this.reloadCountdown = 0;
        this.swapWeaponCountdown = 0;
        this.weaponSwapsQueued = 0;
        this.shotSpread = 0;
        this.equipWeaponIdx = this.weaponIdx;
        this.weapon = this.weapons[this.weaponIdx];
        this.grenadeCountdown = 0;
        this.grenadesQueued = 0;
        this.releaseTrigger();
        if (this.actor) {
            this.weapons[0].actor.gunMesh.setEnabled(false);
            this.weapons[1].actor.gunMesh.setEnabled(false);
        };
        if (!dontReload) {
            for (var i = 0; i < this.weapons.length; i++) {
                if (this.weapons[i]) {
                    this.weapons[i].ammo.rounds = this.weapons[i].ammo.capacity;
                    this.weapons[i].ammo.store = this.weapons[i].ammo.storeMax;
                };
            };
            this.grenadeCount = Math.max(this.grenadeCount, this.gameOptions.startingGrenades);
        };
    };
    isDead() {
        return this.hp <= 0;
    };
    lookForLadder(collide) {
        if (collide && collide.cell && this.controlKeys & CONTROL.up && "ladder" == this.mapMeshes[collide.cell.idx].colliderType) {
            var diff = Math.abs(Math.radDifference(this.yaw, collide.cell.ry));
            if (!(.75 < diff && diff < 2.391)) {
                if (1 == collide.cell.ry || 3 == collide.cell.ry) {
                    if (.2 < Math.abs(this.z - collide.z - .5)) return
                } else if (.2 < Math.abs(this.x - collide.x - .5)) return;
                this.climbingCell.x = collide.x;
                this.climbingCell.z = collide.z;
                this.climbingCell.ry = collide.cell.ry;
                this.climbing = true;
                this.lastTouchedGround = Date.now() + 100;
                this.setJumping(false);
            };
        };
    };
    getOccupiedCell(cx = Math.floor(this.x), cy = Math.floor(this.y), cz = Math.floor(this.z)) {
        if (this.x < 0 || this.y < 0 || this.z < 0 || this.x >= this.map.width || this.y >= this.map.height || this.z > this.map.depth) return {};

        if (this.map && this.map.data && this.map.data[cx] && this.map.data[cx][cy] && this.map.data[cx][cy][cz]) {
            return this.map.data[cx][cy][cz];
        } else {
            return {};
        };
    };
    collidesWithMap() {
        return this.Collider.playerCollidesWithMap(this);
    };
};

export default Player;
