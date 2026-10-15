// Checks that shared.js still REGISTERS every command when loaded the way the browser bundle loads
// it - no server needed.
//
// shared.js is spliced into the browser bundle as raw text (see CLAUDE.md "Shared game logic"):
// its `import` lines are commented out and `export` stripped, so any name that only exists via an
// import is simply undefined in the browser. Commands are registered on BOTH sides, so touching
// such a name while building the command definition (not inside executeServer, which never runs
// in the browser) throws a ReferenceError in the browser, which aborts registration of that
// command and every one after it - they silently vanish from chat autocomplete and /help.
// That is exactly what happened to /botsdebug once, which is why this exists.
//
// Run with: node plugins_default/deadinternet/test-client-registration.js

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
let src = fs.readFileSync(path.join(here, 'shared.js'), 'utf8').replace(/\r\n/g, '\n');
src = src.replace(/\/\/\(server-only-start\)[\s\S]*?\/\/\(server-only-end\)/g, '');
src = src.replace(/^import .*$/gm, (line) => '//' + line);
src = src.replace(/^export (const|var|let|function|class) /gm, '$1 ');
src += '\n;globalThis.__plugin = DeadInternetPlugin;';

const registered = [];
const ctx = {
    ranksEnum: { Guest: 0, Moderator: 1, Admin: 2 },
    newCommand: (c) => registered.push({ category: c.category, name: c.name, permissionLevel: c.permissionLevel }),
    room: {},
};
const sandbox = {
    console: { log() {} }, Math, Date, JSON, Object, Array, Map, Set, Number, String, Promise, setTimeout, clearTimeout,
    CONTROL: {}, isClient: true, isServer: false, maxServerSlots: 50, ticksPerSecond: 60,
    Comm: { Out: function () {}, Chat: {}, Code: {} }, plugins: { on() {} }, setGameOptionInMentions() {}, ClientConstructor: function () {},
};
vm.createContext(sandbox);

let failure = null;
try {
    vm.runInContext(src, sandbox);
    sandbox.__plugin.registerListeners({ on() {} });
    sandbox.__plugin.permissionsAfterSetup({ this: ctx });
} catch (error) {
    failure = `${error.name}: ${error.message}`;
}

let passed = 0, failed = 0;
const assert = (name, ok, detail = '') => { if (ok) { passed++; console.log(`  ok - ${name}`); } else { failed++; console.log(`  FAIL - ${name}${detail ? ` (${detail})` : ''}`); } };

console.log('Test: commands register in the browser bundle');
assert('registration does not throw', failure === null, failure ?? '');
const names = registered.map((c) => `${c.category} ${c.name}`);
for (const want of ['bots add', 'bots clear', 'bots presets', 'bots options', 'botsdebug field', 'botsdebug perf', 'botsdebug cache', 'botsdebug pathtest', 'botsdebug pathtestme', 'botsdebug pathtestpair', 'botsdebug pathtestraw', 'botsdebug pathtestall', 'botsdebug pathtestcheckpoints', 'botsdebug beginmanualrecording']) {
    assert(`"/${want}" is registered`, names.includes(want), `have: ${names.join(', ')}`);
};
assert('every command is admin only', registered.every((c) => c.permissionLevel[0] === 2 && c.permissionLevel[1] === 2));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
