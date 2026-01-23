//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: prepare-babylons
import misc from '#misc';
import jszip from 'jszip';
import { createStampsUV } from '#stampsGenerator';
import crypto from 'crypto';
//legacyshell: logging
import log from 'puppylog';
//legacyshell: ss
import { ss } from '#misc';
//legacyshell: plugins
import { plugins } from '#plugins';
import { getLastSavedTimestamp } from 'puppymisc';
//

var debuggingLogs = false;

export async function prepareBabylons(endBabylonsDir = path.join(ss.rootDir, 'store', 'export-static', 'models'), baseBabylonsDir = path.join(ss.rootDir, 'src', 'base-babylons')) {
    let startTime = Date.now();

    if (!fs.existsSync(endBabylonsDir)) fs.mkdirSync(endBabylonsDir, { recursive: true });

    log.info("Preparing babylons...");

    var babylonDirFiles = fs.readdirSync(baseBabylonsDir);

    var baseBabylons = babylonDirFiles.filter(file => path.extname(file) === '.babylon');

    //delete log files cause doxxing
    var logFiles = babylonDirFiles.filter(file => path.extname(file) === '.log');
    logFiles.forEach(file => fs.unlinkSync(path.join(baseBabylonsDir, file)));

    var modelsZip = new jszip();
    var mapZip = new jszip();

    var fileChanged = false;

    function addBabylonToZip(zip, babylon, babylonData) {
        zip.file(`${babylon}.babylon`, JSON.stringify(babylonData));
    };

    await plugins.emit('prepareBabylonBefore', { baseBabylons, babylonDirFiles, addBabylonToZip });

    for (const babylon of baseBabylons) {
        try {
            const filename = path.basename(babylon, '.babylon');
            let baseBabylon;
            let timestamp;

            var baseBabylonPath = path.join(baseBabylonsDir, babylon);
            if (fs.existsSync(baseBabylonPath)) {
                log.dim(`Copying ${filename}...`);
                baseBabylon = JSON.parse(fs.readFileSync(baseBabylonPath, 'utf8'));
                //get date of file saved
                timestamp = getLastSavedTimestamp(path.join(baseBabylonsDir, babylon));
            } else {
                log.dim(`Base ${filename} doesn't exist, cannot copy.`);
            };

            var extraBabylons = [];

            await plugins.emit('prepareBabylon', { filename, baseBabylon, extraBabylons });

            // debuggingLogs && baseBabylon && console.log(babylon, "before", baseBabylon.meshes.length, extraBabylons);

            for (const item of extraBabylons) {
                try {
                    var extraBabylon = item.filepath;
                    debuggingLogs && console.log("Adding extra babylon", extraBabylon, "for", babylon, !!baseBabylon);

                    const extraBabylonData = item.babylonData || JSON.parse(fs.readFileSync(extraBabylon, 'utf8'));

                    if (!baseBabylon) {
                        log.pink("Using extraBabylon as fallback base", extraBabylon);
                        baseBabylon = JSON.parse(fs.readFileSync(extraBabylon, 'utf8'));
                        timestamp = getLastSavedTimestamp(extraBabylon);

                        debuggingLogs && console.log(extraBabylonData);
                    };

                    var thisTimestamp = getLastSavedTimestamp(extraBabylon);
                    if (thisTimestamp > timestamp) timestamp = thisTimestamp;

                    await plugins.emit('prepareBabylonExtra', { filename, baseBabylon, extraBabylonData, item });

                    if (item.attemptFixSkeleton && extraBabylonData.skeletons) {
                        // 1. reorder skeleton array to match base
                        const baseSkeletonNames = baseBabylon.skeletons.map(s => s.name);

                        extraBabylonData.skeletons = extraBabylonData.skeletons
                            .filter(s => baseSkeletonNames.includes(s.name))
                            .sort((a, b) =>
                                baseSkeletonNames.indexOf(a.name) - baseSkeletonNames.indexOf(b.name)
                            );

                        // 2. rebind mesh.skeletonId using array index
                        extraBabylonData.meshes.forEach(mesh => {
                            const idx = extraBabylonData.skeletons.findIndex(s => s.name === mesh.skeletonName);
                            if (idx !== -1) mesh.skeletonId = idx;
                        });

                        // 3. process each skeleton
                        extraBabylonData.skeletons.forEach((extraSkeleton, extraSkeletonIndex) => {
                            const baseSkeleton = baseBabylon.skeletons.find(s => s.name === extraSkeleton.name);
                            if (!baseSkeleton) return;

                            // build bone index map, extra index -> base index
                            const boneIndexMap = new Map();
                            extraSkeleton.bones.forEach((extraBone, i) => {
                                const baseIndex = baseSkeleton.bones.findIndex(b => b.name === extraBone.name);
                                if (baseIndex !== -1) boneIndexMap.set(i, baseIndex);
                            });

                            // 4. reorder bones to match base skeleton
                            const newBones = [];
                            baseSkeleton.bones.forEach(baseBone => {
                                const idx = extraSkeleton.bones.findIndex(b => b.name === baseBone.name);
                                if (idx !== -1) newBones.push(extraSkeleton.bones[idx]);
                            });
                            extraSkeleton.bones = newBones;

                            // 5. reorder inverseBindMatrices and bindPose if present
                            const reorderMatrices = (arr) => {
                                if (!Array.isArray(arr)) return arr;
                                const reordered = new Array(newBones.length);
                                newBones.forEach((bone, newIndex) => {
                                    const oldIndex = boneIndexMap.has
                                        ? [...boneIndexMap.entries()].find(([, v]) => v === newIndex)?.[0]
                                        : -1;
                                    if (oldIndex !== -1) reordered[newIndex] = arr[oldIndex];
                                });
                                return reordered;
                            };

                            if (extraSkeleton.inverseBindMatrices) {
                                extraSkeleton.inverseBindMatrices = reorderMatrices(extraSkeleton.inverseBindMatrices);
                            }
                            if (extraSkeleton.bindPose) {
                                extraSkeleton.bindPose = reorderMatrices(extraSkeleton.bindPose);
                            }

                            // 6. remap matricesIndices for meshes using this skeleton
                            extraBabylonData.meshes.forEach(mesh => {
                                if (mesh.skeletonId !== extraSkeletonIndex) return;
                                if (!mesh.matricesIndices) return;

                                const indices = mesh.matricesIndices;
                                for (let i = 0; i < indices.length; i++) {
                                    const mapped = boneIndexMap.get(indices[i]);
                                    indices[i] = mapped !== undefined ? mapped : 0;
                                }
                            });
                        });
                    };

                    if (item.overwrite) {
                        baseBabylon.meshes = [
                            ...baseBabylon.meshes,
                            ...extraBabylonData.meshes,
                        ];
                        extraBabylonData.materials && (baseBabylon.materials = [
                            ...baseBabylon.materials,
                            ...extraBabylonData.materials,
                        ]);
                        extraBabylonData.multiMaterials && (baseBabylon.multiMaterials = [
                            ...baseBabylon.multiMaterials,
                            ...extraBabylonData.multiMaterials,
                        ]);
                    } else {
                        extraBabylonData.materials && (baseBabylon.materials = [
                            ...extraBabylonData.materials,
                            ...baseBabylon.materials,
                        ]);
                        extraBabylonData.multiMaterials && (baseBabylon.multiMaterials = [
                            ...extraBabylonData.multiMaterials,
                            ...baseBabylon.multiMaterials,
                        ]);
                        extraBabylonData.meshes && (baseBabylon.meshes = [
                            ...extraBabylonData.meshes,
                            ...baseBabylon.meshes,
                        ]);
                    };

                    //delete log files cause doxxing
                    var logFiles = fs.readdirSync(path.dirname(extraBabylon)).filter(file => path.extname(file) === '.log');
                    logFiles.forEach(file => fs.unlinkSync(path.join(path.dirname(extraBabylon), file)));
                } catch (error) {
                    log.error(`Error adding extra babylon ${extraBabylon}:`, error);
                };
            };
            baseBabylon.materials.forEach((newMaterial) => {
                //check if material has over 1 instance
                const duplicateMaterial = baseBabylon.materials.filter(mat => mat.name === newMaterial.name).length > 1;
                if (duplicateMaterial) {
                    debuggingLogs && console.log("Deleting this material", newMaterial.name);
                    //delete this specific material, not by name cause that would delete all instances
                    baseBabylon.materials = baseBabylon.materials.filter(mat => mat !== newMaterial);
                } else {
                    //check if the material customType is "BABYLON.PBRMaterial" or some other stupid shit
                    if (typeof newMaterial.customType === 'string' && newMaterial.customType !== "BABYLON.StandardMaterial") {
                        log.warning(`IMPORTANT! Material ${newMaterial.name} with customType ${newMaterial.customType} was detected and automatically fixed to StandardMaterial. Please make sure you don't export PBR shit to LegacyShell!`);
                        newMaterial.customType = "BABYLON.StandardMaterial";
                    };
                };
            });
            baseBabylon.multiMaterials.forEach((newMultiMaterial) => {
                //check if multiMaterial has over 1 instance
                const duplicateMultiMaterial = baseBabylon.multiMaterials.filter(mat => mat.name === newMultiMaterial.name).length > 1;
                if (duplicateMultiMaterial) {
                    debuggingLogs && console.log("Deleting this multiMaterial", newMultiMaterial.name);
                    //delete this specific multiMaterial, not by name cause that would delete all instances
                    baseBabylon.multiMaterials = baseBabylon.multiMaterials.filter(mat => mat !== newMultiMaterial);
                };
            });
            for (const newMesh of baseBabylon.meshes) {
                debuggingLogs && console.log("Checking mesh", newMesh.name);
                //check if mesh has over 1 instance
                const duplicateMesh = baseBabylon.meshes.filter(mesh => mesh.name === newMesh.name).length > 1;
                if (duplicateMesh) {
                    debuggingLogs && console.log("Deleting this mesh", newMesh.name);
                    //delete this specific mesh, not by name cause that would delete all instances
                    baseBabylon.meshes = baseBabylon.meshes.filter(mesh => mesh !== newMesh);
                } else {
                    if (newMesh.name === "egg") {
                        newMesh.uvs = await createStampsUV();
                    };
                };
            };

            debuggingLogs && console.log(babylon, "after", baseBabylon.meshes.length);

            const endBabylon = JSON.stringify(baseBabylon);

            try {
                var oldBabylon = fs.readFileSync(path.join(endBabylonsDir, `${filename}.babylon`), 'utf8');
                if (oldBabylon !== endBabylon) fileChanged = true;
            } catch (error) { fileChanged = true };

            let versionNumber = timestamp;

            //use this instead its better
            try {
                var hashSum = crypto.createHash('sha256');
                hashSum.update(endBabylon);
                versionNumber = BigInt('0x' + hashSum.digest('hex')).toString(10);
            } catch (error) {
                log.error("error in hashing babylon? hmm.", error);
            };

            fs.writeFileSync(path.join(endBabylonsDir, `${filename}.babylon`), endBabylon);
            fs.writeFileSync(path.join(endBabylonsDir, `${filename}.babylon.manifest`), `{
	"version" : ${Math.ceil(versionNumber)},
	"enableSceneOffline" : true,
	"enableTextureOffline" : true
}`);
            if (babylon !== "map.babylon") {
                addBabylonToZip(modelsZip, filename, baseBabylon);
            } else {
                addBabylonToZip(mapZip, filename, baseBabylon);
            };
        } catch (error) {
            log.error(`Error preparing babylon ${babylon}:`, error);
        };
    };

    function saveZip(zip, zipName) {
        let startTime = Date.now();
        const tempDir = path.join(endBabylonsDir, "temp_" + zipName);
        const zipDir = path.join(endBabylonsDir, zipName)

        return new Promise((resolve, reject) => {
            zip.generateNodeStream({
                    type: 'nodebuffer',
                    streamFiles: true,
                    compression: "DEFLATE"
                }).pipe(fs.createWriteStream(tempDir))
                .on('finish', function () {
                    fs.renameSync(tempDir, zipDir);
                    log.green(`${zipName} written in ${Date.now() - startTime}ms.`);
                    resolve();
                })
                .on('error', function (err) {
                    log.red(`Error writing ${zipName}: ${err}`);
                    reject(err);
                });
        });
    };

    var promise = Promise.all([
        //why was i still doing this pointless bullshit?
        // saveZip(modelsZip, 'models.zip'),
        // saveZip(mapZip, 'map.zip'),
    ]);

    if (fileChanged) {
        log.info(`Babylons changed in ${Date.now() - startTime}ms. Waiting for zip to save before proceeding.`);
        let promiseTime = Date.now();
        await promise;
        log.success(`All zips saved ${Date.now() - promiseTime}ms, total: ${Date.now() - startTime}ms. Proceeding.`);
    } else {
        log.green(`No babylons changed (${Date.now() - startTime}ms).`);
    };
};