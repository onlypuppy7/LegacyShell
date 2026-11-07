//node plugins_default/francium/test-map-assets.js (after the client has prepared its models)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import misc from '#misc';

const context = vm.createContext({ console, performance, setTimeout, clearTimeout });
vm.runInContext(fs.readFileSync(new URL('../../server-client/src/data/babylon.js', import.meta.url), 'utf8'), context);
vm.runInContext(misc.prepareForClient(fs.readFileSync(new URL('./map.js', import.meta.url), 'utf8')), context);
const B = context.BABYLON, simple = vm.runInContext('FranciumMap', context), engine = new B.NullEngine(), scene = new B.Scene(engine);
new B.FreeCamera('camera', new B.Vector3(0, 5, -5), scene);
try {
    const data = fs.readFileSync(new URL('../../server-client/store/client-modified/models/map.babylon', import.meta.url), 'utf8');
    await new Promise((resolve, reject) => B.SceneLoader.ImportMesh('', '', 'data:' + data, scene, meshes => {
        meshes.forEach(mesh => mesh.setEnabled(false)); resolve();
    }, null, (_, message) => reject(Error(message))));
    const castle = JSON.parse(fs.readFileSync(new URL('../../server-game/store/maps.json', import.meta.url), 'utf8')).find(map => map.name === 'Castle');
    assert.ok(castle);
    const definition = JSON.stringify(castle), snapshots = new Map();
    const snapshot = mesh => JSON.stringify([mesh.getVerticesData(B.VertexBuffer.PositionKind), mesh.getIndices(),
        mesh.colliderMesh?.getVerticesData(B.VertexBuffer.PositionKind), mesh.position.asArray(), mesh.rotation.asArray(), mesh.scaling.asArray(), mesh.isEnabled()]);
    const core = fs.readFileSync(new URL('../../server-client/src/client-static/src/shellshock.min.js', import.meta.url), 'utf8');
    vm.runInContext(core.slice(core.indexOf('function addMeshToMapHelper('), core.indexOf('function addMeshToMap(keyIdx)')), context);
    context.rotInc = Math.PI / 2;
    let detail = 'simple';
    context.LegacySettings = { addTab() {}, addOption() { return {}; }, get: key => key === 'franciumMapDetail' ? detail : undefined };
    for (detail of ['simple', 'ultra']) {
        context.SPS = new B.SolidParticleSystem('castle-' + detail, scene, { updatable: true });
        simple.begin(scene);
        let before = 0, expected = 0, replaced = 0;
        for (const [name, cells] of Object.entries(castle.data)) {
            if (name.startsWith('SPECIAL.')) continue;
            const source = scene.getMeshByName(name); assert.ok(source, name);
            source.colliderType = name.split('.')[2]; source.colliderMesh = source.getChildMeshes()[0];
            snapshots.set(source, snapshot(source));
            const count = Object.keys(cells).length, visual = simple.visual(source, simple.scenes.get(scene));
            before += source.getTotalIndices() / 3 * count; expected += visual.getTotalIndices() / 3 * count;
            if (visual !== source) {
                replaced += count;
                for (const [kind, stride] of [[B.VertexBuffer.PositionKind, 3], [B.VertexBuffer.NormalKind, 3], [B.VertexBuffer.UVKind, 2], [B.VertexBuffer.ColorKind, 4]]) {
                    const attribute = visual.getVerticesData(kind);
                    assert.equal(attribute?.length, visual.getTotalVertices() * stride, `${name}: ${kind} length`);
                    assert.ok(Array.from(attribute).every(Number.isFinite), `${name}: ${kind}`);
                };
                assert.equal(visual.getTotalIndices() / 3, ['wedge', 'iwedge'].includes(source.colliderType) ? 8 : 12);
            } else assert.ok(detail === 'simple' && !['full', 'wedge', 'aabb'].includes(source.colliderType), 'missing proxy: ' + name);
            context.addMeshToMapHelper(source, Object.values(cells));
        };
        const map = context.SPS.buildMesh();
        assert.equal(map.getTotalIndices() / 3, expected);
        assert.equal(before, 315496); assert.equal(expected, detail === 'simple' ? 32274 : 9968); assert.equal(replaced, detail === 'simple' ? 736 : 841);
        for (const [source, previous] of snapshots) assert.equal(snapshot(source), previous, source.name + ' collision/template changed');
        assert.equal(JSON.stringify(castle), definition);
        scene.render();
        console.log('PASS Castle ' + detail + ':', before, '->', expected, 'triangles (' + (100 * (before - expected) / before).toFixed(1) + '% fewer);', replaced,
            'simplified blocks; finite attributes, unchanged source/collider geometry and map definition.');
        map.dispose();
    };
} finally { scene.dispose(); engine.dispose(); };
