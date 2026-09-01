// Builds a small standalone browser bundle so legacyadmin's item browser/codes tab can render
// real weapon/hat/stamp tiles via the exact same #itemRenderer module the main game client uses -
// without pulling in the main client's much heavier dependency chain (constants.js alone cascades
// into #guns/#bullets/#munitionsManager just for gun-stat tables that item tile rendering never
// touches). Splices #isClientServer, #math, #plugins, and #loading directly (all already
// self-contained/server-only-guarded, proven safe by the main client bundle already splicing
// them) via the same misc.hashtagToString/prepareForClient mechanism prepare-modified.js uses,
// plus #itemRenderer itself - see that file for the extraction itself.
//
// #itemRenderer's constructor references a few things that are bundle globals in the main client
// but don't exist in this standalone context on their own - stubbed here rather than in
// #itemRenderer itself (which stays a pure extraction) or by pulling in the real module each one
// actually lives in, which for #constants specifically would drag in its #guns/#bullets/
// #munitionsManager cascade just for gun-stat tables item tile rendering never touches:
//   - itemRendererBabylons (#constants) - the base mesh-pack list. Also pushed onto directly by
//     other early-boot registration code in the main client (shellshock.min.js's "afterBullshit"
//     plugin event) before ItemRenderer ever runs there - irrelevant here since this bundle has no
//     such registration step, but worth knowing this array isn't ItemRenderer-exclusive.
//   - stampSize (#constants), devmode (#isClientServer) - plain constants, stubbed for the same
//     "avoid the #guns cascade" reason.
//   - Math.PI90 - a real extension from #math (Math.PI90 = Math.PI / 2), not a typo. #math's
//     default export is the extend function itself, so it has to be invoked once, same as misc.js
//     does server-side and the main bundle does client-side. #math is genuinely self-contained
//     (unlike #constants), so this one IS spliced for real below rather than stubbed.
//   - loadMaterials(scene) - the main scene's full terrain/shadow material builder (depends on
//     shadowGen/engineCaps globals that only exist in the main bundle's boot sequence). Item
//     meshes only actually need a plain "standard"-named material to exist (loadMeshes looks one
//     up by that name and assigns it) plus a real light in the scene (a StandardMaterial renders
//     black without one - the main client's item tiles get this for free from the main scene's
//     own lighting).
import path from 'node:path';
import fs from 'node:fs';
import { misc } from '#misc';

const STUBS = `
const devmode = false;
const stampSize = 128;
const itemRendererBabylons = __ITEM_RENDERER_BABYLONS__;
function loadMaterials(scene) {
    if (scene.getMaterialByName('standard')) return;
    const mat = new BABYLON.StandardMaterial('standard', scene);
    mat.backFaceCulling = false;
    mat.specularColor = new BABYLON.Color3(0, 0, 0);
    // Lift shadowed faces so a mesh forced onto this material (see the loadMeshesBeforeMaterial
    // fix below) still shows its baked vertex colours where the single light doesn't reach.
    mat.emissiveColor = new BABYLON.Color3(0.3, 0.3, 0.3);
    new BABYLON.HemisphericLight('itemRendererLight', new BABYLON.Vector3(0, 1, 0), scene).intensity = 1;
};
`;

// Base-game gun meshes ship with NO material assigned, so they pick up a lit default and their
// baked vertex colours show. Plugin guns (crackshot's M2DZ / gun_m24) ship each mesh with an
// explicit dark phong material (diffuse 0.4, emissive 0, specular 0) - and this standalone bundle
// has no lighting rig or mesh.setMaterial patch to normalise it the way the main client does, so
// those meshes render pure black / invisible. Force any mesh that arrived WITH a file material
// onto our lit 'standard' material and turn on vertex colours; meshes with no material (every
// base gun) are left exactly as they were.
const MESH_MATERIAL_FIX = `
plugins.on('game:loadMeshesBeforeMaterial', function (data) {
    try {
        var mesh = data && data.mesh;
        if (mesh && mesh.material) {
            mesh.useVertexColors = true;
            var scene = mesh.getScene && mesh.getScene();
            var std = scene && scene.getMaterialByName('standard');
            if (std) mesh.material = std;
            plugins.cancel = true; // keep loadMeshes from re-assigning over this
        };
    } catch (e) {};
});
`;

// The main client bundle grows this list at runtime via plugin registration (e.g. 5_crackshot's
// shared.js does `itemRendererBabylons.push("gun_m24")`); this standalone bundle runs no plugin
// registration, so a hardcoded 6-name list meant every plugin-added weapon rendered as a blank
// tile. Derive it instead from the models the client build actually produced - the base packs
// plus every gun_* / hat_* a plugin contributed, all sitting in store/client-modified/models/.
function collectBabylonNames(rootDir) {
    const names = new Set(['egg', 'gun_cluck9mm', 'gun_eggk47', 'gun_csg1', 'gun_dozenGauge', 'gun_rpegg']);
    const modelsDir = path.join(rootDir, 'server-client', 'store', 'client-modified', 'models');
    try {
        for (const file of fs.readdirSync(modelsDir)) {
            if (!file.endsWith('.babylon')) continue;
            const n = path.basename(file, '.babylon');
            if (n === 'egg' || n.startsWith('gun_') || n.startsWith('hat_')) names.add(n);
        };
    } catch { /* build hasn't emitted models yet - base list still renders base items */ };
    return [...names];
};

export function buildItemRendererBundle(rootDir) {
    const parts = [
        '// Auto-generated by legacyadmin/client/buildItemRendererBundle.js - do not hand-edit.',
        STUBS.replace('__ITEM_RENDERER_BABYLONS__', JSON.stringify(collectBabylonNames(rootDir))),
        misc.hashtagToString('#isClientServer'),
        misc.hashtagToString('#math'),
        'extendMath(Math);',
        misc.hashtagToString('#plugins'),
        MESH_MATERIAL_FIX,
        misc.hashtagToString('#loading'),
        misc.hashtagToString('#itemRenderer'),
    ];
    // Written under this plugin's own store/ (git-ignored via the repo-wide **/store/ pattern,
    // same convention every other generated/cached output in this repo already follows) - it's
    // regenerated fresh on every client boot, never meant to be hand-edited or committed.
    const outDir = path.join(rootDir, 'plugins_default', 'legacyadmin', 'store', 'client-vendor');
    fs.mkdirSync(outDir, { recursive: true });
    // itemRenderer.js still carries the literal LEGACYSHELLSTAMPSPNG token in its stamps.png URL
    // (unchanged from the original inline code, which relied on prepare-modified.js's own
    // substitution pass for the main bundle - this standalone bundle has no equivalent pass, so
    // do the same substitution by hand here). Any cache-busting value works; this doesn't need to
    // match the main bundle's.
    const bundleText = parts.join('\n\n').replaceAll('LEGACYSHELLSTAMPSPNG', String(Date.now()));
    fs.writeFileSync(path.join(outDir, 'item-renderer-bundle.js'), bundleText, 'utf8');

    // BabylonJS itself, bundled the exact same way the main client does (see prepare-modified.js's
    // LEGACYSHELLBABYLON replacement, which inlines this same file's source) - not a CDN copy,
    // which may be a different build/version and isn't guaranteed reachable at all.
    const babylonSrc = path.join(rootDir, 'server-client', 'src', 'data', 'babylon.js');
    if (fs.existsSync(babylonSrc)) {
        fs.copyFileSync(babylonSrc, path.join(outDir, 'babylon.js'));
    };

    // Tabulator (the SQL tab's table-editor grid), served locally from /admin/vendor rather than
    // cdnjs - keeps a third-party script out of the credential-bearing admin origin and works
    // offline. Resolved from the npm dependency declared in this plugin's dependencies.js; if it
    // somehow isn't installed yet the copy is skipped and sql-tab.js surfaces a clear error.
    for (const [src, dest] of [
        ['tabulator-tables/dist/js/tabulator.min.js', 'tabulator.min.js'],
        ['tabulator-tables/dist/css/tabulator.min.css', 'tabulator.min.css'],
    ]) {
        try {
            const resolved = path.join(rootDir, 'node_modules', src);
            if (fs.existsSync(resolved)) fs.copyFileSync(resolved, path.join(outDir, dest));
        } catch {};
    };

    return outDir;
};
