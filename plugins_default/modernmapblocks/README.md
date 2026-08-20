# Modern Map Blocks

Re-adds newer (post-0.17.0) Shell Shockers map block models - purely a model/content pack, no gameplay logic of its own.

## What it actually does

Hooks `prepareBabylon` (client and game) and adds every `.babylon` file under its own `models/` folder as an **additive** model source (`overwrite: false`) - existing map blocks aren't replaced, these are new blocks available alongside them. No `dependencies.js`, no commands, no other event hooks.

## Notes

`christmasevent` depends on this plugin (see its own page) for some of the block types its seasonal decoration logic looks for. Compare with [Burnt Block Sets](/plugins_default/burntblocksets/README.md), which uses `overwrite: true` scoped to just the `map` filename to fully re-theme the default block set instead of adding to it.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
