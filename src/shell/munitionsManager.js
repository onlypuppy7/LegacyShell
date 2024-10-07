//legacyshell: munitions manager
import { Pool } from "#pool";
import { isClient, isServer } from '#constants';
//

export class MunitionsManagerConstructor {
    constructor (scene) {
        this.bulletPool = new Pool(function () { return new Bullet(scene) }, 200);
        this.rocketPool = new Pool(function () { return new Rocket(scene) }, 20);
        this.grenadePool = new Pool(function () { return new Grenade(scene) }, 10);
    };

    update (delta) {
        this.bulletPool.forEachActive(function (bullet) { bullet.update(delta) });
        this.rocketPool.forEachActive(function (rocket) { rocket.update(delta) });
        this.grenadePool.forEachActive(function (grenade) { grenade.update(delta) })
    };
    throwGrenade (player, pos, vec) {
        this.grenadePool.retrieve().throw(player, pos, vec);
    };
    getMapIntersectionPoint (proj, res) {
        if (res && !mapMeshes[res.cell.idx].softness && res.cell && res.cell.idx) {
            var mapMesh = mapMeshes[res.cell.idx],
                ray = new BABYLON.Ray(new BABYLON.Vector3(proj.x - proj.dx - res.x - .5, proj.y - proj.dy - res.y - .5, proj.z - proj.dz - res.z - .5), new BABYLON.Vector3(2 * proj.dx, 2 * proj.dy, 2 * proj.dz), 1);
            mapMesh.rotation.x = res.cell.rx, mapMesh.rotation.y = res.cell.ry, mapMesh.rotation.z = res.cell.rz;
            var pickInfo = ray.intersectsMesh(mapMesh, false);
            if (pickInfo.hit) {
                var ofs = new BABYLON.Vector3(-proj.dx, -proj.dy, -proj.dz).normalize().scale(.005);
                return {
                    x: pickInfo.pickedPoint.x + res.x + .5 + ofs.x,
                    y: pickInfo.pickedPoint.y + res.y + .5 + ofs.y,
                    z: pickInfo.pickedPoint.z + res.z + .5 + ofs.z
                };
            };
        };
        return false
    };
};