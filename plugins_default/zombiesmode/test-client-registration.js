// Loads shared.js the way the browser bundle does (imports commented out, exports stripped) and checks the gametype still
// registers and the browser-side spawn behaves, with no server. A name that only exists through an import is undefined in the
// browser, which would silently drop the gamemode there.
//
// Run with: node plugins_default/zombiesmode/test-client-registration.js

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import BABYLON from 'babylonjs';

const here = path.dirname(fileURLToPath(import.meta.url));
let src = fs.readFileSync(path.join(here, 'shared.js'), 'utf8').replace(/\r\n/g, '\n');
src = src.replace(/\/\/\(server-only-start\)[\s\S]*?\/\/\(server-only-end\)/g, '');
src = src.replace(/^import .*$/gm, (line) => '//' + line);
src = src.replace(/^export (const|var|let|function|class) /gm, '$1 ');
src += '\n' + fs.readFileSync(path.join(here, 'zombievisuals.js'), 'utf8').replace(/\r\n/g, '\n'); //spliced in next to it

let passed = 0, failed = 0;
const assert = (name, ok, detail = '') => { ok ? passed++ : failed++; console.log(`  ${ok ? 'ok' : 'FAIL'} - ${name}${ok || !detail ? '' : ` (${detail})`}`); };

const listeners = {};
const calls = [];
const intervals = [];
const elements = { gameClock: { style: { display: 'none' }, innerText: '0:00' } };
class Player { constructor(id) { this.id = id; } respawn() { calls.push('respawn'); return 'ok'; } }
function PlayerActor() { }
PlayerActor.prototype.update = function () { calls.push('actor update'); return 'updated'; };
PlayerActor.prototype.handsToWeaponSkeleton = function () { calls.push('gun hands'); };
const sandbox = {
    console: { log() {}, error() {} }, Math, Date, JSON, Object, Array, Map, Set, Number, String, Promise, setTimeout, clearTimeout,
    isClient: true, isServer: false,
    plugins: { on: (event, fn) => { listeners[event] = fn; } },
    //what the browser bundle has in scope
    BABYLON, Player, PlayerActor, meId: 1, escPressed: true, unfocused: false, settings: { fastPollMouse: false },
    gameOptions: { plugins: { zombies: {} } },
    canvas: { requestPointerLock: () => calls.push('lock') },
    hideGameMenu: () => calls.push('menu'),
    timedGame: true, betweenRounds: false, me: { playing: true }, respawnTime: null,
    setInterval: (fn) => { intervals.push(fn); },
    window: { getComputedStyle: () => ({ fontFamily: 'Nunito', fontWeight: '900', color: 'white', textShadow: '1px 1px black' }) },
    document: {
        pointerLockElement: null,
        getElementById: (id) => elements[id] ?? null,
        createElement: () => ({ style: {} }),
        body: { appendChild: (el) => { elements[el.id] = el; } },
    },
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

console.log('registration');
assert('registers the gametype listener', typeof listeners['game:GameTypesInit'] === 'function');
const gameTypes = [];
listeners['game:GameTypesInit']({ GameTypes: gameTypes, ItemTypes: { AMMO: 0, GRENADE: 1, HEALTH: 2 }, defaultOptions: { itemsEnabled: [[0, 25, 4], [1, 65, 5]] } });
assert('adds the zombies gametype', gameTypes.length === 1 && gameTypes[0].codeName === 'zombies');
assert('with the horde bite on team 2 only', JSON.stringify(gameTypes[0].options.contactDamage) === '[0,0,15]');
assert('and the settings in plugins.zombies', gameTypes[0].options.plugins.zombies.count === 20);
assert('with the usual items and health packs', JSON.stringify(gameTypes[0].options.itemsEnabled.map((e) => e[0])) === '[0,1,2]', JSON.stringify(gameTypes[0].options.itemsEnabled));
const without = [];
listeners['game:GameTypesInit']({ GameTypes: without, ItemTypes: { AMMO: 0, GRENADE: 1 }, defaultOptions: { itemsEnabled: [[0, 25, 4], [1, 65, 5]] } });
assert('...and without them if the healthpackitem plugin is not there', JSON.stringify(without[0].options.itemsEnabled.map((e) => e[0])) === '[0,1]');
assert('in a 3 minute round', gameTypes[0].options.timedGame.roundLength === 180);

console.log('the browser');
assert('registers for the end of the page load', typeof listeners['game:onPageLoadedEnd'] === 'function');
listeners['game:onPageLoadedEnd']();
listeners['game:onPageLoadedEnd'](); //only patches once

calls.length = 0;
assert('the player\'s own respawn still happens, and returns what it did', new Player(1).respawn() === 'ok');
assert('...and puts them in the game: takes the pointer lock and closes the menu', calls.join() === 'respawn,lock,menu', calls.join());
assert('...without it reading as escape being pressed', sandbox.escPressed === false && sandbox.unfocused === true);

calls.length = 0;
new Player(2).respawn();
assert('someone else spawning does nothing to you', calls.join() === 'respawn', calls.join());

calls.length = 0; sandbox.document.pointerLockElement = {};
new Player(1).respawn();
assert('pressing PLAY (already locked) is left to the game', calls.join() === 'respawn', calls.join());

calls.length = 0; sandbox.document.pointerLockElement = null; sandbox.gameOptions.plugins = {};
new Player(1).respawn();
assert('other gamemodes are left alone', calls.join() === 'respawn', calls.join());

console.log('between rounds');
assert('a timer runs while the page is open', intervals.length === 1);
const tick = intervals[0];
const clock = elements.gameClock;
const waiting = () => elements.zombiesWaiting;
const server = (interim) => { sandbox.gameOptions.plugins = { zombies: {}, zombiesInterim: interim }; }; //what the room params say

server(false);
tick();
assert('mid-round there is no WAITING...', !waiting());

server(true);
tick();
assert('someone in play while the server says it is the gap gets WAITING... in the middle of the screen', waiting() && waiting().innerText === 'WAITING...' && waiting().style.display === 'block');
assert('...in the clock\'s font, smaller', waiting().style.cssText.includes('font-family:Nunito') && waiting().style.cssText.includes('font-weight:900') && waiting().style.cssText.includes('font-size:1.2em') && waiting().style.cssText.includes('top:50%') && waiting().style.cssText.includes('left:50%'));
assert('...without relying on what the game thinks about rounds (it was told nothing here)', sandbox.betweenRounds === false && sandbox.timedGame === true);
assert('the clock is left to the game', clock.innerText === '0:00' && clock.style.display === 'none');

sandbox.me = { playing: false };
tick();
assert('someone who is not in play does not get it', waiting().style.display === 'none');

sandbox.me = { playing: true };
tick();
assert('...until they are', waiting().style.display === 'block');

server(false);
tick();
assert('it goes when the server says the round has started', waiting().style.display === 'none');

sandbox.gameOptions.plugins = { zombiesInterim: true };
tick();
assert('other gamemodes are left alone', waiting().style.display === 'none');

console.log('how zombies look');
const Visuals = vm.runInContext('ZombieVisuals', sandbox);
assert('the look is spliced in alongside the plugin', typeof Visuals.apply === 'function' && typeof Visuals.poseArms === 'function');
const posed = [];
const realPoseBones = Visuals.poseBones;
Visuals.makeHands = () => mesh(); //the model is not here: these are the real hooks and the real stumble, with the meshes stood in for
Visuals.template = () => ({});
Visuals.poseBones = (skeleton, data, pose) => posed.push(pose);

function mesh() {
    return { enabled: true, renderingGroupId: 1, colorMult: { r: 1 }, setEnabled(v) { this.enabled = v; }, dispose() { this.disposed = true; } };
}
function actor(team, id = 5) {
    const gun = mesh();
    return {
        scene: {}, player: { team, id, bobble: 1.2, weapons: [{ actor: { gunMesh: gun } }], weapon: { actor: { gunMesh: gun } } },
        hands: Object.assign(mesh(), { skeleton: {} }), bodyMesh: { rotation: { x: 0, y: 0, z: 0 }, position: { y: 0.32 } }, bobbleIntensity: 0.02, gun,
    };
}
const run = (a) => { calls.length = 0; return PlayerActorStub.prototype.update.call(a, 1); };
const PlayerActorStub = sandbox.PlayerActor;

sandbox.gameOptions.plugins = { zombies: {} };
const z = actor(2);
run(z);
assert('an update of a zombie still does the game\'s own update', calls[0] === 'actor update');
assert('...and gives it the open hands, in place of the model\'s', z.hands.enabled === false && z.zombieHands && z.zombieHands.enabled === true);
assert('...takes its gun out of sight', z.gun.enabled === false);
assert('...and the stumble in place of the wobble: rolled over, hunched forward, dropped on a step', z.bodyMesh.rotation.z !== 0 && z.bodyMesh.rotation.x > 0 && z.bodyMesh.position.y < 0.32 + 0.02, JSON.stringify(z.bodyMesh));
assert('...with the hands taking the colour and drawing group of the model\'s', z.zombieHands.colorMult === z.hands.colorMult && z.zombieHands.renderingGroupId === z.hands.renderingGroupId);

calls.length = 0; posed.length = 0;
PlayerActorStub.prototype.handsToWeaponSkeleton.call(z);
assert('the hands are posed in front instead of following the gun', calls.length === 0 && posed.length === 1 && posed[0].z > 0.3, JSON.stringify(posed));

const still = actor(2); still.bobbleIntensity = 0;
run(still);
assert('a zombie standing still only sways a little', Math.abs(still.bodyMesh.rotation.z) <= 0.041 && still.bodyMesh.rotation.x === 0 && still.bodyMesh.position.y === 0.32, JSON.stringify(still.bodyMesh));

{
    const walker = actor(2);
    const rolls = [], twists = [], phases = [];
    for (let i = 0; i < 400; i++) { walker.bodyMesh.rotation.x = 0; run(walker); rolls.push(walker.bodyMesh.rotation.z); twists.push(walker.bodyMesh.rotation.y); phases.push(walker.zPhase); }
    const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
    assert('the stumble rolls both ways, evenly (it once leant one way only)', Math.min(...rolls) < -0.25 && Math.max(...rolls) > 0.25 && Math.abs(mean(rolls)) < 0.05, `${Math.min(...rolls).toFixed(2)} to ${Math.max(...rolls).toFixed(2)}, mean ${mean(rolls).toFixed(3)}`);
    assert('...and twists both ways', Math.min(...twists) < -0.1 && Math.max(...twists) > 0.1 && Math.abs(mean(twists)) < 0.05);
    assert('...with a phase that only ever counts up, so nothing jumps', phases.every((p, i) => i === 0 || p > phases[i - 1]));
    const jump = Math.max(...rolls.map((r, i) => (i ? Math.abs(r - rolls[i - 1]) : 0)));
    assert('...smoothly from one frame to the next', jump < 0.08, jump.toFixed(3));
}

const human = actor(1);
run(human);
assert('a human is left as the game has it', human.hands.enabled === true && !human.zombieHands && human.gun.enabled === true && human.bodyMesh.rotation.z === 0);
calls.length = 0; posed.length = 0;
PlayerActorStub.prototype.handsToWeaponSkeleton.call(human);
assert('...hands following the gun', calls[0] === 'gun hands' && posed.length === 0);

z.player.team = 1; //cured at the start of a round
const dropped = z.zombieHands;
run(z);
assert('a zombie cured goes back to the model\'s hands and gun', z.hands.enabled === true && z.gun.enabled === true && z.zombieHands === null && dropped.disposed === true && z.bodyMesh.rotation.y === 0);

{
    // The orientation of the hands, from the model's own data (the base model's hands skeleton): that the maths puts the hand the way up it
    // should be, and that the right hand is exactly the left one mirrored. (How it then looks was checked by eye in a model viewer.)
    const model = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'src', 'base-babylons', 'egg.babylon'), 'utf8'));
    const skeletonData = model.skeletons.find((s) => s.name === 'hands_skeleton');
    const handsData = model.meshes.find((m) => m.name === 'hands');
    const bone = (name) => skeletonData.bones.findIndex((b) => b.name === name);
    const fore = bone('foreHand'), grip = bone('gripHand');
    const fake = { bones: skeletonData.bones.map((b) => { const base = BABYLON.Matrix.FromArray(b.matrix); const local = base.clone(); return { getBaseMatrix: () => base, getLocalMatrix: () => local, markAsDirty() {} }; }) };
    const positions = [];
    for (let v = 0; v < handsData.matricesIndices.length; v++) if (handsData.matricesIndices[v] === fore) positions.push(handsData.positions[v * 3], handsData.positions[v * 3 + 1], handsData.positions[v * 3 + 2]);
    const data = { positions: [...positions, ...positions], foreBone: fore, gripBone: grip };
    const square = { yaw: 0, droop: 0, x: -0.17, y: 0.03, z: 0.42 };
    Visuals.bind = null; Visuals.square = null; Visuals.poseBones = realPoseBones;

    const M = BABYLON.Matrix;
    const bind = (i) => fake.bones[i].getBaseMatrix();
    Visuals.poseBones(fake, data, square);
    const moved = (i) => bind(i).clone().invert().multiply(fake.bones[i].getLocalMatrix()); //where the bone's vertices go: inverse bind * pose
    const r = bind(fore).m;
    const axis = (row) => BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(row[0], row[1], row[2]), moved(fore)).asArray().map((x) => +x.toFixed(3));
    assert('square on, the left hand\'s fingers point forward, thumb in and palm down (its local z, y and x go to +z, +x and +y)', JSON.stringify([axis([r[8], r[9], r[10]]), axis([r[4], r[5], r[6]]), axis([r[0], r[1], r[2]])]) === JSON.stringify([[0, 0, 1], [1, 0, 0], [0, 1, 0]]), JSON.stringify([axis([r[8], r[9], r[10]]), axis([r[4], r[5], r[6]]), axis([r[0], r[1], r[2]])]));

    const centre = data.positions.slice(0, positions.length).reduce((s, x, i) => { s[i % 3] += x / (positions.length / 3); return s; }, [0, 0, 0]);
    const where = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(...centre), moved(fore)).asArray().map((x) => +x.toFixed(3));
    assert('...with the centre of the hand where the pose says', JSON.stringify(where) === JSON.stringify([-0.17, 0.03, 0.42]), JSON.stringify(where));

    // the right hand is the left one in a mirror: a vertex of the left hand, and its mirror image on the right bone, end up mirrored
    let worst = 0;
    for (let v = 0; v < positions.length; v += 3) {
        const p = new BABYLON.Vector3(positions[v], positions[v + 1], positions[v + 2]);
        const left = BABYLON.Vector3.TransformCoordinates(p, moved(fore));
        const right = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(-p.x, p.y, p.z), moved(grip));
        worst = Math.max(worst, Math.abs(left.x + right.x), Math.abs(left.y - right.y), Math.abs(left.z - right.z));
    }
    assert('the right hand is the left one exactly mirrored', worst < 1e-4, worst.toExponential(2));

    Visuals.poseBones = (skeleton, d, pose) => posed.push(pose); //back to the stand-in for the rest
}

const other = actor(2); sandbox.gameOptions.plugins = {};
run(other);
assert('in other gamemodes team 2 is left alone', other.hands.enabled === true && !other.zombieHands && other.gun.enabled === true);

sandbox.gameOptions.plugins = { zombies: {} };
const broken = actor(2); const realApply = Visuals.apply;
Visuals.apply = () => { throw new Error('boom'); };
let survived = true; try { run(broken); } catch (e) { survived = false; };
Visuals.apply = realApply;
assert('a failure in the look does not break the game\'s update', survived && calls[0] === 'actor update');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
