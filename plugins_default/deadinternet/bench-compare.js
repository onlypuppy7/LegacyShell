// Before/after lag comparison: runs bench-lag.js across several seeds for each configuration you give
// it, and prints one table - so an optimization can be judged on more than one lucky run.
//
// A "configuration" is a plugin directory (the code to run) and, optionally, whether to use the
// on-disk geometry cache and in what state:
//
//   label=dir                 run that copy of the plugin, geometry cache off
//   label=dir:cold            ... with the cache ON but starting empty (a brand new server)
//   label=dir:warm            ... with the cache ON and already filled (a server that has run before)
//
// The directory "." means this plugin folder as it is now. To compare against the code as it was
// before a change, snapshot it first (copy the .js files into store/baseline, which is gitignored,
// then put the old versions of whatever you are changing in there) and name it as a configuration.
//
// Usage (from the repo root):
//   node plugins_default/deadinternet/bench-compare.js [--seeds 1,2,3] [--seconds 25] [--map Castle]
//        [--bots 30] [--scenario stress] before=plugins_default/deadinternet/store/baseline \
//        after-cold=.:cold after-warm=.:warm
//
// "warm" uses whatever is already in store/ (run `bench-pathfinding.js <map> --store --warm 3000`
// first to fill it); "cold" sets the saved files aside for the run and puts them back after.
// Each configuration is also checked for behaving alike (kills per run are shown), so a speed-up
// that quietly made the bots dumb would show.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(name); if (i < 0) return fallback; const v = args[i + 1]; args.splice(i, 2); return v; };
const seeds = flag('--seeds', '1,2,3').split(',').map(Number);
const seconds = flag('--seconds', '25');
const map = flag('--map', 'Castle');
const bots = flag('--bots', '30');
const scenario = flag('--scenario', 'stress');
const root = path.resolve(here, '..', '..');

const configs = args.map((a) => {
    const eq = a.indexOf('=');
    if (eq < 0) { console.error(`bad configuration "${a}" - expected label=dir[:cold|:warm]`); process.exit(1); };
    const label = a.slice(0, eq);
    let rest = a.slice(eq + 1), mode = 'off';
    const m = rest.match(/^(.*):(cold|warm)$/);
    if (m) { rest = m[1]; mode = m[2]; };
    return { label, dir: rest === '.' ? here : path.resolve(root, rest), mode };
});
if (!configs.length) { console.error('give at least one configuration, e.g. now=.:warm'); process.exit(1); };

const storeDir = path.join(here, 'store');
const stash = path.join(storeDir, '_stash');
const isCache = (f) => f.endsWith('.json.gz') || f.endsWith('.json');
const hideStore = () => { fs.mkdirSync(stash, { recursive: true }); for (const f of fs.readdirSync(storeDir).filter((f) => isCache(f) && fs.statSync(path.join(storeDir, f)).isFile())) fs.renameSync(path.join(storeDir, f), path.join(stash, f)); };
const restoreStore = () => { for (const f of fs.existsSync(stash) ? fs.readdirSync(stash) : []) fs.renameSync(path.join(stash, f), path.join(storeDir, f)); };
const dropNewStore = () => { for (const f of fs.readdirSync(storeDir).filter((f) => isCache(f) && fs.statSync(path.join(storeDir, f)).isFile())) fs.unlinkSync(path.join(storeDir, f)); };

function run(cfg, seed) {
    const extra = cfg.mode === 'off' ? [] : ['--store'];
    const r = spawnSync('node', [path.join(here, 'bench-lag.js'), '--scenario', scenario, '--bots', bots, '--seconds', seconds, '--map', map, '--seed', String(seed), '--label', cfg.label, '--plugin', cfg.dir, ...extra], { encoding: 'utf8', maxBuffer: 1e8, cwd: root });
    const line = (r.stdout || '').split('\n').find((l) => l.startsWith('JSON '));
    if (!line) { console.log(`FAILED ${cfg.label} seed ${seed}:\n${(r.stdout || '').slice(-600)}\n${(r.stderr || '').slice(-600)}`); return null; };
    const m = (r.stdout || '').match(/path search: (\d+) searches, (\d+)ms/);
    return { ...JSON.parse(line.slice(5)), searches: m ? +m[1] : 0, searchMs: m ? +m[2] : 0 };
}

const rows = [];
for (const cfg of configs) {
    const results = [];
    for (const seed of seeds) {
        if (cfg.mode === 'cold') hideStore();
        try { const r = run(cfg, seed); if (r) results.push(r); }
        finally { if (cfg.mode === 'cold') { dropNewStore(); restoreStore(); } }
    };
    if (results.length) rows.push([cfg.label, results]);
}

const avg = (rs, k) => rs.reduce((a, r) => a + r[k], 0) / rs.length;
const max = (rs, k) => Math.max(...rs.map((r) => r[k]));
console.log(`\n${scenario} x${bots} on ${map}, ${seconds}s simulated per run, seeds ${seeds.join(',')}  (tick budget 16.7ms)`);
console.log('configuration'.padEnd(24) + 'avg tick'.padStart(10) + 'p95'.padStart(8) + 'p99'.padStart(8) + 'worst'.padStart(9) + 'late ticks'.padStart(12) + 'stalls>50'.padStart(11) + 'debt (s)'.padStart(10) + 'searches'.padStart(10) + 'search ms'.padStart(11) + 'kills'.padStart(7));
for (const [label, rs] of rows) {
    console.log(label.padEnd(24)
        + (avg(rs, 'avg').toFixed(2) + 'ms').padStart(10) + avg(rs, 'p95').toFixed(1).padStart(8) + avg(rs, 'p99').toFixed(1).padStart(8)
        + (max(rs, 'worst').toFixed(0) + 'ms').padStart(9) + ((100 * avg(rs, 'lagTicks') / rs[0].totalTicks).toFixed(1) + '%').padStart(12)
        + avg(rs, 'stalls').toFixed(0).padStart(11) + (avg(rs, 'debt') / 1000).toFixed(2).padStart(10)
        + avg(rs, 'searches').toFixed(0).padStart(10) + avg(rs, 'searchMs').toFixed(0).padStart(11) + avg(rs, 'kills').toFixed(0).padStart(7));
}
console.log('\nper seed (avg tick ms / worst tick ms):');
for (const [label, rs] of rows) console.log(label.padEnd(24) + rs.map((r) => `${r.avg.toFixed(1)}/${r.worst.toFixed(0)}`).join('   '));
