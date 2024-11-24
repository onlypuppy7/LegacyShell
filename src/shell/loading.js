//basic
import fs from 'node:fs';
import path from 'node:path';
//legacyshell: loading
import BABYLON from "babylonjs";
import { stateBufferSize, isClient, isServer, Team, devlog } from '#constants';
import JSZip from 'jszip';
//legacyshell: ss
import { ss } from '#misc';
//

//(server-only-start)
let Collider;
//(server-only-end)

export function setParamsforLoader(passedMinMap, passedCollider) {
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

var meshesLoaded = [];
var zipsLoaded = [];

// [LS] Mesh Loading Helpers
export function loadMeshes(scene, meshNames, onMeshLoaded, onComplete) { //[srvr]
    let meshCount = meshNames.length;
    let that = this;
    let mat = scene.getMaterialByName("standard");
    let numEggs = 0;
    let numHands = 0;

    let rootUrl = "models/";

    function decrement () {
        // console.log("decrementing mesh count", meshCount, meshNames, meshesLoaded);
        0 == --meshCount && onComplete && onComplete.call(that);
    };

    function load(rootUrl, meshPath, scene, meshName) {
        BABYLON.SceneLoader.ImportMesh("", rootUrl, meshPath, scene, function (meshes, particleSystems, skeletons) {
            try {
                for (var m = 0; m < meshes.length; m++) {
                    var mesh = meshes[m];
                    if (mesh.setMaterial) mesh.setMaterial(mat);
                    mesh.setEnabled(false);
                    mesh.isPickable = false;
                    if (onMeshLoaded) onMeshLoaded(mesh);
                };
                meshesLoaded.push(meshName);
                decrement();
            } catch (e) {
                console.log(e)
            };
        });
    };

    if (typeof meshNames === "string" && meshNames.includes(".zip")) {
        var zipPath = rootUrl + meshNames;

        // if (zipsLoaded.includes(zipPath)) {
        //     devlog("zip already loaded, skipping", zipPath);
        //     onComplete.call(that);
        //     return;
        // };

        zipsLoaded.push(zipPath);

        console.log("loading mesh zip", zipPath);
    
        if (isServer && ss) { //note that this isnt really tested, dont rely on this for server stuff, just use array of strings
            zipPath = path.join(ss.rootDir, 'server-game', 'store', 'models', meshNames);
            var data = fs.readFileSync(zipPath);
            zipPath = "data:application/zip;base64," + data.toString('base64');
            rootUrl = "";
        };
    
        fetch(zipPath)
            .then(response => {
                if (!response.ok) throw new Error("Failed to fetch the zip file");
                return response.arrayBuffer();
            })
            .then(data => {
                const zip = new JSZip();
                return zip.loadAsync(data);
            })
            .then(zip => {
                meshCount = Object.keys(zip.files).length;
                zip.forEach(function (relativePath, zipEntry) {
                    console.log("loading mesh", relativePath);
                    zipEntry.async("string").then(function (data) {
                        const meshPath = "data:" + data.replace(/\r?\n|\r/g, "");
                        load(rootUrl, meshPath, scene, relativePath);
                    });
                });
            })
            .catch(error => {
                console.error("Error loading the zip file:", error);
            });
    } else {
        for (var idx = 0; idx < meshCount; idx++) {
            var meshName = meshNames[idx];
            var meshPath = meshName + ".babylon";
            // console.log("loading mesh", meshPath);
    
            if (isServer && ss) {
                meshPath = path.join(ss.rootDir, 'server-game', 'store', 'models', meshPath);
                var data = fs.readFileSync(meshPath, "utf8");
                meshPath = "data:" + (data = data.replace(/\r?\n|\r/g, ""));
                rootUrl = "";
            };
    
            if (meshesLoaded.includes(meshName)) {
                console.warn("Mesh already loaded: " + meshName);
                // decrement();
                // continue;
            };
    
            load(rootUrl, meshPath, scene, meshPath);
        };
    };
};

// [LS] Server used loaders
export function makeBarrier(name, scene, color) {
    var barrier = BABYLON.MeshBuilder.CreateBox(name, {
        size: 1
    }, scene);
    var mat = new BABYLON.StandardMaterial();
    mat.diffuseColor = color;
    mat.emissiveColor = color;
    mat.specularColor = BABYLON.Color3.Black();
    mat.wireframe = true;
    barrier.material = mat;
    barrier.setEnabled(false);
    return barrier;
};

export function loadMapMeshes(scene, onComplete) { //[8th], loads map meshes, wowie (name from deobf leak)
    mapMeshes = [null];
    var mat;
    
    //this barrier only shows up in the map editor
    mapMeshes.push(makeBarrier("SPECIAL.barrier.full.verysoft", scene, BABYLON.Color3.Red()));
    mapMeshes.push(makeBarrier("SPECIAL.barrier.full", scene, BABYLON.Color3.Green()));
    mapMeshes.push(makeBarrier("SPECIAL.barrier.none", scene, BABYLON.Color3.White()));

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

    loadMeshes(scene, isClient ? "map.zip?LEGACYSHELLMAPZIPTIMESTAMP" : ["map"], function (mesh) {
        if (mesh.parent) {
            mesh.freezeWorldMatrix()
        } else {
            mapMeshes.push(mesh);
        };
    }, onLoadMeshComplete);
};

export var illegalMeshes = [
    "SPECIAL.spatula.none",
    "DYNAMIC.capture-zone.none",
];

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
        if (illegalMeshes.includes(meshName)) {
            devlog("buildMapData skipping illegal:", meshName);
            return;
        };

        var meshData = minMap.data[meshName];
        var meshIdx = meshIndex[meshName];
        var mesh = mapMeshes[meshIdx];

        console.log(meshName)

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