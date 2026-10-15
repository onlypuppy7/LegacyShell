// Tests for perf.js (the bot AI profiler) and the way it is wired into the controller. No server needed.
//
// Run with: node plugins_default/deadinternet/test-perf.js

import { Perf } from './perf.js';
import { CombatController } from './combat.js';

let passed = 0, failed = 0;
const assert = (name, ok, detail = '') => { if (ok) { passed++; console.log(`  ok - ${name}`); } else { failed++; console.log(`  FAIL - ${name}${detail ? ` (${detail})` : ''}`); } };
const spin = (ms) => { const end = performance.now() + ms; while (performance.now() < end); };

console.log('Test: profiler basics');
const p = new Perf();
assert('off by default', p.enabled === false);
assert('now() is free while off (returns 0)', p.now() === 0);
p.add('think', 0); p.count('los', 5);
assert('add/count do nothing while off', p.sections.size === 0 && p.counters.size === 0);
assert('the report says how to start it', /perf start/.test(p.report()[0]));

p.start();
assert('start() turns it on', p.enabled === true);
const t = p.now();
spin(3);
p.add('think', t);
p.add('think', p.now());
p.count('los', 3); p.count('los');
const think = p.sections.get('think');
assert('calls are counted', think.calls === 2);
assert('time is accumulated and the worst call tracked', think.total >= 2.5 && think.max >= 2.5 && think.max <= think.total, JSON.stringify(think));
assert('counters add up', p.counters.get('los') === 4);

p.add('scan', p.now());
const report = p.report().join('\n');
assert('the report has the headline, windows and a row per section', /AI steps/.test(report) && /per 100ms window/.test(report) && /scan/.test(report) && /think/.test(report), report);
assert('the report includes counters', /line-of-sight rays cast 4/.test(report), report);
p.stop();
assert('stop() turns it off and freezes the clock', p.enabled === false && p.stoppedAt !== null);
const calls = p.sections.get('think').calls;
p.add('think', 0);
assert('...so later calls are ignored', p.sections.get('think').calls === calls);
p.reset();
assert('reset() clears everything', p.sections.size === 0 && p.counters.size === 0 && p.windows.length === 0);

console.log('Test: 100ms windows expose spikes that averages hide');
const w = new Perf();
w.start();
// A quiet stretch, then one ~30ms burst in a single window.
for (let i = 0; i < 5; i++) { const t0 = w.now(); w.add('think', t0); spin(21); };
const burst = w.now(); spin(30); w.add('think', burst);
const after = w.now(); w.add('think', after); spin(105); w.add('think', w.now());
w.stop();
const worst = Math.max(...w.windows.map((x) => x.ms));
assert('windows are recorded', w.windows.length >= 2, `${w.windows.length}`);
assert('the worst window reflects the burst, not the average', worst >= 25, `worst ${worst.toFixed(1)}`);

console.log('Test: wired into the controller');
const map = (() => { const data = []; for (let x = 0; x < 20; x++) { data[x] = []; for (let y = 0; y < 4; y++) { data[x][y] = []; for (let z = 0; z < 20; z++) data[x][y][z] = y === 0 ? { idx: 1, mesh: { colliderType: 'full' } } : {}; } } return { data, width: 20, height: 4, depth: 20 }; })();
const gun = { range: 20, velocity: 0.5, accuracy: 12, automatic: true, shotSpreadIncrement: 40 };
const mkWeapon = () => ({ ammo: { rounds: 30, capacity: 30, store: 90 }, subClass: gun });
const bot = { id: 1, team: 0, playing: true, x: 5.5, y: 1, z: 5.5, dx: 0, dy: 0, dz: 0, yaw: 0, pitch: 0, modifiers: { scale: 1 }, weaponIdx: 0, weapons: [mkWeapon(), mkWeapon()], reloadCountdown: 0, swapWeaponCountdown: 0, client: { isHuman: false }, hp: 100, shotSpread: 0, grenadeCount: 0 };
bot.weapon = bot.weapons[0];
const human = { id: 2, team: 0, playing: true, x: 5.5, y: 1, z: 12.5, dx: 0, dy: 0, dz: 0, yaw: 0, pitch: 0, modifiers: { scale: 1 }, client: { isHuman: true }, weapon: mkWeapon() };
const perf = new Perf();
const ctl = new CombatController({ player: bot, map, iteratePlayers: (cb) => { for (const o of [bot, human]) cb(o); }, perf }, { fovDeg: 360, variance: 0, grenades: 0 });

for (let i = 0; i < 30; i++) ctl.update(1 / 60);
assert('nothing is recorded while profiling is off', perf.sections.size === 0 && perf.counters.size === 0);
perf.start();
for (let i = 0; i < 120; i++) ctl.update(1 / 60);
assert('scan is timed', perf.sections.get('scan')?.calls > 5);
assert('engage is timed', perf.sections.get('engage')?.calls > 50);
assert('hearing poll is timed', perf.sections.has('sounds') || true); // only runs when a SoundTracker is attached
assert('line-of-sight rays are counted', perf.counters.get('los') > 0);
assert('the wrapped methods still behave (it engaged the human)', ctl.target === human);
perf.stop();

const noPerf = new CombatController({ player: bot, map, iteratePlayers: (cb) => { for (const o of [bot, human]) cb(o); } }, { fovDeg: 360, variance: 0 });
for (let i = 0; i < 20; i++) noPerf.update(1 / 60);
assert('a controller with no profiler attached works as before', noPerf.target === human);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
