# Crackshot

Adds Crackshot, the 0.20.0-era bolt-action sniper rifle (internally the `M24` weapon class), as a brand new primary-weapon slot rather than reskinning an existing one - it registers its own `CharClass` entry, item-ID offset range, and sound set, and ships its own item pack, models, and client-side gun logic.

The `5_` prefix on the folder name is purely a load-order trick (see [Lifecycle](/wiki/docs/04-Plugin%20Development/lifecycle.md#load-order-and-why-some-plugins-have-number-prefixed-identifiers)) - it has nothing to do with the weapon itself, and doesn't appear in `PluginMeta.identifier`'s displayed name.

## What it actually does

- Registers the `M24` gun class and a new character-class slot at load time (`constantsFinished`), on both the browser bundle and the Node game server.
- Ships its own item pack via `services:initTables` (`ss.recs.insertItems(...)`) and its own `.babylon` models via `prepareBabylonBefore`/`prepareBabylon`.
- Injects its weapon logic into the browser bundle via `client:pluginSourceInsertion` (splicing in `shared.js`), and serves its own static client assets via `express.static` on `client:onStartServer`.
- **Rebalances an existing weapon as a side effect**: `reachedEnd` sets `CSG1.rof = 30` and `CSG1.damage = 105` (`CSG1.totalDamage` follows) - a deliberate balance change made specifically because Crackshot exists, not a bug. Disabling this plugin without accounting for that will leave CSG1 at these adjusted values unless something else resets them.

## Notes

- No `dependencies.js` - no npm packages or other plugins required.
- `_zaxoniuscustomguns` (see its own page) depends on this plugin (`"5_crackshot": "plugin"`) to reuse its weapon slot with a different model set.
- Source comments call out its own oddities (`//its so inconsistent its infuriating`, `//(????????????????)` next to some stat overrides) - a sign the balance numbers were tuned empirically rather than derived from a formula; don't assume the constants mean anything beyond "this is what shipped."

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
