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
    document: { pointerLockElement: null },
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

console.log('registration');
assert('registers the gametype listener', typeof listeners['game:GameTypesInit'] === 'function');
const gameTypes = [];
listeners['game:GameTypesInit']({ GameTypes: gameTypes });
assert('adds the zombies gametype', gameTypes.length === 1 && gameTypes[0].codeName === 'zombies');
assert('with the horde bite on team 2 only', JSON.stringify(gameTypes[0].options.contactDamage) === '[0,0,15]');
assert('and the settings in plugins.zombies', gameTypes[0].options.plugins.zombies.count === 20);
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
