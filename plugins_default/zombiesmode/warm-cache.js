// Fills deadinternet's on-disk pathfinding cache for the zombies' speeds, one map after another, so a server does not have to work it out
// live: the first searches on a map are what make a slow machine (a Pi 4, say) hang for a second at a time, and the cache is kept per
// speed (rounded to 0.1), so the warm-up the bots' usual speed gets does nothing for zombies. It does each speed a zombie is at: its usual
// one and the sudden death one. Run it once per machine (the cache is in
// plugins_default/deadinternet/store/ and is only kept while the physics and pathfinding code are unchanged).
//
// Run with: node plugins_default/zombiesmode/warm-cache.js [--searches N] [map name ...]     (the maps the mode is played on, by default)

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZombiesModeDefaults, ZombiesModeMaps } from './shared.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const bench = path.join(here, '..', 'deadinternet', 'bench-pathfinding.js');

const args = process.argv.slice(2);
const at = args.indexOf('--searches');
const searches = at < 0 ? 2000 : Number(args.splice(at, 2)[1]);

const maps = args.length ? args : ZombiesModeMaps;

const d = ZombiesModeDefaults;
const speeds = [d.zombieSpeed, d.suddenDeathSpeed]; //(the exact speeds: what is checked is the move at that speed, shared by the whole 0.1 either side)

for (const map of maps) {
    for (const speed of speeds) {
        console.log(`\n== ${map} (${searches} searches at speed ${speed})`);
        const run = spawnSync(process.execPath, [bench, map, '--store', '--warm', String(searches), '--speed', String(speed)], { stdio: 'inherit' });
        if (run.status !== 0) console.log(`(${map} at ${speed} failed with ${run.status})`);
    };
};
