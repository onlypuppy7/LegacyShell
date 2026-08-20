# Codebase Reference

> **Audience:** Core contributors and AI agents working on the engine itself · **Prereqs:** [Plugin Development](../04-Plugin%20Development/)

This is the deepest tier: how LegacyShell's engine actually works internally - the shared client/server code layer, the build pipeline, the game loop, the worker-thread room model, the wire protocol. Read this before changing core code (as opposed to writing a plugin, which is covered one tier up).

If you're an AI agent, also read [For AI Agents](../06-Contributing/for-ai-agents.md) first - it explains what in this repo is generated vs. hand-written and how to verify a claim before acting on it.

## What's here

- **[Repo Layout](./repo-layout.md)** - a directory-by-directory map of the monorepo.
- **[Shared Shell Layer](./shared-shell-layer.md)** - `src/shell/`, the `#hashtag` imports map, "one source, two runtimes."
- **[Server-Only Markers](./server-only-markers.md)** - the `(server-only-start/end)` comment convention that strips Node-only code from the browser build.
- **[The `ss` Object](./the-ss-object.md)** - what it holds, which module attaches what, and when.
- **[Build Pipeline](./build-pipeline.md)** - `prepare-modified.js`, placeholder token splicing, minification, IIFE wrapping.
- **[Stamps and Babylons](./stamps-and-babylons.md)** - the model/spritesheet build steps and their hash-based skip logic.
- **[Game Loop](./game-loop.md)** - the 60Hz tick, the 256-entry state ring buffer, ~10Hz sync, client-side reconciliation.
- **[Rooms and Workers](./rooms-and-workers.md)** - the worker-per-room model, the warm-spare-worker optimization, the `Comm.Worker` relay protocol back to the main thread.
- **[Wire Protocol](./wire-protocol.md)** - `Comm.Out`/`Comm.In` packing (the opcode table itself is generated - see below).
- **[Generated](./Generated/)** - machine-extracted reference tables: [wire protocol opcodes](./Generated/comm-opcodes.md), [enums & lookup tables](./Generated/enums-reference.md), [database schema](./Generated/database-schema.md), [config file reference](./Generated/config-reference.md), [slash command reference](./Generated/slash-commands.md). Never hand-edited - regenerate with `npm run gen-docs`, see [Generators](../06-Contributing/generators.md).
- **[Services Internals](./services-internals.md)** - command dispatch, auth, sessions, the DB-seeding pipeline's exact sequencing.
- **[Catalog and Items](./catalog-and-items.md)** - the item-ID offset scheme, tag-based item pools, the weekly shop rotation algorithm.
- **[Permissions Internals](./permissions-internals.md)** - `PermissionsConstructor`, the `Command` class, rank checks, mention parsing.
- **[Physics and Collision](./physics-and-collision.md)** - the voxel collider, the DDA raycast, projectile resolution.
- **[Known Quirks](./known-quirks.md)** - documented inconsistencies in the codebase (stale entries in the imports map, dead code paths, a couple of real bugs in unused functions) so nobody "fixes" something that's actually load-bearing, or wastes time chasing something genuinely dead.
- **[Codebase Anecdotes](./anecdotes.md)** - the source's personality: comments the author left for themselves, JSDoc that gives up mid-sentence, and other genuinely funny stuff found while writing all of the above.
- **[Development Timeline](./timeline.md)** - how this project actually got built, reconstructed from `git log`, branch history, and the project's own historical-research pages - not just a changelog.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
