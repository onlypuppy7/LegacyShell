# Burnt Block Sets

Replaces the entire base `map` model set with a custom block set contributed by Burnt Apple - every map block, reskinned and/or reshaped at once, rather than adding new blocks alongside the defaults.

## What it actually does

Hooks `prepareBabylon` (both client and game builds) and, specifically for the `map` model file, pushes its own `models/*.babylon` files onto `extraBabylons` with `overwrite: true` - see [Stamps and Babylons](/wiki/docs/05-Codebase%20Reference/stamps-and-babylons.md) and [Map Blocks](/wiki/docs/03-Content%20Creation/map-blocks.md) for what that actually replaces. Since every default map block is defined in `map.babylon` (per [Dealing with Babylon Models](/wiki/docs/03-Content%20Creation/dealing-with-models.md)), this is a full visual reskin of the game's block palette, not an addition to it.

## Notes

The source has a large commented-out block (material-name namespacing per plugin, to avoid clashes between multiple block-set plugins overwriting the same names) that the author explicitly left in with the comment `//the below is actually fucking useless but i spent like 10 minutes on it so its staying` - a real, still-unsolved consideration if you're combining multiple block-replacement plugins that might define colliding material names. No `dependencies.js` - nothing else required.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
