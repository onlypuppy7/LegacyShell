//legacyshell: collider
import BABYLON from "babylonjs";
import { isClient } from '#constants';
//

//(server-only-start)
var ss;
var map;
var mapMeshes;
var playerLimit;
var players;
//(server-only-end)

class ColliderConstructor {
    constructor(scene) {
        this.playerCollisionMesh = BABYLON.MeshBuilder.CreateBox("pc", {
            size: 0.5,
            height: 0.6
        }, scene);
        this.playerCollisionMesh.position.y = 0.3;
        this.playerCollisionMesh.bakeCurrentTransformIntoVertices();
        this.playerCollisionMesh.setEnabled(false);
        
        this.wedgeCollisionMesh = BABYLON.MeshBuilder.CreateBox("", {
            size: 1.5
        }, scene);
        this.wedgeCollisionMesh.position.y = -0.75;
        this.wedgeCollisionMesh.bakeCurrentTransformIntoVertices();
        this.wedgeCollisionMesh.rotation.x = -Math.PI / 4;
        this.wedgeCollisionMesh.bakeTransformIntoVertices(this.wedgeCollisionMesh.getWorldMatrix());
        this.wedgeCollisionMesh.setEnabled(false);
        
        this.iwedgeCollisionMesh = BABYLON.MeshBuilder.CreateBox("", {
            size: 1.5
        }, scene);
        this.iwedgeCollisionMesh.position.y = 0.75;
        this.iwedgeCollisionMesh.bakeCurrentTransformIntoVertices();
        this.iwedgeCollisionMesh.rotation.x = -Math.PI / 4;
        this.iwedgeCollisionMesh.bakeTransformIntoVertices(this.iwedgeCollisionMesh.getWorldMatrix());
        this.iwedgeCollisionMesh.setEnabled(false);
        
        this.fullCollisionMesh = BABYLON.MeshBuilder.CreateBox("", {
            size: 1
        }, scene);
        this.fullCollisionMesh.setEnabled(false);
        
        this.pointCollisionMesh = BABYLON.MeshBuilder.CreateBox("", {
            size: 0.01
        }, scene);
        this.pointCollisionMesh.setEnabled(false);

        this.v1 = new BABYLON.Vector3();
        this.v2 = new BABYLON.Vector3();
        this.v3 = new BABYLON.Vector3();
        this.v4 = new BABYLON.Vector3();
        this.ray = new BABYLON.Ray(BABYLON.Vector3.Zero(), BABYLON.Vector3.Zero(), 1);
        this.matrix = new BABYLON.Matrix();

        this.scene = scene;
        this.setUp = 1;
    };

    setSS(ssP, mapP, mapMeshesP, playerLimitP, playersP) {
        ss = ssP
        map = mapP;
        mapMeshes = mapMeshesP;
        playerLimit = playerLimitP;
        players = playersP;

        this.setUp = 2;
    };

    pointCollidesWithMap(point, ignoreSoft) {
        if (isNaN(point.x) || isNaN(point.y) || isNaN(point.z)) return false;
        var cx = Math.floor(point.x),
            cy = Math.floor(point.y),
            cz = Math.floor(point.z);
        return !(cx < 0 || cx >= map.width || cz < 0 || cz >= map.depth || cy < 0 || cy >= map.height) && this.meshCollidesWithCell(this.pointCollisionMesh, point, cx, cy, cz, ignoreSoft);
    }

    playerCollidesWithMap(player) {
        var scale = player.scale || 1;
        // devlog("SCALE", player.id, player.scale, scale);
        // this.playerCollisionMesh.scaling.set(scale, scale, scale);

        if ((!player.playerCollisionMesh) || (scale !== player.playerCollisionMesh.lastScale)) {
            // devlog("creating new playerCollisionMesh, scale @", scale);

            player.playerCollisionMesh = BABYLON.MeshBuilder.CreateBox("pc", {
                size: 0.5 * scale,
                height: 0.6 * scale
            }, player.scene);
            player.playerCollisionMesh.position.y = 0.3 * scale;
            player.playerCollisionMesh.bakeCurrentTransformIntoVertices();
            player.playerCollisionMesh.setEnabled(false);
            player.playerCollisionMesh.lastScale = scale;
        };

        return this.meshCollidesWithMap(player.playerCollisionMesh, player);
    };

    meshCollidesWithMap(mesh, pos) {
        var cellsChecked = {};
        if (isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.z)) return true;
        for (var bbox = mesh.getBoundingInfo().boundingBox, i = 0; i < bbox.vectors.length; i++) {
            var cx = Math.floor(pos.x + bbox.vectors[i].x),
                cy = Math.floor(pos.y + bbox.vectors[i].y),
                cz = Math.floor(pos.z + bbox.vectors[i].z);
            if (cx < 0 || cx >= map.width || cz < 0 || cz >= map.depth) return true; // || cy < 0
            var checkId = cx + 1e3 * cy + 1e6 * cz;
            if (cy < map.height && !cellsChecked[checkId]) {
                var res = this.meshCollidesWithCell(mesh, pos, cx, cy, cz);
                if (res) return res;
                cellsChecked[checkId] = true;
            }
        }
        return false;
    }

    meshCollidesWithCell(mesh, pos, cx, cy, cz, ignoreSoft) {
        if (!map.data[cx] || !map.data[cx][cy] || !map.data[cx][cy][cz]) return false;
        var cell = map.data[cx][cy][cz];
        if (cell.idx) {
            var mapMesh = mapMeshes[cell.idx];
            if (ignoreSoft && mapMesh.softness) return false;
            switch (mapMesh.colliderType) {
                case "full":
                    return {
                        x: cx, y: cy, z: cz, cell: cell, mesh: this.fullCollisionMesh
                    };
                case "ladder":
                    if ("pc" != mesh.name) return false;
                    break;
                case "none":
                    return false;
            }
            mesh.position.x = pos.x - cx - 0.5;
            mesh.position.y = pos.y - cy - 0.5;
            mesh.position.z = pos.z - cz - 0.5;
            mesh.setPivotPoint(new BABYLON.Vector3(-mesh.position.x, -mesh.position.y, -mesh.position.z));
            mesh.rotation.x = -cell.rx;
            mesh.rotation.y = -cell.ry;
            mesh.rotation.z = -cell.rz;
            mesh.computeWorldMatrix();
            var m = cell.colliderMesh.intersectsMesh(mesh, cell.colliderPrecise, cell.colliderChildren);
            if (m) return {
                x: cx,
                y: cy,
                z: cz,
                cell: cell,
                mesh: m
            };
        }
        return false;
    }

    rayCollidesWithMap(origin, direction, callback) {
        if (isNaN(origin.x) || isNaN(origin.y) || isNaN(origin.z)) return false;
        if (origin.x < 0 || origin.x >= map.width || origin.z < 0 || origin.z >= map.depth || origin.y < 0 || origin.y >= map.height) return false;
        var radius = direction.length(),
            x = Math.floor(origin.x),
            y = Math.floor(origin.y),
            z = Math.floor(origin.z),
            dx = direction.x,
            dy = direction.y,
            dz = direction.z,
            stepX = Math.sign(dx),
            stepY = Math.sign(dy),
            stepZ = Math.sign(dz),
            tMaxX = this.intbound(origin.x, dx),
            tMaxY = this.intbound(origin.y, dy),
            tMaxZ = this.intbound(origin.z, dz),
            tDeltaX = stepX / dx,
            tDeltaY = stepY / dy,
            tDeltaZ = stepZ / dz;

        if (0 === dx && 0 === dy && 0 === dz) return false;

        for (radius /= Math.sqrt(dx * dx + dy * dy + dz * dz);
            (0 < stepX ? x < map.width : 0 <= x) && (0 < stepY ? y < map.height : 0 <= y) && (0 < stepZ ? z < map.depth : 0 <= z);) {
            if (!(x < 0 || y < 0 || z < 0 || x >= map.width || y >= map.height || z >= map.depth)) {
                var res = callback(origin, direction, {
                    x: x,
                    y: y,
                    z: z
                });
                if (res && "verysoft" != mapMeshes[res.cell.idx].softness) return res;
            }
            if (tMaxX < tMaxY)
                if (tMaxX < tMaxZ) {
                    if (radius < tMaxX) break;
                    x += stepX;
                    tMaxX += tDeltaX;
                } else {
                    if (radius < tMaxZ) break;
                    z += stepZ;
                    tMaxZ += tDeltaZ;
                }
            else if (tMaxY < tMaxZ) {
                if (radius < tMaxY) break;
                y += stepY;
                tMaxY += tDeltaY;
            } else {
                if (radius < tMaxZ) break;
                z += stepZ;
                tMaxZ += tDeltaZ;
            }
        }
    }

    intbound(s, ds) {
        return ds < 0 ? this.intbound(-s, -ds) : (1 - (s = (s % 1 + 1) % 1)) / ds;
    }

    getCellForRay(voxel) {
        try {
            var cell = map.data[voxel.x][voxel.y][voxel.z];
        } catch (e) {
            console.log(voxel);
        };
        if (!cell || !cell.mesh) return false;
        switch (cell.mesh.colliderType) {
            case "none":
            case "ladder":
                return false;
        };
        return cell;
    };

    projectileCollidesWithCell(origin, direction, voxel) {
        var cell = this.getCellForRay(voxel);
        if (!cell) return false;
        var colliderMesh = cell.colliderMesh;
        this.matrix.copyFrom(cell.colliderMatrix);
        this.v4.set(voxel.x + 0.5, voxel.y + 0.5, voxel.z + 0.5);
        this.v1.set(origin.x, origin.y, origin.z);
        this.v2.copyFrom(direction);
        this.v1.subtractInPlace(this.v4);
        this.ray.origin.copyFrom(this.v1);
        this.ray.direction.copyFrom(this.v2);
        this.ray.length = 1;
        BABYLON.Ray.TransformToRef(this.ray, this.matrix, this.ray);
        var pickInfo = this.intersectsColliderMesh(colliderMesh, false);
        if (colliderMesh = pickInfo.pickedMesh, pickInfo.hit) {
            if (colliderMesh != this.fullCollisionMesh && (0.5 < Math.abs(pickInfo.pickedPoint.x) || 0.5 < Math.abs(pickInfo.pickedPoint.y) || 0.5 < Math.abs(pickInfo.pickedPoint.z))) {
                var to0 = BABYLON.Vector3.DistanceSquared(this.ray.origin, BABYLON.Vector3.Zero());
                BABYLON.Vector3.DistanceSquared(this.ray.origin, pickInfo.pickedPoint) < to0 && (pickInfo = this.ray.intersectsMesh(this.fullCollisionMesh, false));
            }
            if (pickInfo.hit) {
                var p = BABYLON.Vector3.TransformCoordinates(pickInfo.pickedPoint, this.matrix.invert());
                return p.addInPlace(this.v4), pickInfo.pickedPoint = p, {
                    cell: cell,
                    pick: pickInfo
                };
            }
        }
        return false;
    };

    grenadeCollidesWithCell(origin, direction, voxel, ignoreSoft) {
        var cell = this.getCellForRay(voxel);
        if (!cell) return false;
        var colliderMesh = cell.colliderMesh;
        this.matrix.copyFrom(cell.colliderMatrix);
        this.v4.set(voxel.x + 0.5, voxel.y + 0.5, voxel.z + 0.5);
        this.v1.set(origin.x, origin.y, origin.z);
        this.v2.copyFrom(direction);
        var velocity = direction.length();
        this.v2.normalize().scaleInPlace(10);
        this.v1.subtractInPlace(this.v4);
        this.ray.origin.copyFrom(this.v1);
        this.ray.direction.copyFrom(this.v2);
        this.ray.length = 1;
        BABYLON.Ray.TransformToRef(this.ray, this.matrix, this.ray);
        var pickInfo = this.intersectsColliderMesh(colliderMesh, false);
        if (colliderMesh = pickInfo.pickedMesh, pickInfo.hit) {
            if (BABYLON.Vector3.Distance(this.ray.origin, pickInfo.pickedPoint) <= velocity) return this.matrix.invert(), (p = BABYLON.Vector3.TransformCoordinates(pickInfo.pickedPoint, this.matrix)).addInPlace(this.v4), pickInfo.pickedPoint = p, {
                cell: cell,
                pick: pickInfo,
                normal: normal = BABYLON.Vector3.TransformCoordinates(pickInfo.normal, this.matrix),
                dot: BABYLON.Vector3.Dot(direction, normal)
            };
            if (!pickInfo.insideMesh) return false;
            var normal = pickInfo.normal;
            if ((pickInfo = this.ray.intersectsMesh(this.fullCollisionMesh, false)).hit) {
                var p;
                this.matrix.invert(), (p = BABYLON.Vector3.TransformCoordinates(pickInfo.pickedPoint, this.matrix)).addInPlace(this.v4), pickInfo.pickedPoint = p;
                normal = pickInfo.getNormal(true, false);
                return {
                    cell: cell,
                    pick: pickInfo,
                    normal: normal = BABYLON.Vector3.TransformCoordinates(normal, this.matrix),
                    dot: BABYLON.Vector3.Dot(direction, normal)
                };
            }
        }
        return false;
    }

    intersectsColliderMesh(colliderMesh, precise) {
        var closestDistance = 1e5,
            closestPick = this.ray.intersectsMesh(colliderMesh, precise),
            closestNormal = null,
            insideMesh = false;
        closestPick.hit && (closestNormal = closestPick.getNormal(true, false), 0 < (dot = BABYLON.Vector3.Dot(this.ray.direction, closestNormal)) && (insideMesh = true), closestDistance = BABYLON.Vector3.DistanceSquared(this.ray.origin, closestPick.pickedPoint));
        for (var children = colliderMesh.getChildMeshes(), i = 0; i < children.length; i++) {
            var pickInfo = this.ray.intersectsMesh(children[i], precise);
            if (pickInfo.hit) {
                var dot, distance = BABYLON.Vector3.DistanceSquared(this.ray.origin, pickInfo.pickedPoint),
                    normal = pickInfo.getNormal(true, false);
                0 < (dot = BABYLON.Vector3.Dot(this.ray.direction, normal)) && (insideMesh = true), distance < closestDistance && (closestDistance = distance, closestPick = pickInfo, closestNormal = normal, 0 < dot && (insideMesh = true));
            };
        };
        return closestPick.normal = closestNormal, closestPick.insideMesh = insideMesh, closestPick;
    };

    rayCollidesWithPlayer(origin, direction, proj) {
        var fromTeam = proj ? proj.player.team : null;
        var fromId = proj ? proj.player.id : null;
        
        for (var i = 0; i < playerLimit; i++) {
            var player = players[i];
            if (player && player.playing && player.id != fromId && (0 == player.team || player.team != fromTeam)) {
                this.ray.origin.copyFrom(origin);
                this.ray.direction.copyFrom(direction);
                this.ray.length = 1;
                var point = this.rayCollidesWithPlayerHelper(this.ray, player);
                if (point) return proj && proj.collidesWithPlayer(player, point), point;
            };
        };
        return false;
    };

    rayCollidesWithPlayerHelper(ray, player) {
        var p = this.v2,
            d = this.v3,
            c = this.v4,
            m = this.v1;
        p.copyFrom(ray.origin);
        d.copyFrom(ray.direction);
        c.set(player.x, player.y + (0.32 * player.scale), player.z);
        p.subtractToRef(c, m);
        var b = BABYLON.Vector3.Dot(m, d);
        if (0 < (c = BABYLON.Vector3.Dot(m, m) - (0.140625 * player.scale)) && 0 < b) return false;
        var discr = b * b - c;
        if (discr < 0) return false;
        var t = -b - Math.sqrt(discr);
        return t < 0 && (t = 0), d.scaleInPlace(t), p.addInPlace(d), p;
    };
};

export default ColliderConstructor;