# Lifecycle

> **Audience:** Plugin authors · **Prereqs:** [Anatomy](./anatomy.md)
>
> **Canonical source:** `src/shell/plugins.js` (`PluginManager.loadPlugins`, `.preloadPlugin`)

What actually happens, in order, between a server process starting and your plugin's constructor running.

## At a glance

<svg viewBox="0 0 640 520" xmlns="http://www.w3.org/2000/svg" fill="currentColor" style="max-width:100%;height:auto;font-family:system-ui,sans-serif" role="img" aria-label="Diagram: instantiateSS runs first, then loadPlugins(type) preloads every plugin folder in parallel, sorts them alphabetically by identifier, and instantiates them one at a time in that order; only then does the role's own start file get imported.">
  <defs>
    <marker id="lc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
    </marker>
  </defs>

  <rect x="170" y="15" width="300" height="50" rx="6" fill="none" stroke="currentColor" stroke-width="2" />
  <text x="320" y="36" text-anchor="middle" font-size="12" font-weight="bold">1. instantiateSS(...)</text>
  <text x="320" y="53" text-anchor="middle" font-size="10">builds shared ss context (config, paths, version)</text>

  <line x1="320" y1="65" x2="320" y2="93" stroke="currentColor" stroke-width="1.5" marker-end="url(#lc-arrow)" />

  <rect x="60" y="95" width="520" height="330" rx="8" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="4 3" />
  <text x="320" y="118" text-anchor="middle" font-size="12" font-weight="bold">2. loadPlugins(type) - all plugins load here</text>

  <rect x="90" y="140" width="460" height="70" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" />
  <text x="320" y="162" text-anchor="middle" font-size="11" font-weight="bold">Preload, in parallel across every plugin folder</text>
  <text x="320" y="178" text-anchor="middle" font-size="10">git pull (background, non-fatal) - resolve/check</text>
  <text x="320" y="193" text-anchor="middle" font-size="10">dependencies - import index.js</text>

  <line x1="320" y1="210" x2="320" y2="228" stroke="currentColor" stroke-width="1.5" marker-end="url(#lc-arrow)" />

  <rect x="90" y="230" width="460" height="45" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" />
  <text x="320" y="248" text-anchor="middle" font-size="11" font-weight="bold">Sort successfully-preloaded plugins</text>
  <text x="320" y="263" text-anchor="middle" font-size="10">alphabetically by PluginMeta.identifier</text>

  <line x1="320" y1="275" x2="320" y2="293" stroke="currentColor" stroke-width="1.5" marker-end="url(#lc-arrow)" />

  <rect x="90" y="295" width="460" height="70" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" />
  <text x="320" y="317" text-anchor="middle" font-size="11" font-weight="bold">Instantiate sequentially, one at a time, awaited</text>
  <text x="320" y="333" text-anchor="middle" font-size="10">new Plugin(pluginManagerInstance, pluginFolderPath)</text>
  <text x="320" y="348" text-anchor="middle" font-size="10">- a slow constructor delays only plugins after it</text>

  <line x1="320" y1="425" x2="320" y2="448" stroke="currentColor" stroke-width="1.5" marker-end="url(#lc-arrow)" />

  <rect x="170" y="450" width="300" height="55" rx="6" fill="none" stroke="currentColor" stroke-width="2" />
  <text x="320" y="472" text-anchor="middle" font-size="12" font-weight="bold">3. start-*.js dynamically imported</text>
  <text x="320" y="488" text-anchor="middle" font-size="10">role's own core logic runs against</text>
  <text x="320" y="500" text-anchor="middle" font-size="10">already-loaded, already-patched plugins</text>
</svg>

## The boot sequence

Every server role (`services`, `game`, `client`) follows the same pattern in its `run-*.js` entrypoint:

1. `misc.instantiateSS(...)` - builds the shared `ss` context object (config, paths, version info).
2. `plugins.loadPlugins('<services|game|client>')` - **all plugins load here**, before anything else.
3. The role's own `start-*.js` is dynamically imported and runs.

Step 2 happening *before* step 3 is deliberate: it means a plugin can monkey-patch or register against shared modules before the server's own core logic runs against them. It's also why `plugins.type` is already set correctly by the time your plugin's constructor executes.

## What `loadPlugins(type)` actually does

Per-plugin, in order:

1. **Scans both `plugins_default/` and `plugins/`** for subdirectories not starting with `_`.
2. **For each plugin folder, in parallel:**
   - Reads `dependencies.js` if present.
   - If the folder is a git repository, runs `git pull` in the background (non-blocking, logged but non-fatal if it fails - see below).
   - Resolves/installs npm dependencies, and checks any `"plugin"`-type dependencies are present (see [Dependencies](./dependencies.md)). A missing plugin dependency drops this plugin from loading entirely.
   - Imports `index.js`.
3. **Sorts all successfully-preloaded plugins alphabetically by `PluginMeta.identifier`.**
4. **Instantiates them in that sorted order**, one at a time: `new Plugin(pluginManagerInstance, pluginFolderPath)`.

Step 2 (preloading - reading files, git-pulling, resolving dependencies) happens in parallel across all plugins for speed. Step 4 (actually running each constructor) happens strictly in the sorted order, one after another, awaited sequentially - so a slow or blocking constructor in one plugin delays every plugin after it alphabetically, but never one before it.

## Load order and why some plugins have number-prefixed identifiers

Since instantiation order follows `PluginMeta.identifier` alphabetically, and some plugins need to run their constructor before or after another specific plugin (e.g. to make sure a dependency's setup has actually happened, beyond just "the folder exists" which is all `dependencies.js` checks), you'll see identifiers deliberately prefixed with a digit purely to force sort order - `5_crackshot` is a real example in this codebase, chosen specifically to control its position relative to other weapon-model plugins. This is a workaround, not a formal API - there's no other way to express "load after plugin X" today.

## Git auto-pull on every load

If a plugin's folder is its own git repository, LegacyShell runs `git pull` on it every time that server boots - a lightweight built-in auto-update mechanism, no separate deploy step needed for plugin updates. A few things worth knowing:

- It runs **asynchronously and non-blocking** - the plugin loads with whatever code was already on disk; the pull result only affects the *next* boot.
- **Failure is logged, not fatal** - a plugin without internet access, or one that's just a plain folder (not a git repo), loads normally; you'll only see a warning in the log.
- This means **every server restart is a potential update point** for every plugin with a git remote - worth knowing if you're debugging "my change to a plugin didn't take effect," since an auto-pull could have silently reverted or advanced what's on disk if the plugin folder's remote changed underneath you.

## Server-type gating

There's no dedicated API for "only load on the game server" - `plugins.type` (`'services'`, `'game'`, or `'client'`, set by whichever `loadPlugins(type)` call is currently running) is just a plain property, checked by convention at the top of the constructor:

```js
export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        if (plugins.type !== "game") {
            log.orange(`${PluginMeta.identifier} won't run on this server type.`);
            return;
        };

        // ...actual setup, only reached on the game server
    };
};
```

Every server type still instantiates your `Plugin` class (there's no way to skip that) - the convention is just to return early from the constructor once you've confirmed you're not on a relevant server type, so nothing else in your plugin runs.

## One important nuance: room workers load plugins independently

If your plugin targets `game:` events, be aware that `plugins.loadPlugins('game')` doesn't run just once per game server process - it runs again, completely independently, **inside every room's worker thread** (see [Workers and State](./workers-and-state.md) for the full explanation and why it matters for anything involving shared state). Nothing about the boot sequence described above changes because of this - it's just that "the game server" is, in practice, several separate JS execution contexts each running this exact sequence on their own.

Next: [Dependencies](./dependencies.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
