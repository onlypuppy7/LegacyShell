# Repo Layout

> **Audience:** Core contributors, AI agents · **Prereqs:** [Codebase Reference](../)
>
> **Canonical source:** the repository root

A directory-by-directory map of the monorepo - what lives where, and why, before diving into any one subsystem in depth.

## Top level

| Path | What it is |
|---|---|
| `src/shell/` | The shared game-logic layer - see [Shared Shell Layer](./shared-shell-layer.md). Used by both the Node game server and the browser client. |
| `src/defaultconfig/` | Template config files, copied into `store/config/` by `npm run init`. See [Config Files](../01-Getting%20Started/config-files.md). |
| `src/items/` *(does not exist at this path)* | See note below - default items actually live under `server-services/src/items/`, not top-level `src/`. |
| `src/scripts/` | Dev/build tooling - `init.js`, `perpetual.js`, `gen-wiki-reference.js`, and assorted one-off utilities (map converters, a stamp downloader, a bcrypt benchmark). Not part of the shared runtime code. |
| `src/base-babylons/` | Base `.babylon` model files, merged with plugin-contributed models at build time - see [Stamps and Babylons](./stamps-and-babylons.md). |
| `server-services/` | The services server role - see [Services Internals](./services-internals.md). |
| `server-game/` | The game server role - see [Game Loop](./game-loop.md) and [Rooms and Workers](./rooms-and-workers.md). |
| `server-client/` | The client server role, including the entire browser-facing static site and the build pipeline that assembles it - see [Build Pipeline](./build-pipeline.md). |
| `plugins_default/` | First-party bundled plugins. |
| `plugins/` | User-installed/third-party plugins. |
| `plugins_samples/` | Minimal example plugins referenced throughout the [Plugin Development](../04-Plugin%20Development/) docs. |
| `wiki/` | This wiki - VuePress 2, source in `wiki/docs`/`wiki/wiki`/`wiki/plugins`, config in `wiki/.vuepress/`. |
| `store/` | Generated/runtime data - your personal `config/`, cached `items.json`/`maps.json`/`servers.json`, logs, backups. Not checked into git (per-deployment). |
| `versionEnum.txt` / `versionHash.txt` | Auto-incremented by CI on every push to `main` - see [Generators](../06-Contributing/generators.md) for the unrelated-but-similar wiki-generation CI job. |

## Inside `server-services/`

| Path | What it is |
|---|---|
| `run-services.js` | Entry point: `instantiateSS` → `loadPlugins('services')` → dynamic import of `start-services.js`. |
| `start-services.js` | The bulk of services' own logic - DB boot, the WebSocket command dispatch switch, most of the `services:` event emit sites. |
| `src/data_management/` | `recordsManagement.js` (all table DDL + CRUD helpers), `accountManagement.js` (bcrypt, auth tokens), `sessionManagement.js`, `backups.js`. |
| `src/ratelimit.js` | Per-IP sliding-window rate limiting. |
| `src/items/*.js`, `src/maps/*.json` | Default item and map definitions, loaded into the database on boot. |
| `store/LegacyShellData.db` | The canonical SQLite database. |

## Inside `server-game/`

| Path | What it is |
|---|---|
| `run-game.js` | Entry point (main thread). |
| `start-game.js` | Services connection, the player-facing `WebSocketServer`, `initItems()` call. |
| `src/roomManager.js` | Main-thread room lookup/creation, the worker-thread pool. |
| `src/worker.js` | The script each room's dedicated worker thread actually runs. |
| `src/rooms.js` | Room simulation itself - by far the largest single event surface in the codebase. Runs inside the worker thread. |
| `src/client.js` | Per-connection player wrapper (`ClientConstructor`). |

## Inside `server-client/`

| Path | What it is |
|---|---|
| `run-client.js` / `start-client.js` | Entry point and the Express app / build orchestration. |
| `src/prepare-modified.js` | The actual build step - splices `src/shell/*` into the browser bundle, minifies, injects plugin code. |
| `src/stampsGenerator.js` | Composites the stamp spritesheet. |
| `src/client-static/` | Raw, hand-maintained browser assets - `src/shellshock.min.js` (the browser game source, despite the filename), `editor/` (the map editor), `libs/`, `sound/`, `app_nugget/`. |
| `store/client-modified/` | Generated build output - not checked into git. |

## A naming trap: `src/items/` doesn't exist

If you go looking for the default item definitions at the top-level `src/items/` (a reasonable guess, since `src/shell/` and `src/defaultconfig/` both live under top-level `src/`), you won't find it - the real path is `server-services/src/items/`, resolved relative to the services role's own `currentDir`, not the repo root. Same pattern for `server-services/src/maps/`. See [Maps](../03-Content%20Creation/maps.md) and [Content Packs](../04-Plugin%20Development/content-packs.md#items).

## `package.json`'s `imports` map is the real dependency graph for `src/shell/`

Every `#hashtag` subpath import (`#comm`, `#player`, `#catalog`, etc.) resolves through `package.json`'s `"imports"` field - see [Shared Shell Layer](./shared-shell-layer.md) for what this enables. Two entries are stale (`#start-client`, `#start-services` point at nonexistent files under `server-game/`) - see [Known Quirks](./known-quirks.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
