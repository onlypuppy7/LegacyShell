# LegacyShellCore

The flagship content-pack plugin - custom maps, items, stamps, a baseline shop pool, and a couple of gameplay easter eggs, all bundled together. Referenced throughout the rest of this wiki as the canonical example of the [Content Packs](/wiki/docs/04-Plugin%20Development/content-packs.md) shape (models + items + maps + client code, one plugin).

## What it actually ships

- **Maps**: `maps/Flat.json`, `Smallville.json` (loaded via `services:initTablesMaps`). A separate `maps_disabled/` folder (several 0.9.0-era alpha maps, "Brimstone", "Two Towers Too Many") sits alongside it but is never read - only `maps/` gets passed to `insertMaps`, so anything in `maps_disabled/` is present in the repo but genuinely inactive, not just cosmetically hidden.
- **Items and models**: via the standard `initTables`/`prepareBabylon` hooks (see [Content Packs](/wiki/docs/04-Plugin%20Development/content-packs.md)).
- **Stamps**: registers its own `stamps/` folder via `client:stampImageDirs` (see [Stamps and Babylons](/wiki/docs/05-Codebase%20Reference/stamps-and-babylons.md)).
- **A permanent baseline shop pool**: registers a synthetic seasonal event (`services:eventsInit`) named `_legacyshellcore` that starts `01-01` and lasts `999w` - functionally "always active" - defining `tier1pool`/`tier2pool`/`tier3pool` item-tag lists (`tier2count: 3`, `tier3count: 8`). This is the real mechanism the public instance uses to give the [weekly shop rotation](/wiki/docs/05-Codebase%20Reference/catalog-and-items.md#the-weekly-shop-rotation-algorithm-setupshopavailable) a permanent pool to draw from, expressed as an ordinary (if unusually long) seasonal event rather than a separate system.
- **A map tag tweak via `insertMaps`**: adds a `Hiroshima` gamemode flag to the "Ruins" and "Shipyard" maps specifically (the source comment: "better than modifying the maps directly") - a real example of adjusting default map data from a plugin instead of hand-editing the shipped map JSON.

## Two gameplay easter eggs

Both gated behind a room's `gameOptions.glitchyRoom1`/`glitchyRoom2` flags (not exposed through any normal command in this plugin itself - something else would need to set them):

- **`glitchyRoom1`**: every `metaLoop` tick (2000ms), broadcasts a custom `glitchedKek` packet full of random bytes to every client in the room and posts a "The room has been glitched!" notification - a harmless, purely cosmetic troll effect.
- **`glitchyRoom2`**: on `game:clientPackSyncLoop`, sets `plugins.cancel = true` and packs garbage `controlKeys`/`yaw`/`pitch` values into the outgoing sync packet instead of the real ones - a real, if silly, example of [`plugins.cancel`](/wiki/docs/04-Plugin%20Development/events-concept.md#plugins-cancel-opting-out-of-default-behavior) fully replacing a default packet-building step, same mechanism as [Replacing Core Behaviour](/wiki/docs/04-Plugin%20Development/Recipes/replacing-core-behaviour.md), just aimed at chaos instead of a real feature.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
