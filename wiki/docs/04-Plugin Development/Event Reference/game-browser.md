<!-- GENERATED — do not edit by hand. Run `npm run gen-docs` to regenerate. See src/scripts/gen-wiki-reference.js. -->

# `game:` events — in-browser gameplay

> **Audience:** Plugin authors and AI agents · **Prereqs:** [Events (concept)](../events-concept.md)

Every `plugins.emit(...)` call site found in the files below, extracted directly from source - not hand-maintained. Unprefixed at the call site; `PluginManager.emit` adds `game:` before checking for listeners, so e.g. the first row below actually fires as `game:startUp`.

| Event | Location | Payload | Fires when |
|---|---|---|---|
| `startUp` | `server-client/src/client-static/src/shellshock.min.js:99` | `{ }` | The in-browser game client script finished its own top-level setup. |
| `afterBullshit` | `server-client/src/client-static/src/shellshock.min.js:405` | `{}` | Fires after an early setup block (the name is kept verbatim from the original game source). |
| `LegacyShellOnMessage` | `server-client/src/client-static/src/shellshock.min.js:499` | `{cmd, cmdName, input}` | Every incoming server packet, after opcode decoding, before dispatch — a general-purpose network message hook; `data.input` is a still-positioned `Comm.In` reader, so a plugin can read a custom opcode's payload here. |
| `roundEndSFX` | `server-client/src/client-static/src/shellshock.min.js:629` | `{roundLength, roundEndTime, betweenRounds}` | Round-end sound/UI cue. |
| `playerDeathAnimation` | `server-client/src/client-static/src/shellshock.min.js:813` | `{killedPlayer}` | A player's death animation is playing. |
| `inGameSync1` | `server-client/src/client-static/src/shellshock.min.js:920` | `{ id, stateIdx, x, y, z, dx, dy, dz, climbing, pingLevelInt }` | First stage of processing an incoming per-player sync entry. |
| `inGameSync2` | `server-client/src/client-static/src/shellshock.min.js:1016` | `{ id, stateIdx, x, y, z, dx, dy, dz, climbing, pingLevelInt, dist, player }` | Second stage of processing an incoming per-player sync entry (remote players, distance-based detail). |
| `inGameSync3` | `server-client/src/client-static/src/shellshock.min.js:1050` | `{ id, stateIdx, x, y, z, dx, dy, dz, climbing, pingLevelInt, player }` | Third stage of processing an incoming per-player sync entry. |
| `clearItemButtons` | `server-client/src/client-static/src/shellshock.min.js:1459` | `{ i, canvas }` | Shop/loadout UI item-button reset. |
| `encloseRenderPageFunc` | `server-client/src/client-static/src/shellshock.min.js:1609` | `{ i, b, canvas, renderingItem, locked, requiresPhysicalUnlock }` | Rendering one catalog item tile in the shop UI. |
| `playerActorBodyMeshCreated` | `server-client/src/client-static/src/shellshock.min.js:1940` | `{ playerActor: this, bodyMesh: this.bodyMesh, player }` | A player's visual body mesh finished loading. |
| `playerActorShadowRenderList` | `server-client/src/client-static/src/shellshock.min.js:1969` | `{ playerActor: this, shadowGen: shadowGen }` | The player mesh was registered with the shadow generator. |
| `playerActorRemoveFromPlay` | `server-client/src/client-static/src/shellshock.min.js:2152` | `{ playerActor: this }` | A player's visual actor is being hidden (died or left). |
| `playerActorRestoreToPlay` | `server-client/src/client-static/src/shellshock.min.js:2161` | `{ playerActor: this }` | A player's visual actor is being restored (respawned). |
| `bulletActorFired` | `server-client/src/client-static/src/shellshock.min.js:2321` | `{ bulletActor: this }` | A visual bullet actor was fired client-side. |
| `gunActorSetup` | `server-client/src/client-static/src/shellshock.min.js:2392` | `{ gunActor: this, shadowGen }` | A weapon's visual model finished setup. |
| `onPageLoadedEnd` | `server-client/src/client-static/src/shellshock.min.js:3190` | `{}` | The game's HTML page finished loading. |
| `joinGame` | `server-client/src/client-static/src/shellshock.min.js:3223` | `{ joinGameIdPassed }` | The client is about to send its join request. |
| `onExtraParams` | `server-client/src/client-static/src/shellshock.min.js:3314` | `{ extraParams }` | Extra join params (session, custom map, etc.) are being assembled. |
| `clientOnExtraGameInfo` | `server-client/src/client-static/src/shellshock.min.js:3422` | `{ extraInfo }` | Extra per-game info received from the server after joining. |
| `onShadowGeneratorCreated` | `server-client/src/client-static/src/shellshock.min.js:3578` | `{ shadowGen }` | The Babylon shadow generator was created for the scene. |
| `loadSounds` | `server-client/src/client-static/src/shellshock.min.js:3923` | `{ soundsList }` | Before the Apollo/Howler sound list is loaded. |
| `createMapCellsMapLoaded` | `server-client/src/client-static/src/shellshock.min.js:3997` | `{ minMap, SPS, gameScene, shadowGen, shadowLight }` | The raw map JSON has been fetched and is about to be turned into cells. |
| `modifyMinMap` | `server-client/src/client-static/src/shellshock.min.js:4028` | `event` | A direct hook to rewrite the map data itself before cell generation. |
| `createMapCells` | `server-client/src/client-static/src/shellshock.min.js:4055` | `{ minMap, SPS, gameScene, shadowGen, shadowLight }` | Map cells are being generated from `minMap`. |
| `onMapCompleteBeforeSetup` | `server-client/src/client-static/src/shellshock.min.js:4312` | `{ gameScene, minMap }` | Before final map setup finishes. |
| `onMapComplete` | `server-client/src/client-static/src/shellshock.min.js:4325` | `{ gameScene }` | After final map setup finishes. |
| `resetGamePlayer` | `server-client/src/client-static/src/shellshock.min.js:4671` | `{player}` | Client-local counterpart to the server's `resetGamePlayer` — round-scoped UI/state reset. |
| `addKillTextBefore` | `server-client/src/client-static/src/shellshock.min.js:5036` | `{msgs}` | Before the kill-feed text is rendered. |
| `onBalanceUpdated` | `server-client/src/client-static/src/shellshock.min.js:5058` | `{balance: playerAccount.currentBalance}` | The player's currency balance display changed. |
| `onResourcesLoadedEnd` | `server-client/src/client-static/src/shellshock.min.js:5103` | `{}` | All game resources (models/sounds/textures) finished loading. |
| `shellFragBurstBefore` | `server-client/src/client-static/src/shellshock.min.js:6197` | `{ player, count, theSize, theAnimLength }` | Before a shell-casing particle burst effect plays. |
| `syncToServer` | `server-client/src/client-static/src/shellshock.min.js:6760` | `{loadout}` | The client is about to push a loadout change to the server. |
| `waitForSetupAndAuthComplete` | `server-client/src/client-static/src/shellshock.min.js:6997` | `{waitIteration}` | The startup poll loop, waiting for auth and page setup to both finish, has started. |
| `waitForSetupAndAuthCompleteCheck` | `server-client/src/client-static/src/shellshock.min.js:7010` | `{waitIteration, customizer, authAttemptComplete, houseAdsLoaded}` | The startup poll loop is checking whether auth and page setup have both finished yet. |
| `waitForSetupAndAuthCompleteReady` | `server-client/src/client-static/src/shellshock.min.js:7013` | `{waitIteration}` | The startup poll loop has confirmed both auth and page setup are ready. |
| `setupComplete` | `server-client/src/client-static/src/shellshock.min.js:7028` | `{}` | The startup poll loop concluded successfully. |
| `reachedEnd` | `server-client/src/client-static/src/shellshock.min.js:7862` | `{}` | End of the whole client script file, once. |
| `loadMeshesBeforeMaterial` | `server-client/src/client-static/editor/js/mapEdit.js:88278` | `{mesh}` | Same hook as the shared `loading.js` version, duplicated for the standalone map-editor page. |

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
