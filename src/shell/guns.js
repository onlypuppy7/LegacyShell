//legacyshell: guns
import BABYLON from "babylonjs";
import { isClient } from '#constants';
import { Bullet, Rocket } from '#bullets';
import Comm from '#comm';
//

//(server-only-start)

//(server-only-end)

// [LS] Gun CONSTRUCTOR
export function Gun(player, subClass) {
    this.player = player;
    this.scene = this.player.scene;
    this.subClass = subClass;
    this.highPrecision = false;
    this.equipTime = 25;
    this.stowWeaponTime = 25;
};
Gun.prototype.update = function (delta) {
    this.actor && this.actor.update(delta);
};
Gun.prototype.collectAmmo = function () {
    return this.actor ? (this.ammo.store = Math.min(this.ammo.storeMax, this.ammo.store + this.ammo.pickup), true) : this.ammo.store < this.ammo.storeMax && (this.ammo.store = Math.min(this.ammo.storeMax, this.ammo.store + this.ammo.pickup), true)
};
Gun.prototype.fire = function () {
    if (this.actor) this.actor.fire();
    else { //if server, actually make the bullet and fire that shit

        var rotMat = BABYLON.Matrix.RotationYawPitchRoll(this.player.yaw, this.player.pitch, 0);
        var forwardMat = BABYLON.Matrix.Translation(0, 0, this.subClass.range);
        var dirMat = forwardMat.multiply(rotMat, forwardMat);
        var dir = dirMat.getTranslation();
        var spread = .004 * (this.player.shotSpread + this.subClass.accuracy);

        isNaN(spread) && (spread = this.player.shotSpread = 0);

        var spreadMat = BABYLON.Matrix.RotationYawPitchRoll((Math.random() - .5) * spread, (Math.random() - .5) * spread, (Math.random() - .5) * spread);
        var posMat = (dir = (dirMat = dirMat.multiply(spreadMat)).getTranslation(), BABYLON.Matrix.Translation(0, .1, 0));
        var pos = (posMat = (posMat = posMat.multiply(rotMat)).add(BABYLON.Matrix.Translation(this.player.x, this.player.y + .3, this.player.z))).getTranslation();

        Math.seed = Math.randomInt(0, 256);
        pos.x = Math.floor(300 * pos.x) / 300;
        pos.y = Math.floor(300 * pos.y) / 300;
        pos.z = Math.floor(300 * pos.z) / 300;
        dir.x = Math.floor(300 * dir.x) / 300;
        dir.y = Math.floor(300 * dir.y) / 300;
        dir.z = Math.floor(300 * dir.z) / 300;

        var output = new Comm.Out(15, true);
        output.packInt8(Comm.Code.fire);
        output.packInt8(this.player.id);
        output.packFloat(pos.x);
        output.packFloat(pos.y);
        output.packFloat(pos.z);
        output.packFloat(dir.x);
        output.packFloat(dir.y);
        output.packFloat(dir.z);
        output.packInt8(Math.seed);

        return output;
        this.fireMunitions(pos, dir); //todo
    };
};
Gun.prototype.equip = function () {
    this.player.weaponIdx = this.player.equipWeaponIdx, this.player.weapon = this.player.weapons[this.player.weaponIdx], this.player.weapon.actor.equip(), this.player.id == meId && updateAmmoUi()
};

// [LS] Eggk47 CONSTRUCTOR
export function Eggk47(player, meshName) {
    Gun.call(this, player, Eggk47);
    this.ammo = {
        rounds: 30,
        capacity: 30,
        reload: 30,
        store: 240,
        storeMax: 240,
        pickup: 30
    };
    this.longReloadTime = 210, this.shortReloadTime = 180;
    if (player.actor) this.actor = new Eggk47Actor(this, meshName);
};
(Eggk47.prototype = Object.create(Gun.prototype)).constructor = Gun;
Eggk47.weaponName = "EggK-47";
Eggk47.standardMeshName = "eggk47";
Eggk47.rof = 3600 / 550;
Eggk47.recoil = 7;
Eggk47.automatic = true;
Eggk47.accuracy = 12;
Eggk47.shotSpreadIncrement = 40;
Eggk47.accuracySettleFactor = .9;
Eggk47.damage = 48;
Eggk47.totalDamage = 48;
Eggk47.range = 20;
Eggk47.velocity = .5;
Eggk47.prototype.fireMunitions = function (pos, dir) {
    Bullet.fire(this.player, pos, dir, Eggk47)
};

// [LS] DozenGauge CONSTRUCTOR
export function DozenGauge(player, meshName) {
    Gun.call(this, player, DozenGauge), this.ammo = {
        rounds: 2,
        capacity: 2,
        reload: 2,
        store: 24,
        storeMax: 24,
        pickup: 8
    }, this.longReloadTime = 155, this.shortReloadTime = 155, this.v1 = new BABYLON.Vector3;
    if (player.actor) this.actor = new DozenGaugeActor(this, meshName)
};
(DozenGauge.prototype = Object.create(Gun.prototype)).constructor = Gun;
DozenGauge.weaponName = "Dozen Gauge";
DozenGauge.standardMeshName = "dozenGauge";
DozenGauge.rof = 15;
DozenGauge.recoil = 10;
DozenGauge.automatic = false;
DozenGauge.accuracy = 30;
DozenGauge.shotSpreadIncrement = 120;
DozenGauge.accuracySettleFactor = .88;
DozenGauge.damage = 12;
DozenGauge.totalDamage = DozenGauge.damage * 20;
DozenGauge.range = 7;
DozenGauge.velocity = .45;
DozenGauge.prototype.fireMunitions = function (pos, dir) {
    for (var i = 0; i < 20; i++) {
        this.v1.set(dir.x + Math.seededRandom(-.14, .14) * DozenGauge.range, dir.y + Math.seededRandom(-.09, .09) * DozenGauge.range, dir.z + Math.seededRandom(-.14, .14) * DozenGauge.range);
        Bullet.fire(this.player, pos, this.v1, DozenGauge);
    };
};

// [LS] CSG1 CONSTRUCTOR
export function CSG1(player, meshName) {
    Gun.call(this, player, CSG1), this.ammo = {
        rounds: 5,
        capacity: 5,
        reload: 5,
        store: 15,
        storeMax: 15,
        pickup: 5
    }, this.hasScope = true, this.longReloadTime = 240, this.shortReloadTime = 150, this.highPrecision = true;
    if (player.actor) this.actor = new CSG1Actor(this, meshName)
};
(CSG1.prototype = Object.create(Gun.prototype)).constructor = Gun;
CSG1.weaponName = "CSG-1";
CSG1.standardMeshName = "csg1";
CSG1.rof = 60;
CSG1.recoil = 10;
CSG1.automatic = false;
CSG1.accuracy = 0;
CSG1.shotSpreadIncrement = 180;
CSG1.accuracySettleFactor = .94;
CSG1.damage = 230;
CSG1.totalDamage = 230;
CSG1.range = 50;
CSG1.velocity = .6;
CSG1.prototype.fireMunitions = function (pos, dir) {
    Bullet.fire(this.player, pos, dir, CSG1)
};

// [LS] Cluck9mm CONSTRUCTOR
export function Cluck9mm(player, meshName) {
    Gun.call(this, player, Cluck9mm), this.ammo = {
        rounds: 15,
        capacity: 15,
        reload: 15,
        store: 60,
        storeMax: 60,
        pickup: 15
    }, this.longReloadTime = 195, this.shortReloadTime = 160;
    if (player.actor) this.actor = new Cluck9mmActor(this, meshName)
};
(Cluck9mm.prototype = Object.create(Gun.prototype)).constructor = Gun;
Cluck9mm.weaponName = "Cluck 9mm";
Cluck9mm.standardMeshName = "cluck9mm";
Cluck9mm.rof = 6;
Cluck9mm.recoil = 6;
Cluck9mm.automatic = false;
Cluck9mm.accuracy = 26;
Cluck9mm.shotSpreadIncrement = 100;
Cluck9mm.accuracySettleFactor = .84;
Cluck9mm.damage = 38;
Cluck9mm.totalDamage = 38;
Cluck9mm.range = 15;
Cluck9mm.velocity = .45;
Cluck9mm.prototype.fireMunitions = function (pos, dir) {
    Bullet.fire(this.player, pos, dir, Cluck9mm)
};

// [LS] RPEGG CONSTRUCTOR
export function RPEGG(player, meshName) {
    Gun.call(this, player, RPEGG), this.ammo = {
        rounds: 1,
        capacity: 1,
        reload: 1,
        store: 3,
        storeMax: 3,
        pickup: 1
    }, this.hasScope = true, this.longReloadTime = 170, this.shortReloadTime = 170;
    if (player.actor) this.actor = new RPEGGActor(this, meshName)
};
(RPEGG.prototype = Object.create(Gun.prototype)).constructor = Gun;
RPEGG.weaponName = "RPEGG";
RPEGG.standardMeshName = "rpegg";
RPEGG.rof = 80;
RPEGG.recoil = 60;
RPEGG.automatic = false;
RPEGG.accuracy = 5;
RPEGG.shotSpreadIncrement = 200;
RPEGG.accuracySettleFactor = .97;
RPEGG.damage = 120;
RPEGG.radius = 3;
RPEGG.totalDamage = 330;
RPEGG.range = 45;
RPEGG.velocity = .2;
RPEGG.readySpread = 5;
RPEGG.prototype.fireMunitions = function (pos, dir) {
    Rocket.fire(this.player, pos, dir, RPEGG);
    if (this.actor) {
        for (var i = 0; i < 10; i++) {
            var dx = .04 * Math.random() - .02,
                dy = .04 * Math.random() - .02,
                dz = .04 * Math.random() - .02;
            addExplosionSprite(explosionSmokeManager, 10, pos.x, pos.y, pos.z, dx, dy, dz, .4, false)
        };
    };
};

//(server-only-start)

// export default {
//     Gun,
//     Eggk47,
//     DozenGauge,
//     CSG1,
//     Cluck9mm,
//     RPEGG
// };

//(server-only-end)