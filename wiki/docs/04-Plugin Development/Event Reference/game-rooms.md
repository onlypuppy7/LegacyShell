<!-- GENERATED — do not edit by hand. Run `npm run gen-docs` to regenerate. See src/scripts/gen-wiki-reference.js. -->

# `game:` events — room lifecycle & tick loop

> **Audience:** Plugin authors and AI agents · **Prereqs:** [Events (concept)](../events-concept.md)

Every `plugins.emit(...)` call site found in the files below, extracted directly from source - not hand-maintained. Unprefixed at the call site; `PluginManager.emit` adds `game:` before checking for listeners, so e.g. the first row below actually fires as `game:roomLoading`.

| Event | Location | Payload | Fires when |
|---|---|---|---|
| `roomLoading` | `server-game/src/rooms.js:27` | `{}` | Module load, once, inside the room worker thread. |
| `roomInit` | `server-game/src/rooms.js:35` | `{this: this}` | A room is being constructed. |
| `roomSetSS` | `server-game/src/rooms.js:39` | `{ss}` | The room worker's local `ss` is being seeded with `{maps, items, permissions, config}` from the main thread. |
| `roomInitGameOptions` | `server-game/src/rooms.js:61` | `{this: this}` | `gameOptions` is being initialized for the room. |
| `roomBeforeMapBuild` | `server-game/src/rooms.js:94` | `{this: this, info: info}` | Before the map is built — a listener can rewrite `this.minMap` to substitute a custom map. |
| `roomInitEnd` | `server-game/src/rooms.js:168` | `{ this: this }` | Room construction finished; the room is ready to accept players. |
| `roomWsMessage` | `server-game/src/rooms.js:185` | `{this: this, client, type, content}` | A raw, not-yet-decoded websocket message arrived for a client in this room (relayed from the main thread) — a plugin can decode it itself with `new Comm.In(data.content)` to react to a custom opcode. |
| `packRoundEnd` | `server-game/src/rooms.js:255` | `{this: this, output}` | Building the "round end" network packet — fires before the packet body is assembled. |
| `packRoundEndEnd` | `server-game/src/rooms.js:258` | `{this: this, output}` | Building the "round end" network packet — fires after the packet body is assembled. |
| `packRoundUpdate` | `server-game/src/rooms.js:262` | `{this: this, output}` | Building the "round update" (timer) network packet — fires before the packet body is assembled. |
| `packRoundUpdateEnd` | `server-game/src/rooms.js:267` | `{this: this, output}` | Building the "round update" (timer) network packet — fires after the packet body is assembled. |
| `resetGamePlayer` | `server-game/src/rooms.js:284` | `{this: this, player}` | A player's round-scoped state (score, etc.) is being reset. |
| `roomDetailsUpdated` | `server-game/src/rooms.js:294` | `{this: this, details: this.details}` | Room metadata (name, options, etc.) is changing — fires before the change is applied. |
| `roomDetailsUpdatedEnd` | `server-game/src/rooms.js:320` | `{this: this, details: this.details}` | Room metadata (name, options, etc.) has changed — fires after the change is applied. |
| `packUpdateRoomParams` | `server-game/src/rooms.js:330` | `{this: this, output}` | Building the room-params sync packet sent to clients — fires before the packet body is assembled. |
| `packUpdateRoomParamsEnd` | `server-game/src/rooms.js:340` | `{this: this, output}` | Building the room-params sync packet sent to clients — fires after the packet body is assembled. |
| `roomUpdate` | `server-game/src/rooms.js:351` | `{this: this, delta, currentTimeStamp}` | Top of the 60Hz simulation tick, before per-player updates run. |
| `playerUpdate` | `server-game/src/rooms.js:360` | `{this: this, player, delta, currentTimeStamp}` | Per-player, per-tick update within the main tick loop. |
| `playerStateUpdate` | `server-game/src/rooms.js:366` | `{this: this, player, delta, currentTimeStamp}` | Per-player state-buffer replay/prediction step within the main tick loop. |
| `roomStateUpdate` | `server-game/src/rooms.js:376` | `{this: this, delta, currentTimeStamp}` | End of the per-tick player loop. |
| `roomSync` | `server-game/src/rooms.js:383` | `{this: this}` | The ~10Hz full-state sync is about to run (every `FramesBetweenSyncs` ticks). |
| `dataSyncLoop` | `server-game/src/rooms.js:392` | `{this: this, delta, output}` | The ~1000ms "data sync" loop (less time-critical per-client data) is running. |
| `clientDataSync` | `server-game/src/rooms.js:395` | `{this: this, client, delta, output}` | Per-client step within the data-sync loop. |
| `roomDataSync` | `server-game/src/rooms.js:399` | `{this: this, delta, output}` | End of the data-sync loop. |
| `metaLoop` | `server-game/src/rooms.js:405` | `{this: this, fromDisconnect}` | The ~2000ms "meta" loop (idle-kick, weather triggers, empty-room destroy) is running. |
| `metaLoopClients` | `server-game/src/rooms.js:411` | `{this: this, client, fromDisconnect}` | Per-client step within the meta loop. |
| `roomDestroy` | `server-game/src/rooms.js:437` | `{this: this}` | The room is being torn down. |
| `clientSync` | `server-game/src/rooms.js:462` | `{this: this, output}` | Building the full-state sync packet — fires once, before the per-client loop below. |
| `clientSyncLoop` | `server-game/src/rooms.js:465` | `{ this: this, client, output }` | Building the full-state sync packet — fires once per client; a plugin can set `plugins.cancel` here to replace the default position data with its own (e.g. occlusion-based visibility filtering). |
| `clientSyncEnd` | `server-game/src/rooms.js:471` | `{this: this, output}` | Building the full-state sync packet — fires once at the end, after every client has been packed. |
| `joinPlayer` | `server-game/src/rooms.js:477` | `{this: this, info}` | A player is joining this room. |
| `registerPlayerClient` | `server-game/src/rooms.js:492` | `{this: this, client}` | The new `ClientConstructor` is registered into the room's player list. |
| `disconnectClient` | `server-game/src/rooms.js:498` | `{this: this, client}` | A player is leaving/disconnecting — the closest real equivalent to a "leave" hook (there is no separate `leavePlayer` event, despite the naming symmetry you might expect with `joinPlayer`). |
| `getPlayerCountLoop` | `server-game/src/rooms.js:531` | `{this: this, count, uuids, usernames, sessions, player, extraDetails}` | Computing the room's live player count/roster — fires once per player being counted. |
| `getPlayerCount` | `server-game/src/rooms.js:535` | `{this: this, count, uuids, usernames, sessions, extraDetails}` | Computing the room's live player count/roster — fires once with the final tally. |
| `getOldestClientLoop` | `server-game/src/rooms.js:546` | `{this: this, client, oldestClient, oldestTime}` | Finding the longest-connected client (used for game-owner fallback) — fires once per client being checked. |
| `getOldestClient` | `server-game/src/rooms.js:553` | `{this: this, oldestClient}` | Finding the longest-connected client (used for game-owner fallback) — fires once with the result. |
| `packSetGameOwner` | `server-game/src/rooms.js:558` | `{this: this, output}` | Building the "game owner" packet — fires before the packet body is assembled. |
| `packSetGameOwnerFound` | `server-game/src/rooms.js:560` | `{this: this, output}` | Building the "game owner" packet — fires once an owner has actually been found. |
| `setGameOwner` | `server-game/src/rooms.js:568` | `{this: this}` | Game-owner assignment/reassignment is starting (private rooms only have an owner). |
| `setGameOwnerPrivate` | `server-game/src/rooms.js:570` | `{this: this}` | Game-owner assignment is proceeding, specifically for a private room. |
| `setGameOwnerNew` | `server-game/src/rooms.js:576` | `{this: this, newOwner}` | A new game owner has been chosen. |
| `getRandomSpawn` | `server-game/src/rooms.js:594` | `{this: this, player, list, pos}` | A random spawn point is being picked for a player. |
| `getBestSpawn` | `server-game/src/rooms.js:607` | `{this: this, player}` | The "furthest from enemies" best-spawn algorithm is starting for a player. |
| `getBestSpawnLoop` | `server-game/src/rooms.js:617` | `{this: this, player, spwn, spawnPos, smallestDistance}` | The "furthest from enemies" best-spawn algorithm — fires once per candidate spawn point being scored. |
| `getBestSpawnEnd` | `server-game/src/rooms.js:635` | `{this: this, player, best, bestDistance}` | The "furthest from enemies" best-spawn algorithm — fires once with the chosen spawn point. |
| `getValidItemSpawns` | `server-game/src/rooms.js:651` | `{this: this, data}` | Scanning the map for valid item-spawn cells — fires before the scan starts. |
| `getValidItemSpawnsLoop` | `server-game/src/rooms.js:659` | `{this: this, x, y, z}` | Scanning the map for valid item-spawn cells — fires once per cell being checked. |
| `getValidItemSpawnsEnd` | `server-game/src/rooms.js:670` | `{this: this}` | Scanning the map for valid item-spawn cells — fires once the scan is complete. |
| `notify` | `server-game/src/rooms.js:678` | `{this: this, client, text, timeoutTime}` | A toast/notification is being sent to one client, as part of a room-wide `room.notify(text, timeoutTime)` broadcast. |
| `packChat` | `server-game/src/rooms.js:685` | `{this: this, output, text, id, chatType}` | Building a chat-message packet — fires before the packet body is assembled (runs after `censor.js` filtering has already happened). |
| `packChatEnd` | `server-game/src/rooms.js:690` | `{this: this, output, text, id, chatType}` | Building a chat-message packet — fires after the packet body is assembled. |
| `packSpawnItemPacket` | `server-game/src/rooms.js:694` | `{this: this, output, id, kind, x, y, z}` | Building an item-spawn packet — fires before the packet body is assembled. |
| `packSpawnItemPacketEnd` | `server-game/src/rooms.js:701` | `{this: this, output, id, kind, x, y, z}` | Building an item-spawn packet — fires after the packet body is assembled. |
| `packCollectItemPacket` | `server-game/src/rooms.js:705` | `{this: this, output, playerId, kind, index, id}` | Building an item-collected packet — fires before the packet body is assembled. |
| `packCollectItemPacketEnd` | `server-game/src/rooms.js:711` | `{this: this, output, playerId, kind, index, id}` | Building an item-collected packet — fires after the packet body is assembled. |
| `packAllItems` | `server-game/src/rooms.js:716` | `{this: this, output, pools}` | Building the full item-state packet sent on join — fires before the per-pool loop below. |
| `packAllItemsLoop` | `server-game/src/rooms.js:721` | `{this: this, output, item, i}` | Building the full item-state packet sent on join — fires once per item being packed. |
| `spawnItems` | `server-game/src/rooms.js:731` | `{this: this, pools, output}` | The periodic item-spawning algorithm is starting for this pass. |
| `spawnItemsLoop` | `server-game/src/rooms.js:743` | `{this: this, pool, i, maximum, output}` | The item-spawning algorithm — fires once per item pool being processed. |
| `spawnItemsLoopSpawn` | `server-game/src/rooms.js:752` | `{this: this, pool, i, maximum, output, x, y, z}` | The item-spawning algorithm — fires immediately before an individual item is actually spawned. |
| `spawnItemsLoopSpawnEnd` | `server-game/src/rooms.js:759` | `{this: this, pool, i, maximum, output, x, y, z, item}` | The item-spawning algorithm — fires immediately after an individual item has been spawned. |
| `spawnItemsEnd` | `server-game/src/rooms.js:765` | `{this: this, pools, output}` | The periodic item-spawning algorithm has finished this pass. |
| `getItemSpawnFromQueue` | `server-game/src/rooms.js:773` | `{this: this, pos}` | Pulling the next queued spawn position — fires before the position is resolved. |
| `getItemSpawnFromQueueEnd` | `server-game/src/rooms.js:777` | `{this: this, pos}` | Pulling the next queued spawn position — fires with the resolved position. |
| `getUnusedPlayerId` | `server-game/src/rooms.js:783` | `{this: this}` | Allocating a free numeric player-id slot — fires before the scan starts. |
| `getUnusedPlayerIdLoop` | `server-game/src/rooms.js:793` | `{this: this, i, client, player}` | Allocating a free numeric player-id slot — fires once per candidate id being checked. |
| `getPreferredTeam` | `server-game/src/rooms.js:805` | `{this: this}` | Team-balancing logic for a joining player — fires before team counts are tallied. |
| `getPreferredTeamEnd` | `server-game/src/rooms.js:813` | `{this: this, team1Count, team2Count}` | Team-balancing logic for a joining player — fires with the chosen team. |
| `getPlayerClient` | `server-game/src/rooms.js:822` | `{this: this, client, player}` | Resolving a `Player` back to its owning `ClientConstructor`. |
| `packAllPlayers` | `server-game/src/rooms.js:828` | `{this: this, output}` | Building the full player-roster packet sent on join — fires before the per-client loop below. |
| `packAllPlayersLoop` | `server-game/src/rooms.js:832` | `{this: this, output, client}` | Building the full player-roster packet sent on join — fires once per player being packed. |
| `sendToOne` | `server-game/src/rooms.js:841` | `{this: this, output, fromId, toId, debug}` | Unicast send to one client — fires before the target is resolved. |
| `sendToOneFound` | `server-game/src/rooms.js:843` | `{this: this, output, fromId, toId, debug}` | Unicast send to one client — fires once the target client has been found. |
| `sendToOthers` | `server-game/src/rooms.js:854` | `{this: this, output, fromId, debug}` | Broadcast to all clients but one — fires before the per-client loop below. |
| `sendToOthersLoop` | `server-game/src/rooms.js:856` | `{this: this, client, output, fromId, debug}` | Broadcast to all clients but one — fires once per client being considered. |
| `sendToOthersLoopFound` | `server-game/src/rooms.js:858` | `{this: this, client, output, fromId, debug}` | Broadcast to all clients but one — fires once for each client that actually receives the packet. |
| `sendToAll` | `server-game/src/rooms.js:865` | `{this: this, output, fromId, debug}` | Broadcast to every client — fires before the per-client loop below; a plugin can set `plugins.cancel` here to replace default fan-out with custom per-client visibility filtering. |
| `sendToAllLoop` | `server-game/src/rooms.js:867` | `{this: this, client, output, fromId, debug}` | Broadcast to every client — fires once per client being considered. |
| `sendToAllLoopFound` | `server-game/src/rooms.js:869` | `{this: this, client, output, fromId, debug}` | Broadcast to every client — fires once for each client that actually receives the packet. |
| `roomLoaded` | `server-game/src/rooms.js:876` | `{RoomConstructor}` | Module load, once — hands out the room class itself. |

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
