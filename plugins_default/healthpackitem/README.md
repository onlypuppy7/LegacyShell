# Health Pack Item

Adds a Health Pack pickup item that heals the collecting player 50 HP, using the `game:AllItems` extension point - the same mechanism documented generically in [Recipe: New Pickup Item](/wiki/docs/04-Plugin%20Development/Recipes/new-pickup-item.md), from the plugin that recipe was itself modeled on.

## What it actually does

Registers a new pickup (`codeName: "HEALTH"`, mesh `healthpack.alt`) via `game:AllItems`. Its `collect` handler refuses collection outright (`return false`, leaving the item in place) if the player is already at full HP; otherwise it heals 50 HP server-side (`player.heal(50)`) and lets the item despawn normally. Also swaps the health-pack mesh's material to `standardInstanced` once the map finishes loading (`game:onMapComplete`), matching how other instanced pickups render.

## Notes

Ships its own model via `prepareBabylon` (`overwrite: false` - additive, doesn't replace anything) and its gameplay logic via `pluginSourceInsertion` into the browser bundle, following the same shape as every other single-item pickup plugin in this repo.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
