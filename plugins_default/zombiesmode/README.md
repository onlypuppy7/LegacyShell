# ZombiesMode

Adds a **Zombies** gamemode: a horde of slow bots walks at the humans and bites them. A human who dies, or leaves the fight through the menu, is **infected** and joins the horde. Last human standing wins, or the humans win by outlasting the round.

Needs the DeadInternet plugin (the zombies are its bots).

## How a round goes

- Timed rounds (3 minutes), on the maps in the `Teams` pool. Humans are team 1, the horde is team 2. Nobody can switch teams.
- **Everyone is spawned into the round the moment it starts**, whether or not they pressed PLAY (the browser closes the menu and takes the pointer lock for them; if the browser refuses the lock without a click, the first click on the game does it). The horde follows after a head start (`headStartSecs`, 6) and spawns spread over `staggerSecs` (8), so nobody spawns into a horde that has already walked to the spawn.
- The room keeps `count` (20) zombie bots in play while at least one human is in it. A killed zombie comes back after a few seconds. Zombies (the bots and the infected) spawn at a random spawn point with no human within `spawnClearRadius` (12 blocks, at most 40% of the map's size), so the horde is spread around the map rather than appearing on top of anyone.
- **Unreachable humans**: someone on a tower nothing can walk up to is still the target. Zombies search harder for a way (`searchBudget`), walk to the closest point they can reach, and when they are going somewhere but not getting anywhere (standing at a ledge they will not step off while in sight, or at the end of the route to the closest point) they walk straight at the human and jump at whatever is in the way, so the horde piles up against the foot of the tower instead of standing about.
- A zombie is about as tough as a player, walks at about half speed, never shoots, does no aiming (it turns straight to face you) and walks right into you rather than stopping a gun's distance away, and knows where the humans are from anywhere on the map. It bites by touching: team 2's `contactDamage` (15) hits on a half second cooldown. Touching comes from the core `contactDamage` game option (hp per hit, per team, 0 = off; `/contactDamage` sets it), with `contactCooldown` and `contactReach` alongside.
- A human who dies switches to team 2 and respawns as a zombie, with about 75 hp, a bite and no gun.
- **Leaving through the menu infects you too**: pressing escape and respawning is not a way out. (The game takes you out of play a few seconds after you press escape; that is what is noticed.)
- Someone who first spawns more than `graceSecs` (30) into a round comes in as a zombie.
- The round ends early when the last human is infected (the horde wins). Otherwise, when the timer runs out, the surviving humans win and are paid `winEggs` each.
- **Sudden death** starts when one human is left of two or more, or for a player on their own when `suddenDeathSecs` (60) are left: it turns to night and a storm, and every zombie is `suddenDeathSpeed` (1.4x) faster. Each lightning strike then also makes the horde lunge for `surgeSecs` (2) at `surgeSpeed` (1.5x), via legacyweather's `thunderStrike` event. The weather and time are put back when the round ends.
- A new round cures everyone.

Infections and round results go to the room's chat (green lines from the server); only sudden death gets the on-screen pop-up.

## Eggs

The usual per-kill reward is replaced: a human earns `killEggs` (2) per zombie killed, up to `eggCap` (100) a round, and nothing for anything else. Nothing is paid in rooms with cheats on. This uses the `scoreKillEggs` event.

## Settings

Everything is in `gameOptions.plugins.zombies` (the gametype sets the defaults in `shared.js`):

| Setting | Default | Does |
|---|---|---|
| `count` | 20 | zombie bots kept in the room |
| `headStartSecs` | 6 | how long into a round before the first zombie spawns |
| `staggerSecs` | 8 | how long the horde takes to spawn in, spread out |
| `spawnClearRadius` | 12 | zombies only spawn at spawn points with no human this close (blocks) |
| `searchBudget` | 5000 | how hard a zombie looks for a way to someone (path search steps) |
| `zombieSpeed` | 0.55 | zombie bots' speed modifier |
| `zombieResistance` | 1 | zombie bots' resistance (it divides damage taken: 1 is a normal player, 0.5 dies twice as fast) |
| `graceSecs` | 30 | how far into a round a new human still joins as a human |
| `respawnSecs` | 6 | how long a killed zombie takes to come back |
| `killEggs` | 2 | eggs per zombie killed |
| `eggCap` | 100 | most kill eggs one player can earn in a round |
| `winEggs` | 20 | eggs for each survivor when the humans win |
| `suddenDeathSecs` | 60 | when sudden death comes at the latest for a lone player |
| `suddenDeathSpeed` | 1.4 | zombie speed multiplier in sudden death |
| `surgeSpeed` / `surgeSecs` | 1.5 / 2 | the lunge on each lightning strike in sudden death (1 = off) |

The horde's team options (`damageModifier`, `contactDamage`, `contactCooldown`, `contactReach`, `resistanceModifier` for the infected) are on the gametype too. The bots' own behaviour is the `zombie` preset, registered in `index.js` with DeadInternet's `registerPreset`, so it can be tried out anywhere with `/bots add 5 zombie`.

## Testing

```bash
node plugins_default/zombiesmode/test-zombies.js [map]
node plugins_default/zombiesmode/test-client-registration.js
```

`test-zombies.js` boots a real room headlessly with stand-in humans: the gametype, the horde and its head start, eggs, infection (by dying, by leaving through the menu, by joining late), sudden death, both ways a round can end, the next round (including everyone being spawned into it), where zombies spawn, whether they reach and bite a standing human, and whether they crowd up against a human on a tower they cannot walk up (`NOSWARM=1` turns the walk-straight-at-them part off to compare). Takes a minute or so.

`test-client-registration.js` loads `shared.js` the way the browser bundle does and checks the gametype registers and the browser-side spawn behaves, with no server.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
