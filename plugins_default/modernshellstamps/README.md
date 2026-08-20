# Modern Shell Stamps

Re-adds newer (post-0.17.0) Shell Shockers stamps.

## What it actually does

Registers its own `stamps/` folder via `client:stampImageDirs` (see [Stamps and Babylons](/wiki/docs/05-Codebase%20Reference/stamps-and-babylons.md)) rather than shipping `.babylon` models - stamps are composited into a sprite sheet, not loaded as 3D geometry. Uses the same forced items-table reseed as [Modern Shell Guns](/plugins_default/modernshellguns/README.md) and [Modern Shell Hats](/plugins_default/modernshellhats/README.md) (`services:initTablesStart` drop-and-reinit, then `initTablesBefore` inserts its own item rows) so its stamps are always present on boot rather than only on a genuinely empty database.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
