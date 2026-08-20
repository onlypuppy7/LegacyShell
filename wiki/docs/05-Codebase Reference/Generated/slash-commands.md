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
| `/change scale` | "change" | Sets scaling for players. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["number", 0.1, 25, 0.1]` | Yes | `src/shell/permissions.js:177` |
| `/change lifesteal` | "change" | Multiplier for how much health to give back from damage. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["number", -10, 10, 0.1]` | Yes | `src/shell/permissions.js:199` |
| `/admin announce` | "admin" | Sets the homescreen text. | `[this.ranksEnum.Admin, this.ranksEnum.Admin, false]` | `["string"]` | No | `src/shell/permissions.js:220` |
| `/mod boot` | "mod" | Boot problematic players. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["string"]` | No | `src/shell/permissions.js:240` |
| `/room notify` | "room" | Announces a message to all players. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["string"]` | No | `src/shell/permissions.js:260` |
| `/room enableCheats` | "room" | Enable/disable cheats. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["bool"]` | No | `src/shell/permissions.js:276` |
| `/room limit` | "room" | Set the max player limit. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["number", 1, maxServerSlots, 1]` | No | `src/shell/permissions.js:296` |
| `/room warp` | "room" | Change to another room. | `[this.ranksEnum.Guest, this.ranksEnum.Guest, false]` | `["string"]` | No | `src/shell/permissions.js:313` |
| `/room warpall` | "room" | Transfer all players to another room. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["string"]` | No | `src/shell/permissions.js:326` |
| `/room gameoptions` | "room" | View current game options. | `[this.ranksEnum.Guest, this.ranksEnum.Guest, false]` | `["bool"]` | No | `src/shell/permissions.js:344` |
| `/room info` | "room" | View current rooms info. | `[this.ranksEnum.Guest, this.ranksEnum.Guest, false]` | `["bool"]` | No | `src/shell/permissions.js:357` |
| `/room lock` | "room" | Prevent any new players from joining your room. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["bool"]` | No | `src/shell/permissions.js:381` |
| `/room isPublic` | "room" | Change this rooms visibility. | `[this.ranksEnum.Moderator, this.ranksEnum.Moderator, false]` | `["bool"]` | No | `src/shell/permissions.js:402` |
| `/rounds enable` | "rounds" | Enable/disable rounds. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["bool"]` | No | `src/shell/permissions.js:428` |
| `/rounds length` | "rounds" | Set the length of rounds in seconds. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["number", 1, 60 * 60, 1]` | No | `src/shell/permissions.js:456` |
| `/rounds skip` | "rounds" | Skip to the end of this round. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["string"]` | No | `src/shell/permissions.js:480` |
| `/time day` | "time" | Set time to day (default). | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["string"]` | No | `src/shell/permissions.js:500` |
| `/time night` | "time" | Set time to night. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["string"]` | No | `src/shell/permissions.js:519` |
| `/weather rain` | "weather" | Enable/disable rainy weather. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["bool"]` | No | `src/shell/permissions.js:540` |
| `/weather storm` | "weather" | Enable/disable stormy weather. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["bool"]` | No | `src/shell/permissions.js:559` |
| `/weather snowstorm` | "weather" | Enable/disable the snowstorm. | `[this.ranksEnum.Moderator, this.ranksEnum.Guest, true]` | `["bool"]` | No | `src/shell/permissions.js:578` |

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
