# Recipe: UI Modification

> **Audience:** Plugin authors · **Prereqs:** [Client-Side Code](../client-side-code.md)
>
> **Canonical source:** `server-client/src/client-static/src/shellshock.min.js` (the `setupComplete` event)

Adding your own DOM element to the game's UI - a simple welcome banner shown once the player is fully loaded in, as the pattern for anything else you'd want to draw on screen outside the 3D scene itself (HUD elements, custom menus, notifications).

## The hook

`setupComplete` fires once the startup poll loop confirms both authentication and page setup have finished - a reliable "the player is actually looking at a ready game" moment, later than page-load events that could fire before the player's own data is available:

```js
// shellshock.min.js - real code
plugins.emit("setupComplete", {});
```

## The plugin

```js
// plugins/welcomebanner/shared.js
import { isClient } from '#constants';
import { plugins } from '#plugins';

export const WelcomeBanner = {
    registerListeners(pluginManager) {
        this.plugins = pluginManager;
        this.plugins.on('game:setupComplete', this.onSetupComplete.bind(this));
    },
    onSetupComplete() {
        const banner = document.createElement('div');
        banner.textContent = `Welcome, ${me?.name || 'Guest'}!`;
        banner.style.cssText = `
            position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.75); color: white; padding: 8px 20px;
            border-radius: 6px; font-family: sans-serif; font-size: 16px;
            z-index: 9999; pointer-events: none;
        `;
        document.body.appendChild(banner);
        setTimeout(() => banner.remove(), 3000);
    },
};

if (isClient) WelcomeBanner.registerListeners(plugins);
```

```js
// plugins/welcomebanner/index.js
import path from 'node:path';
import { WelcomeBanner } from './shared.js';

export const PluginMeta = {
    identifier: "welcomebanner",
    name: 'Welcome Banner',
    author: 'you',
    version: '1.0.0',
    descriptionShort: 'Shows a brief welcome banner once the game finishes loading.',
    descriptionLong: 'A minimal example of injecting a custom DOM element into the game UI.',
    legacyShellVersion: 598,
};

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        // this plugin only does client-side work - no server-side listeners to register

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

## Why `me` works here, and why `position: 'after'` still matters

`me` is the browser bundle's global reference to the local player's own object (the same global `parseMentions` reads for `@m` - see [Permissions Internals](../../05-Codebase%20Reference/permissions-internals.md#parsementions-resolving-tokens)) - it only has a meaningful value once the player has actually joined a game, which `setupComplete` firing already guarantees. But the *reference itself* (the global binding) also only exists once the relevant shared module has loaded - so this still needs `position: 'after'` for the same reason as [Custom Weapon](./custom-weapon.md#why-position-after-specifically): anything that reads an actual game object, not just registers a listener for later, needs to run after the full bundle is assembled.

## Plain DOM APIs, nothing game-engine-specific

This recipe deliberately doesn't touch Babylon.js at all - `document.createElement`/`appendChild`/inline styles are enough for anything that's genuinely a 2D overlay rather than something rendered in the 3D scene. Reach for Babylon's own GUI/texture system only if you actually need something integrated into the 3D world (a name tag above a player, a marker in space) rather than a screen-space overlay like this.

## What we validated

Loaded against a real (isolated, scratch) client server: the build pipeline successfully locates and splices `shared.js` into the bundle at the `after` position with no insertion error - the same mechanism validated in [Custom Weapon](./custom-weapon.md#what-we-validated-and-what-we-couldn-t), which also notes the pre-existing, unrelated minification issue that prevented us from getting a fully built bundle to visually confirm the banner appears on screen in this particular test environment.

## Common Issues

**The banner never appears.** Confirm `setupComplete` is actually firing - add a `console.log` at the top of `onSetupComplete` and check the browser console; if it never logs, the listener registration itself likely failed (check for a JS error earlier in the console, which would prevent the rest of the bundle - including your plugin's spliced-in code - from running correctly).

**Styling looks wrong or gets overridden by the game's own CSS.** The inline `style.cssText` approach used here is deliberately high-specificity to avoid fighting the game's own stylesheet, but a `z-index` conflict with an existing UI element is still possible - inspect the element in browser dev tools to see what's actually stacking above or below it.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
