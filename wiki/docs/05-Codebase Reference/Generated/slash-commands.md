<!-- GENERATED — do not edit by hand. Run `npm run gen-docs` to regenerate. See src/scripts/gen-wiki-reference.js. -->

# Slash Command Reference

> **Audience:** Server operators, plugin authors, AI agents · **Prereqs:** [Commands](../../04-Plugin%20Development/commands.md)

Every built-in `this.newCommand({...})` call in `src/shell/permissions.js`, extracted directly from source. Plugin-registered commands aren't included here since they don't exist until a plugin loads - see [Commands](../../04-Plugin%20Development/commands.md) for the registration mechanism itself.

| Command | Category | Description | Permission `[bypass, private, requireOwner]` | Input | Cheat | Location |
|---|---|---|---|---|---|---|
| `/change gravity` | "change" | Sets gravity for players. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["number", -12, 12, 0.1]` | Yes | `src/shell/permissions.js:37` |
| `/change knockback` | "change" | Sets knockback for players. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["number", -12, 12, 0.1]` | Yes | `src/shell/permissions.js:57` |
| `/change speed` | "change" | Sets speed for players. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["number", -12, 12, 0.1]` | Yes | `src/shell/permissions.js:77` |
| `/change regen` | "change" | Sets regen rate for players. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["number", -12, 12, 0.1]` | Yes | `src/shell/permissions.js:97` |
| `/change damage` | "change" | Sets damage modifiers for players. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["number", -12, 12, 0.1]` | Yes | `src/shell/permissions.js:117` |
| `/change resistance` | "change" | Sets resistance modifiers for players. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["number", -12, 12, 0.1]` | Yes | `src/shell/permissions.js:137` |
| `/change jumpBoost` | "change" | Sets jump boost for players. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["number", -12, 12, 0.1]` | Yes | `src/shell/permissions.js:157` |
| `/change physicsSpeed` | "change" | Sets physics speed for players. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["number", 0.1, 12, 0.1]` | Yes | `src/shell/permissions.js:177` |
| `/change bulletSpeed` | "change" | Sets bullet speed for players. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["number", 0, 12, 0.001]` | Yes | `src/shell/permissions.js:197` |
| `/change reloadSpeed` | "change" | Sets reload speed for players. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["number", 0.1, 12, 0.1]` | Yes | `src/shell/permissions.js:217` |
| `/change weaponSettle` | "change" | Sets weapon settle speed for players. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["number", 0.1, 1000, 0.1]` | Yes | `src/shell/permissions.js:237` |
| `/change grenadeThrow` | "change" | Sets grenade throw speed multiplier for players. (Higher = farther throw) | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["number", -12, 12, 0.1]` | Yes | `src/shell/permissions.js:257` |
| `/change grenadeTimer` | "change" | Sets grenade timer multiplier for players.  | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["number", 0, 12, 0.1]` | Yes | `src/shell/permissions.js:277` |
| `/change grenadeBounce` | "change" | Sets grenade bounce multiplier for players. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["number", 0, 3, 0.1]` | Yes | `src/shell/permissions.js:297` |
| `/change scale` | "change" | Sets scaling for players. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["number", 0.1, 25, 0.1]` | Yes | `src/shell/permissions.js:317` |
| `/change lifesteal` | "change" | Multiplier for how much health to give back from damage. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["number", -10, 10, 0.1]` | Yes | `src/shell/permissions.js:339` |
| `/admin announce` | "admin" | Sets the homescreen text. | `[this.ranksEnum.Admin, this.ranksEnum.Admin, false]` | `["string"]` | No | `src/shell/permissions.js:360` |
| `/mod boot` | "mod" | Boot problematic players. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["string"]` | No | `src/shell/permissions.js:380` |
| `/player kill` | "player" | Instantly kills a player. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["string"]` | Yes | `src/shell/permissions.js:400` |
| `/player explode` | "player" | Instantly kills a player and spawns a cosmetic explosion effect at their position. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["string"]` | Yes | `src/shell/permissions.js:418` |
| `/player hp` | "player" | Sets a players HP directly. Unlike healing, this can push HP beyond the usual 100 cap. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["number", 0, 100, 1]` | Yes | `src/shell/permissions.js:441` |
| `/room notify` | "room" | Announces a message to all players. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["string"]` | No | `src/shell/permissions.js:465` |
| `/room enableCheats` | "room" | Enable/disable cheats. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["bool"]` | No | `src/shell/permissions.js:481` |
| `/room limit` | "room" | Set the max player limit. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["number", 1, maxServerSlots, 1]` | No | `src/shell/permissions.js:501` |
| `/room warp` | "room" | Change to another room. | `[this.ranksEnum.Guest, this.ranksEnum.Guest, false]` | `["string"]` | No | `src/shell/permissions.js:518` |
| `/room warpall` | "room" | Transfer all players to another room. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["string"]` | No | `src/shell/permissions.js:531` |
| `/room gameoptions` | "room" | View current game options. | `[this.ranksEnum.Guest, this.ranksEnum.Guest, false]` | `["bool"]` | No | `src/shell/permissions.js:549` |
| `/room info` | "room" | View current rooms info. | `[this.ranksEnum.Guest, this.ranksEnum.Guest, false]` | `["bool"]` | No | `src/shell/permissions.js:562` |
| `/room lock` | "room" | Prevent any new players from joining your room. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["bool"]` | No | `src/shell/permissions.js:586` |
| `/room isPublic` | "room" | Change this rooms visibility. | `[this.ranksEnum.Moderator, this.ranksEnum.Moderator, false]` | `["bool"]` | No | `src/shell/permissions.js:607` |
| `/rounds enable` | "rounds" | Enable/disable rounds. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["bool"]` | No | `src/shell/permissions.js:633` |
| `/rounds length` | "rounds" | Set the length of rounds in seconds. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["number", 1, 60 * 60, 1]` | No | `src/shell/permissions.js:661` |
| `/rounds skip` | "rounds" | Skip to the end of this round. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["string"]` | No | `src/shell/permissions.js:685` |

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
