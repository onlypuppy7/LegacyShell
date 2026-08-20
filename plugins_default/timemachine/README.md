# TimeMachine

A "throwback options" plugin - lets a player opt back into older (pre-0.17.0) visual behavior: bullet holes (removed in 0.17.0, this plugin reimplements the 0.9.0 and 0.1.0 versions), bullet smoke, a classic egg-splatter death animation, and classic frag particles - each individually toggleable, none on by default except bullet smoke.

## Setup

Depends on [Legacy Settings](/plugins_default/legacysettings/README.md) and [Legacy Themes](/plugins_default/legacythemes/README.md) (`dependencies.js` declares both as `"plugin"` dependencies) - and, unlike [Legacy Themes](/plugins_default/legacythemes/README.md) itself, actually declares what it depends on rather than relying on splice-order coincidence.

## What it actually does

Adds a "Throwback Options" category under a shared "Graphics" settings tab (see [Legacy Settings](/plugins_default/legacysettings/README.md)) with four options, each wired directly into a `plugins.cancel`-based replacement of a default rendering behavior:

| Option | Effect when set |
|---|---|
| Bullet Holes | `0.17.0` (default, i.e. off), `0.9.0`, or `0.1.0` - reimplements the old sprite-based bullet-hole decal system for the two non-default choices, using an original comment's own note that "0.17.0 removed them entirely." |
| Bullet Smoke | Off cancels the default `bulletHitEffect` behavior entirely (`plugins.cancel = !this.bulletSmoke.get()`). |
| Classic Death Animation | On cancels the default `playerDeathAnimation` and plays an egg-splatter (exploding shell/white/yolk mesh) animation instead. |
| Classic Frag Particles | On cancels the default `shellFragBurstBefore` particle burst and substitutes an old-style one. |

Also registers a "Classic Shell Background" entry in [Legacy Themes](/plugins_default/legacythemes/README.md)' style-pack list, alongside its graphics options.

## A genuinely useful example of conditional `plugins.cancel`

Every `plugins.cancel` example elsewhere in this wiki ([Replacing Core Behaviour](/wiki/docs/04-Plugin%20Development/Recipes/replacing-core-behaviour.md)) cancels unconditionally. This plugin's `bulletHitEffect`/`playerDeathAnimation`/`shellFragBurstBefore` handlers all set `cancel` based on a **live user setting** read at the moment the event fires (`this.bulletSmoke.get()`, etc.) - a real example of a default behavior being conditionally replaced per-player, per-preference, rather than always-on for everyone who has the plugin installed.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
