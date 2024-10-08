//legacyshell: player
import BABYLON from "babylonjs";
import { stateBufferSize, isClient, isServer, CONTROL, devlog, ItemTypes } from '#constants';
import Comm from '#comm';
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
    constructor (data, scene, client) {
        if (client) {
            this.client = client;
            this.Collider = this.client.room.Collider;
            this.mapMeshes = this.client.room.mapMeshes;
            this.map = this.client.room.map;
        } else {
            this.Collider = Collider;
            this.mapMeshes = mapMeshes;
            this.map = map;
        };

        this.id = data.id;
        this.uniqueId = data.uniqueId;
        this.name = data.name || data.nickname; //fyi this is a bad
        this.classIdx = data.classIdx;
        this.username = data.username !== "" ? data.username : "Guest";
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
        this.grenadeCount = 1;
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

        this.resetDespawn(-5000);
        this.jumpHeld = false;
    };
    changeWeaponLoadout (primaryWeaponItem, secondaryWeaponItem) {
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
    update (delta, resim) {
        var dx = 0;
        var dy = 0;
        var dz = 0;
    
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

        // devlog(this.name, this.stateIdx, this.controlKeys, this.x.toFixed(2), this.y.toFixed(2), this.z.toFixed(2), this.dx.toFixed(2), this.dy.toFixed(2), this.dz.toFixed(2), this.yaw.toFixed(2), this.pitch.toFixed(2));
        
        if (this.controlKeys & CONTROL.left) {
            dx -= Math.cos(this.yaw);
            dz += Math.sin(this.yaw);
        };
        
        if (this.controlKeys & CONTROL.right) {
            dx += Math.cos(this.yaw);
            dz -= Math.sin(this.yaw);
        };
        
        if (this.controlKeys & CONTROL.up) {
            if (this.climbing) {
                dy += 1;
            } else {
                dx += Math.sin(this.yaw);
                dz += Math.cos(this.yaw);
            };
        };
        
        if (this.controlKeys & CONTROL.down) {
            if (this.climbing) {
                dy -= 1;
            } else {
                dx -= Math.sin(this.yaw);
                dz -= Math.cos(this.yaw);
            };
        };
        
        if ((this.controlKeys & CONTROL.jump) && (0 < this.lastTouchedGround && Date.now() > this.lastTouchedGround + 100)) {
            if (!this.jumpHeld) {
                this.jump();
                this.jumpHeld = true;
            };
        } else {
            this.jumpHeld = false;
        };
        
        if (this.climbing) {
            this.setJumping(false);
            var pdy = this.dy;
            if (this.corrections) {
                pdy += this.corrected.dy / 6, this.corrections--
            };
            this.dy += .014 * dy * delta;
            var ndy = .5 * (this.dy + pdy) * delta;
            this.y += ndy, this.dy *= Math.pow(.5, delta);
            var cx = Math.floor(this.climbingCell.x);
            var cy = Math.floor(this.y + 1e-4);
            var cz = Math.floor(this.climbingCell.z);
    
            if (0 == this.climbingCell.ry || this.climbingCell.ry, cy >= this.map.height) {
                this.climbing = false;
            } else {
                var cell = this.map.data[cx][cy][cz];
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

            // console.log(dx, dy, dz, deltaVector, delta);
    
            this.dx += .007 * deltaVector.x * delta;
            this.dz += .007 * deltaVector.z * delta;
            this.dy -= .003 * delta;
            this.dy = Math.max(-.2, this.dy);
    
            var ndx = .5 * (this.dx + pdx) * delta;
            var ndz = (ndy = .5 * (this.dy + pdy) * delta, .5 * (this.dz + pdz) * delta);
    
            this.moveX(ndx, delta);
            this.moveZ(ndz, delta);
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
            this.shotSpread += Math.floor(150 * speed * delta);        
            var settleFactor = Math.pow(this.weapon.subClass.accuracySettleFactor, delta);
            this.shotSpread = Math.max(this.shotSpread * settleFactor - 4 * (1 - settleFactor), 0);
            if (this.weapon) {
                this.weapon.update(delta)
            };
            if (0 < this.hp) {
                this.hp = Math.min(100, this.hp + .05 * delta);
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
            if (this.actor) {
                this.id == meId && this.triggerPulled && this.fire()
            } else if (0 < this.shotsQueued) {
                this.lastActivity = isClient ? now : Date.now();
                this.fire(); //TODO! firing...
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
    disableShield () {
        this.shield = 0;
        if (this.actor) { // client/server differentiation stuff
            this.actor.bodyMesh.renderOverlay = false;
            this.actor.hands.renderOverlay = false;
        };
    };
    enableShield () {
        this.shield = 120;
        if (this.actor) { // client/server differentiation stuff
            this.actor.bodyMesh.renderOverlay = true;
            this.actor.hands.renderOverlay = true;
        };
    };
    resetStateBuffer () {
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
    moveX (ndx, delta) {
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
    moveZ (ndz, delta) { //fuck this function
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
    moveY (ndy, delta) {
        var old_y = this.y;
        this.y += ndy;
        if (this.collidesWithMap()) {
            if (ndy < 0) {
                if (this.actor && this.id == meId && 0 == this.lastTouchedGround) {
                    this.lastTouchedGround = Date.now();
                };
                this.setJumping(false);
            };
            this.y = old_y, this.dy *= .5;
        } else {
            if (0 == this.jumping) this.setJumping(true);
        };
    };
    canJump () {
        // if (this.actor && this.id != meId) return true;
        var canJump = !this.jumping | this.climbing;
        if (!canJump) {
            this.y -= .2;
            this.collidesWithMap() && (canJump = true);
            this.y += .2;
        };
        return canJump;
    };
    jump () {
        if (this.climbing) {
            this.dy = 0.03;
            this.climbing = false;
            this.setJumping(true);
            return true;
        };
        
        if (this.canJump()) {
            this.dy = 0.06;
            this.setJumping(true);
            return !(this.lastTouchedGround === 0);
        };
        
        return false;
    };
    setJumping (jumping) {
        this.jumping = jumping;
        this.stateBuffer[this.stateIdx].jumping = jumping;
    };
    changeCharacter (newClassIdx, primaryWeaponItem, secondaryWeaponItem, shellColor, hatItem, stampItem) {
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
                    (output = new Comm.Out(7)).packInt8(Comm.Code.changeCharacter);
                    output.packInt8(newClassIdx);
                    output.packInt8(catalog.get8BitItemId(primaryWeaponItem, newClassIdx));
                    output.packInt8(catalog.get8BitItemId(secondaryWeaponItem, newClassIdx));
                    output.packInt8(shellColor);
                    output.packInt8(catalog.get8BitItemId(hatItem, newClassIdx));
                    output.packInt8(catalog.get8BitItemId(stampItem, newClassIdx));
                    wsSend(output, "changeCharacter");
                } else {
                    this.actor.wearHat(this.hatItem);
                    this.actor.applyStamp(this.stampItem);
                };
            } else { //server code woohoo!
                (output = new Comm.Out(8, true)).packInt8(Comm.Code.changeCharacter);
                output.packInt8(this.id);
                output.packInt8(newClassIdx);
                output.packInt8(catalog.get8BitItemId(primaryWeaponItem, newClassIdx));
                output.packInt8(catalog.get8BitItemId(secondaryWeaponItem, newClassIdx));
                output.packInt8(shellColor);
                output.packInt8(catalog.get8BitItemId(hatItem, newClassIdx));
                output.packInt8(catalog.get8BitItemId(stampItem, newClassIdx));
                sendToOthers(output.buffer, this.id);
            };
    
            this.changeWeaponLoadout(primaryWeaponItem, secondaryWeaponItem)
        };
    };
    swapWeapon (idx) {
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
                sendToOthers(output.buffer, this.id);
            };
        };
    };
    collectItem (kind, applyToWeaponIdx) {
        switch (kind) {
            case ItemTypes.AMMO:
                const ammoCollected = this.weapons[applyToWeaponIdx].collectAmmo();
                if (ammoCollected) {
                    if (this.actor) {
                        Sounds.ammo.play();
                        updateAmmoUi();
                    };
                    return true;
                };
                return false;
            case ItemTypes.GRENADE:
                if (this.grenadeCount < this.grenadeCapacity) {
                    this.grenadeCount++;
                    if (this.actor) {
                        Sounds.ammo.play();
                        updateAmmoUi();
                    };
                    return true;
                };
                return false;
            default:
                return false;
        };
    };
    isSteady () {
        return !this.weapon.subClass.readySpread ||
            5 * this.weapon.subClass.readySpread >= this.shotSpread + this.weapon.subClass.accuracy;
    };
    isAtReady (scoped) {
        return !(!(this.playing && this.weapon && this.reloadCountdown <= 0 && this.swapWeaponCountdown <= 0 && this.grenadeCountdown <= 0) || this.actor && 0 != grenadePowerUp);
    };
    canSwapOrReload () {
        return !(!(this.playing && this.weapon && this.recoilCountdown <= 0 && this.reloadCountdown <= 0 && this.swapWeaponCountdown <= 0 && this.grenadeCountdown <= 0 && this.shotsQueued <= 0) || this.actor && 0 != grenadePowerUp)
    };
    fire () {
        if (0 < this.shield) {
            this.releaseTrigger();
        } else if (this.isAtReady() && this.rofCountdown <= 0) {
            if (0 < this.weapon.ammo.rounds && this.isSteady()) {
                if (this.actor) {
                    this.actor.fire()
                } else {
                    this.recoilCountdown *= .9;
                    this.rofCountdown *= .9;
                    this.shotsQueued--
                };

                this.weapon.fire();

                this.weapon.ammo.rounds--;
                this.recoilCountdown = this.weapon.subClass.recoil;
                this.rofCountdown = this.weapon.subClass.rof;
                this.shotSpread += this.weapon.subClass.shotSpreadIncrement;
                if (this.actor && this.id == meId) {
                    this.shotsQueued++;
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
    pullTrigger () {
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
    releaseTrigger () {
        this.triggerPulled = false;
    };
    reload (sendToOthers) {
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
                this.weapon.ammo.store -= rounds;
            } else { //yay server code
                output = new Comm.Out(2, true);
                output.packInt8(Comm.Code.reload);
                output.packInt8(this.id);
                this.client.sendToOthers(output.buffer, this.id, "reload");
                this.reloadsQueued--;
            };
            if (this.weapon.ammo.rounds == 0) {
                this.reloadCountdown = this.weapon.longReloadTime;
            } else {
                this.reloadCountdown = this.weapon.shortReloadTime;
            };
        };
    };
    reloaded () {
        this.weapon.ammo.rounds += this.roundsToReload;
        if (this.actor) {
            this.id == meId && updateAmmoUi();
        } else {
            this.weapon.ammo.store -= this.roundsToReload;
        };
    };
    queueGrenade (throwPower) {
        this.grenadesQueued++;
        this.grenadeThrowPower = Math.clamp(throwPower, 0, 1);
        this.grenadeCountdown = 20;
        this.actor || (this.grenadeCountdown *= .9);
    };
    cancelGrenade () {
        grenadePowerUp = false;
        me.grenadeCountdown = 30;
        this.id == meId && (document.getElementById("grenadeThrowContainer").style.visibility = "hidden");
        this.actor && (this.actor.gripBone._frozen = false);
    };
    throwGrenade () {
        if (0 < this.shield) this.disableShield();
        if (this.actor) {
            (output = new Comm.Out(3)).packInt8(Comm.Code.throwGrenade);
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
            var pos = (posMat = (posMat = posMat.multiply(rotMat)).add(BABYLON.Matrix.Translation(this.x, this.y + .3, this.z))).getTranslation();
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
            (output = new Comm.Out(14, true)).packInt8(Comm.Code.throwGrenade);
            output.packInt8(this.id);
            output.packFloat(pos.x);
            output.packFloat(pos.y);
            output.packFloat(pos.z);
            output.packFloat(vec.x);
            output.packFloat(vec.y);
            output.packFloat(vec.z);

            sendToAll(output.buffer);
            munitionsManager.throwGrenade(this, pos, vec);
        };
    };
    resetDespawn (offset = 0) {
        this.lastDespawn = Date.now() + offset;
    };
    removeFromPlay () {
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
    scoreKill () {
        this.kills++;
        this.totalKills++;
        this.streak++;
        this.bestGameStreak = Math.max(this.bestGameStreak, this.streak);
        this.bestOverallStreak = Math.max(this.bestOverallStreak, this.streak);
        this.score = this.streak;
    };
    die () {
        this.score = 0;
        this.streak = 0;
        this.deaths++;
        this.totalDeaths++;
        this.hp = 0;
        this.playing = false;
        this.removeFromPlay()
    };
    respawn (newPos) {
        this.x = newPos.x;
        this.y = newPos.y;
        this.z = newPos.z;
        this.yaw = newPos.yaw || this.yaw;
        this.pitch = newPos.pitch || this.pitch;

        this.respawnQueued = false;
        this.playing = true;
        if (this.hp <= 0) {
            this.hp = 100;
            this.resetWeaponState();
        } else {
            this.resetWeaponState(true);
        };
        this.resetStateBuffer();
        if (this.actor) {
            if (this.id == meId) {
                viewingPlayerId = meId;
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
    resetWeaponState (dontReload) {
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
            this.grenadeCount = Math.max(this.grenadeCount, 1)
        };
    };
    isDead () {
        return this.hp <= 0;
    };
    lookForLadder (collide) {
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
    getOccupiedCell () {
        if (this.x < 0 || this.y < 0 || this.z < 0 || this.x >= this.map.width || this.y >= this.map.height || this.z > this.map.depth) return {};
    
        var cx = Math.floor(this.x);
        var cy = Math.floor(this.y + 1e-4);
        var cz = Math.floor(this.z);
        
        return this.map.data[cx][cy][cz]
    };
    collidesWithMap () {
        return this.Collider.playerCollidesWithMap(this);
    };
};

export default Player;