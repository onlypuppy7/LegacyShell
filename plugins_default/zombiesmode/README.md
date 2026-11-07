# ZombiesMode

Adds a **Zombies** gamemode: a horde of slow bots walks at the humans and bites them. A human who dies, or leaves the fight through the menu, is **infected** and joins the horde. Last human standing wins, or the humans win by outlasting the round.

Needs the DeadInternet plugin (the zombies are its bots) and the Modern Shell Hats plugin (the ghosts wear its Ghost Hat).

## How a round goes

- Timed rounds (3 minutes), on the maps in the `Zombies` pool: `ZombiesModeMaps` in `shared.js` (Blue, Castle, Infected Feedlot, Moonbase, Ruins, Two Towers). The plugin hooks services' `insertMaps` event, which fires for each map as it goes into the database on every services start, and adds a `Zombies` mode to those maps' `modes` (the gametype's `mapPool`); the other maps are not touched, so they never come up for this mode. Humans are team 1, the horde is team 2. Nobody can switch teams.
- **Everyone is spawned into the round the moment it starts**, whether or not they pressed PLAY (the browser closes the menu and takes the pointer lock for them; if the browser refuses the lock without a click, the first click on the game does it). The horde follows after a head start (`headStartSecs`, 6) and spawns spread over `staggerSecs` (8), so nobody spawns into a horde that has already walked to the spawn. A human who still has not spawned in `spawnFailsafeSecs` (15) after the round started (or after they joined it) is infected.
- The room keeps `count` (20) zombie bots in play while at least one human is in it. A killed zombie comes back after a few seconds. Zombies (the bots and the infected) spawn at a random spawn point with no human within `spawnClearRadius` (12 blocks, at most 40% of the map's size), so the horde is spread around the map rather than appearing on top of anyone.
- **WAITING...** is shown in the middle of the screen to someone who is in play while it is the gap between two rounds. That is only ever someone who has joined during the gap: everyone in the room when a round ends is taken out of play, and the game does not let you spawn again until the next round starts. They are put into the next round when it starts. Whether it is the gap is sent by the server in the room params (`gameOptions.plugins.zombiesInterim`), rather than the browser working it out from the game's own round state, which depends on which packets it happened to be there for.
- **Getting to you**: a zombie only walks straight at someone it can see when they are level with it, not far, and there is ground all the way: a gap or a drop in between is for the route to cross (a bot in sight never follows a route, and its ledge guard would leave it standing at the edge for good). Someone higher up (a ledge, stairs, a roof) is gone to by route, which is what takes it up there, rather than standing below looking up; and it always knows where the humans are, so it never wastes time going to where it last saw one. Walking straight is never off an edge unless the human is down there.
- **Ghosts**: one in every 6 of the horde (`ghostRatio`, spread evenly: the 6th, the 12th...) is a ghost instead of a zombie. A ghost has **noclip** (the base game's modifier), so it floats straight through walls: no pathfinding, it just points at whoever is nearest and moves at them in a straight line, at a constant speed on all three axes. It is white and see-through (a copy of the shared player shader with a constant alpha, for the body, hands and hat), wears the Ghost Hat (`ghostHat`, an item id from modernshellhats; 0 for none), is slower than a zombie (`ghostSpeed` 0.5, about half the pace of a walking player), bites for less (`ghostBite` 6) and has `ghostResistance` (0.7). It is shot, killed and paid for like any zombie. In sudden death it speeds up by the same factor as the zombies do, so it stays slower.
- **Exploding ghosts**: from round 2 (streak 1) one of the ghosts is an exploding one, and from round 4 two (`bombStreak`, `bombSecondStreak`, `bombMax`). It is a ghost in every way (it replaces a plain ghost, so the horde stays the same size) and just as quick as the other ghosts of the round. It ticks slowly the whole time, with the grenade's own beep at its own position (so it fades with distance like any sound) and a yellow flash on each tick (with a yellow light on its surroundings when Fancy Glow is on, brighter once the fuse is lit), so it can be heard coming. When someone gets within `bombRange` (1.875 blocks) its fuse is lit, and it speeds up by `bombRush` (1.3x) for the dash: it ticks and flashes the way a grenade does, over the length of the fuse (`bombFuseMs`, 3s, down to `bombFuseMinMs` by round 10, so the ticking is quicker the later the round), and its hat spins, faster and faster. It then goes off wherever it is by then. Shooting it dead never sets it off. The blast is a real grenade thrown at its own feet with a timer short enough that it goes at once (the browsers play the game's own explosion, and the damage comes from the game's own explosion code): `bombDamage` (100) at point blank, falling off to nothing at 3 blocks. It cannot hurt the horde (the same team), and the ghost goes out of play with it (it does not die, so there is no death animation, and the blast does not hit it) and comes back after a while like any other. The pin sound plays when the fuse is lit; the grenade it explodes with is silent and unseen (the browsers drop its pin sound, beep and model in `game:grenadeThrow`), so only the blast is heard. The browsers know which ghosts are bombers, and how long their tick and fuse are, from two extra modifiers (`zombieBomber Ghost`, `zombieFuse`) sent on the end of the modifiers packet (`game:packModifiers`).
- **Brutish and small zombies**: of the rest of the horde, 1 in 10 (`brutishRatio`) is brutish and 3 in 20 (`smallRatio`) small, spread evenly like the ghosts. A brutish one has big hands, a `physicsSpeedModifier` of 0.7 (not `speedModifier`, which would throw the pathfinding off), five times a zombie's resistance and a bite 1.25x as hard, a tan egg and a Zombie Eggshell hat (`brutishHat`, from legacyshellcore). A small one has a `physicsSpeedModifier` of 1.25, half the bite and a scale of 0.5, which also halves its health (damage taken is divided by scale), a pinkish grey egg and Devil Horns (`smallHat`). Both take the plain zombies' routes and pathfinding cache: physics speed is not part of a pathfinding profile, and the small ones search as a full size body (`pathAs`). Their egg colours go out through legacyshellcore's `setEggColor`.
- **Unreachable humans**: someone on a tower nothing can walk up to is still the target. Zombies search harder for a way (`searchBudget`); if there is none they try the blocks in the 5x5 columns around the human, closest to them first, and go to the first that has a route; and close to someone they cannot quite reach (above them, or just standing short) they jump now and then (about once every 3 seconds on average), and when they are going somewhere but not getting anywhere (standing at a ledge they will not step off while in sight, or at the end of the route to the closest point) they wander off to a random spot 3 to 8 blocks away for a few seconds, then try the route again, so the horde does not stand about (or pile up) on the one point.
- A zombie has about 70 HP (about 2 rifle hits), walks at about 60% of a human's speed (humans are 1.1), never shoots, does no aiming (it turns straight to face you) and walks right into you rather than stopping a gun's distance away, and knows where the humans are from anywhere on the map. It bites by touching: team 2's `contactDamage` (12) hits on a half second cooldown. Touching comes from the core `contactDamage` game option (hp per hit, per team, 0 = off; `/contactDamage` sets it), with `contactCooldown` and `contactReach` (how far past the two bodies just touching still counts, 0.1) alongside.
- A human who dies switches to team 2 and respawns as a zombie, with about 60 HP (they are faster and cleverer than the bots, so they break more easily), a bite and no gun.
- **Leaving through the menu infects you too**: pressing escape and respawning is not a way out. (The game takes you out of play a few seconds after you press escape; that is what is noticed.)
- Someone who first spawns more than `graceSecs` (30) into a round comes in as a zombie.
- The round ends early when the last human is infected (the horde wins). Otherwise, when the timer runs out, the surviving humans win and are paid the win bonus each (`winEggs`, 20, plus the streak: see Eggs). **When the humans win the whole horde (the bots and the infected) dies**, one after another `victoryGapMs` (100) apart, credited to a survivor in the kill feed but not scored; nothing bites or comes back while that happens, and the round ends `victoryHoldMs` (1500) after the last one goes. (The plugin takes over the room's round timer to be able to do this: the round ends through `roundTimeUp` in `index.js`.)
- **The sky** (with legacyweather): a round starts as an ordinary day, and within about 45 seconds (`dayHoldSecs` 4, then `darkenSecs` 40) has turned into a dark, stormy dusk with rain, wind and the odd bolt. From there it slowly gets darker and the storm builds, reaching night and a heavy storm by the end of the round. The clients blend between the few states the server sends, so it is a smooth change rather than steps. It goes back to the room's own weather when the round ends. `weatherArc: false` leaves the weather alone.
- **Sudden death** starts when one human is left of two or more, or whenever `suddenDeathSecs` (60) are left, whoever is still alive: it goes to full night in a downpour with lightning every second or two, and every zombie (the bots and the infected) goes up to `suddenDeathSpeed` (1.15). The humans get a little quicker too: `suddenDeathHumanSpeed` (+0.2, so 1.3) and a `suddenDeathReload` (1.3) reload, up from the 1.2 reload they have the rest of the round (`reloadSpeedModifier` in the gametype).
- A new round cures everyone.
- **Health packs** (from the healthpackitem plugin, when it is loaded) spawn in this gamemode, for the humans, at a quarter of the usual rate (one per 240 blocks of map, at least one). Health packs, ammo and grenades are for the humans only: the horde walks over them without taking anything.

Infections and round results go to the room's chat (green lines from the server); there are no pop-ups: sudden death is the red text under the clock. What the round looks like on screen is under Screen below.

## How zombies look

Everyone on the horde (the bots and the infected, anywhere in the browser, including your own view if you are infected) looks the part. This is browser-only code in `zombievisuals.js`, spliced into the client bundle next to `shared.js`, which wraps the game's `PlayerActor` update and its hands-to-gun step; nothing about a human changes.

- **A stumble** instead of the egg's even wobble: one turn of its own phase is a left step and a right, rolling the egg over one way then the other (some steps worse than others, with a harsher second beat), hunched forward and nodding, twisting against the roll, and dropping hard on the heavy side as if that foot is being dragged. It goes both ways evenly, counts up continuously rather than following the game's walk cycle (which wraps and made the first version jump and lean one way), scales with how fast they are going, and a standing zombie only sways a little.
- **No gun** in hand.
- **Both hands the open hand from the model**, held out in front, fingers straight forward, palms down, thumbs in, drooping a little at the wrist and swaying with the steps. The model's `hands` mesh is two hands in one skinned mesh (the right one closed round a grip, the left open under the foregrip), so the zombie's is built once from its data: the left hand, and a mirrored copy of it skinned to the right hand's bone. The bones are posed directly. How to turn the hand square on is worked out from the model's own bone frame for it (its local z is the fingers and y the thumb, and as that bone is a mirror there is exactly one proper rotation that points them forward and in, which for a left hand has to be palm down), not by eye; the right bone is set so its hand is the left one exactly mirrored. Both are checked against the model's data in the tests.

- **Ghosts** (anyone on the horde with noclip, which the server sets on them and nothing else in the gamemode, synced to everyone like any modifier) do not stumble: they lean forward a little and float just off the ground, bobbing and swaying slowly, with the same open hands out in front.

## Eggs

The usual per-kill reward is replaced: a human earns `killEggs` (2) per zombie killed, up to `eggCap` (100) a round, and nothing for anything else. Nothing is paid in rooms with cheats on. This uses the `scoreKillEggs` event. A zombie kill never counts as a kill in the account's stats (the default reward, which is what bumps them, is cancelled); LegacyAchievements keeps its own `zombies` count for the Rotten Eggs tiers.

A survivor is also paid the **win bonus** when the humans win: `winEggs` (20) plus `streakWinEggs` (10) for every round in a row the humans have won, up to `streakCap` (10). Someone who was infected, left through the menu or came in as a zombie gets no bonus, and neither does a guest (nothing is paid to someone without a session) or anyone with cheats on. The kills that put the horde down when the humans win are not scored and pay nothing.

Most a round can pay one player: the kill cap (100 x 2 = 200) plus the win bonus at the cap (20 + 10 x 10 = 120), so **320 eggs**. A good round with no streak is nearer 60 to 120.

## The win streak

Rounds in a row the humans have won, per room (the horde winning, or the room emptying of humans, starts it over; a round with nobody in it neither adds nor ends one). It adds to the win bonus and makes the horde worse, all of it up to `streakCap` (10) rounds:

- **Brutish zombies** take over from plain ones: the brutish share is `brutishRatio` (10%) plus `streakBrutishRatio` (7%) per round, up to `brutishRatioMax` (45%). At the start of a round plain zombies are taken out and the horde fills back up with brutish ones.
- **They get quicker**: their physics speed goes from `brutishPhysics` (0.7) up by `streakBrutishPhysics` (0.1) per round to `brutishPhysicsMax` (1, the pace of the plain zombies), so by the third round they are tough without being slow.
- **Ghosts get quicker**: `ghostSpeed` (0.5) plus `streakGhostSpeed` (0.04) per round, up to `ghostSpeedMax` (0.9). In sudden death they still never go faster than the zombies' `suddenDeathSpeed`.

## Screen

All browser-side and in `zombiesui.js` (spliced into the client bundle next to `shared.js`), drawn from what the server already sends in the room params (`zombiesStreak`, `zombiesRound`, `zombiesWinner`, `zombiesResults`, `zombiesNextIn`, `zombiesGraceLeft`, `zombiesSuddenDeath`, `zombiesInterim`); the one thing added to the wire protocol is a `zombiesEggs` packet (`Comm.Add`, handled in `shared.js`) the killer gets for each zombie: u8 eggs for that kill and u16 eggs earned this round. It is counted in the mode's own eggs (`killEggs`, up to `eggCap`) rather than from the account's balance, because the services multiply every payout by the account's VIP multiplier (an hour of 2x comes with Kills II in LegacyAchievements), so a VIP's balance goes up by twice as much as the mode says. The multiplier still applies to what is actually paid. A guest, who is never paid, does not see the egg lines.

- **Under the clock**: SUDDEN DEATH in red while it lasts, then `EGGS 24 / 100` (with a +2 floating up from it on each kill), `SURVIVE FOR +30 WIN BONUS` (struck through once infected, `NEXT ROUND: +35 WIN BONUS` in the gap) and `WIN STREAK x3`.
- **End of round card**: during the gap, for each player who was in the round: YOU SURVIVED!, YOU WERE INFECTED, YOU FLED THE FIGHT, YOU JOINED THE HORDE or THE HORDE WINS, with the kill eggs, the survival bonus (struck out if it was lost), the streak bonus, a VIP BOOST row for an account with a VIP multiplier (the services pay everything out times it, so the total is what the account really gets, while the counter under the clock stays in the mode's own eggs, out of `eggCap`) and the total, and the streak going on or being lost. A note says if cheats were on or the player is a guest.
- **Under the PLAY button**: what pressing it does: the countdown to the next round and that you start as a human, the horde's welcome if you are infected, how long you can still come in as a human in a round that has started or that you will join the horde, and for someone who has just pressed escape in a round that leaving infects them (the game takes you out of play 3 seconds later, then keeps the button grey for 5).

When the humans win a round, anyone still out in the game has the game menu brought up for them (once a round), so the end of round card and the countdown to the next round are in front of them without pressing esc. Pressing PLAY while an open player profile, the settings or a dialog is in the way closes them first.

The leaderboard is only rebuilt at most every quarter of a second in a zombies room (the core rebuilds it for every spawn, death and score, and a horde respawning all the time made that a stutter). The round box sits in the game's own container with no z-index of its own, so the dark overlay behind a dialog covers it like the rest of the game.

## Sounds

Two sounds, in `client/sound/zombies/` (served by the plugin, added to the game's sound list on `game:loadSounds`): a siren when the horde starts spawning (once a round, as the head start ends) and a horn when sudden death starts (with the siren again 1.5 seconds after it). The server tells each human in the room with a second small packet, `zombiesSound` (a u8 off `ZombiesCues` in `shared.js`), so they play on the sound volume and anyone joining later does not hear a cue that already went.

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
| `searchBudgetMs` | 6 | the most the horde's route searching takes in a tick, in ms: a search that is not finished by then carries on in the next ticks (the zombie keeps its old route, or stands, meanwhile), and the others wait. Lower on a slower machine for smoother ticks, higher for zombies that find their way sooner |
| `zombieSpeed` | 0.65 | zombie bots' speed modifier. Not much lower than this: how far a bot can jump depends on its speed, and a two block gap tried from a four block run-up is too wide at 0.6 (and 0.62 is enough) |
| `ghostRatio` | 1/6 | the share of the horde that are ghosts |
| `ghostSpeed` / `ghostResistance` | 0.5 / 0.7 | a ghost's speed modifier (1 is the pace of a walking player) and resistance |
| `ghostBite` | 6 | hp a ghost's touch takes |
| `bombStreak` / `bombSecondStreak` / `bombMax` | 1 / 3 / 2 | the streak the first and second exploding ghost come at, and the most there are |
| `bombRange` | 1.875 | how close someone gets to light its fuse |
| `bombRush` | 1.3 | its speed multiplier once the fuse is lit |
| `bombFuseMs` / `bombFuseMinMs` | 3000 / 1800 | its fuse at round 2, down to this by round 10 |
| `bombIdleMs` / `bombIdleMinMs` | 1200 / 700 | the gap between its slow ticks before the fuse, round 2 down to round 10 |
| `bombDamage` | 100 | what its blast does at point blank, humans only |
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
| `streakWinEggs` / `streakCap` | 10 / 10 | eggs added to the win bonus per round won in a row, and the number of rounds the streak stops counting at |
| `streakBrutishRatio` / `brutishRatioMax` | 0.07 / 0.45 | the brutish share goes up this much per round, to this |
| `streakBrutishPhysics` / `brutishPhysicsMax` | 0.1 / 1 | the brutish get this much quicker per round, to this physics speed |
| `streakGhostSpeed` / `ghostSpeedMax` | 0.04 / 0.9 | the ghosts get this much quicker per round, to this |
| `suddenDeathSecs` | 60 | when sudden death comes at the latest |
| `suddenDeathSpeed` | 1.15 | the zombies' speed in sudden death (the speed itself, for the bots and the infected alike) |
| `suddenDeathHumanSpeed` | 0.2 | added to the humans' speed in sudden death |
| `suddenDeathReload` | 1.3 | the humans' reload speed modifier in sudden death |

The horde's team options (`damageModifier`, `contactDamage`, `contactCooldown`, `resistanceModifier` for the infected) are on the gametype too. The bots' own behaviour is the `zombie` preset, registered in `index.js` with DeadInternet's `registerPreset`, so it can be tried out anywhere with `/bots add 5 zombie`.

## Testing

```bash
node plugins_default/zombiesmode/test-zombies.js [map] [seed] # Two Towers by default; an optional seed repeats the same choices
node plugins_default/zombiesmode/test-navigation-policy.js # route resumption, search limits and direct pursuit (no room needed)
node plugins_default/zombiesmode/test-navigation.js [map] [seed] [plain|small|brutish|sudden] # Blue by default
node plugins_default/zombiesmode/test-client-registration.js
```

## Running it on a slow machine

The cost of the mode is route searching (the zombies' AI is otherwise cheap): every search checks moves against the physics, and the first time a move is checked on a map it is expensive; the answers are then cached, per speed. On a cold cache a Pi 4 hangs for a second at a time while the horde works out its first routes; once the cache is warm it does not. So:

- The cache fills itself: a game server with no rooms running for 20 seconds starts warming it (DeadInternet's `idlewarm.js`, in a worker thread), for every speed and variant a zombie is at (usual and sudden death, plain, brutish and small) on the maps the mode is played on, and stops the moment a room is made, carrying on next time it is quiet. It is kept in `plugins_default/deadinternet/store/` and is thrown away whenever the physics or pathfinding code changes. On a PC the worst tick in a test round went from about 1.3s to under 0.1s with a warm cache.
- Fewer zombies cost proportionally less: `count` (20 by default; try 10-12 on a Pi 4).
- The horde shares one route search budget per tick (`searchBudgetMs`), and a search is carried over several ticks when it does not fit (a zombie after someone it cannot reach would otherwise flood the whole map in one go: hundreds of ms on a desktop, seconds cold on a Pi, with everyone frozen), and the search for a way to someone out of reach is shared between them (and kept for a few seconds) instead of every zombie doing its own.

`test-zombies.js` boots a real room headlessly with stand-in humans: the gametype, the horde and its head start, eggs, infection (by dying, by leaving through the menu, by joining late), sudden death, both ways a round can end, the next round (including everyone being spawned into it), where zombies spawn (and that the position is in the respawn packet), whether they reach and bite a standing human, whether they find their way up to a human a few levels higher, whether they jump a one block gap from a run-up, whether they get as close as they can to a human on a tower they cannot walk up, and that they wander when they are stuck on the way (`NOSWARM=1` turns that off to compare), the cards each player gets at the end of a round, the win streak and what it does to the horde. Takes a minute or so.

`test-navigation-policy.js` checks that a kept route resumes even when the horde has spent its search budget, that another zombie's failed search cannot hold an old route in place, and that waiting for a search is not recorded as an unreachable goal. Direct pursuit checks the whole floor between the zombie and the human; gaps, props and low walls hand over to a route before the zombie reaches them. Incidental jumps leave route execution alone.

The elevated target in `test-zombies.js` is checked against a real zombie's physics and landing point before the human is placed there, so an estimated route onto a blocked prop or a different part of a ramp is not mistaken for a reachable perch.

`test-client-registration.js` loads `shared.js` and `zombievisuals.js` the way the browser bundle does and checks the gametype registers, the browser-side spawn behaves, the WAITING... text, and the zombie look (the hooks on the actors, the stumble, the gun and hands, and that humans are left alone), with no server and the meshes stood in for.

`test-navigation.js` starts a zombie on each supported prop and stair on the real map and checks it reaches a nearby human within 30 simulated seconds. Recovery checks actual position changes, so pushing against something still counts as stuck; an active route keeps its own jump and replan recovery until it finishes.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
