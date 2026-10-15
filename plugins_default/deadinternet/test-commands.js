// Drives the REAL server-side handlers of the /bots and /botsdebug commands with a fake player - no
// game server needed. Only covers what can be checked without actually spawning bots: argument
// parsing, validation and the listing commands. (Spawning needs a live room; see test-ingame.js.)
//
// Exists because a regex that silently lost its backslash once made `/botsdebug field ffa 8` read
// "ffa 8" as a single scenario name, and `list` split on the letter "s".
//
// Run with: node plugins_default/deadinternet/test-commands.js

import { DeadInternetPlugin } from './shared.js';
import { DeadInternetBot, DeadInternetBots } from './index.js';

const cmds = {};
const ctx = {
    ranksEnum: { Guest: 0, Moderator: 1, Admin: 2 },
    newCommand: (c) => { cmds[`${c.category} ${c.name}`] = c; },
    room: {},
};
const realLog = console.log;
console.log = () => {}; // shared.js chatters while registering
DeadInternetPlugin.registerListeners({ on() {} });
DeadInternetPlugin.permissionsAfterSetup({ this: ctx });
console.log = realLog;

let passed = 0, failed = 0;
const assert = (name, ok, detail = '') => { if (ok) { passed++; console.log(`  ok - ${name}`); } else { failed++; console.log(`  FAIL - ${name}${detail ? ` (${detail})` : ''}`); } };

async function run(command, input) {
    const out = [];
    const player = { team: 0, client: { commandFeedback: (t) => out.push(t) } };
    try {
        await cmds[command].executeServer({ player, opts: input, mentions: [] });
    } catch (error) {
        out.push(`THREW: ${error.message}`);
    }
    return out;
}

console.log('Test: /botsdebug field argument handling');
const list = await run('botsdebug field', 'list');
assert('"list" lists every scenario, one per line', list.length >= 13 && list.some((l) => l.startsWith('ffa ')) && list.some((l) => l.startsWith('stress ')), `${list.length} lines: ${list[0]}`);
assert('no arguments lists them too', (await run('botsdebug field', '')).length === list.length);
assert('"LIST" is case-insensitive', (await run('botsdebug field', 'LIST')).length === list.length);
assert('listing mentions the usage', list.some((l) => /Usage/.test(l)));

const unknown = await run('botsdebug field', 'nope');
assert('an unknown scenario names the valid ones', unknown.length === 1 && /unknown scenario "nope"/.test(unknown[0]) && /ffa/.test(unknown[0]), unknown[0]);

// A scenario name followed by a count must be split into two arguments (this is the one that broke).
const badOption = await run('botsdebug field', 'ffa 8 banana=1');
assert('"ffa 8 banana=1": scenario and count are parsed, and the bad option is the only complaint', badOption.length === 1 && /unknown option "banana"/.test(badOption[0]) && !/unknown scenario/.test(badOption[0]), badOption[0]);
const badWord = await run('botsdebug field', 'ffa 8 wat');
assert('a stray word is reported as an unknown argument', badWord.length === 1 && /unknown argument "wat"/.test(badWord[0]), badWord[0]);
const zero = await run('botsdebug field', 'ffa 0');
assert('a total of 0 is rejected', zero.length === 1 && /at least 1/.test(zero[0]), zero[0]);
const tabs = await run('botsdebug field', '  ffa   8   banana=1 ');
assert('extra whitespace is harmless', tabs.length === 1 && /unknown option "banana"/.test(tabs[0]), tabs[0]);

console.log('Test: /botsdebug perf');
const idle = await run('botsdebug perf', 'report');
assert('report with nothing recorded says how to start', idle.length === 1 && /perf start/.test(idle[0]), idle[0]);
const bad = await run('botsdebug perf', 'banana');
assert('an unknown subcommand shows usage', /Usage/.test(bad[0]), bad[0]);
const started = await run('botsdebug perf', 'start 1');
assert('start says how long it will record', /1s/.test(started[0]), started[0]);
const mid = await run('botsdebug perf', 'report');
assert('a report while recording says to spawn bots when there is nothing yet', /spawn some bots|nothing recorded/.test(mid[0]), mid[0]);
const stopped = await run('botsdebug perf', 'stop');
assert('stop works', stopped.length >= 1);
assert('reset works', /cleared/.test((await run('botsdebug perf', 'reset'))[0]));

console.log('Test: bots wear their egg colour');
{
    const make = (color) => {
        const bot = new DeadInternetBot({}, { combat: color === undefined ? {} : { color } });
        const calls = [];
        bot.client = { colorIdx: 0, applyLoadout: async () => { calls.push(bot.client.colorIdx); } };
        return { bot, calls };
    };
    const blue = make('blue'); await blue.bot.applyShellColor();
    assert('blue is set on the client directly (past the game\'s non-subscriber clamp) and then applied', blue.bot.client.colorIdx === 11 && blue.calls.length === 1 && blue.calls[0] === 11);
    const red = make('red'); await red.bot.applyShellColor();
    assert('red likewise', red.bot.client.colorIdx === 7 && red.calls[0] === 7);
    const plain = make(undefined); await plain.bot.applyShellColor();
    assert('with no colour it touches nothing', plain.bot.client.colorIdx === 0 && plain.calls.length === 0);
    const rnd = make('random'); await rnd.bot.applyShellColor();
    assert('random picks one of the 14', rnd.bot.client.colorIdx >= 0 && rnd.bot.client.colorIdx <= 13 && rnd.calls.length === 1);
    DeadInternetBots.length = 0;
    assert('/bots options color lists the colours', /white\(0\)|white/.test((await run('bots options', 'color'))[0]) || /color/.test((await run('bots options', 'color'))[0]));
}

console.log('Test: /bots commands');
const presets = await run('bots presets', '');
assert('/bots presets lists every preset with its skill', presets.length === 5 && presets.every((l) => /skill/.test(l)), presets.join(' | '));
assert('/bots presets 0.7 describes an in-between skill', (await run('bots presets', '0.7'))[0]?.includes('skill 0.7'));
assert('/bots presets nope is an error', /Unknown preset/.test((await run('bots presets', 'nope'))[0]));
const options = await run('bots options', '');
assert('/bots options lists every option', options.length > 40, `${options.length}`);
assert('/bots options filters by name', (await run('bots options', 'cover')).every((l) => /cover/i.test(l)));
assert('/bots options class lists the classes available', /default\|random/.test((await run('bots options', 'class'))[0]));
assert('/bots add rejects a bad option before spawning anything', /unknown option "banana"/.test((await run('bots add', '3 hard banana=1'))[0]));
assert('/bots add rejects a bad difficulty', /unknown argument "wat"|unknown difficulty/.test((await run('bots add', 'wat'))[0]));
assert('/bots add rejects a bad skill', /skill/.test((await run('bots add', 'skill=7'))[0]));
assert('/bots clear rejects a bad count', /count must be/.test((await run('bots clear', 'abc'))[0]));
assert('/bots clear with nothing to clear says so', /No bots/.test((await run('bots clear', ''))[0]));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
