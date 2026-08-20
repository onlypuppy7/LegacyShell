# DeadInternet

Adds real, controllable bot players to a room via `/bots add <count>` - not fake decorations, actual `ClientConstructor` instances joined through the normal `room.joinPlayer` flow, with their input driven by code instead of a real WebSocket connection.

## Commands

| Command | Category / Name | What it does |
|---|---|---|
| `/bots add <1-18>` | `bots` / `add` | Spawns that many bots into the current room. Cheat-tagged (`isCheat: true`) - needs `gameOptions.cheatsEnabled` regardless of rank - and defaults to Moderator-only (`permissionLevel: [Moderator, Guest, true]`). |

## How the bots actually behave

Each bot walks toward the nearest human player (`getNearestPlayer(human = true)`), always holding the forward (`CONTROL.up`) key, and switches weapons plus jumps once every 10 seconds on a plain `setInterval` - simple, deliberately not sophisticated ("Adds a basic command" energy, not a real AI). On death, a bot respawns automatically after 7.5 seconds. Each bot's `player.modifiers.speedModifier` is randomized between 0.4x and 0.6x on spawn, so a room full of bots doesn't move in lockstep.

## Notes

`DeadInternetBot` (exported from `index.js`) is a small reusable class wrapping the join/control/respawn logic - a real reference if you want to build your own bot-driving plugin, since spawning a fully-functional player without a real socket connection isn't otherwise documented anywhere else in this wiki. `executeClient` on the `/bots add` command is intentionally empty - there's no instant client-side feedback when you type it, only once the server actually processes the request and the bot's presence syncs down like any other player joining.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
