//legacyshell: bullets
import BABYLON from "babylonjs";
import { isClient, isServer } from '#constants';
import Comm from "#comm";
//

//(server-only-start)
var room, Collider;
var tv1 = new BABYLON.Vector3;
var tv2 = new BABYLON.Vector3;

function checkExplosionCollisions (explosion) { //stolen from rtw 🥺
    let players = room.players;
    console.log(explosion.player.name);
    players.forEach(player => {

        let origin = new BABYLON.Vector3(explosion.x, explosion.y, explosion.z);
        let dest = new BABYLON.Vector3(player.x, player.y + 0.5, player.z);

        let delta = dest.subtract(origin);
        let direction = (new BABYLON.Vector3(0, 0, 0)).copyFrom(delta);

        let nearestWall = -1;
        Collider.rayCollidesWithMap(origin, direction, (origin, direction, position) => {
            if (!room.map.data[position.x][position.y][position.z].mesh) return;
            let dst = Math.sqrt((position.x - origin.x) ** 2 + (position.y - origin.y) ** 2 + (position.z - origin.z) ** 2);
            if (nearestWall < 0 || dst < nearestWall) nearestWall = dst;
            //do some fucking check if the ray intersects with the other bitch yea
            //if()
        });

        let maxRange = 3;
        // console.log("explosion0", nearestWall, delta.length(), maxRange);
        // console.log(new BABYLON.Vector3(state.x, state.y, state.z), new BABYLON.Vector3(player.x, player.y, player.z));

        if (nearestWall <= 0 || nearestWall >= delta.length()) {
            // console.log("explosion1");
            if (delta.length() < maxRange) {
                // console.log("explosion2");

                //bigger = falls off quicker
                const scalingFactor = 0.7; //linear
                const exponent = 2; //exponential

                const modifier = player.scale * (0.5 / explosion.player.scale);

                let damage = explosion.damage * modifier * (1 / Math.pow(delta.length() * scalingFactor, exponent));

                console.log("explosion hits", damage, "to player", player.id, player.name);
                // console.log("who was hit?", player.id, player.name);
                // console.log("who fired it?", explosion.player.id, explosion.player.name);
                player.hit(damage, explosion.player, explosion.x, explosion.y);
            };
        };
    });
};
//(server-only-end)


export function getMunitionsManager (player) {
    if (player && isServer) room = player.client.room;
    return (isServer && room) ? room.munitionsManager : munitionsManager;
};

// [LS] Bullet CONSTRUCTOR
export function Bullet(scene) {
    this.scene = scene;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.dx = 0;
    this.dy = 0;
    this.dz = 0;
    this.active = false;
    this.player = null;
    this.damage = 20;
    this.range = 0;
    this.velocity = 0;
    if (isClient) {
        room = null;
        this.actor = new BulletActor(this);
    } else {
        room = scene.room
        Collider = room.Collider;
    };
    this.end = new BABYLON.Vector3;
};
Bullet.origin = new BABYLON.Vector3;
Bullet.direction = new BABYLON.Vector3;
Bullet.fire = function (player, pos, dir, weaponClass) {
    // console.log(!!player.client.room);
    pos.y = pos.y;
    getMunitionsManager(player).bulletPool.retrieve().fireThis(player, pos, dir, weaponClass)
};
Bullet.prototype.fireThis = function (player, pos, dir, weaponClass) {
    this.player = player;
    this.x = pos.x;
    this.y = pos.y;
    this.z = pos.z;

    Bullet.direction.copyFrom(dir).normalize();
    this.dx = Bullet.direction.x * weaponClass.velocity;
    this.dy = Bullet.direction.y * weaponClass.velocity;
    this.dz = Bullet.direction.z * weaponClass.velocity;

    this.weaponClass = weaponClass;
    this.damage = weaponClass.damage;
    this.active = true;
    this.range = weaponClass.range;
    this.velocity = weaponClass.velocity;
    var res = Collider.rayCollidesWithMap(pos, dir, Collider.projectileCollidesWithCell.bind(Collider));
    res && (this.actor && this.end.copyFrom(res.pick.pickedPoint), this.range = BABYLON.Vector3.Distance(pos, res.pick.pickedPoint)), this.actor && this.actor.fire()
};
Bullet.prototype.remove = function () {
    getMunitionsManager().bulletPool.recycle(this);
    this.actor && this.actor.remove();
};
Bullet.prototype.update = function (delta) {
    Bullet.origin.set(this.x, this.y, this.z);
    Bullet.direction.set(this.dx, this.dy, this.dz);

    if (!Collider.rayCollidesWithPlayer(Bullet.origin, Bullet.direction, this)) {
        if (this.range <= 0) {
            if (this.actor && this.range < this.weaponClass.range) { //range is distance until it hits a wall
                var pos = this.end;
                var dx = .1 * -this.dx;
                var dy = .1 * -this.dy;
                var dz = .1 * -this.dz;

                function onDestroy (x, y, z, dx, dy, dz) {
                    var s = explosionSmokeManager.getSprite();
                    s.animLength = 20 * Math.random() + 30;
                    s.easing = Ease.outQuint;
                    s.position.x = x;
                    s.position.y = y;
                    s.position.z = z;
                    s.dx = .1 * dx;
                    s.dy = .1 * dy;
                    s.dz = .1 * dz;
                    s.startSize = .1;
                    s.endSize = .2 * Math.random() + .4;
                    s.angle = Math.random() * Math.PI2;
                    s.rotate = .08 * Math.random() - .04;
                    s.animColors = bulletHitColors;
                };

                onDestroy(pos.x, pos.y, pos.z, dx, dy, dz);
            };
            this.remove();
        } else {
            this.x += this.dx * delta;
            this.y += this.dy * delta;
            this.z += this.dz * delta;
            this.range -= this.velocity * delta;

            this.actor && this.actor.update();
        };
    };
};
Bullet.prototype.collidesWithPlayer = function (player, point) {
    if (false) { //this code does nothing
        tv1.x = this.dx;
        tv1.y = this.dy;
        tv1.z = this.dz;
        tv2.x = player.x - point.x;
        tv2.y = player.y + .32 - point.y;
        tv2.z = player.z - point.z;

        var dist = BABYLON.Vector3.Cross(tv1, tv2);
        this.damage; //this line does nothing
        dist.length();
        this.player; //this line does nothing
        tv1.x, tv1.z;
    };

    //(server-only-start)
    if (isServer) {
        var damageExp = 4; //higher means damage falls off more sharply
 
        tv1.x = this.dx; // 0;
        tv1.y = this.dy; // 1;
        tv1.z = this.dz; // 0;
        tv1.normalize();

        tv2.x = player.x - point.x; //point is the position on the egg that the bullet lands
        tv2.y = player.y + (0.32 * player.scale) - point.y; // +0.32, the supposed center
        tv2.z = player.z - point.z;
        tv2.normalize();

        var dist = BABYLON.Vector3.Cross(tv1, tv2).length();

        var dot = -BABYLON.Vector3.Dot(tv1, tv2) * 0.9 + 0.1;
        let damageMod = this.player.scale * (2 / player.scale);
        // var damage = this.damage * Math.pow(dot, damageExp + Math.pow(dot, damageExp) * damageMod);
        var damage = this.damage * Math.pow(dot, damageExp) * damageMod;

        // console.log("damage to playerId:", player.id, damage, "other", dot, damageExp, damageMod, this.damage);
        // console.log("tv", tv1, tv2, "point", point, "playerpos", player.x, player.y, player.z, "dist", dist, "other", BABYLON.Vector3.Dot(tv1, tv2));

        player.hit(damage, this.player, this.dx, this.dz);
    };
    //(server-only-end)

    this.remove();
};


// [LS] Rocket CONSTRUCTOR
export function Rocket(scene) {
    this.scene = scene;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.dx = 0;
    this.dy = 0;
    this.dz = 0;
    this.ttArmed = 10;
    this.active = false;
    this.player = null;
    this.damage = 130;
    if (isClient) {
        room = null;
        this.actor = new RocketActor(this);
    } else {
        room = scene.room
        Collider = room.Collider;
    };
    this.end = new BABYLON.Vector3;
};
Rocket.origin = new BABYLON.Vector3;
Rocket.direction = new BABYLON.Vector3;
Rocket.prototype.remove = function () {
    getMunitionsManager().rocketPool.recycle(this);
    this.actor && this.actor.remove()
};
Rocket.prototype.update = function (delta) {
    if (Rocket.origin.set(this.x, this.y, this.z), Rocket.direction.set(this.dx, this.dy, this.dz), !Collider.rayCollidesWithPlayer(Rocket.origin, Rocket.direction, this)) {
        if (this.range <= 0) return this.x -= this.dx, this.y -= this.dy, this.z -= this.dz, this.explode(), void this.remove();
        this.x += this.dx * delta, this.y += this.dy * delta, this.z += this.dz * delta, this.ttArmed -= delta, this.range -= this.velocity * delta, this.actor && this.actor.update()
    }
};
Rocket.fire = function (player, pos, dir, weaponClass) {
    getMunitionsManager().rocketPool.retrieve().fireThis(player, pos, dir, weaponClass)
};
Rocket.prototype.fireThis = function (player, pos, dir, weaponClass) {
    this.ttArmed = 0, this.radius = weaponClass.radius, this.player = player, this.x = pos.x, this.y = pos.y, this.z = pos.z, this.weaponClass = weaponClass;
    var v = dir.clone().normalize();
    this.dx = v.x * weaponClass.velocity, this.dy = v.y * weaponClass.velocity, this.dz = v.z * weaponClass.velocity, this.damage = weaponClass.damage, this.active = true, this.range = weaponClass.range, this.velocity = weaponClass.velocity;
    var res = Collider.rayCollidesWithMap(pos, dir, Collider.projectileCollidesWithCell.bind(Collider));
    res && (this.actor && this.end.copyFrom(res.pick.pickedPoint), this.range = BABYLON.Vector3.Distance(pos, res.pick.pickedPoint)), this.actor && this.actor.fire()
};
Rocket.prototype.explode = function () {
    if (this.actor) {
        addExplosion(this.x, this.y, this.z, this.damage, this.radius);
        var pos = new BABYLON.Vector3(this.x, this.y, this.z);
        this.actor.explodeSound.setPosition(pos), this.actor.explodeSound.play()
    } else checkExplosionCollisions(this);
    this.remove()
};
Rocket.prototype.poof = function () {
    if (this.actor) {
        var pos = new BABYLON.Vector3(this.x, this.y, this.z);
        this.actor.poofSound.setPosition(pos), this.actor.poofSound.play();
        for (var i = 0; i < 10; i++) {
            var dx = .2 * Math.random() - .1,
                dy = .2 * Math.random() - .1,
                dz = .2 * Math.random() - .1;
            addExplosionSprite(explosionSmokeManager, 10, pos.x, pos.y, pos.z, dx, dy, dz, .4, false)
        };
    };
    this.remove();
};
Rocket.prototype.collidesWithMap = function (res) {
    this.x -= this.dx, this.y -= this.dy, this.z -= this.dz, this.ttArmed <= 0 ? this.explode() : this.poof()
};
Rocket.prototype.collidesWithPlayer = function (player) {
    this.ttArmed <= 0 ? (this.actor || (this.player, tv1.x, tv1.z), this.explode()) : (this.actor || (this.player, tv1.x, tv1.z), this.poof())
};


// [LS] Grenade CONSTRUCTOR
export function Grenade(scene) {
    this.scene = scene;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.dx = 0;
    this.dy = 0;
    this.dz = 0;
    this.ttl = 0;
    this.active = false;
    this.player = null;
    if (isClient) {
        room = null;
        this.actor = new GrenadeActor(this);
    } else {
        room = scene.room
        Collider = room.Collider;
    };
};
Grenade.v1 = new BABYLON.Vector3;
Grenade.v2 = new BABYLON.Vector3;
Grenade.v3 = new BABYLON.Vector3;
Grenade.v4 = new BABYLON.Vector3;
Grenade.matrix = new BABYLON.Matrix;
Grenade.prototype.update = function (delta) {
    if (this.ttl <= 0) {
        // console.log(new BABYLON.Vector3(this.x, this.y, this.z));
        if (getMunitionsManager().grenadePool.recycle(this), this.actor) {
            addExplosion(this.x, this.y, this.z, this.damage, this.radius);
            var pos = new BABYLON.Vector3(this.x, this.y, this.z);
            this.actor.explodeSound.setPosition(pos), this.actor.explodeSound.play(), this.actor.remove()
        } else checkExplosionCollisions(this);
    } else {
        var pdx = this.dx;
        var pdy = this.dy;
        var pdz = this.dz;
        var ndx = .5 * (this.dx + pdx) * delta;
        var ndy = .5 * (this.dy + pdy) * delta;
        var ndz = .5 * (this.dz + pdz) * delta;

        if (!this.collidesWithMap()) {
            this.x += ndx;
            this.y += ndy;
            this.z += ndz;
            this.dy -= .003 * delta;
        };

        this.dx *= Math.pow(.98, delta);
        this.dz *= Math.pow(.98, delta);
        this.ttl -= delta;
        this.actor && this.actor.update();
    };
};
Grenade.prototype.collidesWithMap = function () {
    Grenade.v1.set(this.x, this.y - .07, this.z), Grenade.v2.set(this.dx, this.dy, this.dz), Grenade.v3.set(this.dx, this.dy, this.dz);
    var res = Collider.rayCollidesWithMap(Grenade.v1, Grenade.v2, Collider.grenadeCollidesWithCell.bind(Collider));
    return !!res && (Grenade.v3.subtractInPlace(res.normal.scale(1.6 * res.dot)), this.dx = .98 * Grenade.v3.x, this.dy = Grenade.v3.y, this.dz = .98 * Grenade.v3.z, this.actor && this.actor.bounce(), res)
};
Grenade.prototype.throw = function (player, pos, vec) {
    this.player = player, this.x = pos.x, this.y = pos.y, this.z = pos.z, this.dx = vec.x, this.dy = vec.y, this.dz = vec.z, this.ttl = 150, this.damage = 130, this.radius = 3, this.active = true, this.actor && this.actor.throw()
};

//(server-only-start)

export default {
    Bullet,
    Rocket,
    Grenade
};

//(server-only-end)