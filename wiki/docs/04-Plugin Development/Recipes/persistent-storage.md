# Recipe: Persistent Plugin Storage

> **Audience:** Plugin authors · **Prereqs:** [Anatomy](../anatomy.md)
>
> **Canonical source:** `plugins_default/autoshopnotifications/index.js`, `plugins_default/playercountnotifications/index.js`

A plugin's own on-disk config/state that survives a server restart - there's no built-in key-value store or ORM for this, it's just `node:fs` reading and writing JSON next to your plugin's own code. Two bundled plugins already do exactly this in production; this recipe is that same real pattern, extracted and explained.

## Why not the database?

`server-services/store/LegacyShellData.db` (see [The Database](../../02-Running%20a%20Server/the-database.md)) is services' database, reachable only from services-side plugin code, and its schema is meant for accounts/items/maps/sessions - not ad-hoc plugin state. A game or client server plugin (where most plugin logic actually lives) has no direct DB access at all. For "remember this one JSON blob between restarts," a file in your own plugin folder is simpler, requires no schema, and works identically on every server role.

## The pattern

```js
// plugins/mystats/index.js - the real pattern, from plugins_default/autoshopnotifications/index.js
import fs from 'node:fs';
import path from 'node:path';
import log from 'puppylog';

export const PluginMeta = {
    identifier: "mystats",
    name: 'My Stats',
    author: 'you',
    version: '1.0.0',
    descriptionShort: 'Tracks something across restarts.',
    descriptionLong: 'A minimal example of a plugin persisting its own JSON state to disk.',
    legacyShellVersion: 598,
};

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        this.storeFolder = path.join(this.thisDir, 'store');
        if (!fs.existsSync(this.storeFolder)) {
            fs.mkdirSync(this.storeFolder, { recursive: true });
        };

        var config = this.getConfig();
        log.beige(`mystats: loaded, seenTotal so far is ${config.seenTotal}`);

        this.plugins.on('game:onPlayerDeath', this.onPlayerDeath.bind(this));
    };

    getConfig() {
        const configPath = path.join(this.storeFolder, 'mystats.json');
        if (!fs.existsSync(configPath)) {
            fs.writeFileSync(configPath, JSON.stringify({ seenTotal: 0 }, null, 4));
        };
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    };

    saveConfig(config) {
        const configPath = path.join(this.storeFolder, 'mystats.json');
        fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
    };

    onPlayerDeath(data) {
        var config = this.getConfig();
        config.seenTotal++;
        this.saveConfig(config);
    };
};
```

This is a direct simplification of the real `getConfig`/`saveConfig` pair in `plugins_default/autoshopnotifications/index.js:159-176` (and duplicated almost verbatim in `plugins_default/playercountnotifications/index.js:186-201`) - two independent, currently-shipping plugins converged on the same read-if-missing-else-parse, write-whole-file-back approach, which is a reasonable sign this is the idiomatic way to do it in this codebase rather than something more elaborate.

## Why `thisDir/store/`, not `thisDir` directly

Keeping persisted data in a `store/` subfolder (created with `{ recursive: true }` so it's a no-op if it already exists) separates your plugin's actual code from its generated state - useful if the plugin folder is a git repository that gets auto-pulled on every boot (see [Lifecycle](../lifecycle.md#git-auto-pull-on-every-load)): a `.gitignore` entry for `store/` keeps a `git pull` from ever touching (or conflicting with) your saved state. This mirrors the top-level `store/` folder pattern used by the server roles themselves (`server-services/store/`, `server-game/store/`, etc.) - see [Repo Layout](../../05-Codebase%20Reference/repo-layout.md).

## Read-modify-write, not an in-memory cache

Notice `getConfig()` is called fresh every time, re-reading and re-parsing the file rather than keeping a single in-memory object updated over the plugin's lifetime. For infrequent writes (a notification-tracking plugin firing a few times a day) this is simple and correct - it can't drift from what's actually on disk. If you're writing on every single game tick or similar hot path, that's a sign this pattern isn't the right fit (disk I/O at 60Hz would be a real problem) - batch writes on a timer instead, or keep an in-memory copy and only flush periodically.

## What we validated

Loaded this exact plugin against a real (isolated, scratch) game server: it loads cleanly with no errors, on both the main thread and the spare room worker, and genuinely creates `plugins/mystats/store/mystats.json` on disk with `{"seenTotal": 0}` the first time it boots - confirmed by inspecting the file after startup, not just reading the log.

## Common Issues

**My config file gets reset every restart.** Check `fs.existsSync(configPath)` is actually finding your file - a relative path used instead of `path.join(this.thisDir, ...)` resolves against the server process's current working directory, not your plugin's folder, and silently "finds" nothing every time.

**Two server processes (e.g. `game` and a spare room worker) are stepping on each other's writes.** This simple read-modify-write pattern has no locking - it's fine for occasional writes from a single logical writer, but if multiple processes (see [Workers and State](../workers-and-state.md) - every room worker runs its own independent copy of your plugin) write to the same file concurrently, the last write wins and can lose data from the other. Keep truly shared, frequently-written state in a database instead, or have only one process (e.g. only the game server's main thread, gated with `if (plugins.type === "game")`) own the writes.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
