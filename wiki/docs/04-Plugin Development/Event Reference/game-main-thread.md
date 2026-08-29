<!-- GENERATED — do not edit by hand. Run `npm run gen-docs` to regenerate. See src/scripts/gen-wiki-reference.js. -->

# `game:` events — main-thread server process

> **Audience:** Plugin authors and AI agents · **Prereqs:** [Events (concept)](../events-concept.md)

Every `plugins.emit(...)` call site found in the files below, extracted directly from source - not hand-maintained. Unprefixed at the call site; `PluginManager.emit` adds `game:` before checking for listeners, so e.g. the first row below actually fires as `game:onLoad`.

| Event | Location | Payload | Fires when |
|---|---|---|---|
| `onLoad` | `server-game/start-game.js:39` | `{ ss }` | Game process finished its own init, before connecting the outbound socket to services. |
| `connectWebSocketMessage` | `server-game/start-game.js:170` | `{ this: this, ss, msg }` | Any message received on the outbound services websocket. |
| `requestConfigReceived` | `server-game/start-game.js:178` | `{msg}` | Specifically a `requestConfig` response (maps/items/servers/config sync) was received from services. |
| `servicesCommand` | `server-game/start-game.js:249` | `{ msg }` | Services routed an admin-style command to THIS specific instance (see `services/registry.js`'s `adminRouteToServer`, which targets by our own `auth_key`) down our existing persistent connection. `msg.payload` carries the actual command; a listener replies via a fresh one-off `#wsrequest` call wrapped as `adminRouteToServerResponse`, not back down this connection. |
| `beforeJoinRoom` | `server-game/src/roomManager.js:306` | `{ room, msg, ws, ip }` | Right before a join is accepted, before the existing bootedIps/uuid/session/locked checks — set `plugins.cancel = true` to reject it (closes with `Comm.Close.booted`), e.g. legacyadmin's global ban-list check (`game/banCache.js`). |
| `sendGameInfo` | `server-game/src/roomManager.js:423` | `{gameInfo}` | Before the aggregated per-room player/room-count snapshot is pushed to services. |

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
