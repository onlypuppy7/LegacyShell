<!-- GENERATED — do not edit by hand. Run `npm run gen-docs` to regenerate. See src/scripts/gen-wiki-reference.js. -->

# `game:` events — shared logic (`src/shell/`)

> **Audience:** Plugin authors and AI agents · **Prereqs:** [Events (concept)](../events-concept.md)

Every `plugins.emit(...)` call site found in the files below, extracted directly from source - not hand-maintained. Unprefixed at the call site; `PluginManager.emit` adds `game:` before checking for listeners, so e.g. the first row below actually fires as `game:bulletHitEffect`.

| Event | Location | Payload | Fires when |
|---|---|---|---|
| `bulletHitEffect` | `src/shell/bullets.js:146` | `{ x, y, z, dx, dy, dz, player: this.player }` | A bullet impact occurred (wall or player) — a visual/effect hook, fires on both client and server. |
| `bulletHitAfter` | `src/shell/bullets.js:165` | `{ x, y, z, dx, dy, dz, player: this.player }` | After hit resolution/damage has been applied for that bullet. |
| `setUpShopAvailableBeforeEventLoop` | `src/shell/catalog.js:255` | `{ shop, Math, items, mondayStart, eventsMonday }` | Inside the weekly shop-rotation algorithm, before seasonal-event item pools are folded into the candidate set. |
| `setUpShopAvailableBeforeApply` | `src/shell/catalog.js:309` | `{ shop, Math, items, mondayStart, eventsMonday }` | Inside the weekly shop-rotation algorithm, before the final tier selection is written to the database. |
| `constantsFinished` | `src/shell/constants.js:538` | `{}` | All shared constants/enums have been computed at module load — signals other shared modules that it's now safe to reference them. |
| `eventsInit` | `src/shell/events.js:256` | `{ events: this.events, this: this }` | The seasonal `EventManager` finished loading `defaultEvents`. This same call site fires under either `services:` or `game:` depending on which process is running it. |
| `GameTypesInit` | `src/shell/gametypes.js:132` | `{ GameTypes, ItemTypes, defaultOptions }` | Before `GameTypes` is deep-merged against `defaultOptions` — the extension point for registering an entirely new gamemode. |
| `fireEggk47` | `src/shell/guns.js:117` | `{this: this, pos, dir, Eggk47}` | The Eggk47 fired — immediately followed by `if (!plugins.cancel) Bullet.fire(...)`, so a listener can fully replace this weapon's projectile behavior by setting `plugins.cancel`. |
| `fireDozenGauge` | `src/shell/guns.js:147` | `{this: this, pos, dir, DozenGauge}` | The Dozen Gauge fired — same `plugins.cancel` override pattern as `fireEggk47`. |
| `fireDozenGaugeBullet` | `src/shell/guns.js:154` | `{this: this, pos, v1: this.v1, DozenGauge}` | One pellet of the Dozen Gauge's shotgun spread is about to fire — fires once per pellet, distinct from the single `fireDozenGauge` event for the overall trigger pull. |
| `fireCSG1` | `src/shell/guns.js:185` | `{this: this, pos, dir, CSG1}` | The CSG1 (Free Ranger) fired — same `plugins.cancel` override pattern as `fireEggk47`. |
| `fireCluck9mm` | `src/shell/guns.js:215` | `{this: this, pos, dir, Cluck9mm}` | The Cluck9mm fired — same `plugins.cancel` override pattern as `fireEggk47`. |
| `fireRPEGG` | `src/shell/guns.js:247` | `{this: this, pos, dir, RPEGG}` | The RPEGG (Eggsploder) fired — followed by `if (!plugins.cancel) Rocket.fire(...)` rather than `Bullet.fire(...)`, since this weapon fires a rocket projectile. |
| `AllItems` | `src/shell/items.js:100` | `{ AllItems, ItemActor, dummyItem }` | Before the flat pickup-item array (`AMMO`, `GRENADE`, …) is indexed into `ItemTypes` — push a new pickup item type onto `data.AllItems` here. Fired from inside the exported `initItems()` function, called explicitly once `plugins.loadPlugins('game')` resolves (see `server-game/run-game.js` and `server-game/src/worker.js`) rather than automatically at module load — module-load-time firing was unreliable server-side. Still fires immediately at module load on the client, where no such ordering issue exists. |
| `itemsLoaded` | `src/shell/items.js:109` | `{ AllItems, ItemTypes, ItemActor, dummyItem }` | After pickup items are indexed — `ItemTypes` and each item's `id` are now final. Same `initItems()` timing as `AllItems` above. |
| `loadMeshesBeforeMaterial` | `src/shell/loading.js:79` | `{mesh}` | During mesh loading, before a material is assigned — lets a plugin swap in a different material/texture. |
| `permissionsAfterSetup` | `src/shell/permissions.js:707` | `{ this: this }` | End of `PermissionsConstructor`'s constructor, after every built-in command is registered — the extension point for registering new slash commands via `data.this.newCommand(...)`. |
| `updateBefore` | `src/shell/player.js:241` | `{ player: this, delta, resim }` | Start of `Player.update()`, before movement/physics for that tick — the main per-player-per-tick hook. |
| `onStandOnBlock` | `src/shell/player.js:746` | `{mesh, this: this, out}` | Per-tick, when a player's feet resolve against a block mesh — used for special surface behavior (e.g. a parkour gamemode). |
| `onStandOnTile` | `src/shell/player.js:749` | `{mesh, this: this}` | Per-tick, when a player's feet resolve against a tile mesh — same use case as `onStandOnBlock` for a different mesh category. |
| `canJump` | `src/shell/player.js:758` | `{ this: this, canJump }` | Before jump eligibility is finalized — a listener can override the boolean. |
| `onPlayerDeath` | `src/shell/player.js:1205` | `{player: this, firedId}` | A player has died — `firedId` identifies the killer (or is absent/null for an environmental death). |
| `prepareBabylonBefore` | `src/shell/general/prepare-babylons.js:45` | `{ baseBabylons, babylonDirFiles, addBabylonToZip }` | Model-build pipeline: register new `.babylon` filenames into `data.baseBabylons` before file paths are resolved. |
| `prepareBabylon` | `src/shell/general/prepare-babylons.js:84` | `{ filename, baseBabylon: undefined, extraBabylons }` | Model-build pipeline: supply the actual file path for a previously-registered `.babylon` filename. |
| `prepareBabylonExtra` | `src/shell/general/prepare-babylons.js:141` | `{ filename, baseBabylon, extraBabylonData, item }` | Model-build pipeline: reconcile a per-item "extra" babylon/skeleton against the base model (e.g. bone-index fixups). |

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
