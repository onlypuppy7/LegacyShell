# Recipe: Custom Theme

> **Audience:** Plugin authors · **Prereqs:** [Client-Side Code](../client-side-code.md), [Dependencies](../dependencies.md), [Static Assets](../static-assets.md)
>
> **Canonical source:** `plugins_default/legacythemes` (the framework), `plugins_default/whatsapptheme` (a complete, shipping example theme built on it)

A "theme" in LegacyShell is a CSS stylesheet plus an image set, registered into the `LegacyThemes` framework so it shows up as a selectable, stackable option under Settings → Theming. `whatsapptheme` (bundled, shown to every player as "WhatsApp Theme") is a real, currently-shipping theme - this page walks through exactly how it works and how to build your own the same way, rather than inventing a new unvalidated example.

## The framework, in one picture

`legacythemes` does three things from its own `client.js` (spliced into the bundle via `client:pluginSourceInsertion`, same mechanism as any other plugin's client code):

1. **Loads a base stylesheet** (`legacythemesbase.css`) unconditionally, so there's always a coherent default even with no theme selected.
2. **Builds a Settings UI** (`LegacySettings.addTab("Theming", ...)`) listing every registered style pack, plus a reorderable, stackable "Current Applied Style Packs" list - players can layer more than one theme at once.
3. **Applies theme CSS and reads specific variables back out into the game itself** - most of a theme is just CSS the browser applies normally, but two things live outside the DOM (the 3D scene's sky/lighting, and swapping a few `<img>` elements) and need a JS bridge, described below.

A theme plugin's only job is to add one entry to `LegacyThemesPlugin.stylePacks` and ship the CSS/images that entry points at. `legacythemes` itself doesn't need to know your theme exists ahead of time.

## Registering a theme: the whole of `whatsapptheme`'s client code

```js
// plugins_default/whatsapptheme/client.js - real code, complete
const WhatsAppThemePlugin = {
    registerListeners: function (pluginManager) {
        this.plugins = pluginManager;
    },
};

WhatsAppThemePlugin.registerListeners(plugins);

LegacyThemesPlugin.stylePacks.push({
    name: "WhatsApp Theme",
    identifier: "whatsapptheme",
    description: "A theme that makes LegacyShell look like WhatsApp.\nAn example theme made by onlypuppy7",
    cssFile: "/themes/whatsapptheme/whatsapptheme.css",
    author: "onlypuppy7",
    images: [
        '/themes/whatsapptheme/img/logo.png',
        '/themes/whatsapptheme/img/anim_chicken.gif',
        // ...more preview images, shown in the settings gallery
    ]
});
```

That's the entire registration - a plain object pushed onto a global array. `name`/`description` show up in the settings UI, `images` populate the preview gallery when the pack is selected, and `cssFile` is the actual stylesheet that gets fetched and cached (`cacheAllStyles`) the first time settings load.

This only works because `LegacyThemesPlugin` already exists as a global by the time this code runs - which is why `whatsapptheme`'s `dependencies.js` declares:

```js
// plugins_default/whatsapptheme/dependencies.js - real code
export const dependencies = {
    legacysettings: "plugin",
    legacythemes: "plugin",
};
```

`version: "plugin"` means "this other plugin must also be installed" (see [Dependencies](../dependencies.md)) - without it, nothing guarantees `legacythemes` loaded (and its client code executed) before yours does.

## The plugin shell around it

```js
// plugins_default/whatsapptheme/index.js - real code
import path from 'node:path';
import express from 'express';

export const PluginMeta = {
    identifier: "whatsapptheme",
    name: 'WhatsAppTheme',
    author: 'onlypuppy7',
    version: '1.0.0',
    descriptionShort: 'A little demonstration theme',
    descriptionLong: 'A little demonstration theme',
    legacyShellVersion: 562,
};

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        this.plugins.on('client:onStartServer', this.onStartServer.bind(this));
        this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));
    };

    async onStartServer(data) {
        data.app.use(express.static(path.join(this.thisDir, 'client')));
    };

    pluginSourceInsertion(data) {
        data.pluginInsertion.files.push({
            filepath: path.join(this.thisDir, 'client.js'),
            position: 'after',
        });
    };
};
```

Two hooks, nothing else:

- **`client:onStartServer`** serves the plugin's own `client/` folder as static files (see [Static Assets](../static-assets.md)) - this is what makes `/themes/whatsapptheme/whatsapptheme.css` and every image under it actually reachable over HTTP.
- **`client:pluginSourceInsertion`** splices `client.js` into the browser bundle **at `position: 'after'`** - not optional here. `legacythemes`' own `client.js` defines the `LegacyThemesPlugin` global your code reaches into; if your code ran before that module existed in the concatenated bundle, `LegacyThemesPlugin.stylePacks.push(...)` would throw. `position: 'after'` guarantees the whole bundle (including every other plugin's `client.js`) has already executed once before yours runs - see [Recipe: Custom Weapon - why `position: 'after'` specifically](./custom-weapon.md#why-position-after-specifically) for the general rule this follows.

Your theme's own folder layout ends up identical in shape:

```
plugins/yourtheme/
├── index.js              # same two hooks as above, your own PluginMeta
├── dependencies.js        # { legacythemes: "plugin" }
└── client/
    └── themes/yourtheme/
        ├── yourtheme.css
        └── img/
            └── logo.png   # at least one preview image
```

## Writing the CSS: what's just CSS, and what's actually a bridge into the 3D scene

Most of a theme is ordinary CSS - repaint the base game's own color variables, override selectors, done. `whatsapptheme.css` repaints the base palette on the wildcard selector so it cascades everywhere:

```css
/* plugins_default/whatsapptheme/client/themes/whatsapptheme/whatsapptheme.css - real code (abridged) */
* {
    --ss-blue0: #e4ffea;
    --ss-blue1: #c8f6d3;
    --ss-white0: #198500;
    --ss-yellow0: #00ff27;
    --itemButton-gradient-start: #acf2ac;
    --itemButton-gradient-end: #dfffdc;
}
```

None of that needs JavaScript - it's the base stylesheet's own custom properties, redefined. Two variable *namespaces* are special, because they control things CSS itself has no reach into:

### `--customizer-skyColor` / `--customizer-diffuseColor`

The 3D scene's sky color and ambient light aren't DOM elements - CSS can't touch them directly. `legacythemes` reads these two variables back out with `getComputedStyle` after applying your stylesheet and feeds them into the Babylon.js scene itself:

```js
// plugins_default/legacythemes/client.js:264-265 - real code
Customizer.skyColor.set(...this.getCSSVariable('--customizer-skyColor'));
Customizer.diffuseColor.set(...this.getCSSVariable('--customizer-diffuseColor'));
```

Set them as hex colors, same as any other CSS color value:

```css
* {
    --customizer-skyColor: #85CC85;
    --customizer-diffuseColor: #85CC85;
}
```

### `--replaceImgSrc-<elementId>`

Any variable named `--replaceImgSrc-` followed by a DOM element's `id` swaps that element's `src` to the variable's `url(...)` value:

```css
/* plugins_default/whatsapptheme/client/themes/whatsapptheme/whatsapptheme.css - real code */
* {
    --replaceImgSrc-noItemImg: url('/themes/whatsapptheme/img/noItem.png');
    --replaceImgSrc-noHatImg: url('/themes/whatsapptheme/img/noHat.png');
    --replaceImgSrc-noStampImg: url('/themes/whatsapptheme/img/noStamp.png');
}
```

This is resolved generically - `updateThingsFromCSS` (`legacythemes/client.js:263-281`) scans every custom property collected from all currently-applied stylesheets, and for any name matching the `--replaceImgSrc-` prefix, looks up `document.getElementById(identifier)` and sets `.src`. You aren't limited to the three images `whatsapptheme` replaces - any element with an `id` in the base game's markup is a valid target, as long as your variable name matches it exactly.

## Stacking order, if you support being combined with other themes

Players can apply more than one style pack at once via the reorderable "Current Applied Style Packs" list. `applyStylesFromList` reverses that list before appending each stylesheet to `<head>` in order:

```js
// plugins_default/legacythemes/client.js:235 - real code
list = list.slice().reverse();
```

Later `<head>` entries win the normal CSS cascade for any variable both stylesheets define - so the list's reversal means **the first item in the player's visible list has final say**, matching what a player would expect ("top of my list wins"). If your theme is meant to layer under others rather than override them, don't redefine variables you don't actually need to change - an unset variable simply falls through to whatever's beneath it.

## Common Issues

**`LegacyThemesPlugin is not defined` in the browser console.** Your `dependencies.js` is missing `legacythemes: "plugin"`, or your `pluginSourceInsertion` entry isn't using `position: 'after'` - either way, your code ran before `legacythemes`' own `client.js` did.

**My theme applies but the 3D sky/lighting never changes.** Confirm `--customizer-skyColor`/`--customizer-diffuseColor` are defined as plain hex colors (`hexToNormalizedRGB` only handles `#rrggbb`, not `rgb()`/named colors) on a selector that's actually active - `*` is the safest choice, matching both bundled examples.

**An `--replaceImgSrc-` variable doesn't do anything.** The identifier after the prefix must exactly match a real element's `id` in the page - check the base game's markup (or an existing working example like `noItemImg`) rather than guessing at an id name.

Next: [Recipe: UI Modification](./ui-modification.md) for DOM changes that aren't theme-related, or back to [Recipes](./README.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
