<!-- GENERATED — do not edit by hand. Run `npm run gen-docs` to regenerate. See src/scripts/gen-wiki-reference.js. -->

# `game:` events — per-connection client object

> **Audience:** Plugin authors and AI agents · **Prereqs:** [Events (concept)](../events-concept.md)

Every `plugins.emit(...)` call site found in the files below, extracted directly from source - not hand-maintained. Unprefixed at the call site; `PluginManager.emit` adds `game:` before checking for listeners, so e.g. the first row below actually fires as `game:clientStartUp`.

| Event | Location | Payload | Fires when |
|---|---|---|---|
| `clientStartUp` | `server-game/src/client.js:22` | `{ }` | Module load, once, in the game server's main thread. |
| `clientInit` | `server-game/src/client.js:41` | `{ this: this, room, info }` | A `ClientConstructor` is being built for a newly joining player or bot. |
| `clientGameJoinedExtraInfos` | `server-game/src/client.js:94` | `{this:this, room: room, extraInfo: extraInfo}` | Extra join-time params (e.g. a custom join payload) are being processed for this client. |
| `clientInitEnd` | `server-game/src/client.js:110` | `{ this: this, room, info }` | End of client construction. |
| `clientUpdateLoadout` | `server-game/src/client.js:119` | `{ this: this, classIdx, primary_item_id, secondary_item_id, colorIdx, hatId, stampId }` | Before a loadout change (class/weapons/color/hat/stamp) is applied to this client. |
| `clientUpdateLoadoutEnd` | `server-game/src/client.js:131` | `{ this: this, classIdx, primary_item_id, secondary_item_id, colorIdx, hatId, stampId }` | After a loadout change has been applied to this client. |
| `clientApplyLoadout` | `server-game/src/client.js:135` | `{ this: this }` | The loadout is being applied to the live `Player` instance. |
| `clientInstantiatePlayer` | `server-game/src/client.js:148` | `{ this: this }` | Before the `Player` object is constructed for this client. |
| `clientInstantiatePlayerEnd` | `server-game/src/client.js:196` | `{ this: this }` | After the `Player` object has been constructed for this client. |
| `requestRespawn` | `server-game/src/client.js:262` | `{this: this, player: this.player, spawnPoint}` | A respawn request from this client is being processed. |
| `CommCodeSyncEnd` | `server-game/src/client.js:327` | `{this: this, player: this.player, adjustment: this.adjustment, stateIdx, startIdx, i}` | End of processing an incoming input-sync packet from this client — a natural hook for anti-cheat heuristics that inspect aim-angle jitter between synced states. |
| `clientPackSync` | `server-game/src/client.js:580` | `{ this: this, output }` | Building this client's outbound sync packet — fires once per sync, before the per-state loop below. |
| `clientPackSyncLoop` | `server-game/src/client.js:599` | `{ this: this, output, state }` | Building this client's outbound sync packet — fires once per buffered state entry being packed. |

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
