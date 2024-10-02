//basic
import fs from 'node:fs';
import path from 'node:path';
//legacyshell: loading
import BABYLON from "babylonjs";
import { stateBufferSize, isClient, isServer, Team } from '#constants';
//

//(server-only-start)
let ss;
let Collider;
//(server-only-end)

export function setSSforLoader(newSS, passedMinMap, passedCollider) {
    ss = newSS;
    minMap = passedMinMap;
    Collider = passedCollider;
};

var mapMeshes;
var map;
var minMap;
var duplicateWarningIssued = false;

// [LS] Map Loading Helpers
export function make3DArray(width, height, depth, initVal) {
    for (var arr = Array(width), x = 0; x < width; x++) {
        arr[x] = Array(height);
        for (var y = 0; y < height; y++) {
            arr[x][y] = Array(depth);
            for (var z = 0; z < depth; z++) arr[x][y][z] = initVal || {}
        };
    };
    return arr;
};

export function iterateXYZ(width, height, depth, options, callback) {
    var opt = options || {};
    opt.step = opt.step || 1, opt.x = opt.x || 0, opt.y = opt.y || 0, opt.z = opt.z || 0;
    for (var x = opt.x; x < width; x += opt.step)
        for (var y = opt.y; y < height; y += opt.step)
            for (var z = opt.z; z < depth; z += opt.step) callback(x, y, z)
};

// [LS] Mesh Loading Helpers
export function loadMeshes(scene, meshNames, onMeshLoaded, onComplete) { //[srvr]
    for (var meshCount = meshNames.length, that = this, mat = scene.getMaterialByName("standard"), numEggs = 0, numHands = 0, idx = 0; idx < meshCount; idx++) {
        var rootUrl = "models/";
        var meshPath = meshNames[idx] + ".babylon";

        if (isServer && ss) {
            meshPath = path.join(ss.rootDir, 'src', 'shared-static', rootUrl, meshPath);
            var data = fs.readFileSync(meshPath, "utf8");
            meshPath = "data:" + (data = data.replace(/\r?\n|\r/g, "")), rootUrl = ""
        };

        BABYLON.SceneLoader.ImportMesh("", rootUrl, meshPath, scene, function (meshes, partcileSystems, skeletons) {
            try {
                for (var m = 0; m < meshes.length; m++) {
                    var mesh = meshes[m];

                    if (isServer && ss && ss.config.verbose) ss.log.bgPurple(mesh.name);
                    
                    "egg" == mesh.name && numEggs++;
                    "hands" == mesh.name && numHands++;

                    if (!duplicateWarningIssued) {
                        if (1 < numEggs || 1 < numHands) {
                            duplicateWarningIssued = true, alert("Duplicate egg and/or hand models detected.\n\nOpen the weapon models in Blender and make sure egg/hands layers are turned off, then re-export.")
                        };
                        if (mesh.setMaterial) mesh.setMaterial(mat);
                        mesh.setEnabled(false);
                        mesh.isPickable = false;
                        if (onMeshLoaded) onMeshLoaded(mesh);
                    };
                };
                0 == --meshCount && onComplete && onComplete.call(that);
            } catch (e) {
                console.log(e)
            };
        });
    };
};

// [LS] Server used loaders
export function loadMapMeshes(scene, onComplete) { //[8th], loads map meshes, wowie (name from deobf leak)
    mapMeshes = [null];
    var mat;
    
    //this barrier only shows up in the map editor
    var barrier = BABYLON.MeshBuilder.CreateBox("SPECIAL.barrier.full.verysoft", {
        size: 1
    }, scene);
    mat = new BABYLON.StandardMaterial;
    mat.diffuseColor = BABYLON.Color3.Red();
    mat.emissiveColor = BABYLON.Color3.Red();
    mat.specularColor = BABYLON.Color3.Black();
    mat.wireframe = true, barrier.material = mat;
    barrier.setEnabled(false);
    mapMeshes.push(barrier);

    //defines a shape for the egg meshes (idk im assuming this is necessary for some reason)
    for (var shape = [], i = 0; i <= 1; i += .125) {
        var a = -Math.PI / 2 + Math.PI * i,
            x = Math.cos(a),
            y = .5 * Math.sin(a + .05) + .5;
        x = .25 * Math.pow(x, 1.3), y = .6 * Math.pow(y, 1.3) - .48, shape.push(new BABYLON.Vector3(x, y, 0))
    };

    //BLUE team spawn zones (only visible in map editor)
    var egg = BABYLON.MeshBuilder.CreateLathe("SPECIAL.spawn-blue.none", {
        shape: shape,
        tessellation: 12
    }, scene);
    mat = new BABYLON.StandardMaterial;
    mat.diffuseColor = new BABYLON.Color3(0, .5, 1);
    mat.specularColor = new BABYLON.Color3(.1, .2, .4);
    mat.specularPower = 8;
    egg.material = mat;
    egg.setEnabled(false);
    mapMeshes.push(egg);

    //RED team spawn zones (only visible in map editor)
    egg = BABYLON.MeshBuilder.CreateLathe("SPECIAL.spawn-red.none", {
        shape: shape,
        tessellation: 12
    }, scene);
    mat = new BABYLON.StandardMaterial;
    mat.diffuseColor = new BABYLON.Color3(1, .25, .25);
    mat.specularColor = new BABYLON.Color3(.4, .3, .3);
    mat.specularPower = 8;
    egg.material = mat;
    egg.setEnabled(false);
    mapMeshes.push(egg);

    function onLoadMeshComplete () { //in rtw it's left as inline func (or whatever its called)
        for (var i = 1; i < mapMeshes.length; i++) {
            var mesh = mapMeshes[i].getChildMeshes()[0];
            mesh && (mapMeshes[i].colliderMesh = mesh)
        };
        onComplete();
    };

    loadMeshes(scene, ["map"], function (mesh) {
        if (mesh.parent) {
            mesh.freezeWorldMatrix()
        } else {
            mapMeshes.push(mesh);
        };
    }, onLoadMeshComplete);
};

export function buildMapData (errorFunc) { //[12th], (name from deobf leak)
    map = {
        width: minMap.width,
        height: minMap.height + 1,
        depth: minMap.depth,
        surfaceArea: minMap.surfaceArea
    };
    
    map.data = make3DArray(map.width, map.height, map.depth);

    for (var meshIndex = {}, i = 1; i < mapMeshes.length; i++) {
        var mesh = mapMeshes[i];
        meshIndex[mesh.name] = i
    };

    var meshesNotFound = {};
    var spawnPoints;

    if (isServer) {
        spawnPoints = [
            [],
            [],
            []
        ];
    };

    Object.keys(minMap.data).forEach(function (meshName) {
        var meshData = minMap.data[meshName];
        var meshIdx = meshIndex[meshName];
        var mesh = mapMeshes[meshIdx];

        if (meshIdx) {
            var colliderMesh;
            var colliderPrecise;
            var colliderChildren;
            var fields = meshName.split(".");

            // devlog("mesh, theme", mesh, fields);

            mesh.theme = fields[0];
            mesh.name = fields[1];
            mesh.colliderType = fields[2];
            mesh.softness = fields[3];

            //le server code
            if (isServer && "SPECIAL" == mesh.theme && mesh.name.startsWith("spawn")) return void Object.values(meshData).forEach(function (cell) {
                spawnPoints[0].push({
                    x: cell.x,
                    y: cell.y,
                    z: cell.z
                }), "spawn-blue" == mesh.name ? spawnPoints[Team.blue].push({
                    x: cell.x,
                    y: cell.y,
                    z: cell.z
                }) : spawnPoints[Team.red].push({
                    x: cell.x,
                    y: cell.y,
                    z: cell.z
                })
            });

            switch (mesh.colliderType) {
                case "full":
                    colliderMesh = Collider.fullCollisionMesh;
                    colliderChildren = colliderPrecise = false;
                    break;
                case "wedge":
                    colliderMesh = Collider.wedgeCollisionMesh;
                    colliderChildren = !(colliderPrecise = true);
                    break;
                case "iwedge":
                    colliderMesh = Collider.iwedgeCollisionMesh;
                    colliderChildren = !(colliderPrecise = true);
                    break;
                case "ladder":
                    colliderMesh = mesh.colliderMesh;
                    colliderChildren = colliderPrecise = false;
                    break;
                case "aabb":
                    colliderMesh = mesh.colliderMesh;
                    colliderChildren = !(colliderPrecise = false);
                    break;
                case "obb":
                    colliderMesh = mesh.colliderMesh;
                    colliderChildren = colliderPrecise = true
            }
            Object.values(meshData).forEach(function (cell) {
                var rx = cell.rx * Math.PI90 || 0;
                var ry = cell.ry * Math.PI90 || 0;
                var rz = cell.rz * Math.PI90 || 0;

                map.data[cell.x][cell.y][cell.z] = {
                    item: void 0,
                    mesh: mesh,
                    idx: meshIdx,
                    colliderMesh: colliderMesh,
                    colliderPrecise: colliderPrecise,
                    colliderChildren: colliderChildren,
                    colliderMatrix: BABYLON.Matrix.RotationYawPitchRoll(-ry, -rx, -rz),
                    rx: rx,
                    ry: ry,
                    rz: rz
                };
            });
        } else meshesNotFound[meshName] = true
    });

    var str = "";
    Object.keys(meshesNotFound).forEach(function (name) {
        str += name + "\n"
    });
    "" != str && errorFunc(str);
    
    if (isClient) {
        return meshIndex;
    } else {
        return { map, spawnPoints, mapMeshes }; //rtw
    };
};