# ParkourMode

Adds a full "Parkour" gamemode - checkpoints, a goal, sound cues, and egg rewards - built entirely on ordinary plugin extension points, no core engine changes.

## The gamemode itself

Registered via `game:GameTypesInit` (see [Recipe: New Gamemode](/wiki/docs/04-Plugin%20Development/Recipes/new-gamemode.md) for the general mechanism): `damageModifier`/`knockbackModifier` set to 0 for every team, no spawnable items at all, 5-minute timed rounds, 3 starting grenades, and `rearmOnRespawn: false`. Ships its own maps via `services:initTablesMaps`.

## How checkpoints and the goal actually work

Hooks `game:onStandOnTile` and checks the mesh name a player is currently standing on against `"checkpoint1"` through `"checkpoint5"` and `"goal"` literally - a private naming convention for this plugin's own maps, unrelated to the `theme.name.colliderType` convention in [Map Blocks](/wiki/docs/03-Content%20Creation/map-blocks.md). Reaching a new checkpoint (only counted if higher than the player's current best) sets their respawn point, plays a numbered sound cue, and scores a kill point; reaching the goal scores three kill points and resets the player back to a normal spawn after a short delay.

**Egg rewards are asymmetric**: a checkpoint only rewards `player.client.addEggsViaServices(5)` (see [Rewarding Players with Currency](/wiki/docs/04-Plugin%20Development/Recipes/player-currency.md)) if `player.gameOptions.cheatsEnabled` is falsy - but the goal's `addEggsViaServices(10)` has no such check. A room with cheats enabled (e.g. noclip) can't farm checkpoint eggs, but reaching the goal repeatedly still pays out regardless - worth knowing if you're relying on this mode to be cheat-proof for currency purposes.

## A real example of registering a custom network opcode

`Comm.Add("parkourScore")` (see [Networking](/wiki/docs/04-Plugin%20Development/networking.md#registering-a-new-opcode)) is called from inside `permissionsAfterSetup` in `shared.js` - one piece of code that genuinely runs on both the browser bundle (spliced in via `pluginSourceInsertion`) and the Node game server (imported normally), which is exactly the "call `Comm.Add` from one shared call site" guidance that page gives, not just a description of the ideal.

## Notes

Sound assets include a `parkour.gerudo` clip that's loaded (`loadSounds`) but never actually played anywhere in the reviewed source - a loaded-but-unused asset, not a bug that affects anything, just dead weight if you're auditing what actually gets used.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
