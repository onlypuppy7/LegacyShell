# WhatsAppTheme

An intentionally silly example theme - re-skins LegacyShell to look like WhatsApp. Its own description says as much: "An example theme made by onlypuppy7."

## What it actually does

The entire plugin is a single `LegacyThemesPlugin.stylePacks.push({...})` call (see [Legacy Themes](/plugins_default/legacythemes/README.md)) with a CSS file and a gallery of preview images - no options, no logic, no server-side behavior beyond serving its own static assets. This is the minimum viable shape for adding a selectable theme: one style-pack object, nothing else.

## Setup

Depends on `legacysettings` and `legacythemes` (`dependencies.js`, both `"plugin"`-type) - declared explicitly, unlike [Legacy Themes](/plugins_default/legacythemes/README.md)' own undeclared reliance on Legacy Settings.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
