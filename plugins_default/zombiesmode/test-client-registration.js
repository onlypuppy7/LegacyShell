// Loads shared.js the way the browser bundle does (imports commented out, exports stripped) and checks the gametype still
// registers and the browser-side spawn behaves, with no server. A name that only exists through an import is undefined in the
// browser, which would silently drop the gamemode there.
//
// Run with: node plugins_default/zombiesmode/test-client-registration.js

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
let src = fs.readFileSync(path.join(here, 'shared.js'), 'utf8').replace(/\r\n/g, '\n');
src = src.replace(/\/\/\(server-only-start\)[\s\S]*?\/\/\(server-only-end\)/g, '');
src = src.replace(/^import .*$/gm, (line) => '//' + line);
src = src.replace(/^export (const|var|let|function|class) /gm, '$1 ');

let passed = 0, failed = 0;
const assert = (name, ok, detail = '') => { ok ? passed++ : failed++; console.log(`  ${ok ? 'ok' : 'FAIL'} - ${name}${ok || !detail ? '' : ` (${detail})`}`); };

const listeners = {};
const calls = [];
const intervals = [];
const elements = { gameClock: { style: { display: 'none' }, innerText: '0:00' } };
class Player { constructor(id) { this.id = id; } respawn() { calls.push('respawn'); return 'ok'; } }
const sandbox = {
    console: { log() {} }, Math, Date, JSON, Object, Array, Map, Set, Number, String, Promise, setTimeout, clearTimeout,
    isClient: true, isServer: false,
    plugins: { on: (event, fn) => { listeners[event] = fn; } },
    //what the browser bundle has in scope
    Player, meId: 1, escPressed: true, unfocused: false, settings: { fastPollMouse: false },
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
