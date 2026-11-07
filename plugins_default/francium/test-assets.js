//node plugins_default/francium/test-assets.js (after the client has prepared its models)
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import misc from '#misc';

const context = vm.createContext({ console, performance, setTimeout, clearTimeout, setInterval, clearInterval });
vm.runInContext(fs.readFileSync(new URL('../../server-client/src/data/babylon.js', import.meta.url), 'utf8'), context);
for (const file of ['hud.js', 'materials.js', 'particles.js', 'warmup.js', 'map.js', 'client.js']) {
    vm.runInContext(misc.prepareForClient(fs.readFileSync(new URL(file, import.meta.url), 'utf8')), context);
};
const B = context.BABYLON, plugin = vm.runInContext('FranciumPlugin', context);
const materials = vm.runInContext('FranciumMaterials', context), warmup = vm.runInContext('FranciumWarmup', context);
const engine = new B.NullEngine(), scene = new B.Scene(engine);
new B.FreeCamera('camera', new B.Vector3(0, 0, -5), scene);

try {
    for (const file of ['map', 'egg', 'gun_cluck9mm', 'gun_eggk47', 'gun_csg1', 'gun_dozenGauge', 'gun_rpegg', 'items', 'munitions']) {
        const data = fs.readFileSync(new URL('../../server-client/store/client-modified/models/' + file + '.babylon', import.meta.url), 'utf8');
        await new Promise((resolve, reject) => B.SceneLoader.ImportMesh('', '', 'data:' + data, scene, meshes => {
            meshes.forEach(mesh => mesh.setEnabled(false));
            resolve();
        }, null, (_, message) => reject(Error(message))));
    };

    materials.attach(scene);
    const template = scene.getMeshByName('hat_alien');
    assert.ok(template);
    const hat = scene.cloneMesh('hat_alien');
    B.MeshBuilder.CreateBox('live-map', {}, scene);
    const active = () => Array.from(scene.getActiveMeshes().data).slice(0, scene.getActiveMeshes().length);
    scene.render();
    const before = active();
    plugin.attachScene(scene);
    scene.render();
    assert.deepEqual(active(), before);
    assert.equal(scene.getMeshByName('hat_alien'), template);
    assert.ok(scene.getActiveMeshCandidates().data.includes(hat));
    hat.setEnabled(false);
    assert.ok(!scene.getActiveMeshCandidates().data.includes(hat));
    hat.setEnabled(true);
    assert.ok(scene.getActiveMeshCandidates().data.includes(hat));
    const mat = new B.StandardMaterial('test-material', scene);
    hat.material = mat;
    assert.ok(materials.scenes.get(scene).index.get(mat).has(hat));
    const unassigned = scene.meshes.filter(mesh => !mesh.material);
    assert.ok(unassigned.length > 1000);
    const restore = [];
    for (const mesh of unassigned) for (const sub of mesh.subMeshes || []) {
        restore.push([sub, sub.getMaterial]);
        sub.getMaterial = () => assert.fail('scanned an unrelated default-material template');
    };
    try { mat._markAllSubMeshesAsDirty(() => {}); }
    finally { restore.forEach(([sub, get]) => sub.getMaterial = get); };
    const beforeEnabled = Array.from(scene.meshes).map(mesh => mesh.isEnabled());
    warmup.prepare(scene);
    assert.deepEqual(Array.from(scene.meshes).map(mesh => mesh.isEnabled()), beforeEnabled);
    scene.render();
    console.log('PASS real model imports and equipped hat rendering:', scene.meshes.length,
        'registered meshes,', scene.getActiveMeshCandidates().length, 'render candidates;',
        unassigned.length, 'default-material templates skipped by unrelated material updates.');
} finally {
    scene.dispose();
    engine.dispose();
};
