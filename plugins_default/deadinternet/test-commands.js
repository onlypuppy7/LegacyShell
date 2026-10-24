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
    //what the bot asks the room for when it joins: the colour (and hat) go in with its first loadout, past the game's non-subscriber clamp (see clientUpdateLoadoutEnd)
    const joinWith = async (color, hatId) => {
        let info = null;
        const bot = new DeadInternetBot({ joinPlayer: async (given) => { info = given; throw new Error('stop here'); } }, { combat: color === undefined ? {} : { color } });
        if (hatId) bot.hatId = hatId;
        await bot.init().catch(() => { });
        return info.botLoadout;
    };
    assert('blue goes in with the join', (await joinWith('blue')).colorIdx === 11);
    assert('red likewise', (await joinWith('red')).colorIdx === 7);
    assert('with no colour it asks for none', (await joinWith(undefined)).colorIdx === null);
    const rnd = (await joinWith('random')).colorIdx;
    assert('random picks one of the 14', rnd >= 0 && rnd <= 13);
    assert('a hat goes in with the join too', (await joinWith('red', 50031)).hatId === 50031);
    DeadInternetBots.length = 0;
    assert('/bots options color lists the colours', /white\(0\)|white/.test((await run('bots options', 'color'))[0]) || /color/.test((await run('bots options', 'color'))[0]));
}

console.log('Test: only fighting bots get combat physics (a debug bot keeps the game\'s defaults)');
{
    // Regression: setting a bot up used to apply the combat skill's speed (~0.6) to EVERY bot, including
    // the pathtest/checkpoint bots. At that speed the physics verifier correctly finds the parkour jumps
    // impossible, so /botsdebug pathtestcheckpoints reported "no path" on every leg.
    const make = (combat) => {
        const bot = new DeadInternetBot({}, { combat });
        const changes = [];
        bot.player = { team: 0, playing: false, controlKeys: 0, modifiers: { speedModifier: 1, damageModifier: 1, resistanceModifier: 1 }, changeModifiers(m) { changes.push(m); Object.assign(this.modifiers, m); }, switchTeam() { } };
        bot.client = {};
        bot.setupCombat();
        return { bot, changes };
    };
    const debug = make({});
    assert('a bot that is only set up (what pathtest and the checkpoint tour spawn) changes nothing', debug.changes.length === 0 && debug.bot.player.modifiers.speedModifier === 1 && debug.bot.player.modifiers.damageModifier === 1);

    const fighter = make({ difficulty: 'normal', variance: 0 });
    assert('...still true right after setup for a bot that will fight', fighter.changes.length === 0);
    fighter.bot.startCombatAI();
    assert('starting the combat AI applies the skill\'s speed', fighter.changes.length === 1 && fighter.bot.player.modifiers.speedModifier === 0.6, JSON.stringify(fighter.changes));
    fighter.bot.startCombatAI(); fighter.bot.applyCombatModifiers();
    assert('...once, not again on later calls', fighter.changes.length === 1);

    const easy = make({ difficulty: 'easy', variance: 0 });
    easy.bot.startCombatAI();
    assert('an easy bot is slower and deals less damage', easy.bot.player.modifiers.speedModifier === 0.4 && easy.bot.player.modifiers.damageModifier === 0.6);

    const thinker = make({ difficulty: 'hard', variance: 0 });
    thinker.bot.think(1);
    assert('driving a bot with think() directly applies them too', thinker.changes.length === 1 && thinker.bot.player.modifiers.speedModifier === 0.8);
    thinker.bot.think(1);
    assert('...once', thinker.changes.length === 1);

    const explicit = make({ difficulty: 'easy', speed: 1, variance: 0 });
    explicit.bot.startCombatAI();
    assert('an explicit speed beats the skill\'s', explicit.bot.player.modifiers.speedModifier === 1);
    DeadInternetBots.length = 0;
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
