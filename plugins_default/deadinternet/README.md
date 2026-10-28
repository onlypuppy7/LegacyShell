# DeadInternet

Bot players for your game. They **walk the map** (ramps, jumps, falls, ladders), **fight** (aim, shoot,
strafe, take cover, throw grenades, hear gunfire, restock, heal), and come in any skill from a target
dummy to a nightmare - all of it customisable per bot from a chat command. Underneath is a
general-purpose **A\* pathfinding engine** over the game's real voxel collision grid, which other
plugins can use on its own.

Everything is admin-only. `/bots add` and `/botsdebug field` count as cheats; an admin running one with
cheats off turns them on automatically.

```
/bots add 5 hard                      # five hard bots, hunting the humans in the room
/bots add easy role=ally              # an easy bot that follows you and fights what you fight
/botsdebug field squad 16             # a whole field: you + allies vs enemies
/bots clear                           # remove them all again
```

## Commands

| Command | What it does |
|---|---|
| `/bots add [count] [difficulty or skill] [option=value ...]` | Spawn combat bots (up to 18 per command). A difficulty is a preset name (`dummy`, `easy`, `normal`, `hard`, `nightmare`) or a number 0-1 (`0.7`, `70%`, `skill=0.7`). Every behavior is an option - see [Combat](#combat). |
| `/bots clear [count]` | Remove bots from the room, newest first; no count removes them all. |
| `/bots presets [preset or skill]` | What each preset (or any skill value) works out to. |
| `/bots options [filter]` | Every option with its range and default; the ones marked "follows skill" scale with the difficulty. |
| `/botsdebug field [scenario or list] [total] [option=value ...]` | Fill the room from a ready-made scenario (up to 40 bots) - see [Fields](#fields-botsdebug-field). |
| `/botsdebug perf [start [seconds] or report or stop or reset]` | Profile the bot AI: where the time goes. See [Performance](#performance). |
| `/botsdebug cache [stats or save or clear]` | The saved pathfinding cache for this map. See [Performance](#performance). |
| `/botsdebug pathtest` | One bot that wanders forever between random spawn points, announcing each route in chat. |
| `/botsdebug pathtestme` | A bot that paths to where you are standing. |
| `/botsdebug pathtestpair <fromIdx> <toIdx>` | Re-run one specific spawn-to-spawn leg. |
| `/botsdebug pathtestraw <fromX fromY fromZ toX toY toZ>` | The same between two exact coordinates (cell + 0.5 for the centre). |
| `/botsdebug pathtestall [maxLegs]` | Exhaustive check of pathfinding between every spawn point on the map. |
| `/botsdebug pathtestcheckpoints [from to]` | Runs a bot through the map's parkour route (`checkpoint1` ... `goal`), or just the legs between two named checkpoints. |
| `/botsdebug beginmanualrecording` | Records your own run through the same route (full-resolution position/velocity/controls) to `store/deadinternet/recordings/`, as a reference for what a working traversal looks like. Run it again to discard and restart. |

The `pathtest*` commands are debug tools for the pathfinder: they report to chat and the server log
rather than affect gameplay. `pathtest` spawns its bot at random spawn points on purpose - spawn points
are scattered around the map, so routes between them reliably exercise ramps, jumps, falls and ladders
without you having to stand somewhere awkward first.

## Files

| File | Role |
|---|---|
| `index.js` | The plugin's public API surface. Other plugins should import from here. |
| `pathfinding.js` | The A\* engine. Takes a `room`-shaped object and plain `{x,y,z}` positions; knows nothing about bots. |
| `physicsSimulation.js` | Verifies candidate moves by running them through the real player physics, so the planner only offers moves a bot can actually make. |
| `combat.js` | The combat layer: option schema, skill curves and presets, target selection, aim, fire control, the controller. Engine-free like `pathfinding.js`. |
| `combat-tactics.js` | Hearing (`SoundTracker`), cover (`findCover`) and grenades (`solveGrenadeThrow`). Engine-free. |
| `combat-geometry.js` | Angle math, line of sight and ground checks shared by the two above. |
| `scenarios.js` | The `/botsdebug field` scenarios and the planner that turns one into a spawn list. |
| `geometryStore.js` | The on-disk pathfinding cache (`store/`, gitignored). |
| `perf.js` | The bot AI profiler behind `/botsdebug perf`. |
| `shared.js` | The chat commands, and the client-side plugin registration glue. Not the reusable API - see [Scope](#scope-indexjs-is-the-api-sharedjs-is-the-commands). |
| `bench-lag.js`, `bench-compare.js`, `bench-pathfinding.js` | Headless benchmarks - see [Performance](#measuring-it). |
| `bench-checkpoints.js` | Headless version of `/botsdebug pathtestcheckpoints` - see [Testing](#testing). |
| `test-*.js` | Tests - see [Testing](#testing). |
| `maps/` | The parkour/pathing test maps (JSON, with notes for some), inserted into the game's map list. |
| `CLAUDE.md` | Operational notes for iterating on this plugin (what the maps are for, what the author has ruled out, how to run things). |
| `PERFORMANCE-VALIDATION.md` | Notes from an earlier round of pathfinding performance work. |

## Scope: index.js is the API, shared.js is the commands

`index.js` (plus what it re-exports from `pathfinding.js` and `combat.js`) is meant to be the thing other
plugins import from:

```js
import { DeadInternetBot, findPath, isStandable, EDGE_TYPE, MOVEMENT_PROFILE } from '../deadinternet/index.js';
```

`shared.js` holds the chat commands. They are real working examples of driving a bot, kept separate so the
command surface doesn't blur into the API other plugins build against. Read it to see how to *use*
`DeadInternetBot`, but depend on `index.js`, not `shared.js`.

Note that `shared.js` is also spliced into the browser bundle (commands are registered on both sides), so
anything it uses **while defining a command** must exist in the browser; only the `executeServer` bodies
may use server-side imports. `test-client-registration.js` guards this.

## Pathfinding

### `findPath(room, start, goal, opts = {})`

A\* search from `start` to `goal` (both `{x, y, z}` world positions - a real `Player` works directly).
Returns an array of waypoints, or `null` if there is no path.

Each waypoint is `{ x, y, z, type }`: `x`/`z` are cell centers, `y` is the standing height at that cell, and
`type` (one of `EDGE_TYPE`) describes how to get from the *previous* waypoint to this one.

`opts`:
- `maxExpansions` (default `4000`) - search node budget before giving up.
- `avoidEdges` - a `Set` of `"x,y,z->x,y,z"` strings naming edges to skip entirely. Used by
  `DeadInternetBot`'s stuck recovery to route around an edge that turned out not to be traversable.
- `snapGoal` - if the goal isn't somewhere a bot can stand (a chased player mid-jump, on a prop the grid
  can't model), aim for the nearest cell that is (below it, else beside it) instead of giving up.
- `allowPartial` - if there is no complete route (budget spent, or the goal is walled off), return the route
  to the closest point the search reached, flagged `path.partial`, rather than `null`. A partial route that
  doesn't get meaningfully closer is still `null`.

The start position doesn't need to be exactly on a standable cell - the search looks around/below it first
(mid-jump, mid-fall, or right on a cell boundary).
Real players can also start on a prop's fractional standing surface; its verified height and footprint are kept for the first move.

With a real player available (the normal in-game case) every WALK/RAMP/JUMP/FALL candidate is **verified
by the real physics** (`physicsSimulation.js`) before the planner will use it; without one (the offline
tests) it falls back to static estimates.

### `EDGE_TYPE`

```js
{ WALK: 'walk', RAMP: 'ramp', JUMP: 'jump', FALL: 'fall', LADDER: 'ladder' }
```

- **WALK** - same-level move, 8-directional (includes diagonals).
- **RAMP** - one level up via a `wedge`/`iwedge` collider (cheap - no jump needed).
- **JUMP** - one level up via a standing jump, no ramp involved. Weighted heavily (cost `4` vs `1.1` for a
  ramp, `1` for a walk) because a standing jump clearing a full level is frequently unreliable in practice;
  the planner only reaches for one when there is genuinely no walk/ramp/fall route around it.
- **FALL** - walking off a ledge, landing up to `MOVEMENT_PROFILE.maxFallLevels` cells below. There is no
  fall damage, so these are allowed fairly liberally, cost-weighted by drop distance.
- **LADDER** - climbing a stack of `ladder` collider cells, including stepping off at the top.

### `MOVEMENT_PROFILE`

```js
{ maxJumpLevels: 1, maxFallLevels: 4, arrivalRadius: 0.3 }
```

These are **estimates** derived from `player.js`'s real movement constants, not exact physics. The physics
verification above is what actually decides a move; `DeadInternetBot.followPath()`/`checkStuck()` are what
make an imperfect value harmless at runtime rather than stranding a bot.

### Cell helpers

`isStandable(map, x, y, z)`, `isBlockingCell(cell)`, `isLadderCell(cell)`, `isRampCell(cell)` - lower-level
cell classification, exported in case a consuming plugin wants to reason about the grid directly.

### Collision model handled

Every real `colliderType` from `buildMapData` (`src/shell/loading.js`) is accounted for:

- `full` - blocks fully, no edge offered through it.
- `wedge` / `iwedge` - ramps; walkable up onto, and enable the cheap RAMP edge for an adjacent level-up.
- `aabb` / `obb` - custom collision geometry; stand heights come from the real collider, not the cell grid.
- `ladder` - climbable via dedicated LADDER edges, matched by `ry` between stacked ladder cells the same way
  `player.js`'s `lookForLadder` does, so the planner never offers a climb the physics would reject.
- `none` - passable, no collision.

### `DeadInternetBot` movement methods (`index.js`)

- **`pathTo(target, opts = {})`** - computes a route to `target` (anything with `x`/`y`/`z`, including a
  `Player`), or reuses the current one. Safe to call every tick to chase a moving target:
  - it keeps the current route while the goal hasn't moved further than a tolerance that grows with distance
    (a goal 20 blocks away may drift about 5);
  - it waits about half a second (jittered ±30%) between searches for a moving target;
  - after a failed search it **backs off exponentially** (0.6s, 1.2s, ... up to 6s) instead of retrying the
    same unreachable place every time the target steps to a new cell;
  - `opts.chase: true` (what the combat AI passes) snaps a mid-air goal to the floor under it, accepts a
    partial route, and searches with a budget that scales with distance;
  - `opts.force: true` always searches (the stuck recovery uses it); other `opts` pass through to `findPath`.
  Clears the bot's avoided-edges set when the destination itself changes.
- **`followPath(delta)`** - call once per tick to steer along the current route: sets yaw, holds forward,
  jumps on a JUMP edge. Returns `'idle'`, `'following'` or `'arrived'`.
- **`stopPath()`** - clears the route and all progress state.
- **`suspendPath()`** - puts the route aside (the combat AI does this while a bot fights) without discarding
  it; the next `pathTo()` for the same goal resumes it from the nearest waypoint if the bot is still near it,
  and searches afresh if the fight carried it away.

#### Self-correcting execution

`MOVEMENT_PROFILE`'s constants are estimates, and other players can wander into a planned route, so
`followPath()`/`checkStuck()` detect when a bot hasn't made horizontal progress in a while and react in stages:

1. **~600-900ms stuck** - a cheap `jump()` nudge (fixes most "blocked by a lip" cases).
2. **≥1800ms stuck** - blacklists the specific failing edge into the bot's `pathAvoidedEdges` and forces a
   replan. Blacklisting the exact edge matters: without it a replan from the same spot re-selects the same
   bad edge forever.
3. **Five stuck replans in a row** - gives up the route and clears the blacklist.

There is deliberately **no force-respawn recovery** any more: it used to fire every tick for a bot chasing an
unreachable target, producing a respawn storm.

## Combat

Bots can fight. Everything about how they do it is **one flat options object**. A difficulty is a
**skill rating** (0-1) that drives a whole family of those options, and any option can still be set by hand.

```
/bots add 3 hard aim=1.5 team=2 nickname=Gary
/bots add 5 0.7                     # a skill between hard and nightmare (also 70%, or skill=0.7)
/bots add easy role=ally            # follows you and fights what you fight
```

### Skill, presets and overrides

`dummy` (0), `easy` (.25), `normal` (.5), `hard` (.75) and `nightmare` (1) are just skill values.
`SKILL_CURVES` in `combat.js` says how each skill-driven option scales (reaction time, aim error, turn
rate, miss chance, sight, hearing, cover use, grenades, strafe unpredictability, focus fire, ...);
`/bots options` marks them "follows skill". A skill between two presets interpolates. Resolution order
is **schema defaults → skill curves → preset extras → explicit options**, so `hard aim=1.5` is "hard,
but sharper aim" and `skill=0.9 reaction=1` is "very good, but slow to react". Add your own preset from
another plugin with `registerPreset(name, { skill: 0.6, ...options })`.

Two things are deliberately NOT part of skill: **`aggression`** (personality: aggressive bots fight
closer, retreat later, hide less and chase longer; cautious ones the opposite) and **`variance`** (each bot
gets its own small random differences in reaction, aim, speed, hearing and aggression, so a group of
identical presets doesn't act identically).

Unknown options are errors (never silently ignored); out-of-range numbers are clamped with a warning.
Keys are case/underscore-insensitive and have short aliases (`aim`, `reaction`, `turn`, `fov`, `cone`,
`burst`, `sight`, `memory`, `lead`, `move`, `spray`, `cover`, `retreat`, `nades`, `hear`, `aggro`, `focus`).

Option groups (see `COMBAT_OPTIONS` in `combat.js` for ranges, defaults and descriptions):
role/allegiance (`role`, `targets`, `team` 0-2, `class`, `color`, `nickname`, `speed`, `damage`, `resistance`),
skill & personality (`skill`, `aggression`, `variance`), perception (`sightRange`, `fovDeg`, `peripheralDeg`,
`peripheralDelay`, `hearingRange`, `memoryTime`, `reactionTime`, `targetSwitchDelay`, `focusFire`), aim
(`turnRateDeg`, `aimErrorDeg`, `movePenalty`, `leadFactor`, `flinch`, `missChance`, `missAngleDeg`), fire
control (`holdFire`, `fireConeDeg`, `burstShots`, `burstPause`, `sprayControl`, `grenades`, `minFireRange`,
`maxFireRange`), movement (`engageMovement`, `preferredRangeMin/Max`, `strafeInterval`, `strafeVariance`,
`jumpChance`, `spacing`, `followDistance`, `huntRange`), survival (`useCover`, `retreatBelow`,
`resumeAbove`, `coverMaxTime`, `healthPacks`), weapons/lifecycle (`weapon`, `autoReload`, `autoSwap`,
`reloadBelow`, `restock`, `restockRange`, `respawnDelay`).

### Using it from another plugin

```js
const bot = new DeadInternetBot(room, { combat: { difficulty: 'hard', aimErrorDeg: 1 }, owner: somePlayer });
await bot.init();
bot.startCombatAI();   // default onUpdate/onDeath; or call bot.think(delta) from your own onUpdate
bot.remove();          // take it out of the room again
```

`CombatController.update(dt)` is pure decision-making: it returns a command (`engaged`, `yaw`,
`pitch`, `controls`, `fire`, `jump`, `reload`, `swap`, `grenade`, `moveTo`, `state`) and
`DeadInternetBot.applyCombat()` is the only thing that applies it to the real Player.

### How it behaves

**Seeing and noticing**
- **Line of sight** is a voxel ray over `room.map` (full/aabb/obb block; ramps and ladders don't).
  Scans run at ~6.7Hz per bot with randomized phase, not every tick.
- **Peripheral vision**: targets inside the `fovDeg` focus cone are noticed at once; ones in the wider
  `peripheralDeg` cone only after staying there for `peripheralDelay`; anything behind that isn't noticed at all.
- **Hearing**: only gunshots, grenade throws and explosions (nothing else makes noise). They're inferred
  from room state - a player's loaded rounds dropping, their grenade count dropping, a grenade or rocket
  vanishing - by one `SoundTracker` shared per room, so no core code is touched. A heard sound sends an idle
  bot to look at roughly (not exactly) where it came from; it never reveals where anyone actually is, friendly
  and own fire are ignored, and a bot already fighting something it can see ignores them. Explosions carry
  1.8x as far as gunshots, grenade throws 0.6x. Set `huntRange=1` to make bots rely on sight and sound alone.
- **Target switching**: whoever just hurt the bot becomes a priority target (and is investigated if unseen);
  otherwise it only drops its target for one clearly closer, and not before `targetSwitchDelay`.
- **Focus fire**: enemies share a per-room, per-team "squad focus" (whatever a squadmate has been fighting);
  an ally goes for whatever its owner is aiming at. `focusFire` is the chance a bot follows it.

**Aiming and shooting**
- **Fire control** only fires when the aim is within the cone of where the target really is (not the noisy
  aim point), the reaction time has elapsed, the weapon has ammo and isn't mid reload/swap.
- **Movement prediction**: linear lead. `leadFactor` shifts the aim point by the target's per-tick velocity
  (scaled by its own speed modifier) over the projectile's flight time, which comes from the weapon (a rocket
  is far slower than a bullet). It does not predict strafe reversals or jumps.
- **Movement penalty**: aim error grows with how much the bot and its target are moving (`movePenalty`).
- **Spray control**: skilled bots wait for the weapon's spread to settle (`player.shotSpread`) rather than spray.
- **Flinch** (subtle): being hit nudges the aim a few degrees and delays the next shot by a fraction of a second.
- **Missed shots**: each shot has a `missChance` of being aimed deliberately wide by `missAngleDeg` (never
  less than needed to clear the target's body at that range), firing only once the aim has settled on the
  wide point.
- **Every gun works.** Nothing is hardcoded per weapon: `weaponProfile()` derives how a gun should be
  fought from its own stats (range, velocity, spread, explosive radius, `readySpread`). Inaccurate guns
  (EggK-47, pistol, shotgun) are fought up close; CSG-1 and Crackshot's M24 from a distance; the RPEGG from
  mid range, clear of its own blast, aimed at the feet, and stationary until steady. With `weapon=auto` and
  `autoSwap` on, a bot swaps between its two weapons when the other suits the distance.
- **`class`** picks the weapon class (`default` = soldier, `random`, or any class name). The list is read
  live from the game's own class list, so a plugin that adds a class (Crackshot adds one) is selectable
  exactly when that plugin is loaded - `/bots options class` lists what's available now.
- **Grenades**: `grenades` is how readily it throws. `solveGrenadeThrow()` mirrors the real throw and
  flight physics to find a pitch and power that lands on the target, around walls, then the bot holds its
  aim still until the throw actually leaves (the real throw happens ~0.3s after queueing). Grenades only
  travel about 8 blocks on the level, so that's the window (never inside the blast radius, 4 blocks). It
  also lobs them at where a hidden enemy was last seen.

**Moving**
- **Engaged** (a hostile target is in sight): path following is paused (`suspendPath()`) and combat owns yaw
  and controls - `followPath()` steers by setting yaw toward the next waypoint and forward is relative to
  yaw, so the two can't drive it at once. Strafing/advancing/backing off is ledge-checked.
- **Smarter strafing**: with `strafeVariance` 0 it flips on a fixed beat; higher values vary the timing,
  stop to take shots, sometimes keep going the same way, and dodge the other way when hit. Precise
  single-shot guns (snipers) stand still to fire.
- **Spacing**: bots heading for the same target or owner each take their own spot around it, don't advance
  into a teammate standing in the way, and dodge sideways rather than stack.
- **Not engaged**: combat only supplies a destination (last seen position, a sound, the owner for allies,
  the nearest hostile for enemies) to the normal `pathTo()`/`followPath()` pair.

**Surviving**
- **Cover**: when badly hurt (`retreatBelow`) - or out of rounds in a fight with nothing else to switch to -
  the bot ducks behind the nearest spot the threat can't see (`findCover()`), holds it facing the threat
  while reloading or recovering (`resumeAbove`, or `coverMaxTime`), then walks back out to the last seen
  position: the peek. `useCover` and `aggression` decide how readily; if no cover exists it fights on.
- **Retreat**: hurt with no cover (or `useCover=0`), it backs away while still shooting back.
- **Health**: below the retreat threshold and with nothing in sight it fetches a health pack, if the room
  has any (the health pack item plugin adds them - no pack kind, no behavior).
- **Restocking**: when *every* weapon is completely dry and `restock` is on, the bot goes to the nearest
  ammo crate within `restockRange` (height counts double), walking straight at it once close because the
  server only collects an item within its half-block cell. A pickup or cover spot it can't path to is
  skipped for 10s.
- **Egg colour**: `color=<name or 0-13>` (white, ice, sand, orange, clay, rust, brown, red, purple, pink,
  yellow, blue, green, lime; or `random`). The game only lets subscribers pick colours 7-13 and treats a bot as
  a non-subscriber, so the bot sets it on its client directly and applies the loadout, which tells everyone
  in the room. A scenario can colour each team (`botwar` does: blue vs red, the game's own team colours).
- **Teams**: teammates and the owner are never targeted; team 0 is free-for-all. The game only has teams
  0, 1 and 2.

### Fields (`/botsdebug field`)

`/botsdebug field <scenario> [total up to 40] [option=value ...]` fills the room from a named
scenario in `scenarios.js` (`/botsdebug field list` shows them). A scenario is a set of weighted option
groups; the total is shared out between them, and any extra `key=value` applies to every bot
(`/botsdebug field mixed 20 skill=0.9`). Several make bots fight each other:

| Scenario | What you get |
|---|---|
| `mixed` | easy to nightmare enemies, assorted classes, all hunting the humans |
| `rookies` | very low skill, slow, miss a lot |
| `gauntlet` | hard/nightmare, aggressive, hunting the humans |
| `ffa` | free for all - bots fight each other **and** the humans |
| `teams` | bots split across teams 1/2, fighting each other and any human |
| `botwar` | a blue team (team 1) vs a red team (team 2) that fight each other and ignore humans, so you can watch |
| `squad` | you + allies (defend you) vs enemy bots that hunt everyone |
| `classes` | one group per weapon class that exists right now (incl. Crackshot if loaded) |
| `snipers` | Free Ranger / Crackshot campers that hold position, use cover and listen |
| `rushers` | max-aggression Scramblers, fast, jumping, grenade-happy |
| `dummies` | target dummies that never shoot |
| `stealth` | nobody hunts; half deaf, half keen-eared |
| `stress` | 30 varied bots in a free for all, to watch server tick rate |

`/bots clear` removes them again.

### Not yet implemented

Grenade use beyond the 3-8 block window, actively peeking from cover with pre-aim, and aim/movement
decoupling while pathing (see the engaged note above). Wave/horde gamemode logic belongs in a separate plugin
on top of this.

## Performance

The AI is cheap; **path searching is not** - a profile of 30 fighting bots put 98% of AI time in A\*, and
the AI at 96% of tick time. Four things keep that in check (all in `pathfinding.js`, `physicsSimulation.js`,
`geometryStore.js` and `DeadInternetBot.pathTo()`):

- **Collision answers are cached for the life of a room.** Every "would a bot fit here?" probe and every
  "can a bot get from A to B?" simulation depends only on the map and on how the bot moves, never on where
  anyone is, so each is computed once and shared by every bot and every search.
- **Whether a move works depends on the bot's speed**, gravity, jump boost and size, so physics verdicts are
  cached per physics profile (speed rounded to 0.1). They used to be shared across all bots, which let the
  first bot to verify an edge decide it for everyone (at speed 1.0 only 14 of 40 Castle routes matched
  the speed-0.6 ones). Physics speed is not part of it (it only changes how fast time passes, not the arc),
  and a bot can search as another body (`bot.pathAs`, e.g. `{ scale: 1 }`) to share that body's routes and cache.
- **The cache survives restarts** (`store/<map>-<fingerprint>.json.gz`, gitignored): loaded when the first
  bot joins, saved every 30s while it is still learning. The file is only used if the map and the
  collision/physics/pathfinding code are byte-for-byte what produced it; anything else is ignored (so after
  any change to those files, the first run on each map is cold again). A gzipped file is 0.2-0.9MB per map
  (7MB of JSON for Castle); loading holds the game loop for about 100ms once, a save about 120ms (building and
  stringifying the JSON - gzipping runs off-thread). Fill it in advance, offline, with
  `node plugins_default/deadinternet/bench-pathfinding.js <map> --store --warm 3000`;
  `/botsdebug cache [stats|save|clear]` manages it in-game. A game server also fills it itself when it has had no rooms for 20s (`idlewarm.js`, in a worker thread that is killed when a room is made); other plugins say what to warm by pushing `{ maps, modifiers, searches, priority }` to `data.jobs` in the `idleWarmJobs` event.
- **Searching less.** `pathTo()` reuses a route while the goal hasn't moved further than a tolerance that
  grows with distance, keeps a route through a fight (suspended, then resumed) instead of discarding it,
  waits ~0.5s between searches for a moving target, and backs off exponentially after a failed search
  (see [`pathTo`](#deadinternetbot-movement-methods-indexjs)). Chasing bots also snap a mid-air goal to the
  floor beneath it and settle for the closest reachable point, so nothing is unreachable-and-frozen and a
  failing search can't burn thousands of expansions.

### Measured

Headless, Castle, 30 `stress` bots, 25 simulated seconds, averaged over 3 seeds (tick budget 16.7ms; "debt"
is how far behind real time the lagging ticks add up to):

| | avg tick | p95 | p99 | worst | late ticks | debt |
|---|---|---|---|---|---|---|
| original | 16.9ms | 83.9 | 277 | 1173ms | 17.0% | 18.0s |
| new code, empty cache | 4.4ms | 9.2 | 80 | 522ms | 3.2% | 3.5s |
| new code, warm cache | 2.4ms | 5.5 | 32 | 294ms | 1.8% | 0.8s |

On a live server, `/botsdebug perf start 15` with a `stress` field went from ~10.5 bots using 59% of wall
time (AI windows p95 371ms, worst bot step 683ms) to ~28.7 bots using 9.6% (p95 30ms, worst step 87ms).

### Measuring it

```bash
# profile the bot AI in a live room (then: report | stop | reset)
/botsdebug perf start 15

# the stress test you'd do in the browser, headless, on a virtual clock (30 simulated seconds in a few real ones)
node plugins_default/deadinternet/bench-lag.js --scenario stress --bots 30 --seconds 25 --map Castle [--store]

# before vs after, across several seeds, one table
node plugins_default/deadinternet/bench-compare.js --seeds 1,2,3 \
    "before=plugins_default/deadinternet/store/baseline" "after cold=.:cold" "after warm=.:warm"
```

`bench-lag.js` boots a real room and drives its real update loop, so every tick is the real cost of that tick;
it reports tick time (avg/p95/p99/worst against the 16.7ms budget), late ticks and the "debt" they add up to,
the six worst ticks and what was in them, the AI profile, why searches ran, and kills/deaths/movement as a
sanity check that a speed-up didn't make the bots dumb. To compare against code as it was, copy the plugin's
`.js` files into `store/baseline` (gitignored), put the old version of whatever you changed in there, and
name it in `bench-compare.js`. Run the benchmark scripts one map per process.

## Testing

Offline - no server needed, and safe to run any time:

| File | Covers |
|---|---|
| `test-pathfinding.js` | `findPath` on synthetic maps: flat floor, wall with a gap, jumpable parapet, an unclimbable wall (correct refusal), a ramp, a ladder shaft, a sealed goal, an imprecise start, `isStandable`. |
| `test-physics-contracts.js`, `test-deferred-verification.js`, `test-support-probes.js`, `test-arrival-probe-cost.js`, `test-precise-arrival.js`, `test-corner-steering.js`, `test-ladder-state.js` | The physics verification and path execution contracts: what counts as arriving, supported footing, ladder catches, corner steering, how edges are verified and cached. |
| `test-path-economy.js` | `pathTo`: route reuse, the search floor, backoff, goal snapping, partial routes, suspend/resume, and how the combat AI uses them. |
| `test-geometry-store.js` | The on-disk cache: round trip, stale/corrupt files, merging between rooms, gzip vs plain, autosave, and speed-keyed physics verdicts. |
| `test-combat.js` | The combat layer: options/presets/skill, argument parsing, line of sight, targeting, aim, fire control, every gun, hearing, peripheral vision, cover, grenades, strafing, egg colours, and every field scenario. |
| `test-perf.js` | The profiler and its hooks. |
| `test-commands.js` | The real chat command handlers with a fake player: parsing, validation, listings. |
| `test-client-registration.js` | Loads `shared.js` the way the browser bundle does and checks every command still registers (a stray server-only name there silently hides commands). |

```bash
node plugins_default/deadinternet/test-combat.js        # (any of the above)
```

**Headless, boots a real room** (slow - one map per process, no game server needed):

| File | Does |
|---|---|
| `bench-checkpoints.js` | Runs a map's parkour checkpoint route exactly as `/botsdebug pathtestcheckpoints` does, on a virtual clock (seconds, not minutes), and reports each leg: first try / needed stuck recovery / timed out / no path. `--plugin <dir>` runs another copy of the plugin's files (e.g. `git show <rev>:<file>` extracted into `store/versions/<name>/`), which is how to tell whether a change broke a route; `--speed <n>` forces the bot's speed. |

A bot that is only set up with `init()` (the debug and pathtest bots, or any plugin that just wants a bot to navigate) keeps the game's default physics. The combat options that change the Player itself (speed, damage, resistance) are applied only when the combat AI starts - a bot slowed to a combat skill's speed can't make the jumps a parkour route needs, and the pathfinder, which verifies every move against the bot's real physics, correctly reports no path.

**Live** - these connect to a *running game server* (default `localhost:13372`) as a raw WebSocket client,
join a room and run chat commands, so **never run them casually or in a loop over every `test-*.js`**:

| File | Drives |
|---|---|
| `test-ingame.js` | `/botsdebug pathtest` - one bot wandering between random spawn points. A quick smoke test on any map. |
| `test-allspawns.js` | `/botsdebug pathtestall` - all-pairs connectivity, then a live tour of every spawn. |
| `test-checkpoints.js` | `/botsdebug pathtestcheckpoints` against a map's parkour route (`TEST_MAP=<map>` required). |

The actual proof is the **game server's own console output** (route plan, arrivals, stuck/replan events) -
these scripts deliberately don't parse incoming payloads. Confirmed via repeated live runs against the "Two
Towers" map: consistent successful arrivals in the 14-16 second range, including routes needing ramps, falls
and (when unavoidable) jumps, with automatic recovery via the replan/avoid-edge mechanism on the rare edge
that didn't clear as estimated.

**Gotchas if you're testing from a non-git-cloned working copy** (e.g. a scratch/throwaway server instance):
- Every plugin folder must be its own git repo with at least one commit - the plugin loader
  (`src/shell/plugins.js`) silently skips (never instantiates) any plugin whose `git rev-parse HEAD` fails,
  with no fatal error.
- A raw WS test client needs to send `requestRespawn` before it has a real position - without it, a target of
  `(0,0,0)` isn't on the map and `findPath` will (correctly) refuse it as unreachable.
- Chat messages must be packed with `packLongString`, not `packString` - `client.js`'s chat handler reads a
  2-byte length prefix; the 1-byte-prefix `packString` garbles the text.
