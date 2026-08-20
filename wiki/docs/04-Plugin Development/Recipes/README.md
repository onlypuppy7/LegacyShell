# Recipes

> **Audience:** Plugin authors · **Prereqs:** Everything else in [Plugin Development](../)

Complete, working plugins - each one validated against a real (isolated, scratch) LegacyShell instance while being written, not just written and hoped to be correct.

Not sure which recipe (or which page in general) actually answers your question? **[I Want To...](../i-want-to.md)** is a task-oriented index of this entire section and the rest of Plugin Development, phrased as goals rather than page titles.

## Available

- **[Killstreaks](./killstreaks.md)** - reacting to gameplay events (`game:onPlayerDeath`), resolving a player id back to a live client/player, and applying a temporary stat buff. The simplest complete example in this section.
- **[New Pickup Item](./new-pickup-item.md)** - adding an in-world collectible item via `game:AllItems`.
- **[New Gamemode](./new-gamemode.md)** - registering an entirely new gamemode via `game:GameTypesInit`, and why `resistanceModifier` alone is enough to build a "Sudden Death" mode.
- **[Custom Weapon](./custom-weapon.md)** - replacing an existing weapon's fire behavior entirely (a three-pellet spread) via a per-weapon `fireX` hook and `plugins.cancel`.
- **[UI Modification](./ui-modification.md)** - injecting a custom DOM element into the game UI via [Client-Side Code](../client-side-code.md), with no Babylon.js needed for a plain 2D overlay.
- **[Discord Integration](./discord-integration.md)** - relaying room chat to a Discord webhook via `packChat`, and why the request shouldn't be awaited.
- **[Replacing Core Behaviour](./replacing-core-behaviour.md)** - the smallest complete `plugins.cancel` example (skipping client-build minification entirely), plus how to go from "cancel" to "replace."
- **[Persistent Storage](./persistent-storage.md)** - a plugin's own JSON state surviving a restart, extracted from the real pattern two bundled plugins already use.
- **[Rewarding Players with Currency](./player-currency.md)** - crediting a player's egg balance from a game-server plugin, reusing the exact request the game server itself makes for a real kill.
- **[Custom Per-Player Data](./custom-player-data.md)** - attaching your own state directly to a player/client object, and why it needs no cleanup code.

If you build something else worth documenting, the pattern every recipe on this page follows is: real code, validated against an actual running server, with any non-obvious gotchas called out explicitly rather than glossed over.

## Looking for more real code than fits in a recipe?

Every recipe above is deliberately minimal - enough to demonstrate one mechanism cleanly. For real, currently-shipping plugins doing much more (multiple files, content packs, client+server code together), read the actual source:

- **`plugins_default/`** - first-party plugins bundled with LegacyShell, running in production right now. Browse these for genuine, non-simplified patterns - `legacyshellcore` (content-pack shape: static assets + models + items + maps), `healthpackitem` (a complete small gameplay item), `parkourmode` (a full gamemode), `autoshopnotifications`/`playercountnotifications` (the persistent-storage pattern this section's recipe is extracted from).
- **`plugins_samples/`** - dedicated, minimal teaching examples that exist *only* to be read (their own folder comment: "copy folders into the plugins folder to activate") - `sample1cmd` (the smallest possible command plugin), `sample2dependency` (declaring a dependency).

**Don't look in `plugins/` for examples** - on a fresh install that folder is empty; it's where *your own* plugins and third-party installs go, not a source of reference code.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
