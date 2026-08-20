# Minerva

Internally identified as "Minerva" (`PluginMeta.name`, distinct from its folder/identifier `multiplayermaphost`) - lets the in-editor map maker test a map in a real, live multiplayer match instead of the editor's own offline preview.

## What it actually does

Only active for real players when the **map editor** page loads it (`isEditor` gate in `shared.js`) - it adds a "Test ONLINE" button next to the editor's existing offline test button. Clicking it saves the current map to `localStorage` (`mapBackup`) and opens a new tab at `?testMapOnline=<gametype>`. That new tab, on load, requests a private game and (via `game:onExtraParams`) attaches the map pulled back out of `localStorage` as `extraParams.customMinMap`.

Server-side, the actual gate this unlocks is documented in [Known Quirks](/wiki/docs/05-Codebase%20Reference/known-quirks.md#custom-private-room-maps-are-off-by-default-but-a-bundled-plugin-turns-them-back-on): `RoomConstructor` hardcodes `acceptCustomMaps = false`, and this plugin's `game:roomBeforeMapBuild` listener is what flips it back to `true` for the room being created - without this plugin installed, the "send a custom map to a private room" pathway exists in core code but is unreachable.

## Notes

A meaningful amount of the plugin's own source is dead/commented-out ("former logic" comments throughout `shared.js`, and an unused `MultiplayerMapHost.registerListeners(this.plugins)` call left commented out in `index.js`) - this plugin was clearly trimmed down from a larger feature set at some point. What's described above is what's actually active today; don't assume the commented-out code still runs.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
