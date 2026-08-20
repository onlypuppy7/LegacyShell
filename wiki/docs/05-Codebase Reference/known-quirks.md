# Known Quirks

> **Audience:** Core contributors, AI agents · **Prereqs:** [Codebase Reference](../)

Documented inconsistencies, dead code, and easy-to-misread spots in the codebase - collected here so nobody "fixes" something that's actually load-bearing, wastes time chasing something genuinely dead, or reports a bug that's already known. Each entry was verified directly against current source while writing this page, not carried forward from an older snapshot.

## Stale `#start-client` / `#start-services` entries in the imports map

`package.json`'s `"imports"` field has:

```json
"#start-client": "./server-game/start-client.js",
"#start-services": "./server-game/start-services.js",
```

Neither file exists - the real files are `server-client/start-client.js` and `server-services/start-services.js`. A repo-wide check found zero live uses of either specifier anywhere in the codebase - every `run-*.js` imports its own `start-*.js` via a plain relative path instead, not through this map. This is dead configuration, most likely left over from when the three server roles were split into separate directories, not a bug currently breaking anything. Don't "fix" it expecting something depends on it, but also don't rely on either specifier if you're writing new code.

## `roomManager.js`'s `gameKey` is hardcoded to spell "LS" in base 36, not random

```js
createRoom(info) {
    // info.gameKey = Math.getRandomInt(10, Math.pow(36, 2) - 10);   // <- commented out
    info.gameKey = 784;                                              // <- what actually runs
```

`784` looks like an arbitrary debug leftover at a glance - it isn't. Every room's shareable join code is built by rendering `gameId`/`gameKey` in base 36 (`roomManager.js:367`: `` `${ss.thisServer}${gameId.toString(36)}${gameKey.toString(36)}`.toUpperCase() ``, and the browser builds the same code independently from the same two fields, `shellshock.min.js:5223`), and `(784).toString(36) === "ls"`. **`784` is the base-36 encoding of the literal string `LS`** - "LegacyShell" - so every room's join code ends in `LS` by design.

This is a deliberate branding choice, not dead code, but it does have a real side effect worth knowing: the commented-out randomized version drew across the full `36²`-wide range specifically for these two trailing characters; hardcoding them removes that entropy entirely - every room's join code ends identically, and two rooms only ever differ in their (still-random) leading `gameId` digits. See [Rooms and Workers](./rooms-and-workers.md#gamekey-is-hardcoded-to-spell-ls-in-base-36).

## Custom private-room maps are off by default, but a bundled plugin turns them back on

`RoomConstructor` has `this.acceptCustomMaps = false;` hardcoded, unconditionally, gating the code path that would otherwise let a private room use a player-submitted custom map (`extraParams.customMinMap`). The supporting code for this feature still exists (it's a real, reachable `if` branch, just never taken with this flag hardcoded false) - not fully dead code, but a feature switched off at the source level, not via a config flag.

**This isn't purely theoretical**: `plugins_default/multiplayermaphost` ("Minerva") sets `ctx.acceptCustomMaps = true` on `game:roomBeforeMapBuild`, right after core sets it `false` and before the `if` branch that checks it - a real, currently-shipping plugin that re-enables this exact feature. See [its own page](../../plugins/Plugin%20Docs/Default/multiplayermaphost/info.md) for what actually uses it (map-editor "test online" support).

## `getStringHeight` in `stringWidth.js` would throw if ever called

```js
export function getStringHeight(str) {
    // ...
    const textHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent || 16;
    return textHeight (isClient ? 1 : 2);   // <- this calls textHeight AS A FUNCTION
};
```

`textHeight` is a plain number - `textHeight (isClient ? 1 : 2)` is JavaScript function-call syntax, missing the intended `/` (or whatever the real operator should have been), and would throw `TypeError: textHeight is not a function` if this ran. It's not currently invoked anywhere else in the codebase (confirmed by searching the whole repo) - the only other references to it are commented-out test `console.log` calls directly below it in the same file, which is presumably why this was never caught: nothing in the live application path calls it.

## The "8-bit" item ID system is no longer 8-bit

`catalog.js`'s `get8BitItemId` carries its own comment: `//its not really 8bit any more`. The name is historical - see [Catalog and Items](./catalog-and-items.md#the-8-bit-item-id-scheme-no-longer-actually-8-bit) for why the offset ranges grew well past what a single byte can represent, while the function/method names never got renamed to match.

## Model zip packaging is disabled, despite what older docs may say

`prepare-babylons.js`'s `saveZip` calls are commented out entirely, with the author's own comment above them: `// why was i still doing this pointless bullshit?`. If you've read anything describing automatic zipping of model files for bandwidth savings, that description no longer matches current behavior - see [Stamps and Babylons](./stamps-and-babylons.md#preparebabylons-merging-base-and-plugin-models).

## Several plugin events are commented out, not currently emitted

Present in source as dead code, not firing for any plugin to listen to:

- `beforePrepareStamps` / `afterPrepareStamps` (`server-client/start-client.js:134-145`)
- `beforePrepareModified` / `afterPrepareModified` (same location)
- `roomBeforeMapInit` (`server-game/src/rooms.js:85`)

If you're searching the source for an event and find one of these, that's why it never fires - it's not a bug in your plugin.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
