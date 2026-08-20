# FancyGraphics

A small "readds old/nicer visual options" plugin - adds an optional fancy-shadows mode (hands and gun meshes cast shadows, not just the player body), an outline effect on fired bullets, and a little pop animation on the currency counter when your balance updates. Client-only - the constructor returns immediately (with a log line) on services or game servers.

## Setup

Depends on two other plugins, not npm packages (`dependencies.js`: `{ legacysettings: "plugin", legacythemes: "plugin" }`) - and actually *uses* both of their exposed APIs rather than just requiring they exist:

- Registers a new settings tab and two checkboxes ("Fancy Shadows", "Fancy Bullets", both default off) through [Legacy Settings](/plugins_default/legacysettings/README.md)'s `addTab`/`addCategory`/`addOption` framework.
- Registers itself as a selectable CSS theme ("Fancy Animations") through [Legacy Themes](/plugins_default/legacythemes/README.md)'s `stylePacks` list.

This is a genuinely good, real example of a plugin building on top of *other plugins'* extension points instead of hooking core LegacyShell events directly - see [Dependencies](/wiki/docs/04-Plugin%20Development/dependencies.md) for what a `"plugin"`-type dependency guarantees (the other plugin is loaded first) and what it doesn't (there's no formal API contract beyond whatever that plugin's own code happens to expose).

## What each option actually toggles

Both checkboxes are read live (`.get()`) inside the relevant render hooks, not cached - toggling either in the settings UI takes effect on the next shadow/bullet render without needing a reload:

- **Fancy Shadows** - adds player hand meshes and gun meshes to the shadow generator's render list (`playerActorShadowRenderList`, `gunActorSetup`), and bumps the shadow map resolution to `1024 * 5` on `onShadowGeneratorCreated`.
- **Fancy Bullets** - gives each fired bullet's visual mesh a rendered outline (`bulletActorFired`).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
