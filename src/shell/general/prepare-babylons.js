//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: prepare-babylons
import misc from '#misc';
import jszip from 'jszip';
//legacyshell: plugins
import { plugins } from '#plugins';
//

var debuggingLogs = true;

export function prepareBabylons(ss, endBabylonsDir = path.join(ss.rootDir, 'store', 'export-static', 'models'), baseBabylonsDir = path.join(ss.rootDir, 'src', 'base-babylons')) {
    if (!fs.existsSync(endBabylonsDir)) fs.mkdirSync(endBabylonsDir, { recursive: true });

    var babylonDirFiles = fs.readdirSync(baseBabylonsDir);

    var baseBabylons = babylonDirFiles.filter(file => path.extname(file) === '.babylon');

    //delete log files cause doxxing
    var logFiles = babylonDirFiles.filter(file => path.extname(file) === '.log');
    logFiles.forEach(file => fs.unlinkSync(path.join(baseBabylonsDir, file)));

    var modelsZip = new jszip();
    var mapZip = new jszip();

    function addBabylonToZip(zip, babylon, babylonData) {
        zip.file(`${babylon}.babylon`, JSON.stringify(babylonData));
    };

    for (const babylon of baseBabylons) {
        try {
            const filename = path.basename(babylon, '.babylon');
            debuggingLogs && console.log(`Copying ${filename}...`);
            const baseBabylon = JSON.parse(fs.readFileSync(path.join(baseBabylonsDir, babylon), 'utf8'));
            //get date of file saved
            var timestamp = misc.getLastSavedTimestamp(path.join(baseBabylonsDir, babylon));

            var extraBabylons = [];

            plugins.emit('prepareBabylon', { filename, baseBabylon, extraBabylons });

            debuggingLogs && console.log(babylon, "before", baseBabylon.meshes.length);

            for (const extraBabylon of extraBabylons) {
                debuggingLogs && console.log("Adding extra babylon", extraBabylon);
                try {
                    const extraBabylonData = JSON.parse(fs.readFileSync(extraBabylon, 'utf8'));
                    var thisTimestamp = misc.getLastSavedTimestamp(extraBabylon);
                    if (thisTimestamp > timestamp) timestamp = thisTimestamp;

                    extraBabylonData.materials && (baseBabylon.materials = [
                        ...baseBabylon.materials,
                        ...extraBabylonData.materials
                    ]);
        
                    extraBabylonData.multiMaterials && (baseBabylon.multiMaterials = [
                        ...baseBabylon.multiMaterials,
                        ...extraBabylonData.multiMaterials
                    ]);
        
                    extraBabylonData.meshes && (baseBabylon.meshes = [
                        ...baseBabylon.meshes,
                        ...extraBabylonData.meshes
                    ]);

                    //delete log files cause doxxing
                    var logFiles = fs.readdirSync(path.dirname(extraBabylon)).filter(file => path.extname(file) === '.log');
                    logFiles.forEach(file => fs.unlinkSync(path.join(path.dirname(extraBabylon), file)));
                } catch (error) {
                    ss.log.error(`Error adding extra babylon ${extraBabylon}:`, error);
                };
            };
            baseBabylon.materials.forEach((newMaterial) => {
                //check if material has over 1 instance
                const duplicateMaterial = baseBabylon.materials.filter(mat => mat.name === newMaterial.name).length > 1;
                if (duplicateMaterial) {
                    debuggingLogs && console.log("Deleting this material", newMaterial.name);
                    //delete this specific material, not by name cause that would delete all instances
                    baseBabylon.materials = baseBabylon.materials.filter(mat => mat !== newMaterial);
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
            baseBabylon.meshes.forEach((newMesh) => {
                debuggingLogs && console.log("Checking mesh", newMesh.name);
                //check if mesh has over 1 instance
                const duplicateMesh = baseBabylon.meshes.filter(mesh => mesh.name === newMesh.name).length > 1;
                if (duplicateMesh) {
                    debuggingLogs && console.log("Deleting this mesh", newMesh.name);
                    //delete this specific mesh, not by name cause that would delete all instances
                    baseBabylon.meshes = baseBabylon.meshes.filter(mesh => mesh !== newMesh);
                };
            });

            debuggingLogs && console.log(babylon, "after", baseBabylon.meshes.length);

            const endBabylon = JSON.stringify(baseBabylon);
            fs.writeFileSync(path.join(endBabylonsDir, `${filename}.babylon`), endBabylon);
            fs.writeFileSync(path.join(endBabylonsDir, `${filename}.babylon.manifest`), `{
	"version" : ${Math.ceil(timestamp)},
	"enableSceneOffline" : true,
	"enableTextureOffline" : true
}`);
            if (babylon !== "map.babylon") {
                addBabylonToZip(modelsZip, filename, baseBabylon);
            } else {
                addBabylonToZip(mapZip, filename, baseBabylon);
            };
        } catch (error) {
            ss.log.error(`Error preparing babylon ${babylon}:`, error);
        };
    };

    function saveZip(zip, zipName) {
        zip.generateNodeStream({ 
            type: 'nodebuffer', 
            streamFiles: true, 
            compression: "DEFLATE"
        }).pipe(fs.createWriteStream(path.join(endBabylonsDir, zipName))
            .on('finish', function () {
                ss.log.green(`${zipName} written.`);
            }));
    };

    saveZip(modelsZip, 'models.zip');
    saveZip(mapZip, 'map.zip');


};