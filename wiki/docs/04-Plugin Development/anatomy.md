# Anatomy of a Plugin

> **Audience:** Plugin authors · **Prereqs:** [Quickstart](./quickstart.md)
>
> **Canonical source:** `src/shell/plugins.js` (`PluginManager.preloadPlugin`, `.preloadPluginsFromDir`)

The full folder contract, in detail - everything the loader looks for and how it interprets it.

## Where plugins live

Two directories, scanned identically:

| Directory | Purpose |
|---|---|
| `plugins_default/` | First-party plugins bundled with LegacyShell. Safe to disable, not meant to be hand-edited. |
| `plugins/` | Your own plugins, and anything third-party you've installed. This is where you work. |

Both get scanned at startup and merged into one combined plugin list - there's no functional difference between the two directories beyond convention.

## The required file: `index.js`

Every plugin folder must contain an `index.js` with exactly two named exports:

```js
export const PluginMeta = { /* ... */ };
export class Plugin { /* ... */ };
```

### `PluginMeta` fields

Every plugin in this codebase - first-party and third-party alike - uses this exact shape:

```js
export const PluginMeta = {
    identifier: "someplugin",      // unique key - see below
    name: 'Human Readable Name',   // shown in boot logs
    author: 'someone',
    version: '1.0.0',
    descriptionShort: 'One-liner shown when loading',
    descriptionLong: 'Longer description',
    legacyShellVersion: 598,       // the LegacyShell build this targets - see /versionEnum.txt
};
```

`identifier` is the only field the loader actually uses programmatically - it's the sort key for load order (see [Lifecycle](./lifecycle.md)) and the key your plugin is stored under in `pluginManager.plugins[identifier]`. `legacyShellVersion` is purely informational - nothing checks it against the running server's actual version, so don't rely on it to gate behavior.

### The `Plugin` class

Instantiated exactly once, when the server loading it starts up:

```js
new Plugin(pluginManagerInstance, absolutePathToThisPluginsFolder)
```

The universal constructor pattern used throughout this codebase:

```js
export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;   // the PluginManager - use this to register listeners
        this.thisDir = thisDir;   // absolute path to your own plugin folder
        pluginInstance = this;    // module-level singleton reference, handy for other files in your plugin to reach back in

        // register event listeners, commands, etc. here
    };
};
```

`thisDir` is what you use to reference your own bundled files - static assets, models, item packs - regardless of whether your plugin ended up in `plugins/` or `plugins_default/`.

## Disabling a plugin: the `_` prefix

Rename a plugin's folder to start with an underscore (`_someplugin`) and the loader skips it entirely - it won't even attempt to read `index.js`:

```js
// src/shell/plugins.js, preloadPluginsFromDir
if (fs.statSync(dirPath).isDirectory() && !pluginFolder.startsWith("_")) {
    // ...loads it...
}
```

This is purely a directory-naming convention - `PluginMeta.identifier` itself never has an underscore, even for a disabled plugin. You'll see this in the bundled examples: `plugins_default/_zaxoniuscustomguns` is disabled by default (identifier: `zaxoniuscustomguns`, no underscore), while everything else in `plugins_default/` ships enabled.

This is the standard way to ship a plugin "present but off" - keep the folder in place (so re-enabling later is a one-character rename) rather than deleting it.

## Optional files

- **`dependencies.js`** - declares npm packages or other required plugins. See [Dependencies](./dependencies.md).
- **Anything else** - entirely up to you. Common patterns seen throughout this codebase: a `shared.js` or `client.js` file holding the logic that gets spliced into the browser bundle (see [Client-Side Code](./client-side-code.md)), a `store/` folder for the plugin's own persistent config/data, an `items/` folder for content packs (see [Content Packs](./content-packs.md)), and a `client/` folder of static assets served via `express.static` (see [Static Assets](./static-assets.md)).

There's no manifest beyond `index.js` - everything else is just files your own code reads, using `thisDir` as the anchor.

## Common Issues

**My plugin doesn't show up in the boot log at all.** Check for a leading underscore in the folder name (disables it silently, no error) and check that `index.js` actually exports both `PluginMeta` and `Plugin` by those exact names - a typo here fails just as silently as a missing file, since the loader destructures `const { PluginMeta, Plugin } = pluginObject.Plugin;` and simply gets `undefined` back if the names don't match.

**"Failed to initialize plugin from folder ..." in the log.** Your constructor threw. The full stack trace is logged right after that message - check it for the actual error rather than guessing.

Next: [Lifecycle](./lifecycle.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
