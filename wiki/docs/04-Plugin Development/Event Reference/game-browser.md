<!-- GENERATED — do not edit by hand. Run `npm run gen-docs` to regenerate. See src/scripts/gen-wiki-reference.js. -->

# `game:` events — in-browser gameplay

> **Audience:** Plugin authors and AI agents · **Prereqs:** [Events (concept)](../events-concept.md)

Every `plugins.emit(...)` call site found in the files below, extracted directly from source - not hand-maintained. Unprefixed at the call site; `PluginManager.emit` adds `game:` before checking for listeners, so e.g. the first row below actually fires as `game:startUp`.

| Event | Location | Payload | Fires when |
|---|---|---|---|
| `startUp` | `server-client/src/client-static/src/shellshock.min.js:99` | `{ }` | The in-browser game client script finished its own top-level setup. |
| `afterBullshit` | `server-client/src/client-static/src/shellshock.min.js:398` | `{}` | Fires after an early setup block (the name is kept verbatim from the original game source). |
| `LegacyShellOnMessage` | `server-client/src/client-static/src/shellshock.min.js:433` | `{cmd, cmdName, input}` | Every incoming server packet, after opcode decoding, before dispatch — a general-purpose network message hook; `data.input` is a still-positioned `Comm.In` reader, so a plugin can read a custom opcode's payload here. |
| `roomParamsUpdated` | `server-client/src/client-static/src/shellshock.min.js:450` | `{ roomParamsObj }` | A Comm.Code.updateRoomParams payload was just parsed (cheatsEnabled/Object.assign already handled by core) - lets a plugin render its own gameOptions.plugins-owned fields (e.g. legacyweather's weather/time rendering). |
| `roundEndSFX` | `server-client/src/client-static/src/shellshock.min.js:498` | `{roundLength, roundEndTime, betweenRounds}` | Round-end sound/UI cue. |
| `playerDeathAnimation` | `server-client/src/client-static/src/shellshock.min.js:681` | `{killedPlayer}` | A player's death animation is playing. |
| `inGameSync1` | `server-client/src/client-static/src/shellshock.min.js:788` | `{ id, stateIdx, x, y, z, dx, dy, dz, climbing, pingLevelInt }` | First stage of processing an incoming per-player sync entry. |
| `inGameSync2` | `server-client/src/client-static/src/shellshock.min.js:884` | `{ id, stateIdx, x, y, z, dx, dy, dz, climbing, pingLevelInt, dist, player }` | Second stage of processing an incoming per-player sync entry (remote players, distance-based detail). |
| `inGameSync3` | `server-client/src/client-static/src/shellshock.min.js:918` | `{ id, stateIdx, x, y, z, dx, dy, dz, climbing, pingLevelInt, player }` | Third stage of processing an incoming per-player sync entry. |
| `clearItemButtons` | `server-client/src/client-static/src/shellshock.min.js:1329` | `{ i, canvas }` | Shop/loadout UI item-button reset. |
| `encloseRenderPageFunc` | `server-client/src/client-static/src/shellshock.min.js:1479` | `{ i, b, canvas, renderingItem, locked, requiresPhysicalUnlock }` | Rendering one catalog item tile in the shop UI. |
| `playerActorBodyMeshCreated` | `server-client/src/client-static/src/shellshock.min.js:1739` | `{ playerActor: this, bodyMesh: this.bodyMesh, player }` | A player's visual body mesh finished loading. |
| `playerActorShadowRenderList` | `server-client/src/client-static/src/shellshock.min.js:1768` | `{ playerActor: this, shadowGen: shadowGen }` | The player mesh was registered with the shadow generator. |
| `playerActorRemoveFromPlay` | `server-client/src/client-static/src/shellshock.min.js:1951` | `{ playerActor: this }` | A player's visual actor is being hidden (died or left). |
| `playerActorRestoreToPlay` | `server-client/src/client-static/src/shellshock.min.js:1960` | `{ playerActor: this }` | A player's visual actor is being restored (respawned). |
| `bulletActorFired` | `server-client/src/client-static/src/shellshock.min.js:2120` | `{ bulletActor: this }` | A visual bullet actor was fired client-side. |
| `gunActorSetup` | `server-client/src/client-static/src/shellshock.min.js:2191` | `{ gunActor: this, shadowGen }` | A weapon's visual model finished setup. |
| `onPageLoadedEnd` | `server-client/src/client-static/src/shellshock.min.js:2989` | `{}` | The game's HTML page finished loading. |
| `joinGame` | `server-client/src/client-static/src/shellshock.min.js:3022` | `{ joinGameIdPassed }` | The client is about to send its join request. |
| `onExtraParams` | `server-client/src/client-static/src/shellshock.min.js:3112` | `{ extraParams }` | Extra join params (session, custom map, etc.) are being assembled. |
| `clientOnExtraGameInfo` | `server-client/src/client-static/src/shellshock.min.js:3220` | `{ extraInfo }` | Extra per-game info received from the server after joining. |
| `onShadowGeneratorCreated` | `server-client/src/client-static/src/shellshock.min.js:3376` | `{ shadowGen }` | The Babylon shadow generator was created for the scene. |
| `loadMaterials` | `server-client/src/client-static/src/shellshock.min.js:3668` | `{ scene }` | Core's built-in materials have just been defined - lets a plugin define its own right after (e.g. legacyweather's wet material). |
| `loadSounds` | `server-client/src/client-static/src/shellshock.min.js:3722` | `{ soundsList }` | Before the Apollo/Howler sound list is loaded. |
| `createMapCellsMapLoaded` | `server-client/src/client-static/src/shellshock.min.js:3790` | `{ minMap, SPS, gameScene, shadowGen, shadowLight }` | The raw map JSON has been fetched and is about to be turned into cells. |
| `modifyMinMap` | `server-client/src/client-static/src/shellshock.min.js:3821` | `event` | A direct hook to rewrite the map data itself before cell generation. |
| `createMapCells` | `server-client/src/client-static/src/shellshock.min.js:3848` | `{ minMap, SPS, gameScene, shadowGen, shadowLight }` | Map cells are being generated from `minMap`. |
| `onMapCompleteBeforeSetup` | `server-client/src/client-static/src/shellshock.min.js:4105` | `{ gameScene, minMap }` | Before final map setup finishes. |
| `onMapComplete` | `server-client/src/client-static/src/shellshock.min.js:4118` | `{ gameScene }` | After final map setup finishes. |
| `resetGamePlayer` | `server-client/src/client-static/src/shellshock.min.js:4386` | `{player}` | Client-local counterpart to the server's `resetGamePlayer` — round-scoped UI/state reset. |
| `leaveGame` | `server-client/src/client-static/src/shellshock.min.js:4482` | `{}` | The player is leaving the game for the main menu - fired just before the game scene is disposed. A plugin should stop anything it started for the game (sounds, timers). |
| `addKillTextBefore` | `server-client/src/client-static/src/shellshock.min.js:4752` | `{msgs}` | Before the kill-feed text is rendered. |
| `onBalanceUpdated` | `server-client/src/client-static/src/shellshock.min.js:4774` | `{balance: playerAccount.currentBalance}` | The player's currency balance display changed. |
| `onResourcesLoadedEnd` | `server-client/src/client-static/src/shellshock.min.js:4819` | `{}` | All game resources (models/sounds/textures) finished loading. |
| `shadowsToggled` | `server-client/src/client-static/src/shellshock.min.js:5499` | `{ shadowsEnabled: false }` | Shadows were just switched on or off (by the settings or the auto-detail optimiser) and the map's material swapped with them; `data.shadowsEnabled` is the new state. Lets a plugin re-apply anything that replaces the map material. |
| `shadowsToggled` | `server-client/src/client-static/src/shellshock.min.js:5506` | `{ shadowsEnabled: true }` | Shadows were just switched on or off (by the settings or the auto-detail optimiser) and the map's material swapped with them; `data.shadowsEnabled` is the new state. Lets a plugin re-apply anything that replaces the map material. |
| `explosionSpriteAfter` | `server-client/src/client-static/src/shellshock.min.js:5888` | `{ sprite: s, manager, isFire: manager == explosionFireManager }` | After an explosion or rocket-trail smoke/fire sprite has been set up (spawned with its animColors, which are re-applied to sprite.color every tick, so a plugin recolours them by replacing sprite.animColors). |
| `shellFragBurstBefore` | `server-client/src/client-static/src/shellshock.min.js:5918` | `{ player, count, theSize, theAnimLength }` | Before a shell-casing particle burst effect plays. |
| `shellFragBurstAfter` | `server-client/src/client-static/src/shellshock.min.js:5947` | `{ player, count }` | After an egg's shell fragments have been spawned (death or heavy damage); the fragment sprites are in shellFragManager. |
| `yolkBurstAfter` | `server-client/src/client-static/src/shellshock.min.js:5975` | `{ player, manager: yolkManager }` | After the yolk particles of an egg death have been spawned; `manager` is the yolk sprite manager. |
| `syncToServer` | `server-client/src/client-static/src/shellshock.min.js:6493` | `{loadout}` | The client is about to push a loadout change to the server. |
| `waitForSetupAndAuthComplete` | `server-client/src/client-static/src/shellshock.min.js:6730` | `{waitIteration}` | The startup poll loop, waiting for auth and page setup to both finish, has started. |
| `waitForSetupAndAuthCompleteCheck` | `server-client/src/client-static/src/shellshock.min.js:6743` | `{waitIteration, customizer, authAttemptComplete, houseAdsLoaded}` | The startup poll loop is checking whether auth and page setup have both finished yet. |
| `waitForSetupAndAuthCompleteReady` | `server-client/src/client-static/src/shellshock.min.js:6746` | `{waitIteration}` | The startup poll loop has confirmed both auth and page setup are ready. |
| `setupComplete` | `server-client/src/client-static/src/shellshock.min.js:6761` | `{}` | The startup poll loop concluded successfully. |
| `reachedEnd` | `server-client/src/client-static/src/shellshock.min.js:7595` | `{}` | End of the whole client script file, once. |
| `loadMeshesBeforeMaterial` | `server-client/src/client-static/editor/js/mapEdit.js:88278` | `{mesh}` | Same hook as the shared `loading.js` version, duplicated for the standalone map-editor page. |

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
