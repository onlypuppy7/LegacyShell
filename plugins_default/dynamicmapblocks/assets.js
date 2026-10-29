//plugin: dynamicmapblocks, client only
import BABYLON from 'babylonjs';
import { PlatformMap } from './platforms.js';

export const PlatformAssets = {
    async ensure(minMap, sources, scene, request = url => fetch(url, { cache: 'reload' })) {
        var names = new Set(Object.keys(minMap?.data || {}));
        for (var body of PlatformMap.read(minMap)) for (var block of body.blocks) names.add(block.mesh);
        var missing = Array.from(names).filter(name => !PlatformMap.source(sources, name));
        if (!missing.length) return;
        var response = await request('models/map.babylon');
        if (!response.ok) throw new Error('Could not refresh map models: ' + response.status);
        var data = await response.text();
        var meshes = await new Promise((resolve, reject) => BABYLON.SceneLoader.ImportMesh(missing, '', 'data:' + data, scene,
            resolve, null, (_, message) => reject(new Error(message))));
        var material = scene.getMaterialByName('standard');
        for (var mesh of meshes) {
            if (material && mesh.setMaterial) mesh.setMaterial(material);
            mesh.setEnabled(false);
            mesh.isPickable = false;
            if (mesh.parent) mesh.freezeWorldMatrix();
            else {
                mesh.colliderMesh = mesh.getChildMeshes()[0];
                sources.push(mesh);
            };
        };
    },
};
