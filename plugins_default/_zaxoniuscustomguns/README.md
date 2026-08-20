# Zaxonius Custom Guns

Swaps in an alternate Crackshot model set contributed by Zaxonius, reusing the `5_crackshot` plugin's weapon slot and logic rather than defining a new weapon.

## Disabled by default

The folder name is `_zaxoniuscustomguns` (leading underscore) - per [Anatomy](/wiki/docs/04-Plugin%20Development/anatomy.md#disabling-a-plugin-the-prefix), that disables it entirely; it won't even be read by the plugin loader unless you rename the folder to drop the underscore. `PluginMeta.identifier` itself is `zaxoniuscustomguns` (no underscore) - only the folder name carries the disabled marker.

## Setup

Depends on `5_crackshot` being installed and loaded first (`dependencies.js`: `{ "5_crackshot": "plugin" }`) - see [Dependencies](/wiki/docs/04-Plugin%20Development/dependencies.md) for what a `"plugin"`-type dependency means. Without it, Crackshot's weapon slot/logic this plugin relies on doesn't exist.

## What it actually does

Ships its own item pack (`services:initTables`) and its own `.babylon` models, exactly like `5_crackshot` itself - but registers them with `overwrite: true` and `attemptFixSkeleton: true` on the `prepareBabylon` hook, replacing Crackshot's default model with this one rather than adding a separate weapon.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
