# Modern Shell Hats

Re-adds newer (post-0.17.0) Shell Shockers hat models and their items, additively.

## What it actually does

Ships models via the standard additive `prepareBabylon` hook (`overwrite: false`). Uses the same forced-reseed technique as [Modern Shell Guns](/plugins_default/modernshellguns/README.md): `services:initTablesStart` drops the whole `items` table before `initTablesBefore` inserts this plugin's own hats, guaranteeing they're present on every boot rather than only the first time the database happens to be empty - see [Services Internals](/wiki/docs/05-Codebase%20Reference/services-internals.md#the-inittables-db-seeding-pipeline-exact-sequencing-matters) for why that matters. No commands, no other event hooks, no `dependencies.js`.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
