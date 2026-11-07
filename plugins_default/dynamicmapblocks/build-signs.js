//model parts, called by build-model.js
import BABYLON from 'babylonjs';

export function buildSigns(scene) {
    var wood = [.43, .27, .14], edge = [.24, .15, .08], cream = [.89, .83, .63], metal = [.25, .32, .34], gold = [1, .64, .14];
    function box(parts, size, pos, rgb, turn = 0) {
        var mesh = BABYLON.MeshBuilder.CreateBox('part', { width: size[0], height: size[1], depth: size[2] }, scene);
        mesh.position.set(...pos); mesh.rotation.z = turn;
        mesh.setVerticesData('color', Array.from({ length: mesh.getTotalVertices() }, () => [...rgb, 1]).flat());
        parts.push(mesh); return mesh;
    };
    function finish(name, parts, text, ink) {
        var root = BABYLON.Mesh.MergeMeshes(parts, true); root.name = root.id = name;
        if (ink) root.metadata = { signInk: ink };
        root.position.set(0, 0, 0);
        var collision = root.clone(name + '-collision', root, true); collision.id = collision.name;
        collision.isVisible = false;
        if (text) {
            var plane = BABYLON.MeshBuilder.CreatePlane(name + '-TEXT', { width: text[0], height: text[1] }, scene);
            plane.id = plane.name; plane.position.set(...text.slice(2)); plane.parent = root; plane.isVisible = false;
        };
    };
    for (var stand of [false, true]) for (var steel of [false, true]) {
        var parts = [], z = stand ? 0 : .42, y = stand ? .19 : .03;
        box(parts, [.96, .59, .12], [0, y, z], steel ? metal : edge);
        box(parts, [.86, .49, .014], [0, y, z - .065], steel ? [.14, .23, .29] : [.7, .51, .3]);
        if (!steel) for (var line of [-1, 1]) box(parts, [.84, .008, .003], [0, y + line * .085, z - .074], wood);
        for (var x of [-.44, .44]) for (var dy of [-.25, .25]) box(parts, [.025, .025, .014], [x, y + dy, z - .065], steel ? gold : cream);
        if (stand) {
            box(parts, [.09, .58, .1], [0, -.21, .025], steel ? metal : wood);
            if (steel) box(parts, [.48, .045, .36], [0, -.477, .025], metal);
        };
        finish((stand ? 'SIGNSTAND.' : 'SIGNWALL.') + (steel ? 'metal' : 'wood') + '.mesh', parts, [.8, .42, 0, y, z - .077], '#fff2c6');
    };
    function question(parts, y, z) {
        for (var [x, dy, w, h] of [[-.1,.15,.08,.12],[0,.23,.2,.06],[.12,.15,.06,.16],[.06,.045,.14,.06],[0,-.035,.06,.13],[0,-.18,.07,.07]])
            box(parts, [w, h, .016], [x, y + dy, z], gold);
    };
    for (var stand of [false, true]) {
        var parts = [], z = stand ? 0 : .42, y = stand ? .18 : 0;
        box(parts, [.55, .65, .13], [0, y, z], metal); question(parts, y, z - .075);
        if (stand) { box(parts, [.16, .4, .16], [0, -.25, .02], metal); box(parts, [.48, .06, .4], [0, -.47, .02], metal); };
        finish('SIGNBUBBLE.question-' + (stand ? 'pedestal' : 'plaque') + '.mesh', parts);
    };
    var parts = [];
    box(parts, [.64, .74, .18], [0, 0, .39], metal);
    box(parts, [.52, .56, .02], [0, .05, .288], [.12, .16, .17]);
    for (var y = -.16; y < .3; y += .08) box(parts, [.45, .025, .025], [0, y, .27], [.47, .5, .47]);
    box(parts, [.06, .035, .02], [.2, -.29, .28], gold);
    finish('SIGNBUBBLE.speaker.mesh', parts);
    parts = [];
    box(parts, [.12, .58, .12], [0, -.21, .08], wood);
    box(parts, [.7, .43, .44], [0, .22, .03], [.56, .18, .13]);
    box(parts, [.58, .018, .025], [0, .28, -.2], [.14, .13, .12]);
    box(parts, [.23, .13, .025], [.06, .2, -.21], cream, -.14);
    box(parts, [.025, .28, .025], [.37, .31, .03], metal);
    box(parts, [.17, .11, .025], [.44, .43, .03], gold);
    finish('SIGNBUBBLE.mailbox.mesh', parts);
    parts = [];
    box(parts, [.6, .07, .47], [0, -.465, 0], edge);
    box(parts, [.2, .63, .22], [0, -.12, .04], wood);
    var top = box(parts, [.85, .08, .58], [0, .23, 0], edge); top.rotation.x = -.35;
    for (var side of [-1, 1]) {
        var page = box(parts, [.36, .045, .47], [side * .19, .3, -.02], cream, side * -.1); page.rotation.x = -.35;
        for (var i = 0; i < 4; i++) {
            var line = box(parts, [.24, .006, .009], [side * .19, .326 + i * .025, -.15 + i * .072], wood); line.rotation.x = -.35;
        };
    };
    finish('SIGNBUBBLE.lectern.mesh', parts);
};
