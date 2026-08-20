# Workers and State

> **Audience:** Plugin authors · **Prereqs:** [Lifecycle](./lifecycle.md)
>
> **Canonical source:** `server-game/src/roomManager.js` (main thread), `server-game/src/worker.js` (worker entrypoint)

This is the single most important architectural fact for a `game:`-targeting plugin to understand, because it breaks the "just store some state in my plugin instance" instinct that works fine on the services and client servers.

## Each room is its own worker thread

The game server's main thread doesn't run room simulation itself - `server-game/src/roomManager.js` spins up a dedicated `node:worker_threads` `Worker` **per room**, running `server-game/src/worker.js`. A spare worker is kept warm at all times (spun up proactively, so creating a new room doesn't pay JS-startup latency on the critical path).

Each worker is a genuinely separate JS execution context - its own heap, its own module state, its own everything. Critically, `server-game/src/worker.js` **independently re-runs the entire boot sequence**: its own `misc.instantiateSS(...)` and its own `plugins.loadPlugins('game')`, completely separately from whatever happened in the main thread.

## What this means for your plugin

**Your `Plugin` class gets instantiated once in the main thread, and again, completely separately, inside every room worker.** These are not the same object, don't share memory, and can't reach each other's instance state (`this.someCounter = 0` in one has no relationship whatsoever to the same line running in another).

We confirmed this directly while validating the [Quickstart](./quickstart.md) example plugin - booting a game server with one plugin installed produced **two independent, complete load sequences** in the log, a few hundred milliseconds apart:

```
[INFO] Starting plugin -> hellolegacyshell
[SUCCESS] Loaded plugin -> Hello LegacyShell v1.0.0 by you: ... (load: 147ms | preload: 1063ms | start: 0ms)
...
[INFO] Starting plugin -> hellolegacyshell
[SUCCESS] Loaded plugin -> Hello LegacyShell v1.0.0 by you: ... (load: 144ms | preload: 1050ms | start: 0ms)
```

The first is the main thread; the second is the spare worker thread the room manager pre-spawns. Once real rooms are created, each one gets its own additional, equally independent load.

Practical consequences:

- **Per-room state is naturally fine** - if what you're tracking is genuinely scoped to one room (a killstreak counter, a minigame's state), storing it on your plugin instance works exactly as expected, *because* each room's worker has its own separate instance anyway.
- **Cross-room or server-wide state does not work this way.** A leaderboard across all active rooms, a global cooldown, anything meant to be "one value for the whole game server" - a plain instance variable on `this` silently becomes "one separate copy per room," not the single shared value you probably expected.
- **`ss` in a worker is seeded, not full.** Each worker's local `ss` only receives `{ maps, items, permissions, config }` at creation time (posted from the main thread) - it doesn't have direct database access or the full context a services/client-side plugin might expect.

## Getting real cross-room or persistent state

Two practical options, depending on what you actually need:

### Option A: Ask services directly

`#wsrequest` (`src/shell/general/wsrequest.js`) is a small promise-based helper for making a one-off WebSocket request from inside a worker (or anywhere else) directly to the services server, independent of the room's own state:

```js
import wsrequest from '#wsrequest';

const response = await wsrequest(
    { cmd: 'someCustomCommand', someData: 123 },
    ss.config.game.services_server,
    ss.config.game.auth_key
);
```

This is exactly how core code itself fetches account data from inside a room (e.g. resolving a joining player's `userData`) - it's the sanctioned way for room-worker code to reach outside its own isolated thread. Anything you want to actually persist (not just share momentarily between rooms) needs a corresponding command handled on the **services** side of your plugin (see [Events (concept)](./events-concept.md) and the `services:` event catalog) - `wsrequest` only gets you a network call, not storage; the services-side listener is what would read/write a database table, a `flags` row, or similar.

### Option B: Relay through the main thread

If what you need is coordination between rooms on the *same* game server (not durable storage), the main thread (`roomManager.js`) is the one place that actually sees every room. This requires a plugin presence in the main thread's own boot (which happens too - remember, the main thread runs `plugins.loadPlugins('game')` just like every worker) reacting to `game:sendGameInfo` or similar main-thread-only events, combined with the room-to-main-thread `postMessage`/`Comm.Worker` relay mechanism rooms already use for sending network output. This is a more advanced pattern than most plugins need - reach for [Codebase Reference](../05-Codebase%20Reference/rooms-and-workers.md) if you're building something that genuinely requires it.

## Common Issues

**My global counter/leaderboard/cooldown resets or behaves inconsistently between matches.** You're storing it on a plugin instance and hitting the per-worker isolation described above - each room has its own copy. Move it to services (Option A) if it needs to be genuinely shared or persistent.

**A value I set in my main-thread plugin instance never seems to reach my room-worker code, or vice versa.** They're not the same object - see above. There's no implicit bridge; only what's explicitly passed via `postMessage` at worker creation (`{maps, items, permissions, config}`) or fetched via `wsrequest` crosses the thread boundary.

Next: [Prediction and Authority](./prediction-and-authority.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
