//node plugins_default/dynamicmapblocks/profile-signs.js
import fs from 'node:fs';
import BABYLON from 'babylonjs';
import { SignRender } from './sign-render.js';

var engine = new BABYLON.NullEngine(), scene = new BABYLON.Scene(engine);
await new Promise(resolve => BABYLON.SceneLoader.ImportMesh('', '', 'data:' + fs.readFileSync(new URL('./models/map.babylon', import.meta.url), 'utf8'), scene, resolve));
var source = scene.getMeshByName('SIGNBUBBLE.question-pedestal.mesh'); source.setEnabled(false);
function measure(name, definitions, near) {
    var view = SignRender.create(scene, definitions, [source], { editor: true });
    var ray = new BABYLON.Ray(new BABYLON.Vector3(0, .18, near ? -2 : -100), new BABYLON.Vector3(0, 0, 1), 12);
    var times = [], found = 0;
    for (var i = 0; i < 11000; i++) {
        var start = performance.now(); if (SignRender.target(ray, view.entries, () => false)) found++;
        var elapsed = performance.now() - start; if (i >= 1000) times.push(elapsed);
    };
    times.sort((a, b) => a - b);
    var result = { name, count: definitions.length, meanMs: times.reduce((a, b) => a + b, 0) / times.length, p99Ms: times[Math.floor(times.length * .99)], checks: times.length, found };
    view.dispose(); return result;
};
var definitions = Array.from({ length: 128 }, (_, i) => ({ block: { mesh: source.name, x: i % 16, y: 0, z: Math.floor(i / 16) }, text: 'A message', range: 5 }));
var results = [measure('no props', [], true), measure('128 props, out of range', definitions, false), measure('128 props, aiming at one', definitions, true)];
console.log(JSON.stringify({ node: process.version, pollHz: 10, results }, null, 2));
scene.dispose(); engine.dispose();
