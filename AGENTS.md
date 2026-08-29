# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project overview

LegacyShell is a from-scratch reimplementation of the backend and client for the browser game **Shell Shockers** (shellshock.io) as it existed at version 0.17.0, plus original extensions (commands system, new gamemodes/weather, an overhauled item/catalog system, an in-game map editor, a plugin API, an integrated wiki). It's a Node.js ESM monorepo (`"type": "module"` in `package.json`) split into three independently-deployable server roles that together emulate the original game's backend, plus a shared game-logic layer used by both the authoritative server and the browser client.

## Commands

```bash
npm install
npm run init      # REQUIRED before first run — interactive wizard, see "First-time setup" below
npm run all        # runs client + services + game together (background jobs via `&`)
npm run client     # node src/scripts/perpetual.js --client   (port 13370, HTTP)
npm run services   # node src/scripts/perpetual.js --services (port 13371, WebSocket)
npm run game       # node src/scripts/perpetual.js --game     (port 13372, WebSocket)
npm run bcrypt     # benchmarks bcrypt cost factors, used to pick services.yaml's password_cost_factor
npm run gen-docs   # regenerates the wiki's machine-extracted reference pages from source, see below
npm run cn         # kills whatever is bound to ports 13370-13372 (unix `lsof`, won't work on Windows)
```

Bun equivalents exist per-role (`binit`, `bclient`, `bservices`, `bgame`) but there is no combined `ball`.

There is **no test suite, no lint script, and no build script** defined anywhere in this repo today. The only CI (`.github/workflows/main.yml`) runs on every push to `main` and just increments `versionEnum.txt` / rewrites `versionHash.txt` with the new commit hash — it is not a build or test gate. Don't assume `npm test` or `npm run build` exist.

The **wiki** (VuePress 2, under `wiki/`) has no wired npm script; build/serve it directly:
```bash
npx vuepress dev wiki      # local dev server
npx vuepress build wiki    # outputs to wiki/.vuepress/dist
```
`server-client`'s boot sequence also does this itself via `cross-spawn` (`npx vuepress build wiki`) as part of starting up, so a running client server keeps the wiki output current automatically.

`wiki/docs/` is a full contributor/agent-facing documentation site (six numbered tiers, Getting Started through Contributing) — distinct from `wiki/wiki/` (in-game Shell Shockers lore/history, unrelated to developing LegacyShell itself) and `wiki/plugins/` (per-plugin docs — see "Plugin folder contract" below). A meaningful chunk of `wiki/docs/` is generated rather than hand-written — the plugin event catalog, DB schema, config keys, slash commands, wire opcodes, enums/lookup tables, and `/llms.txt`/`/llms-full.txt` — via `npm run gen-docs` (`src/scripts/gen-wiki-reference.js`, which parses real source with `acorn`/`acorn-walk`, not regex). Generated pages open with a `<!-- GENERATED -->` banner and get silently overwritten on the next run — never hand-edit one; fix the extraction script or the underlying source instead, then regenerate. Per-plugin docs work differently still: `wiki/.vuepress/pluginDocsPlugin.js` builds those pages live, straight from each plugin's own `README.md`, at `vuepress build`/`dev` time — there's no generated file for them at all, tracked or otherwise (see `src/scripts/plugin-docs-lib.js` for the shared logic that page and `genLLMsTxt()` both use). See [`wiki/docs/06-Contributing/generators.md`](wiki/docs/06-Contributing/generators.md) for the full mechanism, and [`wiki/docs/06-Contributing/for-ai-agents.md`](wiki/docs/06-Contributing/for-ai-agents.md) for agent-specific orientation — that page names this file as its own canonical source, so keep the two consistent.

### First-time setup
`npm run init` (`src/scripts/init.js`) is a CLI wizard that: creates `plugins/`, copies every template from `src/defaultconfig/*.yaml` into `store/config/*.yaml` (without overwriting existing ones), asks about verbose/dev logging, and optionally creates `server-services/store/LegacyShellData.db` with a `local` game-server row so `game.yaml`'s `AUTH_KEY` placeholder gets filled in. Every server process refuses to start without `store/config/` existing, and `perpetual.js` explicitly checks for `store/config/perpetual_all.yaml`. Pass `-y`/`--yes` (`npm run init -- -y`) to auto-answer all three prompts with `y` instead of reading from stdin - the right way to run it non-interactively (scripted setup, CI, an agent's scratch instance).

## High-level architecture

### Three server roles + one shared logic layer

| Role | Dir | Entry (`run-*.js`) | Protocol / port | Purpose |
|---|---|---|---|---|
| **Services** | `server-services/` | `run-services.js` → `start-services.js` | WebSocket only, `:13371` | Single source of truth: SQLite DB (accounts, sessions, items, maps, codes, authorized game servers), auth, shop/inventory economy. Should only run once per deployment. |
| **Game** | `server-game/` | `run-game.js` → `start-game.js` | WebSocket (player-facing) `:13372`, plus an outbound WS to services | Authoritative gameplay simulation. Many instances can run, each registered in services' `game_servers` table via an `auth_key`. |
| **Client** | `server-client/` | `run-client.js` → `start-client.js` | HTTP (Express), `:13370` | Serves the browser game, builds/bundles it, serves the wiki. Many mirror instances can run, unauthenticated. |

Every role boots the same way: `misc.instantiateSS(import.meta, argv)` (builds the global `ss` context object) → `plugins.loadPlugins('<services|game|client>')` (loaded **before** the role's own logic, so plugins can patch shared modules first) → dynamic import of that role's `start-*.js`.

`ss` (from `#misc` → `src/shell/general/misc.js`) is the shared server-side context/config bag: `ss.rootDir`/`ss.currentDir`, `ss.config` (deep-merge of `store/config/*.yaml` over `src/defaultconfig/*.yaml`, with a special `all.yaml`/`config.all` flattened into every role's top-level config), `ss.pluginsDir`/`ss.pluginsDirDefault`, `ss.packageJson`, `ss.versionEnum`/`ss.versionHash`. Other modules attach further state onto the same object as the process boots (`ss.db`/`ss.recs` on services, `ss.RoomManager` on game, `ss.cache`/`ss.distributed_config` on client). It only exists server-side — never on the browser client.

Services is the single source of truth for maps/items/authorized-servers; game and client servers are `requestConfig` pollers against it that cache the last-known-good JSON to disk (`store/{maps,items,servers}.json`) so they can boot if services is briefly unreachable, and self-restart (`process.exit(1337)`, picked up by the `puppyperpetual` process wrapper) whenever services reports a newer `startTime`, keeping the fleet in sync after a services restart.

**Known stale mapping**: `package.json`'s `imports` map has `#start-client` → `./server-game/start-client.js` and `#start-services` → `./server-game/start-services.js` — both point at files that don't exist (the real files are `server-client/start-client.js` and `server-services/start-services.js`). Nothing in the codebase actually imports via these two specifiers (every `run-*.js` uses a plain relative import instead), so this is dead config, not a bug to "fix" expecting something depends on it.

### Shared game logic: `src/shell/`

`src/shell/*.js` (bullets, guns, munitions, items, itemManager, catalog, player, collider, math, pool, permissions, gametypes, comm, events, constants, censor, stringWidth, loading, isClientServer, plugins) plus `src/shell/general/*.js` (misc, looper, prepare-babylons, wsrequest) is **one canonical implementation of game logic used by both the Node game server and the browser client** — this is the "backend and clients share the same code" goal from the project's aims. There is no bundler: `package.json`'s `"imports"` map defines `#hashtag` subpaths (`#bullets`, `#player`, `#catalog`, `#comm`, `#constants`, etc.) resolving into `src/shell/`. Node resolves these as normal ESM imports server-side. For the browser, `server-client/src/prepare-modified.js` reads each shared file's *raw source text* via `misc.hashtagToString`/`hashtagToPath` (which resolve the `#hashtag` through this same `imports` map) and textually splices it into the browser bundle in place of `LEGACYSHELLXXX` placeholder tokens found in `src/client-static/src/shellshock.min.js` (despite the filename, this is the *unminified* input to the build).

The splice transform (`misc.prepareForClient`) does four things to each shared file's text:
1. Comments out `import` lines (the concatenated bundle isn't a module).
2. Strips `export`/`export default` keywords, so top-level `const`/`class`/`function` declarations become **globals shared across the whole concatenated browser script**.
3. Converts `//(server-only-start)` / `//(server-only-end)` line-comment markers into a real `/* ... */` block comment — **everything between them is deleted from the client build.** Server-side, these are just inert `//` comments and the code runs normally. Use this convention for anything Node-only (fs/path/child_process imports, `@napi-rs/canvas`, duplicate-declared globals that the client bundle already defines elsewhere) inside a file under `src/shell/`.
4. (Minification is a separate later step in `prepare-modified.js`, gated by `config.client.minify`, using UglifyJS by default — pluggable, see the plugin event catalog below.)

Because of this, most nontrivial methods in `player.js`, `bullets.js`, `guns.js`, `permissions.js` branch internally on `isClient`/`isServer` (from `#isClientServer`) rather than being split into separate files — client does local prediction, server does authoritative resolution, in the same function body.

Two systems that sound similar but are unrelated:
- **`plugins.js`'s `PluginManager`** — the actual plugin/hook system (see below).
- **`events.js`'s `EventManager`** — a calendar-based seasonal-content scheduler (Halloween/Christmas-style date ranges with associated shop item pools), consumed by `catalog.js`'s weekly shop-rotation logic. Not related to plugin events despite the name.

Other load-bearing shared pieces: `constants.js` (tick rate `fps=60`/`ticksPerSecond`, `stateBufferSize=256` client-prediction ring buffer, item-ID offset tables, enums, `iteratePlayers`), `gametypes.js` (`defaultOptions`/`GameTypes` — the per-room, per-team-indexed `gameOptions` object that both physics and the command system read/write; new modes are meant to be added via the `GameTypesInit` plugin event, not by editing this file), `comm.js` (hand-rolled binary wire protocol, `Comm.Code` opcode enum, `Comm.Add(name)` lets plugins register new opcodes).

### Plugin system — this is the primary extension mechanism

The project's stated philosophy ("Could this be a plugin?" — see Contributing in the README) means most new functionality belongs in a plugin, not core. The whole system is one class: `PluginManager` in `src/shell/plugins.js`, exported as the singleton `plugins`.

**Plugin folder contract** — a plugin is a directory under `plugins_default/` (bundled first-party, safe to disable), `plugins_samples/` (minimal, dedicated teaching plugins — `sample1cmd`, `sample2dependency`, `classicskybox`), or `plugins/` (user-installed third-party):
- Must contain `index.js` exporting `PluginMeta` (object) and `Plugin` (a class, instantiated once as `new Plugin(pluginManager, thisDir)`).
- Optional `dependencies.js` exporting `dependencies: { name: version }`. `version === "plugin"` means "another plugin, matched by folder name, must also be installed"; anything else is treated as an npm package version and auto-installed on the fly with `npm install <name>@<version> --no-save` if not already resolvable.
- **A leading underscore in the folder name disables the plugin** (`preloadPluginsFromDir` skips it entirely, no error) — e.g. `plugins_default/_zaxoniuscustomguns`, `plugins/_mcblocks`. This is purely a directory-naming convention; `PluginMeta.identifier` itself has no underscore.
- Each plugin folder is treated as its own git repo and gets `git pull`'d automatically on every load.
- Plugins load alphabetically by `PluginMeta.identifier` — some plugin names are numerically prefixed (`5_crackshot`) purely to control load order relative to other plugins.

```js
// PluginMeta shape (consistent across every plugin in the repo)
export const PluginMeta = {
    identifier: "someplugin",
    name: 'Human Readable Name',
    author: 'someone',
    version: '1.0.0',
    descriptionShort: 'One-liner shown when loading',
    descriptionLong: 'Longer description',
    legacyShellVersion: 561,  // informational compat hint (see /versionEnum.txt), not enforced
};
```

**Event system**: `plugins.on(event, listener)` registers against the **fully-prefixed** event name (`"game:startUp"`, `"services:addKill"`, `"client:onStartServer"` — the prefix is the `type` string passed to `loadPlugins`, i.e. `services`/`game`/`client`). Core code calls `plugins.emit(event, ...args)` (unprefixed at the call site — `emit` adds the `${this.type}:` prefix), which awaits every registered listener in order, injects `args[0].EVENT` if `args[0]` is an object, and catches per-listener errors without aborting.

**The `plugins.cancel` convention**: reset to `false` at the top of every `emit()`. A listener sets `plugins.cancel = true` to tell the *emitting* code to skip its own default follow-up behavior (e.g. `plugins.emit("fireEggk47", ...); if (!plugins.cancel) Bullet.fire(...)` in `guns.js`; similar guards around default WS responses, default `next()` calls, default minification). Because it's one flag shared per `PluginManager` instance, don't set it unless you specifically mean to suppress the default for that emit — other listeners on the same event see the same flag.

**Note on the browser runtime**: the `PluginManager` singleton's `type` defaults to `'game'` and nothing resets it client-side (the browser never calls `loadPlugins()`), so in-browser gameplay code emits/listens under the `game:` prefix too — same namespace as the Node game server.

**Command registration** (not a separate API — just another event): `src/shell/permissions.js`'s `PermissionsConstructor` registers its built-in slash commands, then emits `plugins.emit('permissionsAfterSetup', { this: this })` at the end of its constructor. Plugins hook `game:permissionsAfterSetup` and call `data.this.newCommand({ identifier, name, category, description, permissionLevel: [bypassRank, privateRoomRank, requireGameOwnerInPrivate], inputType, executeClient, executeServer, isCheat, mentionTypes, ... })` — see `plugins_samples/sample1cmd/samplecommand.js` for the minimal working example. `executeClient` runs immediately for responsiveness; `executeServer` re-validates and applies authoritatively, mirroring the client-prediction pattern used throughout the shared game logic.

**Shipping code into the browser bundle**: since the client is one statically-built file, a plugin that needs browser-side JS hooks `client:pluginSourceInsertion` (emitted from `server-client/src/prepare-modified.js`) and pushes `{ filepath, insertBefore, insertAfter, position: 'beforebefore'|'before'|'after' }` describing a file (e.g. its own `shared.js`/`client.js`) to splice into the bundle at that anchor point — that file typically self-registers its listeners guarded by `if (isClient)`. A plugin that just needs to serve static assets (models, textures, extra pages) instead hooks `client:onStartServer` and mounts `app.use(express.static(path.join(this.thisDir, 'client')))`.

**Event catalog**: there is no central registry or typed list of plugin events — they're just `plugins.emit(...)` call sites scattered across `src/shell/`, `server-services/`, `server-game/`, and `server-client/`. This file used to embed a full hand-copied catalog here; it's gone, on purpose. Line numbers in a hand-copied list drift the moment anyone edits a file above the call site — this file's own copy proved exactly that (15 line references silently went stale from one unrelated two-line addition to `start-client.js`). The real, always-fresh catalog is generated instead:

- **[`wiki/docs/04-Plugin Development/Event Reference/`](wiki/docs/04-Plugin%20Development/Event%20Reference/)** (7 pages, grouped by logical source — `services`, `game` shared-logic/main-thread/clients/rooms/browser, `client`) — rebuilt from a real AST walk of every `plugins.emit(...)` call site by `npm run gen-docs`. Trust this over anything hand-copied, including an old version of this section.
- If you suspect the generated pages themselves are stale, run `npm run gen-docs` first before falling back to `grep -rn "plugins\.emit(" src/shell server-services server-game server-client` — plugin authors have shipped listeners for event names that were never actually emitted anywhere in core code, so a name existing in someone else's plugin isn't proof it's real.
- A handful of call sites are commented out/dead — check the generated pages' "fires when" column, or grep for `//.*plugins\.emit` to find them directly; `beforePrepareStamps`/`afterPrepareStamps`/`beforePrepareModified`/`afterPrepareModified` (`server-client/start-client.js`, inside a commented-out block) and `roomBeforeMapInit` (`server-game/src/rooms.js:85`) are the known ones as of this writing.

Good reference examples, roughly in order of complexity: `plugins_samples/sample1cmd` (minimal), `plugins_samples/sample2dependency` (dependency declaration), `plugins_default/legacyshellcore` (content-pack pattern: static assets + models + items + maps). At the advanced end, a plugin can go as far as replacing core minification or sync-packet logic outright via `plugins.cancel` — see the `minificationBefore` and `sendToAll`/`clientSyncLoop` rows on the generated pages for where those hooks live.

### Services server internals

Single external interface is a `ws.WebSocketServer` (no HTTP) on `config.services.port`. Every message is `{ cmd, ... }` JSON, classified into `regular`/`sensitive`/`auth_required` for per-IP rate limiting (`server-services/src/ratelimit.js`, in-memory sliding window with lazy DB persistence to `ip_requests`) — requests carrying a valid `auth_key` (checked against `game_servers.auth_key`) bypass rate limiting entirely. `requestConfig` is the polling handshake used by game/client servers (see above) and is handled outside the normal command gate. All DB schema/DDL lives in `server-services/src/data_management/recordsManagement.js` (`initTables`); `accountManagement.js` handles bcrypt password hashing and the auth-token "remember me" flow; `sessionManagement.js` enforces one active session per account and wipes all sessions on an IP mismatch (anti-hijacking); `backups.js` does periodic raw-file-copy backups of the SQLite DB to `store/backups/`, pruned to a configured retention count.

### Game server internals

`server-game/src/roomManager.js` (main thread) owns room lookup/creation and a **worker-thread-per-room** model (`node:worker_threads`) via `server-game/src/worker.js` — a spare worker is always kept warm to avoid startup latency on room creation. Each worker independently re-runs `misc.instantiateSS` and `plugins.loadPlugins('game')` — **plugins have no shared state between the main thread and individual room workers**; anything a room needs beyond the `{maps, items, permissions, config}` seed passed at worker creation must be fetched via `#wsrequest` directly from inside the worker, or relayed through `postMessage`. The main thread owns all real player socket I/O; once a player joins a room, the main thread becomes a dumb relay forwarding raw WS messages into that room's worker, and the worker posts back a small `Comm.Worker` command enum (`send`/`close`/`updateRoom`/`boot`/etc.) for the main thread to execute against the actual sockets.

Room simulation (`server-game/src/rooms.js`) runs a 60Hz (`ticksPerSecond`/`fps` from `constants.js`) authoritative update loop via `#looper`'s hybrid `setTimeout`/`setImmediate` scheduler, replaying buffered player input against a 256-entry state ring buffer for reconciliation, and syncs full state to clients at ~10Hz (every `FramesBetweenSyncs` ticks). It uses `babylonjs`'s `NullEngine` headlessly, purely for collision/math primitives — no rendering.

### Client server internals

Express app on `config.client.port`. Has a `closed` maintenance mode (serves only `src/client-closed`) and an open mode serving `store/client-modified` (generated output) layered over `src/client-static` (raw assets). On startup it runs, in parallel: `npx vuepress build wiki` (fire-and-forget), `stampsGenerator.js` (composites all "Stamp" cosmetic items into one sprite sheet via `sharp`, skips regeneration via input/output hashing), and `prepare-modified.js` (the actual build step — see "Shared game logic" above for the splice mechanism; also handles minification, IIFE-wrapping to hide globals from the console, and injecting plugin-supplied client code via `pluginSourceInsertion`). `Apollo.js` (`server-client/src/client-static/src/apollon/Apollo.js`, imported via `#apollo`) is a hand-rolled Howler.js audio-engine wrapper that gets spliced into the client bundle the same way as `src/shell/*` modules, despite physically living outside `src/shell/` — it's shared code in practice even though it's not colocated with the rest.

## Database

`server-services/store/LegacyShellData.db` (SQLite) is the canonical data store. See the root [README.md](README.md#navigating-the-database) for the full per-table breakdown and USER-EDITABLE/SYS-EDITABLE/SYS-READONLY tags — those tags are load-bearing when deciding whether it's safe to write a migration/plugin that touches a given table directly versus needing to go through `recordsManagement.js`'s helpers.

## Contributing conventions (from README)

PRs for security, bugfixes, efficiency, and features are welcome, but new gameplay-affecting features should default to being a **plugin** unless they need modding-API surface that doesn't exist yet (in which case, PR the missing emitters/hooks rather than hardcoding the feature into core). Purely cosmetic content (skins/stamps/etc.) is never accepted into the base game — it goes into a plugin (e.g. `legacyshellcore`) instead, at the maintainer's discretion.
