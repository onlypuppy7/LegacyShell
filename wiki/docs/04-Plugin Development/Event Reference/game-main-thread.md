<!-- GENERATED — do not edit by hand. Run `npm run gen-docs` to regenerate. See src/scripts/gen-wiki-reference.js. -->

# `game:` events — main-thread server process

> **Audience:** Plugin authors and AI agents · **Prereqs:** [Events (concept)](../events-concept.md)

Every `plugins.emit(...)` call site found in the files below, extracted directly from source - not hand-maintained. Unprefixed at the call site; `PluginManager.emit` adds `game:` before checking for listeners, so e.g. the first row below actually fires as `game:onLoad`.

| Event | Location | Payload | Fires when |
|---|---|---|---|
| `onLoad` | `server-game/start-game.js:39` | `{ ss }` | Game process finished its own init, before connecting the outbound socket to services. |
| `connectWebSocketMessage` | `server-game/start-game.js:169` | `{ this: this, ss, msg }` | Any message received on the outbound services websocket. |
| `requestConfigReceived` | `server-game/start-game.js:177` | `{msg}` | Specifically a `requestConfig` response (maps/items/servers/config sync) was received from services. |
| `sendGameInfo` | `server-game/src/roomManager.js:406` | `{gameInfo}` | Before the aggregated per-room player/room-count snapshot is pushed to services. |

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
