# Plugin Development

> **Audience:** Developers extending LegacyShell · **Prereqs:** JavaScript, [Running a Server](../02-Running%20a%20Server/)

LegacyShell's stated philosophy is **"could this be a plugin?"** - most new functionality, from a single chat command to a full anticheat, is meant to be built as a plugin rather than patched into core. This section teaches the plugin API from a working "hello world" up through the patterns real, shipped plugins use.

Not sure where to start, or looking for a specific answer rather than a linear read-through? **[I Want To...](./i-want-to.md)** is a task-oriented index of this entire section, phrased as goals ("I want to add a new weapon," "I want my plugin's data to survive a restart") with a direct link to the right page for each.

## What's here

- **[Quickstart](./quickstart.md)** - a working plugin in ten minutes.
- **[Anatomy](./anatomy.md)** - the folder contract, `PluginMeta`, the `Plugin` class, disabling a plugin with a leading `_`.
- **[Lifecycle](./lifecycle.md)** - load order, alphabetical sorting, git auto-pull on load, gating a plugin to one server type.
- **[Dependencies](./dependencies.md)** - `dependencies.js`, npm packages vs. depending on another plugin.
- **[Events (concept)](./events-concept.md)** - `on`/`emit`, the `type:` prefix system, payload shapes, the shared `plugins.cancel` flag.
- **[Event Reference](./Event%20Reference/)** - the full, generated table of every event LegacyShell emits (~185 of them), split by subsystem.
- **[Commands](./commands.md)** - hooking `permissionsAfterSetup`, `newCommand`, permission tuples, @mentions.
- **[Client-side code](./client-side-code.md)** - shipping browser JS via `pluginSourceInsertion`, the `isClient` guard.
- **[Static assets](./static-assets.md)** - serving your plugin's own files via `onStartServer`.
- **[Content packs](./content-packs.md)** - shipping items, maps, and models from a plugin.
- **[Networking](./networking.md)** - registering new wire-protocol opcodes with `Comm.Add`.
- **[Workers and state](./workers-and-state.md)** - the worker-per-room isolation gotcha, and using `wsrequest` for state that needs to cross rooms.
- **[Prediction and authority](./prediction-and-authority.md)** - why most nontrivial gameplay code needs both an `executeClient` and an `executeServer` half.
- **[Recipes](./Recipes/)** - complete worked examples: killstreaks, a new gamemode, a custom weapon, a new pickup item, UI changes, Discord integration, persistent storage, player currency, custom per-player data, and replacing core behavior outright.
- **[Publishing](./publishing.md)** - versioning a plugin and listing it publicly.
- **[Pitfalls](./pitfalls.md)** - the mistakes real plugins in this repo have actually made (a shared cancel flag stepping on another plugin, listening for events that don't exist, assuming state persists across worker threads).

For the deeper "how does the engine actually work" material this section builds on, see [Codebase Reference](../05-Codebase%20Reference/).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
