# Content Creation

> **Audience:** Map, model, and skin makers - semi-technical, no coding required · **Prereqs:** [Getting Started](../01-Getting%20Started/)

This section is for making content for LegacyShell - maps, 3D models, item skins, sounds - without writing any JavaScript. If you end up wanting that content to unlock new gameplay behavior (not just cosmetics), you'll eventually cross into [Plugin Development](../04-Plugin%20Development/), but everything here stands alone first.

## What's here

- **[Maps](./maps.md)** - the in-game map editor, the underlying JSON format, adding a map to the pool.
- **[Dealing with Babylon models](./dealing-with-models.md)** - the existing, thorough guide to `.babylon` files, Blender export, and common export errors. *(Already written - not part of this doc effort, just relocated here.)*
- **[Map blocks](./map-blocks.md)** - adding new collidable blocks via `map.babylon`, and exactly how each collider type actually generates its collision.
- **[Items and skins](./items-and-skins.md)** - the item definition shape, IDs, offsets, pricing.
- **[Hats and stamps](./hats-and-stamps.md)** - how the stamp spritesheet is generated and UV-mapped onto models.
- **[Sounds](./sounds.md)** - the Apollo/Howler audio layer, adding new sounds.
- **[Gamemodes](./gamemodes.md)** - `gameOptions`, per-team modifiers, timed rounds (config-level, not code-level).
- **[Seasonal events](./seasonal-events.md)** - the date-range event scheduler and its shop pools.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
