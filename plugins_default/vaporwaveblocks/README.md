# Vaporwave Map Blocks

Adds a full vaporwave-styled map block set, plus its own maps built around that block set - a content pack in the same family as [Burnt Block Sets](/plugins_default/burntblocksets/README.md), but shipping matching maps alongside the blocks rather than just the blocks alone.

## What it actually does

Ships models via `prepareBabylon` with `overwrite: true` for any of its own `.babylon` files (see [Map Blocks](/wiki/docs/03-Content%20Creation/map-blocks.md) for what `overwrite` actually replaces) and ships its own maps via `services:initTablesMaps`. No `dependencies.js`, no commands.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
