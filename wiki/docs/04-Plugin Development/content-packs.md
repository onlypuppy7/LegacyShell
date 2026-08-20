# Content Packs

> **Audience:** Plugin authors · **Prereqs:** [Static Assets](./static-assets.md)
>
> **Canonical source:** `server-services/start-services.js` (the `initTables` pipeline), `server-services/src/data_management/recordsManagement.js` (`insertItems`, `insertMaps`), `plugins_default/legacyshellcore/index.js` (the real reference implementation)

A "content pack" plugin ships new items, maps, and/or models - `legacyshellcore` (the maintainer's own catalog of custom content for the public instance) is the canonical example, and worth reading in full once this page makes sense. This is the pattern the README refers to when it says purely cosmetic content should go in a plugin rather than the base game.

## Items

Default items are loaded from `.js` files in `server-services/src/items/` - one file per weapon/category, each exporting a default object keyed by category name, containing an array of item definitions:

```js
// server-services/src/items/CSG1.js (a real default file, shown for shape reference)
export default {
    "CSG1": [{
        "meta_id": 0,
        "id": 3400,
        "name": "CSG1",
        "price": 0,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": { "class": "CSG1", "meshName": "gun_csg1", "tags": ["DefaultUnlocks"] },
        "is_available": false
    }, /* ... */]
};
```

Your plugin ships its own directory of files in this same shape, and calls `ss.recs.insertItems(yourDir)` to load them - **on `services:initTables`**, not `initTablesBefore`:

```js
this.plugins.on('services:initTables', this.initTables.bind(this));

async initTables(data) {
    await data.ss.recs.insertItems(path.join(this.thisDir, 'items'));
};
```

::: warning Use `initTables`, not `initTablesBefore`, for your own items
It's tempting to reach for `initTablesBefore` since the name suggests "before the defaults load" - but default items only ever get (re)inserted when the `items` table is completely empty (a genuinely fresh database), so `initTablesBefore` only fires once, ever, on a brand-new install. `initTables` fires on **every single boot**, after the empty-table check either ran or didn't - that's why `legacyshellcore` (the real reference implementation) uses it, and why your own item pack should too. This is the difference between your items appearing once and then never again after a database wipe, versus appearing reliably every time services starts.
:::

### Meta ID ranges

Item `meta_id`s share one numeric space across the whole game, so collisions are a real risk. The convention documented directly in the default item files:

| Range | Reserved for |
|---|---|
| `0` - `10,000` | Original Shell Shockers items |
| `10,000` - `20,000` | `legacyshellcore` |
| `20,000+` | Fair game for other plugins |

Pick a range for your plugin and stay inside it - there's no enforced uniqueness check beyond what SQLite's primary key does, so an accidental collision silently overwrites another plugin's item rather than erroring.

## Maps

Default maps are `.json` files (in the actual Shell Shockers map-editor export format) in `server-services/src/maps/`, reloaded from scratch on **every** services boot (the entire `maps` table is deleted and rebuilt every time, no empty-check gate like items has). Ship your own directory of map JSONs and call `ss.recs.insertMaps(yourDir)` on `services:initTablesMaps`, which fires right after the defaults have been reloaded:

```js
this.plugins.on('services:initTablesMaps', this.initTablesMaps.bind(this));

async initTablesMaps(data) {
    await data.ss.recs.insertMaps(path.join(this.thisDir, 'maps'));
};
```

Because this whole table is rebuilt every boot, there's no "only runs once" gotcha here the way there is for items - `initTablesMaps` is unconditionally the right hook.

## Models

New 3D content (guns, hats, map blocks) needs actual `.babylon` model files merged into the game's model set, on **both** the client server (build-time) and the game server (runtime, for server-side collision meshes) - hence these hooks fire under both `client:` and `game:` prefixes identically:

```js
this.plugins.on('client:prepareBabylonBefore', this.prepareBabylonBefore.bind(this));
this.plugins.on('game:prepareBabylonBefore', this.prepareBabylonBefore.bind(this));
this.plugins.on('client:prepareBabylon', this.prepareBabylon.bind(this));
this.plugins.on('game:prepareBabylon', this.prepareBabylon.bind(this));

async prepareBabylonBefore(data) {
    // list your own .babylon files so the build knows they exist
    const babylonPath = path.join(this.thisDir, 'models');
    this.babylonFiles = fs.readdirSync(babylonPath);
    for (const file of this.babylonFiles) {
        data.baseBabylons.push({ filename: file.replace('.babylon', ''), /* ...metadata... */ });
    };
};

async prepareBabylon(data) {
    // supply the actual file path when asked for a specific one
    for (const file of this.babylonFiles) {
        if (data.filename + ".babylon" === file) {
            data.extraBabylons.push({ /* path, overwrite/location metadata */ });
        };
    };
};
```

This two-step handshake (declare filenames first, then resolve them to actual paths when asked) is how the build step merges base models with every plugin's extra models into one final set. If you're only adding a genuinely new model (not modifying an existing one), see [Dealing with Babylon Models](../03-Content%20Creation/dealing-with-models.md) first for how to actually produce a `.babylon` file - this page only covers wiring an existing one into the plugin/build system.

## Serving the files themselves

None of the hooks above make your `models/`/`items/`/`maps/` folders reachable over HTTP - that's a separate, simpler step covered in [Static Assets](./static-assets.md) (`client:onStartServer` + `express.static`). A typical content-pack plugin uses both: static-serving for the raw files the browser downloads, and the hooks on this page for telling the database/build pipeline those files exist.

## Common Issues

**My items appeared once and then vanished after I restarted services.** You're hooking `initTablesBefore` - switch to `initTables` (see the warning above).

**Two plugins' items are stomping on each other.** Check for a `meta_id` range collision - see the table above.

Next: [Networking](./networking.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
