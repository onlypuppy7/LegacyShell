# Christmas Event

A seasonal content plugin: adds Christmas-themed models (a gift box, mistletoe, baubles, stockings, wreaths, gingerbread, candy canes, snowy tree variants), swaps certain map blocks for snowy versions, procedurally scatters decorations across whatever map is loaded, and turns on a snowstorm weather effect - all gated on the "christmas" [seasonal event](/wiki/docs/03-Content%20Creation/seasonal-events.md) actually being active.

## Setup

Depends on `modernmapblocks` (`dependencies.js`: `{ modernmapblocks: "plugin" }`).

## What it actually does

- **Server-side**: on `game:roomInitEnd`, if the "christmas" event is currently active (via `#events`' `getEventsAtTime()`) and the map doesn't opt out (`minMap.extents.seasonalEffectsDisabled`), sets `gameOptions.weather.snowStormEnabled = true` for that room.
- **Client-side** (spliced into the browser bundle via `pluginSourceInsertion`, gated once at bundle-build time by `events.currentArray.includes("christmas")` - not re-checked live): renames specific tree meshes on `game:createMapCells` (e.g. `nature.tree-01.aabb` becomes `christmas.tree-large.aabb`) to swap in snowy variants on *any* map, without that map needing to be authored with Christmas content itself. Then, on `game:createMapCellsMapLoaded`, procedurally scans every cell for likely-flat-surface blocks (roughly: `full`-collider blocks, arches, and specific "half"/"round-out" shapes, while excluding barriers, trees, and cap pieces) and scatters snow, then randomly places gifts/mistletoe/baubles/stockings/wreaths/gingerbread/candy canes based on adjacency checks (is there a wall here, a ceiling there, is the spot actually open) with a per-decoration-type placement chance.
- The tree-renaming step is a concrete, real example of the `modifyMinMap`/`createMapCells` map-loading hooks (see the [browser event reference](/wiki/docs/04-Plugin%20Development/Event%20Reference/game-browser.md)) being used to alter a map's block layout at load time, generically, without editing the map file itself.

## Notes

The procedural decoration logic runs once per map load and its own source comment admits the placement condition is "a huge mess of a condition" - if you're extending it, read `createMapCellsMapLoaded` in `client.js` directly rather than guessing from this summary, since the exact accept/reject rules are intricate.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
