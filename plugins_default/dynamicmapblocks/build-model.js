//node plugins_default/dynamicmapblocks/build-model.js
import fs from 'node:fs';
import BABYLON from 'babylonjs';

const engine = new BABYLON.NullEngine();
const scene = new BABYLON.Scene(engine);
const pieces = [];
function colour(mesh, rgb) {
    mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind, Array.from({ length: mesh.getTotalVertices() }, () => [...rgb, 1]).flat());
    pieces.push(mesh);
    return mesh;
};
const disk = colour(BABYLON.MeshBuilder.CreateCylinder('disk', { diameter: 6, height: .25, tessellation: 96 }, scene), [.22, .25, .28]);
disk.position.y = -.125;
for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2;
    const spoke = colour(BABYLON.MeshBuilder.CreateBox('spoke', { width: 2.34, height: .004, depth: .12 }, scene), [1, .55, .06]);
    spoke.position.set(Math.cos(angle) * 1.59, .002, Math.sin(angle) * 1.59);
    spoke.rotation.y = -angle;
};
const hub = colour(BABYLON.MeshBuilder.CreateCylinder('hub', { diameter: .35, height: .008, tessellation: 24 }, scene), [1, .55, .06]);
hub.position.y = .004;
const model = BABYLON.Mesh.MergeMeshes(pieces, true);
model.name = model.id = 'dynamic.spinner.mesh';
model.position.set(0, 0, 0);
const material = new BABYLON.StandardMaterial('dynamic-spinner', scene);
material.diffuseColor.set(1, 1, 1);
material.specularColor.set(.15, .15, .15);
model.material = material;
const collider = BABYLON.MeshBuilder.CreateCylinder('spinner-collision', { diameter: 6, height: .25, tessellation: 96 }, scene);
collider.id = 'dynamic-spinner-collision';
collider.position.y = -.125;
collider.parent = model;
collider.isVisible = false;
const output = BABYLON.SceneSerializer.Serialize(scene);
for (const mesh of output.meshes) {
    const source = scene.getMeshByID(mesh.id);
    for (const [key, kind] of Object.entries({ positions: 'position', normals: 'normal', uvs: 'uv', colors: 'color' })) {
        const values = source.getVerticesData(kind);
        if (values) mesh[key] = Array.from(values);
    };
    mesh.indices = Array.from(source.getIndices());
    delete mesh.geometryId;
};
delete output.geometries;
fs.mkdirSync(new URL('./models/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./models/map.babylon', import.meta.url), JSON.stringify(output) + '\n');
scene.dispose();
engine.dispose();
