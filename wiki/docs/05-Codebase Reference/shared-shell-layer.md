# Shared Shell Layer

> **Audience:** Core contributors, AI agents · **Prereqs:** [Repo Layout](./repo-layout.md)
>
> **Canonical source:** `src/shell/`, `package.json`'s `"imports"` map, `src/shell/general/misc.js` (`hashtagToString`, `hashtagToPath`, `prepareForClient`)

The project's founding goal - "backend and clients share the same code" - is implemented by one mechanism: `src/shell/*.js` files are written once, then consumed two completely different ways depending on which runtime needs them.

## Server-side: normal ESM imports, via `#hashtag` subpaths

`package.json`'s `"imports"` field maps `#bullets`, `#player`, `#catalog`, `#comm`, `#constants`, and every other shared module to its real path under `src/shell/`:

```json
"imports": {
    "#bullets": "./src/shell/bullets.js",
    "#player": "./src/shell/player.js",
    "#catalog": "./src/shell/catalog.js"
}
```

Any Node code (server-game, server-services, another shared module) just does `import { Bullet } from '#bullets';` - Node resolves this exactly like a normal package import, no special handling needed. This is the entire mechanism server-side; there's no bundler, no transpilation step for these files when running under Node.

## Browser-side: raw source text, spliced into one script

The browser never runs Node's module resolver. Instead, `server-client/src/prepare-modified.js` (the client build step - see [Build Pipeline](./build-pipeline.md)) reads each shared file's **raw source text** and textually inserts it into `src/client-static/src/shellshock.min.js` (a hand-maintained file that is, despite its name, not actually minified - it's the *input* to the build) in place of `LEGACYSHELLXXX` placeholder tokens.

The lookup goes through the same `imports` map, just resolved manually instead of by Node:

```js
// misc.js
hashtagToPath: function (hashtag) {
    let fromJson = ss.packageJson.imports[hashtag];   // same package.json field Node uses
    return [path.join(ss.rootDir, fromJson.replace(".", "")), fromJson];
},
hashtagToString: function (hashtag) {
    const path = misc.hashtagToPath(hashtag);
    let file = fs.readFileSync(path[0], 'utf8');
    file = misc.prepareForClient(file);                // see below
    return file;
},
```

## The four-step text transform (`prepareForClient`)

Before a shared file's text gets spliced into the bundle, `misc.prepareForClient` does exactly this, in order (the real implementation, four `String.replaceAll` calls):

```js
prepareForClient: function (file) {
    file = `\n${file}`;
    file = file.replaceAll("\nimport ", "\n//(ignore) import ");
    file = file.replaceAll("\nexport default ", "\n//(ignore) export default ");
    file = file.replaceAll("\nexport ", "\n/*(ignore) export*/ ");
    file = file.replaceAll("\n//(server-only-start)", "\n/*(server-only-start)");
    file = file.replaceAll("\n//(server-only-end)", "\n(server-only-end)*/");
    return file;
},
```

1. **`import` lines get commented out.** The concatenated bundle isn't an ES module, so a real `import` statement would be a syntax error there.
2. **`export default` gets commented out.**
3. **`export` gets commented out** (via a `/*...*/` inline comment around just the keyword, not the whole line) - so a top-level `export const Foo = ...` becomes a plain `const Foo = ...`, which is a **global** in the concatenated script, visible to every other spliced-in file and to the rest of `shellshock.min.js` itself. This is the actual mechanism that lets `Bullet`, `catalog`, `Comm`, `plugins`, etc. all reference each other across file boundaries once flattened into one script - there's no browser-side import system standing in for what Node's module resolution does server-side.
4. **`//(server-only-start)`/`//(server-only-end)` markers become a real block comment**, deleting everything between them from the client build. See [Server-Only Markers](./server-only-markers.md) for the dedicated page on this convention.

Because of step 3, most nontrivial methods in `player.js`, `bullets.js`, `guns.js`, `permissions.js` branch internally on `isClient`/`isServer` (from `#isClientServer`) rather than being split into separate files per runtime - client does local prediction, server does authoritative resolution, in the same function body, reading the same globals either way.

## What's actually in `src/shell/`

| File | Responsibility |
|---|---|
| `bullets.js` | `Bullet`/`Rocket`/`Grenade` projectile simulation and hit resolution. |
| `guns.js` | `Gun` base class + the five weapon subclasses, fire logic. |
| `munitionsManager.js` | Per-room pooled management of active projectiles. |
| `items.js` | The pickup-item array (`AllItems`/`ItemTypes`) - ammo, grenades, plugin-added pickups. See [Catalog and Items](./catalog-and-items.md). |
| `itemManager.js` | Per-room pooled management of spawned pickup items. |
| `catalog.js` | The cosmetic/loadout shop catalog and weekly rotation algorithm. See [Catalog and Items](./catalog-and-items.md). |
| `player.js` | The authoritative `Player` class - movement, combat, state-buffer prediction/reconciliation. |
| `collider.js` | Voxel-grid collision engine. See [Physics and Collision](./physics-and-collision.md). |
| `math.js` | Monkey-patches the global `Math` object with vector/angle/seeded-random helpers shared client/server. |
| `pool.js` | The generic object-pool class everything high-frequency (bullets, items) is built on. |
| `permissions.js` | The slash-command system. See [Permissions Internals](./permissions-internals.md). |
| `gametypes.js` | `GameTypes`/`defaultOptions` - the gamemode and per-room `gameOptions` shape. |
| `comm.js` | The binary wire protocol. See [Wire Protocol](./wire-protocol.md). |
| `events.js` | The **seasonal** event scheduler (`EventManager`) - unrelated to the plugin event system despite the name. See [Seasonal Events](../03-Content%20Creation/seasonal-events.md). |
| `constants.js` | Tick rate, enums, item-ID offset tables, `iteratePlayers`, and re-exports from `isClientServer.js`. |
| `censor.js` | Chat profanity filtering. |
| `stringWidth.js` | Text pixel-width measurement (Canvas-based, both sides). |
| `loading.js` | Map/mesh loading, including the block-naming-convention parser - see [Map Blocks](../03-Content%20Creation/map-blocks.md). |
| `isClientServer.js` | The actual source of `isClient`/`isServer`/`isEditor` - the one primitive everything else branches on. |
| `plugins.js` | `PluginManager` itself - see [Plugin Development](../04-Plugin%20Development/). |
| `general/misc.js` | The `ss` context object and the splice machinery described on this page. See [The `ss` Object](./the-ss-object.md). |
| `general/looper.js` | The server tick-loop scheduler. See [Game Loop](./game-loop.md). |
| `general/prepare-babylons.js` | Server-only model-merging build step (not itself spliced into the client - it's never referenced via a `LEGACYSHELLXXX` token). |
| `general/wsrequest.js` | A minimal promise-wrapped WebSocket request helper, used for server-to-server calls. |

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
