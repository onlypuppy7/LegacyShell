//legacyshell: grenade
import BABYLON from "babylonjs";
import { isClient } from '#constants';
//

//(server-only-start)
//(server-only-end)

// [LS] Grenade CONSTRUCTOR
function Grenade(scene) {
    this.scene = scene, this.x = 0, this.y = 0, this.z = 0, this.dx = 0, this.dy = 0, this.dz = 0, this.ttl = 0, this.active = false, this.player = null, this.actor = new GrenadeActor(this)
};
Grenade.v1 = new BABYLON.Vector3, Grenade.v2 = new BABYLON.Vector3, Grenade.v3 = new BABYLON.Vector3, Grenade.v4 = new BABYLON.Vector3, Grenade.matrix = new BABYLON.Matrix;
Grenade.prototype.update = function (delta) {
    if (this.ttl <= 0)
        if (munitionsManager.grenadePool.recycle(this), this.actor) {
            addExplosion(this.x, this.y, this.z, this.damage, this.radius);
            var pos = new BABYLON.Vector3(this.x, this.y, this.z);
            this.actor.explodeSound.setPosition(pos), this.actor.explodeSound.play(), this.actor.remove()
        } else checkExplosionCollisions(this);
    else {
        var pdx = this.dx,
            pdy = this.dy,
            pdz = this.dz,
            ndx = .5 * (this.dx + pdx) * delta,
            ndy = .5 * (this.dy + pdy) * delta,
            ndz = .5 * (this.dz + pdz) * delta;
        this.collidesWithMap() || (this.x += ndx, this.y += ndy, this.z += ndz, this.dy -= .003 * delta), this.dx *= Math.pow(.98, delta), this.dz *= Math.pow(.98, delta), this.ttl -= delta, this.actor && this.actor.update()
    }
};
Grenade.prototype.collidesWithMap = function () {
    Grenade.v1.set(this.x, this.y - .07, this.z), Grenade.v2.set(this.dx, this.dy, this.dz), Grenade.v3.set(this.dx, this.dy, this.dz);
    var res = Collider.rayCollidesWithMap(Grenade.v1, Grenade.v2, Collider.grenadeCollidesWithCell);
    return !!res && (Grenade.v3.subtractInPlace(res.normal.scale(1.6 * res.dot)), this.dx = .98 * Grenade.v3.x, this.dy = Grenade.v3.y, this.dz = .98 * Grenade.v3.z, this.actor && this.actor.bounce(), res)
};
Grenade.prototype.throw = function (player, pos, vec) {
    this.player = player, this.x = pos.x, this.y = pos.y, this.z = pos.z, this.dx = vec.x, this.dy = vec.y, this.dz = vec.z, this.ttl = 150, this.damage = 130, this.radius = 3, this.active = true, this.actor && this.actor.throw()
};

//(server-only-start)

export default {
    Grenade
};

//(server-only-end)