//legacyshell: bullets
import BABYLON from "babylonjs";
import { isClient } from '#constants';
//

//(server-only-start)
//(server-only-end)

// [LS] Bullet CONSTRUCTOR
function Bullet(scene) {
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
    this.actor = new BulletActor(this);
    this.end = new BABYLON.Vector3;
};
Bullet.origin = new BABYLON.Vector3;
Bullet.direction = new BABYLON.Vector3;
Bullet.fire = function (player, pos, dir, weaponClass) {
    munitionsManager.bulletPool.retrieve().fireThis(player, pos, dir, weaponClass)
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
    var res = Collider.rayCollidesWithMap(pos, dir, Collider.projectileCollidesWithCell);
    res && (this.actor && this.end.copyFrom(res.pick.pickedPoint), this.range = BABYLON.Vector3.Distance(pos, res.pick.pickedPoint)), this.actor && this.actor.fire()
};
Bullet.prototype.remove = function () {
    munitionsManager.bulletPool.recycle(this);
    this.actor && this.actor.remove();
};
Bullet.prototype.update = function (delta) {
    if (Bullet.origin.set(this.x, this.y, this.z), Bullet.direction.set(this.dx, this.dy, this.dz), !Collider.rayCollidesWithPlayer(Bullet.origin, Bullet.direction, this))
        if (this.range <= 0) {
            if (this.actor && this.range < this.weaponClass.range) {
                var pos = this.end,
                    dx = .1 * -this.dx,
                    dy = .1 * -this.dy,
                    dz = .1 * -this.dz;
                ! function (x, y, z, dx, dy, dz) {
                    var s = explosionSmokeManager.getSprite();
                    s.animLength = 20 * Math.random() + 30, s.easing = Ease.outQuint, s.position.x = x, s.position.y = y, s.position.z = z, s.dx = .1 * dx, s.dy = .1 * dy, s.dz = .1 * dz, s.startSize = .1, s.endSize = .2 * Math.random() + .4, s.angle = Math.random() * Math.PI2, s.rotate = .08 * Math.random() - .04, s.animColors = bulletHitColors
                }(pos.x, pos.y, pos.z, dx, dy, dz)
            }
            this.remove()
        } else this.x += this.dx * delta, this.y += this.dy * delta, this.z += this.dz * delta, this.range -= this.velocity * delta, this.actor && this.actor.update()
};
Bullet.prototype.collidesWithPlayer = function (player, point) {
    if (!this.actor) {
        tv1.x = this.dx, tv1.y = this.dy, tv1.z = this.dz, tv2.x = player.x - point.x, tv2.y = player.y + .32 - point.y, tv2.z = player.z - point.z;
        var dist = BABYLON.Vector3.Cross(tv1, tv2);
        this.damage; //this line does nothing
        dist.length();
        this.player; //this line does nothing
        tv1.x, tv1.z
    };
    this.remove();
};

// [LS] Rocket CONSTRUCTOR
function Rocket(scene) {
    this.scene = scene, this.x = 0, this.y = 0, this.z = 0, this.dx = 0, this.dy = 0, this.dz = 0, this.ttArmed = 10, this.active = false, this.player = null, this.damage = 130, this.actor = new RocketActor(this), this.end = new BABYLON.Vector3
};
Rocket.origin = new BABYLON.Vector3, Rocket.direction = new BABYLON.Vector3, Rocket.prototype.remove = function () {
    munitionsManager.rocketPool.recycle(this), this.actor && this.actor.remove()
};
Rocket.prototype.update = function (delta) {
    if (Rocket.origin.set(this.x, this.y, this.z), Rocket.direction.set(this.dx, this.dy, this.dz), !Collider.rayCollidesWithPlayer(Rocket.origin, Rocket.direction, this)) {
        if (this.range <= 0) return this.x -= this.dx, this.y -= this.dy, this.z -= this.dz, this.explode(), void this.remove();
        this.x += this.dx * delta, this.y += this.dy * delta, this.z += this.dz * delta, this.ttArmed -= delta, this.range -= this.velocity * delta, this.actor && this.actor.update()
    }
};
Rocket.fire = function (player, pos, dir, weaponClass) {
    munitionsManager.rocketPool.retrieve().fireThis(player, pos, dir, weaponClass)
};
Rocket.prototype.fireThis = function (player, pos, dir, weaponClass) {
    this.ttArmed = 0, this.radius = weaponClass.radius, this.player = player, this.x = pos.x, this.y = pos.y, this.z = pos.z, this.weaponClass = weaponClass;
    var v = dir.clone().normalize();
    this.dx = v.x * weaponClass.velocity, this.dy = v.y * weaponClass.velocity, this.dz = v.z * weaponClass.velocity, this.damage = weaponClass.damage, this.active = true, this.range = weaponClass.range, this.velocity = weaponClass.velocity;
    var res = Collider.rayCollidesWithMap(pos, dir, Collider.projectileCollidesWithCell);
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
        }
    }
    this.remove()
};
Rocket.prototype.collidesWithMap = function (res) {
    this.x -= this.dx, this.y -= this.dy, this.z -= this.dz, this.ttArmed <= 0 ? this.explode() : this.poof()
};
Rocket.prototype.collidesWithPlayer = function (player) {
    this.ttArmed <= 0 ? (this.actor || (this.player, tv1.x, tv1.z), this.explode()) : (this.actor || (this.player, tv1.x, tv1.z), this.poof())
};

//(server-only-start)

export default {
    Bullet,
    Rocket
};

//(server-only-end)