# LegacyThemes

A CSS theme-switching framework, parallel to [Legacy Settings](/plugins_default/legacysettings/README.md) - lets a player stack multiple named "style packs" (each just a CSS file plus some metadata) on top of the base theme, reorderable and removable, with the result persisted client-side.

## Setup

Client-only. Its own `client.js` calls into `LegacySettings.addTab`/`addOption` directly to build its "Theming" tab - **this dependency isn't declared in a `dependencies.js`** (legacythemes has none), so nothing enforces that Legacy Settings is actually installed. It works today because Legacy Settings splices into the browser bundle at the `beforebefore` position while this plugin splices at `before` (see [Client-Side Code](/wiki/docs/04-Plugin%20Development/client-side-code.md#the-three-insertion-positions)) - earlier in the concatenated script, so its `LegacySettings` global already exists by the time this plugin's code runs. Removing Legacy Settings without also removing this plugin would break it at runtime, not at load time.

## What it actually does

Other plugins register their own selectable theme by pushing onto `LegacyThemesPlugin.stylePacks` (an array, populated before `game:permissionsAfterSetup` finalizes the settings UI) - [FancyGraphics](/plugins_default/fancygraphics/README.md) is a real example. Three built-in packs (`[Default Theme]`, "Old LegacyShell Assets", "Shell Shockers Assets") are always present alongside whatever other plugins add.

Selected packs' CSS is fetched and cached once (`cacheAllStyles`), then applied in reverse list order (later-added packs override earlier ones) by appending `<style>` elements to `<head>`. After applying, it reads back a fixed set of `--customizer-*` CSS custom properties to update the actual 3D scene's sky/ground colors (`Customizer.skyColor`/`diffuseColor`) - meaning a style pack can affect more than just UI chrome, it can genuinely retint the game world, by defining the right CSS variables.

## Notes

`--replaceImgSrc-<elementId>` is a second, more specific CSS-variable convention this plugin looks for: any custom property named that way gets used to swap the `src` of the DOM element with that id - a way for a theme's CSS file to replace specific images (e.g. the logo) without any JS of its own.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
