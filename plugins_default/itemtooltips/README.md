# Item ToolTips

Adds a hover tooltip showing an item's name when hovering over its tile in the shop UI - a small, self-contained UI enhancement.

## What it actually does

Hooks `game:encloseRenderPageFunc` (fired once per rendered shop item tile) to attach a floating `<div>` tooltip element to that tile's canvas, positioned via `mousemove`, shown/hidden via `mousemove`/`mouseout`. Hooks `game:clearItemButtons` to tear the tooltip and its listeners back down when the shop UI resets (e.g. switching category) - without this cleanup step, tooltips from a previous render pass would silently pile up as detached DOM nodes and stale event listeners every time the shop tiles re-render.

## Notes

Purely client-side UI, no server-side behavior at all (only registers `client:pluginSourceInsertion`). A good minimal reference if you're building something in the same family as [Recipe: UI Modification](/wiki/docs/04-Plugin%20Development/Recipes/ui-modification.md) but need it to specifically hook into shop-tile rendering rather than a one-off banner.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
