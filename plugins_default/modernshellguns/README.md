# Modern Shell Guns

Re-adds newer (post-0.17.0) Shell Shockers gun models and their items, alongside the legacy 0.17.0-era weapons rather than replacing them.

## What it actually does

- Adds its models additively (`overwrite: false`, like [Modern Map Blocks](/plugins_default/modernmapblocks/README.md)), but with an extra step on `prepareBabylonExtra`: it renames the modern gun meshes (`gun_eggk47` -> `gun_eggk47_modern`, and similarly for `dozenGauge`/`csg1`/`rpegg`/`cluck9mm`) specifically to avoid colliding with the legacy meshes of the same name that LegacyShell's base game already defines.
- **Forces a full items-table reseed on every boot**: `services:initTablesStart` drops the entire `items` table (`DROP TABLE IF EXISTS items`) and re-runs `recs.initDB`, before `initTablesBefore` inserts this plugin's own items. This is a deliberate, real use of the sequencing described in [Services Internals](/wiki/docs/05-Codebase%20Reference/services-internals.md#the-inittables-db-seeding-pipeline-exact-sequencing-matters) - normally `initTablesBefore` only ever fires once, on a database that happens to be completely empty; this plugin sidesteps that by making the table empty again on every single boot, guaranteeing its own items are always present without a manual database wipe.

## Notes

That reseed strategy is aggressive - it wipes and rebuilds the *entire* items table (not just this plugin's own rows) on every boot the plugin is active. If you're combining this with other item-adding plugins, check they insert via `initTablesBefore`/`initTables` (not something that assumes a stable table across restarts) so they still get reseeded correctly on the boot after this plugin's drop.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
