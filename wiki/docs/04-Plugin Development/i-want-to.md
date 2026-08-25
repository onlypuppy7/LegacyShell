# I Want To...

> **Audience:** Plugin authors, content creators · **Prereqs:** None

A task-oriented index into this wiki - phrased as goals, not page titles. If you already know which page you need, use the sidebar; if you're not sure where something lives, find your goal below and follow the link. Every link points at a page with real, working code, not just prose.

::: tip Looking for real code to read, not a guide to follow?
Skip straight to `plugins_default/` (first-party plugins bundled with LegacyShell, running in production right now - `legacyshellcore`, `healthpackitem`, `parkourmode`, and friends) or `plugins_samples/` (minimal, dedicated teaching examples - `sample1cmd`, `sample2dependency`, whose own folder comment says "copy folders into the plugins folder to activate"). **Don't look in `plugins/`** - on a fresh install that folder is empty; it's where *your own* plugins and third-party installs go, not a source of reference code.
:::

## Getting started

- **...make my first plugin.** [Quickstart](./quickstart.md) - a working plugin in about ten minutes.
- **...understand the plugin folder structure and what files are required.** [Anatomy](./anatomy.md).
- **...know what order my plugins (and other people's) load in.** [Lifecycle](./lifecycle.md).
- **...make my plugin require another plugin, or an npm package.** [Dependencies](./dependencies.md).
- **...understand the event system (`on`/`emit`) that everything else is built on.** [Events (concept)](./events-concept.md).
- **...look up the exact payload of a specific event.** [Event Reference](./Event%20Reference/) - generated from source, always current.

## Reacting to gameplay

- **...run code when a player dies, joins, fires a weapon, etc.** [Events (concept)](./events-concept.md), then find the specific event in the [Event Reference](./Event%20Reference/).
- **...add a new slash command.** [Commands](./commands.md).
- **...reward consecutive kills with a temporary buff.** [Recipe: Killstreaks](./Recipes/killstreaks.md).
- **...give a player in-game currency (eggs).** [Recipe: Rewarding Players with Currency](./Recipes/player-currency.md).
- **...attach my own custom data to a player.** [Recipe: Custom Per-Player Data](./Recipes/custom-player-data.md).
- **...fully replace something core code does by default, not just react to it.** [Events (concept) - `plugins.cancel`](./events-concept.md#plugins-cancel-opting-out-of-default-behavior), then [Recipe: Replacing Core Behaviour](./Recipes/replacing-core-behaviour.md).

## Adding content

- **...add a new gamemode.** [Recipe: New Gamemode](./Recipes/new-gamemode.md), background in [Gamemodes](../03-Content%20Creation/gamemodes.md).
- **...understand or add gameplay multipliers like speed, gravity, or damage.** [Modifiers](./modifiers.md).
- **...add a theme, or understand how the theming system actually works.** [Recipe: Custom Theme](./Recipes/custom-theme.md).
- **...change how an existing weapon fires, or add a new one.** [Recipe: Custom Weapon](./Recipes/custom-weapon.md).
- **...add a new pickup item (health, ammo, a custom power-up).** [Recipe: New Pickup Item](./Recipes/new-pickup-item.md), background in [Items and Skins](../03-Content%20Creation/items-and-skins.md).
- **...add a new hat, stamp, or weapon skin.** [Hats and Stamps](../03-Content%20Creation/hats-and-stamps.md) and [Items and Skins](../03-Content%20Creation/items-and-skins.md), shipped via [Content Packs](./content-packs.md#items).
- **...add a new collidable map block, and actually understand how its collision gets generated.** [Map Blocks](../03-Content%20Creation/map-blocks.md) - covers the naming convention *and* exactly where each `colliderType`'s collision geometry comes from.
- **...build or edit a map.** [Maps](../03-Content%20Creation/maps.md).
- **...add sound effects or music.** [Sounds](../03-Content%20Creation/sounds.md) for the assets, [Sound and Apollo](./sound-and-apollo.md) for triggering them from code.
- **...add a seasonal/limited-time shop event.** [Seasonal Events](../03-Content%20Creation/seasonal-events.md).
- **...ship models, items, and maps together as one plugin.** [Content Packs](./content-packs.md) - the pattern `legacyshellcore` itself uses.

## Client-side and UI

- **...add my own UI element (a HUD element, a menu, an overlay).** [Recipe: UI Modification](./Recipes/ui-modification.md).
- **...ship any JavaScript that needs to run in the browser.** [Client-Side Code](./client-side-code.md).
- **...serve my own static assets (textures, extra pages, downloadable files).** [Static Assets](./static-assets.md).
- **...add a new network message/opcode.** [Networking](./networking.md), reference in [Comm Opcodes](../05-Codebase%20Reference/Generated/comm-opcodes.md).
- **...understand why my server-side change feels delayed, or how to avoid that.** [Prediction and Authority](./prediction-and-authority.md).

## Persistence and external integration

- **...make my plugin's data survive a server restart.** [Recipe: Persistent Storage](./Recipes/persistent-storage.md).
- **...post messages to a Discord webhook.** [Recipe: Discord Integration](./Recipes/discord-integration.md).
- **...know whether my plugin's in-memory state is shared across rooms, or across the main thread.** [Workers and State](./workers-and-state.md) - short answer: no, and this explains exactly why.

## Publishing and troubleshooting

- **...share my finished plugin with others.** [Publishing](./publishing.md).
- **...avoid the mistakes other plugin authors have already made.** [Pitfalls](./pitfalls.md).
- **...figure out why my plugin doesn't show up in the boot log, or crashes on load.** [Anatomy - Common Issues](./anatomy.md#common-issues).

## Understanding the engine itself

These go deeper than "how do I build X" - they're for when you need to know *why* the engine behaves a certain way, usually because you're doing something advanced or debugging something subtle. Start at the [Codebase Reference](../05-Codebase%20Reference/) index, or jump straight to a common one:

- **...understand the 60Hz game loop and when full-state syncs happen.** [Game Loop](../05-Codebase%20Reference/game-loop.md).
- **...understand how rooms and worker threads relate to each other.** [Rooms and Workers](../05-Codebase%20Reference/rooms-and-workers.md).
- **...understand exactly how map-block collision is generated, at the engine level.** [Physics and Collision](../05-Codebase%20Reference/physics-and-collision.md).
- **...understand the browser build pipeline (how shared code becomes the client bundle).** [Build Pipeline](../05-Codebase%20Reference/build-pipeline.md).
- **...understand the binary wire protocol itself.** [Wire Protocol](../05-Codebase%20Reference/wire-protocol.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
