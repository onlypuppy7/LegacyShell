# Maps

> **Audience:** Map makers · **Prereqs:** [Getting Started](../01-Getting%20Started/)
>
> **Canonical source:** `server-services/src/maps/*.json`, `server-services/src/data_management/recordsManagement.js` (`insertMaps`)

Building and installing a custom map - no coding required, using the in-game map editor.

## The editor

Open **`/editor`** on any client server (e.g. `http://localhost:13370/editor`) - it's a full 3D block-placement editor running in the browser, built on the same rendering pipeline as the game itself. Place blocks from a palette of models, set spawn points (the `SPECIAL.spawn-blue.none`/`SPECIAL.spawn-red.none` block types), test your map directly in the editor before exporting.

This isn't a LegacyShell-specific format - it's the same map editor and file format the original Shell Shockers game used, which is why the root README notes map JSON files are "directly compatible with those exported from the Shell Shockers map editor." If you've ever made a Shell Shockers map before, nothing here is new.

## The file format

An exported map is a single JSON file:

```json
{
    "fileVersion": 1,
    "data": {
        "generic.grass.full": [{ "x": 0, "y": 0, "z": 0, "ry": 2 }, ...],
        "town.shop1.full": [{ "x": 5, "y": 0, "z": 3 }, ...]
    },
    "palette": ["SPECIAL.spawn-blue.none", "SPECIAL.spawn-red.none", "town.shop1.full", ...],
    "width": 20,
    "height": 6,
    "depth": 20,
    "name": "Blue",
    "surfaceArea": 482
}
```

`data` is keyed by mesh name (matching a model in `map.babylon` - see [Dealing with Babylon Models](./dealing-with-models.md) and [Map Blocks](./map-blocks.md) if you need a block type that doesn't already exist), each holding an array of placements (`x`/`y`/`z` grid position, optional `ry` rotation). You won't typically hand-edit this - the editor produces it - but it's a plain, readable format if you ever need to script a change across many maps.

## Installing a map

Once exported, a map becomes playable by placing its JSON file where services reads maps from and restarting:

```bash
cp YourMap.json server-services/src/maps/
```

Then restart the services server - `initTablesMaps` unconditionally wipes and reloads the entire `maps` table from this directory on every boot (see [The Database](../02-Running%20a%20Server/the-database.md)), so a new file just needs to be present at the next restart, no separate "install" step.

If you're distributing a map pack as a plugin instead of editing the base game directly (the preferred approach per this project's "could this be a plugin?" philosophy - see the root README), see [Content Packs](../04-Plugin%20Development/content-packs.md#maps) instead, which covers the equivalent `services:initTablesMaps` + `ss.recs.insertMaps(...)` hook for shipping your own maps directory from a plugin folder.

## Fields set outside the editor

A few map properties aren't part of the editor export and instead come from the database row's own defaults (or need setting directly) - `sun`, `fog` *(unused)*, `skybox`, `modes` (which gamemodes the map is valid for, e.g. `{"FFA":true,"Teams":true}`), `availability` (`public`/`private`/`both`), and `numPlayers` (spawn-count hint). See the [generated database schema](../05-Codebase%20Reference/Generated/database-schema.md#maps) for the full column list and current defaults - editing these means editing the database row directly (or the plugin-side map object before calling `insertMaps`) rather than through the in-game editor.

## Common Issues

**My map doesn't show up after restarting services.** Confirm the file actually landed in `server-services/src/maps/` (not a client or game server's own directory - only services reads this path) and that it's valid JSON - a parse error here fails that one file's insert silently rather than crashing the whole boot.

**Blocks I placed aren't rendering / show as missing geometry.** The mesh name in your placement doesn't exist in the currently-loaded `map.babylon` - see [Map Blocks](./map-blocks.md) for adding new block types, or double check you're using a block from the standard palette if you didn't intend to add anything custom.

Next: [Map Blocks](./map-blocks.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
