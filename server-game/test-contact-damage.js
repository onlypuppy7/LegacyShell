// Offline test for Room.contactDamageUpdate (the core contactDamage modifier). Boots a real room headlessly
// (same approach as plugins_default/deadinternet/bench-pathfinding.js), puts two bots next to each other and
// drives the contact check by hand with a fake clock.
//
// Run with: node server-game/test-contact-damage.js [map name]

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

let passed = 0, failed = 0;
function assert(name, condition, detail = '') {
    if (condition) { passed++; console.log(`  ok - ${name}`); }
    else { failed++; console.log(`  FAIL - ${name}${detail ? ` (${detail})` : ''}`); };
};

const lines = [];
const realLog = (...a) => lines.push(a.join(" "));
const mute = () => { console.log = () => {}; };
const unmute = () => { console.log = realLog; };

// rooms post to the worker parent port, so the room has to live in a worker thread (as in the real game server)
if (isMainThread) {
    const worker = new Worker(fileURLToPath(import.meta.url), { argv: process.argv.slice(2), stdout: false, stderr: false });
    worker.on('message', (m) => { if (!m?.lines) return; /* the room posts its own messages on this port too */ console.log(m.lines.join('\n')); process.exit(m.failed ? 1 : 0); });
    worker.on('error', (e) => { console.log(e); process.exit(1); });
    worker.on('exit', (code) => process.exit(code));
} else {

mute();
const miscModule = await import('#misc');
miscModule.misc.instantiateSS(import.meta, ['node', 'test', '--game'], true);
const ss = miscModule.ss; // a live binding, only set once instantiateSS has run
const root = ss.rootDir;
ss.maps = JSON.parse(fs.readFileSync(path.join(root, 'server-game', 'store', 'maps.json'), 'utf8'));
ss.items = JSON.parse(fs.readFileSync(path.join(root, 'server-game', 'store', 'items.json'), 'utf8'));
ss.permissions = yaml.load(fs.readFileSync(path.join(root, 'store', 'config', 'distributed_permissions.yaml'), 'utf8'));
await (await import('#items')).initItems();
const RoomConstructor = (await import('#rooms')).default;
const Comm = (await import('#comm')).default;
const { DeadInternetBot } = await import('../plugins_default/deadinternet/index.js');

const mapName = (process.argv[2] || 'Castle').toLowerCase();
const mapId = ss.maps.findIndex((m) => m.name.toLowerCase() === mapName);
if (mapId < 0) { unmute(); console.log(`unknown map ${mapName}`); process.exit(1); };

const room = new RoomConstructor({ gameType: 0, mapId, gameId: 1, gameKey: 784, joinType: Comm.Code.createPrivateGame, locked: false, extraParams: {} });
ss.room = room;
for (let i = 0; i < 600 && !room.map; i++) await new Promise((r) => setTimeout(r, 50));
const stopLoops = () => { for (const loop of ['updateLoopObject', 'dataSyncLoopObject', 'metaLoopObject', 'updateRoomDetailsLoopObject', 'spawnItemsLoopObject']) { try { room[loop]?.stop?.(); room[loop]?.clear?.(); } catch { }; }; };
stopLoops();
const botA = new DeadInternetBot(room, {}); await botA.init();
const botB = new DeadInternetBot(room, {}); await botB.init();
stopLoops();
unmute();

const A = botA.player; // the zombie
const B = botB.player; // the victim

function setup({ dx = 0.4, dy = 0, team = [0, 0], damage = 20, hp = 100 } = {}) {
    A.playing = B.playing = true;
    A.hp = B.hp = hp;
    A.x = 10; A.y = 5; A.z = 10;
    B.x = 10 + dx; B.y = 5 + dy; B.z = 10;
    A.team = team[0]; B.team = team[1];
    A.modifiers.contactDamage = damage;
    A.modifiers.damageModifier = 1;
    A.modifiers.scale = B.modifiers.scale = 1;
    B.modifiers.resistanceModifier = 1;
    B.nextContactHit = 0;
    room.gameOptions.contactCooldown = 500;
};
const tick = (t) => { mute(); room.contactDamageUpdate(t); unmute(); };

console.log('defaults');
assert('contactDamage defaults to 0 for every team', room.gameOptions.contactDamage.every((v) => v === 0));
assert('players get the modifier', A.modifiers.contactDamage === 0 || A.modifiers.contactDamage === room.gameOptions.contactDamage[A.team]);

console.log('contact');
setup({ damage: 0 }); tick(1000);
assert('contactDamage 0 does nothing', B.hp === 100, `hp ${B.hp}`);

setup(); tick(1000);
assert('touching hurts for contactDamage', B.hp === 80, `hp ${B.hp}`);
assert('the toucher is not hurt', A.hp === 100);

console.log('cooldown');
tick(1100);
assert('no second hit inside the cooldown', B.hp === 80, `hp ${B.hp}`);
tick(1500);
assert('hit again once it has passed', B.hp === 60, `hp ${B.hp}`);

console.log('range');
setup({ dx: 2 }); tick(1000);
assert('2 blocks away: nothing', B.hp === 100);
setup({ dy: 2 }); tick(1000);
assert('2 blocks above: nothing', B.hp === 100);
setup({ dy: -2 }); tick(1000);
assert('2 blocks below: nothing', B.hp === 100);
setup({ dx: 0.55 }); tick(1000);
assert('just touching (0.55) still hits', B.hp === 80, `hp ${B.hp}`);
setup({ dy: 0.5 }); tick(1000);
assert('victim slightly higher still hits', B.hp === 80, `hp ${B.hp}`);

setup({ dx: 0.9 }); tick(1000);
assert('0.9 away is out of the default reach', B.hp === 100);
setup({ dx: 0.9 }); room.gameOptions.contactReach = 0.5; tick(1000); room.gameOptions.contactReach = 0.1;
assert('...but inside a contactReach of 0.5', B.hp === 80, `hp ${B.hp}`);
setup({ dx: 0.5 }); B.z = 10.5; tick(1000);
assert('reach is a circle: a diagonal 0.7 away is out of default reach', B.hp === 100);

console.log('teams');
setup({ team: [1, 1] }); tick(1000);
assert('same team: nothing', B.hp === 100);
setup({ team: [2, 1] }); tick(1000);
assert('opposing teams: hit', B.hp === 80);
setup({ team: [0, 0] }); tick(1000);
assert('ffa (team 0): hit', B.hp === 80);

console.log('modifiers');
setup({ damage: 20 }); A.modifiers.damageModifier = 0; tick(1000);
assert('not scaled by damageModifier (a toucher that cannot shoot still bites)', B.hp === 80, `hp ${B.hp}`);
setup({ damage: 20 }); B.modifiers.resistanceModifier = 2; tick(1000);
assert('reduced by the victim\'s resistance', B.hp === 90, `hp ${B.hp}`);

console.log('dead / not playing');
setup(); B.playing = false; tick(1000);
assert('victim not playing: nothing', B.hp === 100);
setup(); A.playing = false; tick(1000);
assert('toucher not playing: nothing', B.hp === 100);
setup({ hp: 0 }); A.hp = 100; tick(1000);
assert('dead victim: nothing', B.hp === 0);

console.log('kills');
setup({ hp: 10 }); A.kills = 0; mute(); room.contactDamageUpdate(1000); unmute();
assert('lethal touch kills the victim', B.hp <= 0, `hp ${B.hp}`);
assert('the toucher gets the kill', A.kills === 1, `kills ${A.kills}`);

console.log(`\n${passed} passed, ${failed} failed`);
parentPort.postMessage({ lines, failed });

};
