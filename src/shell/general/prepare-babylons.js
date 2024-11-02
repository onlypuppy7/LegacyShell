//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: prepare-babylons
import misc from '#misc';
//legacyshell: plugins
import { plugins } from '#plugins';
//

var debuggingLogs = false;

export function prepareBabylons(ss, endBabylonsDir = path.join(ss.rootDir, 'store', 'export-static', 'models'), baseBabylonsDir = path.join(ss.rootDir, 'src', 'base-babylons')) {
    if (!fs.existsSync(endBabylonsDir)) fs.mkdirSync(endBabylonsDir, { recursive: true });

    var baseBabylons = fs.readdirSync(baseBabylonsDir);
    baseBabylons = baseBabylons.filter(file => path.extname(file) === '.babylon');

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

                    baseBabylon.materials = [
                        ...baseBabylon.materials,
                        ...extraBabylonData.materials
                    ];
        
                    baseBabylon.meshes = [
                        ...baseBabylon.meshes,
                        ...extraBabylonData.meshes
                    ];
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
	"version" : ${timestamp},
	"enableSceneOffline" : true,
	"enableTextureOffline" : true
}`);
        } catch (error) {
            ss.log.error(`Error preparing babylon ${babylon}:`, error);
        };
    };
};