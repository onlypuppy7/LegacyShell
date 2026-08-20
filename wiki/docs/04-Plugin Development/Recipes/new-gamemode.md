# Recipe: New Gamemode

> **Audience:** Plugin authors · **Prereqs:** [Events (concept)](../events-concept.md)
>
> **Canonical source:** `src/shell/gametypes.js`

Registering an actual new entry in the gamemode selector - distinct from [Gamemodes](../../03-Content%20Creation/gamemodes.md), which covers per-room *configuration* of existing modes. This recipe adds "Sudden Death" - any hit is lethal.

## The hook

`gametypes.js` builds its `GameTypes` array inside an async IIFE that awaits `game:GameTypesInit` before filling in defaults:

```js
// src/shell/gametypes.js - real code
(async function () {
    await plugins.emit('GameTypesInit', { GameTypes, ItemTypes, defaultOptions });
    // ...fills in defaults, assigns .value/.shortNameDisplay/.longNameDisplay, builds AllMapPools and the GameType enum
})();
```

`GameTypes` is passed by reference - a listener pushes a new entry onto the same array the rest of the file then finishes processing.

## The plugin

```js
// plugins/suddendeath/index.js
import log from 'puppylog';

export const PluginMeta = {
    identifier: "suddendeath",
    name: 'Sudden Death',
    author: 'you',
    version: '1.0.0',
    descriptionShort: 'A gamemode where any hit is lethal.',
    descriptionLong: 'Adds a Sudden Death gamemode - resistanceModifier is set extremely low so any hit kills.',
    legacyShellVersion: 598,
};

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        this.plugins.on('game:GameTypesInit', this.onGameTypesInit.bind(this));
    };

    onGameTypesInit(data) {
        data.GameTypes.push({
            shortName: "Sudden Death",
            longName: "Sudden Death",
            codeName: "suddendeath",
            mapPool: "FFA",
            options: {
                resistanceModifier: [0.01, 0.01, 0.01],   // [ffa, team1, team2]
            },
        });
    };
};
```

`options` only needs to specify what differs from `defaultOptions` - everything else (item spawn rates, gravity, etc.) is deep-merged from the default automatically, the same way the two built-in modes (`FFA`, `Teams`) only specify `teamsEnabled` and nothing else.

## Why `resistanceModifier`, specifically

Damage resolution (`player.js`'s `hit` method) computes `damage = Math.ceil((damage / player.modifiers.resistanceModifier) / player.modifiers.scale)` - resistance is a **divisor**, so a value far below `1` (the default) massively amplifies incoming damage rather than reducing it. `0.01` means damage gets multiplied roughly 100x, which one-shots a player from any hit that would normally do noticeable damage, without needing to touch the actual hit-resolution code at all - the existing per-team modifier system already does the work.

## `mapPool`

Set to `"FFA"` here, reusing the existing free-for-all map pool rather than requiring maps to be specifically tagged for a brand-new pool name - see [Gamemodes](../../03-Content%20Creation/gamemodes.md#mappool-why-some-maps-don-t-show-up-for-some-modes). If you want your mode restricted to a curated map subset instead, pick a new pool name and make sure at least some maps' `modes` field includes it (see [Maps](../../03-Content%20Creation/maps.md)).

## What we validated

Loaded against a real (isolated, scratch) game server: `GameTypes` grew to include the new entry on both the main thread and inside a room worker, confirmed via a log line reporting the array's length after registration (went from the baseline of built-in-plus-other-bundled-plugin modes to one more, in both threads, matching expectations). We did not verify the in-game damage behavior against live gameplay - see [Killstreaks](./killstreaks.md#validated) for the same category of limitation and why it's an honest one to state rather than paper over.

## Common Issues

**My gamemode doesn't appear in the mode list at all.** Confirm your listener is actually registered before `GameTypesInit` fires - this happens once per process at `gametypes.js`'s own module-evaluation time (early in boot, on both the main thread and every room worker independently - see [Rooms and Workers](../../05-Codebase%20Reference/rooms-and-workers.md)), so a plugin loaded normally through the standard boot sequence is always in time; this would only bite you if something tried to import `#gametypes` unusually early, which no plugin should ever need to do directly.

**Options I didn't specify aren't behaving like the defaults.** Double-check you're using the exact same key names as `defaultOptions` (`src/shell/gametypes.js`) - a typo'd key doesn't override anything, it just becomes an unused extra field, silently.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
