# ZombiesMode

Adds a **Zombies** gamemode: a horde of slow bots walks at the humans and bites them. A human who dies, or leaves the fight through the menu, is **infected** and joins the horde. Last human standing wins, or the humans win by outlasting the round.

Needs the DeadInternet plugin (the zombies are its bots) and the Modern Shell Hats plugin (the ghosts wear its Ghost Hat).

## How a round goes

- Timed rounds (3 minutes), on the maps in the `Zombies` pool: `ZombiesModeMaps` in `shared.js` (Blue, Castle, Dirt, Feedlot, Moonbase, Ruins, Shellville, Shipyard, Two Towers). The plugin hooks services' `insertMaps` event, which fires for each map as it goes into the database on every services start, and adds a `Zombies` mode to those maps' `modes` (the gametype's `mapPool`); the other maps are not touched, so they never come up for this mode. Humans are team 1, the horde is team 2. Nobody can switch teams.
- **Everyone is spawned into the round the moment it starts**, whether or not they pressed PLAY (the browser closes the menu and takes the pointer lock for them; if the browser refuses the lock without a click, the first click on the game does it). The horde follows after a head start (`headStartSecs`, 6) and spawns spread over `staggerSecs` (8), so nobody spawns into a horde that has already walked to the spawn. A human who still has not spawned in `spawnFailsafeSecs` (15) after the round started (or after they joined it) is infected.
- The room keeps `count` (20) zombie bots in play while at least one human is in it. A killed zombie comes back after a few seconds. Zombies (the bots and the infected) spawn at a random spawn point with no human within `spawnClearRadius` (12 blocks, at most 40% of the map's size), so the horde is spread around the map rather than appearing on top of anyone.
- **WAITING...** is shown in the middle of the screen to someone who is in play while it is the gap between two rounds. That is only ever someone who has joined during the gap: everyone in the room when a round ends is taken out of play, and the game does not let you spawn again until the next round starts. They are put into the next round when it starts. Whether it is the gap is sent by the server in the room params (`gameOptions.plugins.zombiesInterim`), rather than the browser working it out from the game's own round state, which depends on which packets it happened to be there for.
- **Getting to you**: a zombie only walks straight at someone it can see when they are level with it, not far, and there is ground all the way: a gap or a drop in between is for the route to cross (a bot in sight never follows a route, and its ledge guard would leave it standing at the edge for good). Someone higher up (a ledge, stairs, a roof) is gone to by route, which is what takes it up there, rather than standing below looking up; and it always knows where the humans are, so it never wastes time going to where it last saw one. Walking straight is never off an edge unless the human is down there.
- **Ghosts**: one in every 6 of the horde (`ghostRatio`, spread evenly: the 6th, the 12th...) is a ghost instead of a zombie. A ghost has **noclip** (the base game's modifier), so it floats straight through walls: no pathfinding, it just points at whoever is nearest and moves at them in a straight line, at a constant speed on all three axes. It is white and see-through (a copy of the shared player shader with a constant alpha, for the body, hands and hat), wears the Ghost Hat (`ghostHat`, an item id from modernshellhats; 0 for none), is slower than a zombie (`ghostSpeed` 0.5, about half the pace of a walking player), bites for less (`ghostBite` 8) and has `ghostResistance` (0.7). It is shot, killed and paid for like any zombie. In sudden death it speeds up by the same factor as the zombies do, so it stays slower.
- **Brutish and small zombies**: of the rest of the horde, 1 in 10 (`brutishRatio`) is brutish and 3 in 20 (`smallRatio`) small, spread evenly like the ghosts. A brutish one has big hands, a `physicsSpeedModifier` of 0.7 (not `speedModifier`, which would throw the pathfinding off), five times a zombie's resistance and a bite 1.25x as hard, a tan egg and an Axe-in-head hat (`brutishHat`). A small one has a `physicsSpeedModifier` of 1.25, half the bite and a scale of 0.5, which also halves its health (damage taken is divided by scale), a pinkish grey egg and Devil Horns (`smallHat`). Their egg colours go out through legacyshellcore's `setEggColor`.
- **Unreachable humans**: someone on a tower nothing can walk up to is still the target. Zombies search harder for a way (`searchBudget`); if there is none they try the blocks in the 5x5 columns around the human, closest to them first, and go to the first that has a route; and close to someone they cannot quite reach (above them, or just standing short) they jump now and then (about once every 3 seconds on average), and when they are going somewhere but not getting anywhere (standing at a ledge they will not step off while in sight, or at the end of the route to the closest point) they wander off to a random spot 3 to 8 blocks away for a few seconds, then try the route again, so the horde does not stand about (or pile up) on the one point.
- A zombie has about 70 HP (about 2 rifle hits), walks at about 60% of a human's speed (humans are 1.1), never shoots, does no aiming (it turns straight to face you) and walks right into you rather than stopping a gun's distance away, and knows where the humans are from anywhere on the map. It bites by touching: team 2's `contactDamage` (15) hits on a half second cooldown. Touching comes from the core `contactDamage` game option (hp per hit, per team, 0 = off; `/contactDamage` sets it), with `contactCooldown` and `contactReach` (how far past the two bodies just touching still counts, 0.1) alongside.
- A human who dies switches to team 2 and respawns as a zombie, with about 60 HP (they are faster and cleverer than the bots, so they break more easily), a bite and no gun.
- **Leaving through the menu infects you too**: pressing escape and respawning is not a way out. (The game takes you out of play a few seconds after you press escape; that is what is noticed.)
- Someone who first spawns more than `graceSecs` (30) into a round comes in as a zombie.
- The round ends early when the last human is infected (the horde wins). Otherwise, when the timer runs out, the surviving humans win and are paid `winEggs` each. **When the humans win the whole horde (the bots and the infected) dies**, one after another `victoryGapMs` (100) apart, credited to a survivor in the kill feed but not scored; nothing bites or comes back while that happens, and the round ends `victoryHoldMs` (1500) after the last one goes. (The plugin takes over the room's round timer to be able to do this: the round ends through `roundTimeUp` in `index.js`.)
- **The sky** (with legacyweather): a round starts as an ordinary day, and within about 45 seconds (`dayHoldSecs` 4, then `darkenSecs` 40) has turned into a dark, stormy dusk with rain, wind and the odd bolt. From there it slowly gets darker and the storm builds, reaching night and a heavy storm by the end of the round. The clients blend between the few states the server sends, so it is a smooth change rather than steps. It goes back to the room's own weather when the round ends. `weatherArc: false` leaves the weather alone.
- **Sudden death** starts when one human is left of two or more, or for a player on their own when `suddenDeathSecs` (60) are left: it goes to full night in a downpour with lightning every second or two, and every zombie (the bots and the infected) goes up to `suddenDeathSpeed` (1.15). The humans get a little quicker too: `suddenDeathHumanSpeed` (+0.2, so 1.3) and a `suddenDeathReload` (1.3) reload, up from the 1.2 reload they have the rest of the round (`reloadSpeedModifier` in the gametype).
- A new round cures everyone.
- **Health packs** (from the healthpackitem plugin, when it is loaded) spawn in this gamemode, for the humans, at a quarter of the usual rate (one per 240 blocks of map, at least one). Health packs, ammo and grenades are for the humans only: the horde walks over them without taking anything.

Infections and round results go to the room's chat (green lines from the server); only sudden death gets the on-screen pop-up.

## How zombies look

Everyone on the horde (the bots and the infected, anywhere in the browser, including your own view if you are infected) looks the part. This is browser-only code in `zombievisuals.js`, spliced into the client bundle next to `shared.js`, which wraps the game's `PlayerActor` update and its hands-to-gun step; nothing about a human changes.

- **A stumble** instead of the egg's even wobble: one turn of its own phase is a left step and a right, rolling the egg over one way then the other (some steps worse than others, with a harsher second beat), hunched forward and nodding, twisting against the roll, and dropping hard on the heavy side as if that foot is being dragged. It goes both ways evenly, counts up continuously rather than following the game's walk cycle (which wraps and made the first version jump and lean one way), scales with how fast they are going, and a standing zombie only sways a little.
- **No gun** in hand.
- **Both hands the open hand from the model**, held out in front, fingers straight forward, palms down, thumbs in, drooping a little at the wrist and swaying with the steps. The model's `hands` mesh is two hands in one skinned mesh (the right one closed round a grip, the left open under the foregrip), so the zombie's is built once from its data: the left hand, and a mirrored copy of it skinned to the right hand's bone. The bones are posed directly. How to turn the hand square on is worked out from the model's own bone frame for it (its local z is the fingers and y the thumb, and as that bone is a mirror there is exactly one proper rotation that points them forward and in, which for a left hand has to be palm down), not by eye; the right bone is set so its hand is the left one exactly mirrored. Both are checked against the model's data in the tests.

- **Ghosts** (anyone on the horde with noclip, which the server sets on them and nothing else in the gamemode, synced to everyone like any modifier) do not stumble: they lean forward a little and float just off the ground, bobbing and swaying slowly, with the same open hands out in front.

## Eggs

The usual per-kill reward is replaced: a human earns `killEggs` (2) per zombie killed, up to `eggCap` (100) a round, and nothing for anything else. Nothing is paid in rooms with cheats on. This uses the `scoreKillEggs` event.

## Settings

Everything is in `gameOptions.plugins.zombies` (the gametype sets the defaults in `shared.js`):

| Setting | Default | Does |
|---|---|---|
| `count` | 20 | zombie bots kept in the room |
| `weatherArc` | true | the darkening, building storm over the round (needs legacyweather) |
| `dayHoldSecs` / `darkenSecs` | 4 / 40 | how long it stays day, then how long the turn to dusk takes |
| `victoryGapMs` / `victoryHoldMs` | 100 / 1500 | when the humans win: how far apart the horde dies, and how long after the last one the round ends |
| `spawnFailsafeSecs` | 15 | a human who has not spawned into the round by then is infected |
| `headStartSecs` | 6 | how long into a round before the first zombie spawns |
| `staggerSecs` | 8 | how long the horde takes to spawn in, spread out |
| `spawnClearRadius` | 12 | zombies only spawn at spawn points with no human this close (blocks) |
| `searchBudget` | 1500 | how hard a zombie looks for a way to someone (path search steps: a failed search spends all of them) |
| `searchBudgetMs` | 6 | once the horde's route searches have taken this many ms in a tick, the others wait for a later one |
| `zombieSpeed` | 0.65 | zombie bots' speed modifier. Not much lower than this: how far a bot can jump depends on its speed, and a two block gap tried from a four block run-up is too wide at 0.6 (and 0.62 is enough) |
| `ghostRatio` | 1/6 | the share of the horde that are ghosts |
| `ghostSpeed` / `ghostResistance` | 0.5 / 0.7 | a ghost's speed modifier (1 is the pace of a walking player) and resistance |
| `ghostBite` | 8 | hp a ghost's touch takes |
| `brutishRatio` / `smallRatio` | 0.1 / 0.15 | the share of the horde that are brutish / small |
| `brutishPhysics` / `brutishResistance` / `brutishDamage` | 0.7 / 3.5 / 1.25 | a brutish one's physics speed, resistance and bite multiplier |
| `smallPhysics` / `smallDamage` / `smallScale` | 1.25 / 0.5 / 0.5 | a small one's physics speed, bite multiplier and scale |
| `brutishColor` / `smallColor` | rgb | egg colours (0-255) |
| `zombieColor` | rgb | egg colour of the plain zombie bots (0-255) |
| `ghostHat` | 50244 | the item id of a ghost's hat (Ghost Hat); 0 for none |
| `zombieResistance` | 0.7 | zombie bots' resistance (it divides damage taken: 1 is a normal player, 0.5 dies twice as fast) |
| `graceSecs` | 30 | how far into a round a new human still joins as a human |
| `respawnSecs` | 6 | how long a killed zombie takes to come back |
| `killEggs` | 2 | eggs per zombie killed |
| `eggCap` | 100 | most kill eggs one player can earn in a round |
| `winEggs` | 20 | eggs for each survivor when the humans win |
| `suddenDeathSecs` | 60 | when sudden death comes at the latest for a lone player |
| `suddenDeathSpeed` | 1.15 | the zombies' speed in sudden death (the speed itself, for the bots and the infected alike) |
| `suddenDeathHumanSpeed` | 0.2 | added to the humans' speed in sudden death |
| `suddenDeathReload` | 1.3 | the humans' reload speed modifier in sudden death |

The horde's team options (`damageModifier`, `contactDamage`, `contactCooldown`, `resistanceModifier` for the infected) are on the gametype too. The bots' own behaviour is the `zombie` preset, registered in `index.js` with DeadInternet's `registerPreset`, so it can be tried out anywhere with `/bots add 5 zombie`.

## Testing

```bash
node plugins_default/zombiesmode/test-zombies.js [map]    # Two Towers by default
node plugins_default/zombiesmode/test-client-registration.js
```

## Running it on a slow machine

The cost of the mode is route searching (the zombies' AI is otherwise cheap): every search checks moves against the physics, and the first time a move is checked on a map it is expensive; the answers are then cached, per speed. On a cold cache a Pi 4 hangs for a second at a time while the horde works out its first routes; once the cache is warm it does not. So:

- The cache fills itself: a game server with no rooms running for 20 seconds starts warming it (DeadInternet's `idlewarm.js`, in a worker thread), for every speed and variant a zombie is at (usual and sudden death, plain, brutish and small) on the maps the mode is played on, and stops the moment a room is made, carrying on next time it is quiet. It is kept in `plugins_default/deadinternet/store/` and is thrown away whenever the physics or pathfinding code changes. On a PC the worst tick in a test round went from about 1.3s to under 0.1s with a warm cache.
- Fewer zombies cost proportionally less: `count` (20 by default; try 10-12 on a Pi 4).
- The horde shares one route search budget per tick (`searchBudgetMs`), and the search for a way to someone out of reach is shared between them (and kept for a few seconds) instead of every zombie doing its own.

`test-zombies.js` boots a real room headlessly with stand-in humans: the gametype, the horde and its head start, eggs, infection (by dying, by leaving through the menu, by joining late), sudden death, both ways a round can end, the next round (including everyone being spawned into it), where zombies spawn (and that the position is in the respawn packet), whether they reach and bite a standing human, whether they find their way up to a human a few levels higher, whether they jump a one block gap from a run-up, whether they get as close as they can to a human on a tower they cannot walk up, and that they wander when they are stuck on the way (`NOSWARM=1` turns that off to compare). Takes a minute or so.

`test-client-registration.js` loads `shared.js` and `zombievisuals.js` the way the browser bundle does and checks the gametype registers, the browser-side spawn behaves, the WAITING... text, and the zombie look (the hooks on the actors, the stumble, the gun and hands, and that humans are left alone), with no server and the meshes stood in for.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
