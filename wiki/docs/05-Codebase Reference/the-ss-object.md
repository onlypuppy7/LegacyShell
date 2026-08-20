# The `ss` Object

> **Audience:** Core contributors, AI agents · **Prereqs:** [Shared Shell Layer](./shared-shell-layer.md)
>
> **Canonical source:** `src/shell/general/misc.js` (`instantiateSS`)

`ss` is the shared server-side context/config bag every role builds at boot and keeps mutating throughout its lifetime. It only exists server-side - there is no client equivalent, and code that needs to run on both sides never references `ss` directly (client-side data gets baked into the bundle as separate globals via the `LEGACYSHELLXXX` placeholder substitutions instead - see [Build Pipeline](./build-pipeline.md)).

## It's a mutable module-level binding, not a constant

```js
// misc.js
export var ss; //trollage. access it later.
```

Genuinely `var`, genuinely reassigned (`ss = {...}`, then later `ss = {...ss, config}`, etc.) rather than mutated in place during `instantiateSS` itself - worth knowing if you're ever tempted to hold a reference to `ss` before `instantiateSS` runs and expect it to update; you'd be holding a reference to `undefined`, not a live binding that later gets filled in.

## What `instantiateSS(meta, argv, noStorage, noConfig)` builds

Called once per process (and once per room worker thread - see [Rooms and Workers](./rooms-and-workers.md)) as the very first step of every role's boot sequence, before plugins even load:

| Field | Where it comes from |
|---|---|
| `ss.currentDir` | The resolved dirname of the *calling* module (`meta.dirname` from `import.meta` passed in by the entrypoint) - the specific role's own directory (e.g. `server-game/`). |
| `ss.rootDir` | Resolved as three `..` up from `src/shell/general/`'s own location - the repo root, regardless of which role called it. |
| `ss.config` | Deep merge: every `store/config/*.yaml` file over the matching `src/defaultconfig/*.yaml` default, with missing keys logged as warnings (up to 3 levels deep), then `config.all`'s contents flattened into the top level and `config.all` itself deleted. Skipped entirely if `noConfig` is passed (used by `init.js`, which needs `ss` before `store/config/` even exists yet). |
| `ss.packageJson` | The parsed root `package.json` - this is how `hashtagToPath`/`hashtagToString` resolve `#hashtag` imports back to real file paths at runtime, reusing the exact same `"imports"` map Node itself uses. |
| `ss.pluginsDir` / `ss.pluginsDirDefault` | `<root>/plugins` and `<root>/plugins_default` - consumed by `PluginManager.loadPlugins`. |
| `ss.versionEnum` / `ss.versionHash` | Read from `versionEnum.txt` / `versionHash.txt` at the repo root (hash truncated to 7 characters). |
| `ss.isPerpetual` | `true` if launched with `--perpetual` as the second CLI arg - see [Perpetual](../02-Running%20a%20Server/perpetual.md). |
| `ss.startTime` | `Date.now()` at the moment `instantiateSS` ran. |

The process exits immediately (`process.exit(1)`) if `store/config/` doesn't exist yet (unless `noConfig` is set) - this is the actual mechanism behind "every server refuses to start without `npm run init`" from [Installation](../01-Getting%20Started/installation.md).

## What gets attached later, by other modules

`ss` keeps growing after `instantiateSS` returns - different roles bolt on different things as their own boot sequences progress:

- **Services** (`start-services.js`): `ss.db` (the raw `sqlite3.Database`), `ss.runQuery`/`ss.getOne`/`ss.getAll` (promisified DB calls), `ss.accs`/`ss.sess`/`ss.recs` (the account/session/records-management modules), `ss.requests_cache` (the in-memory rate-limit cache - see [Rate Limiting](../02-Running%20a%20Server/rate-limiting.md)), `ss.dbPath`/`ss.backupPath`, and later `ss.servicesSeed`/`ss.sqlPassword` (lazily generated via `misc.getServicesSeed`/`getSQLPassword`, stored in the `flags` table).
- **Game** (`start-game.js`): `ss.RoomManager` (the `RoomManager` instance), `ss.thisServer` (this game server's own identity/index once services responds to its `requestConfig`).
- **Game workers** (`worker.js`): a much smaller seed - just `{maps, items, permissions, config}`, posted from the main thread via `postMessage`, and later `ss.room` (the live `RoomConstructor` instance for whichever room this worker owns) - see [Rooms and Workers](./rooms-and-workers.md) for why this is a genuinely separate, unshared `ss` per worker thread.
- **Client** (`start-client.js`): `ss.cache` (raw JSON *strings*, not parsed objects, of `items`/`maps`/`servers` - kept as strings specifically so they can be spliced directly into the generated client bundle without a re-stringify step), `ss.distributed_data`/`ss.distributed_config` (the full merged config bundle from services, the latter YAML-dumped for admin display).

## Practical implication: `ss` is a god-object, treat it as one

Because so many unrelated modules attach state to the same object over the process's lifetime, `ss` functions less like a typed config object and more like a shared namespace - convenient for cross-module access, but it means "what does `ss` contain right now" genuinely depends on *when* you ask, not just *which role* is asking. A plugin's constructor running early in boot sees a much sparser `ss` than the same plugin's event listener firing mid-game.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
