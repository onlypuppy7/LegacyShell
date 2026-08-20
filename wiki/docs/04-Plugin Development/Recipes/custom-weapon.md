# Recipe: Custom Weapon

> **Audience:** Plugin authors · **Prereqs:** [Events (concept)](../events-concept.md), [Client-Side Code](../client-side-code.md)
>
> **Canonical source:** `src/shell/guns.js` (the `fireX` hooks), `src/shell/bullets.js` (`Bullet.fire`)

LegacyShell's four weapon classes (Eggk47, Dozen Gauge, CSG1, Cluck9mm) plus RPEGG are fixed at the engine level - there's no plugin hook for registering a genuinely new sixth weapon slot. What you *can* do, fully through the plugin API, is replace an **existing** weapon's fire behavior entirely. This recipe does that: making the CSG1 (Free Ranger) fire three pellets in a horizontal spread instead of one bullet.

## The hook

Every weapon's fire method emits a per-weapon event, immediately followed by the default single-bullet fire, gated on `plugins.cancel` (see [Events (concept)](../events-concept.md#plugins-cancel-opting-out-of-default-behavior)):

```js
// src/shell/guns.js - real code, CSG1's fire method
CSG1.prototype.fireMunitions = function (pos, dir) {
    plugins.emit("fireCSG1", {this: this, pos, dir, CSG1});
    if (!plugins.cancel) Bullet.fire(this.player, pos, dir, CSG1)
};
```

Cancel that default, and call `Bullet.fire` yourself - as many times, with whatever positions, as you want.

## `shared.js` - the actual weapon-behavior code

This needs to run identically on both client and server, since `fireMunitions` itself has no `isClient`/`isServer` branch - it's the same code path predicting the shot locally and resolving it authoritatively:

```js
// plugins/customweapon/shared.js
import BABYLON from "babylonjs";
import { Bullet } from '#bullets';
import { isClient } from '#constants';
import { plugins } from '#plugins';

export const TripleShotCSG1 = {
    registerListeners(pluginManager) {
        this.plugins = pluginManager;
        this.plugins.on('game:fireCSG1', this.onFireCSG1.bind(this));
    },
    onFireCSG1(data) {
        const offsets = [-0.15, 0, 0.15];
        offsets.forEach(offset => {
            const pelletPos = new BABYLON.Vector3(data.pos.x + offset, data.pos.y, data.pos.z);
            Bullet.fire(data.this.player, pelletPos, data.dir, data.CSG1);
        });
        this.plugins.cancel = true;
    },
};

if (isClient) TripleShotCSG1.registerListeners(plugins);
```

`import { Bullet } from '#bullets'` and `import BABYLON from "babylonjs"` both work here exactly like they do in `guns.js` itself - the same shared-module resolution described in [Shared Shell Layer](../../05-Codebase%20Reference/shared-shell-layer.md), whether this file is running as a normal Node import (server) or spliced raw into the browser bundle (client, where both `import` lines get commented out and `Bullet`/`BABYLON` are already-loaded globals by the time this file's code runs - see the position note below).

## `index.js`

```js
// plugins/customweapon/index.js
import path from 'node:path';
import { TripleShotCSG1 } from './shared.js';

export const PluginMeta = {
    identifier: "customweapon",
    name: 'Triple Shot CSG1',
    author: 'you',
    version: '1.0.0',
    descriptionShort: 'Makes the CSG1 fire three pellets in a spread.',
    descriptionLong: 'Replaces the CSG1 default single-bullet fire with a three-pellet horizontal spread.',
    legacyShellVersion: 598,
};

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        TripleShotCSG1.registerListeners(this.plugins);
        this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));
    };

    pluginSourceInsertion(data) {
        data.pluginInsertion.files.push({
            filepath: path.join(this.thisDir, 'shared.js'),
            position: 'after',
        });
    };
};
```

## Why `position: 'after'`, specifically

`shared.js` references `Bullet` and `BABYLON` at the top level of `onFireCSG1` - real gameplay objects that only exist once the full shared game-logic bundle has loaded. Per [Client-Side Code](../client-side-code.md#the-three-insertion-positions), `before`/`beforebefore` run too early in the concatenated script for that - `after` (the very end, once everything else has already executed) is the correct choice whenever your injected code references actual game objects rather than just registering event listeners for later.

## What we validated, and what we couldn't

We loaded this exact plugin against a real (isolated, scratch) instance: the **game server** loads it cleanly on both the main thread and inside a room worker (no errors, both `Bullet`/`BABYLON` imports resolve correctly server-side). The **client server**'s build pipeline also successfully locates and splices `shared.js` into the bundle at the `after` position with no insertion error. We could not get a fully built, minified, visually-verified bundle in our test environment - the client build's minification step failed with an unrelated pre-existing error (`Legacy octal literals are not allowed in strict mode`) that we confirmed also occurs with **zero** custom plugins installed, i.e. it's an environment/dependency issue in the stock codebase, not something this recipe caused. If you hit the same error in your own environment, it's worth investigating separately - it isn't specific to this plugin.

## Common Issues

**Pellets don't visually spread apart.** Double-check the offset values are actually reaching `Bullet.fire` - log `pelletPos` inside the handler and confirm three distinct positions are being computed, rather than assuming the math is the problem.

**The gun still fires a single normal shot.** `plugins.cancel` wasn't actually set before the default `if (!plugins.cancel) Bullet.fire(...)` check ran - confirm your listener runs synchronously (no `await` before the `this.plugins.cancel = true` line) so it takes effect before `guns.js` checks it.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
