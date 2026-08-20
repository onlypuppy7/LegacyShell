# LegacySettings

A complete replacement settings-menu UI, and - more importantly for other plugin authors - a small framework other plugins build their own settings tabs on top of. [FancyGraphics](/plugins_default/fancygraphics/README.md) is a real example of a plugin doing exactly that.

## Setup

Client-only (`plugins.type !== "client"` returns early elsewhere). Splices its own CSS and `client.js` into the browser bundle at the `beforebefore` insertion position (see [Client-Side Code](/wiki/docs/04-Plugin%20Development/client-side-code.md#the-three-insertion-positions)) - early enough that the rest of the bundle, and other plugins' client code, can rely on the global `LegacySettings` instance already existing.

## The API other plugins actually use

A single global instance (`LegacySettings`, `client.js`) exposes:

| Method | What it does |
|---|---|
| `addTab(name, panelWidths = [1])` | Creates (or returns the existing) tab. `panelWidths` splits the tab into side-by-side columns, e.g. `[1,1]` for two equal panels. |
| `addCategory(tabName, panelIndex, label, { defaultOpen, collapsible })` | A labeled, optionally-collapsible group of options within one panel. |
| `addOption(tabName, opt, panelIndex, categoryLabel)` | Adds one control. `opt.key` is the persisted storage key (auto-generated with a warning if omitted); `opt.type` selects which control renders - see below. |
| `get(key, default)` / `set(key, value)` | Read/write a value directly, outside of the UI - state persists to `localStorage` under the settings-menu's own id, not to any server-side store. |

Existing settings added before this plugin's own UI takes over are preserved: `finalise()` absorbs the page's original `#settingsContainer` element wholesale into a "General" tab (`absorbOldSettings`, default `true`) rather than discarding it.

## Option types

`checkbox`, `slider` (with an optional live number readout), `button`, `bind` (captures the next keypress/mouse button/scroll direction as a keybind), `select`, `radio`, `text`, `info` (static, but updatable text), `list` (removable and/or drag-reorderable), `gallery` (a small image carousel), and `customDiv` (wraps an arbitrary existing DOM element - this is the mechanism `absorbOldSettings` itself uses). An unrecognized `type` renders a visible "Unknown option type" placeholder rather than failing silently, which is worth knowing if a typo'd type string doesn't show what you expected.

## Notes

`client.js` ends with a full worked example (a "Gameplay" tab exercising every option type) purely for reference - it's live example code, not something that ships to real players, but reading it directly is the fastest way to see every option type's exact call shape at once.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
