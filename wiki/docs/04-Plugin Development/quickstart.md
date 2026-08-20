# Quickstart

> **Audience:** Plugin authors · **Prereqs:** [Running a Server](../02-Running%20a%20Server/), basic JavaScript
>
> **Canonical source:** `src/shell/plugins.js` (`PluginManager`), `plugins_samples/sample1cmd/`

A working LegacyShell plugin in about ten minutes: a folder, two files, one restart.

## 1. Create the folder

Plugins live in `plugins/` (for your own/third-party plugins - `plugins_default/` is reserved for the ones LegacyShell ships with). Create:

```
plugins/hello-legacyshell/
```

The folder name doesn't have to match anything inside it, but keep it lowercase and hyphenated - it's what shows up in boot logs and in dependency declarations from other plugins.

## 2. Write `index.js`

Every plugin needs exactly one required file: `index.js`, exporting a `PluginMeta` object and a `Plugin` class.

```js
// plugins/hello-legacyshell/index.js
import log from 'puppylog';

export const PluginMeta = {
    identifier: "hellolegacyshell",
    name: 'Hello LegacyShell',
    author: 'you',
    version: '1.0.0',
    descriptionShort: 'Says hello when the game server starts.',
    descriptionLong: 'A minimal example plugin for the quickstart guide.',
    legacyShellVersion: 598, // see /versionEnum.txt
};

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        if (plugins.type !== "game") {
            log.orange(`${PluginMeta.identifier} won't run on this server type.`);
            return;
        };

        this.plugins.on('game:startUp', this.onStartUp.bind(this));
    };

    onStartUp(data) {
        log.green("Hello from a plugin! (This actually fires in the browser, not the Node server - see below.)");
    };
};
```

That's the entire contract: `PluginMeta` (metadata) and `Plugin` (a class, instantiated once as `new Plugin(pluginManager, pluginFolderPath)`). Everything else - registering event listeners, adding commands, shipping browser code - happens inside that constructor or methods it calls.

::: tip Why `game:startUp` fires in the browser, not on your Node server
`startUp` is emitted from the shared game-logic source that gets spliced into the *browser* bundle (see [Events (concept)](./events-concept.md)), not from `server-game`'s own boot sequence. It's a deliberately chosen "does this even work" test event for the quickstart, precisely because it's easy to eyeball in a browser console. For something that actually fires in your Node terminal on boot, use `game:roomInit` or `services:servicesOnLoad` instead - see the [Event Reference](./Event%20Reference/) once it's built out.
:::

## 3. Restart the affected server(s)

Plugins load once at server startup - there's no hot reload. Restart whichever server(s) this plugin targets (here, `game`):

```bash
npm run game
```

Watch the boot log - you should see your plugin listed and loaded:

```
Starting plugin -> hellolegacyshell
Loaded plugin -> Hello LegacyShell v1.0.0 by you: Says hello when the game server starts.
```

If it doesn't show up, double-check the folder name doesn't start with `_` (that disables it - see [Anatomy](./anatomy.md)) and that `index.js` doesn't have a syntax error (check the boot log for a stack trace).

## 4. See it actually do something

Since `game:startUp` fires client-side, open the browser console (F12) at `http://localhost:13370` and load into a game - you'll see the green log line there, not in your terminal. This is the fastest possible way to confirm your plugin is genuinely loaded and wired up correctly end to end (config → server → build → browser), before you write anything that actually changes gameplay.

## Where to go next

- [Anatomy](./anatomy.md) - the full folder contract and `PluginMeta` schema, in detail.
- [Events (concept)](./events-concept.md) - how `on`/`emit` actually work, and the full list of events available.
- [Commands](./commands.md) - adding your own slash commands, probably the most common first real thing to build.
- The [Recipes](./Recipes/) section has complete, working examples if you'd rather learn by reading a finished plugin than building one from scratch.
- **[I Want To...](./i-want-to.md)** - if you already know what you're trying to build, this task-oriented index jumps straight to the relevant page instead of reading through the whole section.
- For real, currently-shipping plugins to read (rather than the deliberately minimal examples on this page), browse `plugins_default/` and `plugins_samples/` directly - not `plugins/`, which is empty on a fresh install. See [I Want To...](./i-want-to.md) for pointers on which bundled plugin demonstrates what.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
