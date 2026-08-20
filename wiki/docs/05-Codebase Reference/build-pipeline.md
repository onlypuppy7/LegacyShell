# Build Pipeline

> **Audience:** Core contributors, AI agents · **Prereqs:** [Shared Shell Layer](./shared-shell-layer.md), [Server-Only Markers](./server-only-markers.md)
>
> **Canonical source:** `server-client/src/prepare-modified.js`

How `src/client-static/src/shellshock.min.js` (the hand-maintained, *not actually minified* browser game source) becomes the real, served, minified bundle in `store/client-modified/`.

## At a glance

<svg viewBox="0 0 700 575" xmlns="http://www.w3.org/2000/svg" fill="currentColor" style="max-width:100%;height:auto;font-family:system-ui,sans-serif" role="img" aria-label="Diagram: on boot, the client server runs modifyFiles and prepareBabylons in parallel; modifyFiles runs pass one (inlining shared modules and plugin code), optional IIFE wrapping, optional cancellable minification, then pass two (inlining items/maps JSON and the babylon.js library); both branches converge into store/client-modified, served by Express.">
  <defs>
    <marker id="bp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
    </marker>
  </defs>

  <rect x="220" y="15" width="260" height="40" rx="6" fill="none" stroke="currentColor" stroke-width="2" />
  <text x="350" y="40" text-anchor="middle" font-size="12" font-weight="bold">Client server boot: Promise.all([...])</text>

  <line x1="300" y1="55" x2="245" y2="88" stroke="currentColor" stroke-width="1.5" marker-end="url(#bp-arrow)" />
  <line x1="400" y1="55" x2="535" y2="88" stroke="currentColor" stroke-width="1.5" marker-end="url(#bp-arrow)" />

  <rect x="90" y="90" width="300" height="40" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" />
  <text x="240" y="115" text-anchor="middle" font-size="12">modifyFiles()</text>

  <line x1="240" y1="130" x2="240" y2="158" stroke="currentColor" stroke-width="1.5" marker-end="url(#bp-arrow)" />

  <rect x="90" y="160" width="300" height="70" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" />
  <text x="240" y="180" text-anchor="middle" font-size="11" font-weight="bold">Pass one: replacementsBefore (~35)</text>
  <text x="240" y="196" text-anchor="middle" font-size="10">inlines #hashtag shared modules</text>
  <text x="240" y="211" text-anchor="middle" font-size="10">+ plugin code (pluginSourceInsertion)</text>

  <line x1="240" y1="230" x2="240" y2="253" stroke="currentColor" stroke-width="1.5" marker-end="url(#bp-arrow)" />

  <rect x="90" y="255" width="300" height="40" rx="6" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="4 3" />
  <text x="240" y="279" text-anchor="middle" font-size="11">IIFE wrap (optional - config.client.iif)</text>

  <line x1="240" y1="295" x2="240" y2="318" stroke="currentColor" stroke-width="1.5" marker-end="url(#bp-arrow)" />

  <rect x="90" y="320" width="300" height="70" rx="6" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="4 3" />
  <text x="240" y="340" text-anchor="middle" font-size="11" font-weight="bold">Minification (optional - config.client.minify)</text>
  <text x="240" y="356" text-anchor="middle" font-size="10">UglifyJS.minify()</text>
  <text x="240" y="371" text-anchor="middle" font-size="10">cancellable via minificationBefore</text>

  <line x1="240" y1="390" x2="240" y2="413" stroke="currentColor" stroke-width="1.5" marker-end="url(#bp-arrow)" />

  <rect x="90" y="415" width="300" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" />
  <text x="240" y="435" text-anchor="middle" font-size="11" font-weight="bold">Pass two: replacementsAfter</text>
  <text x="240" y="450" text-anchor="middle" font-size="10">inlines items/maps JSON +</text>
  <text x="240" y="465" text-anchor="middle" font-size="10">babylon.js library + shaders</text>

  <rect x="430" y="90" width="220" height="90" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" />
  <text x="540" y="112" text-anchor="middle" font-size="12">prepareBabylons()</text>
  <text x="540" y="130" text-anchor="middle" font-size="10">merges per-item .babylon</text>
  <text x="540" y="145" text-anchor="middle" font-size="10">model files - see Stamps</text>
  <text x="540" y="160" text-anchor="middle" font-size="10">and Babylons</text>

  <line x1="240" y1="475" x2="300" y2="503" stroke="currentColor" stroke-width="1.5" marker-end="url(#bp-arrow)" />
  <line x1="540" y1="180" x2="450" y2="503" stroke="currentColor" stroke-width="1.5" marker-end="url(#bp-arrow)" />

  <rect x="150" y="505" width="400" height="50" rx="6" fill="none" stroke="currentColor" stroke-width="2" />
  <text x="350" y="526" text-anchor="middle" font-size="11" font-weight="bold">store/client-modified/</text>
  <text x="350" y="542" text-anchor="middle" font-size="10">served by the client server's Express app</text>
</svg>

## Runs on every client server boot

`prepareModified()` is called as part of `server-client`'s own startup (alongside `stampsGenerator.js` and the wiki build - see [Architecture Overview](../02-Running%20a%20Server/architecture-overview.md#client-what-your-browser-actually-downloads)), running two things in parallel:

```js
await Promise.all([
    prepareBabylons(path.join(ss.rootDir, 'server-client', 'store', 'client-modified', 'models')),
    modifyFiles(),
]);
```

`prepareBabylons` handles model merging - see [Stamps and Babylons](./stamps-and-babylons.md). `modifyFiles()` is the actual JS/HTML build step this page covers.

## What `modifyFiles()` processes

Five source files get read and transformed, written into `store/client-modified/`: `src/client-static/src/shellshock.min.js` (the game itself), `src/client-static/src/servers.js` (server-list template), `src/client-static/editor/js/mapEdit.js` and `editor/index.html` (the map editor), and the root `src/index.html`.

## The two-pass token replacement

The build works by literal string substitution against `LEGACYSHELLXXX`-style placeholder tokens baked into the source files, applied in two separate passes:

**Pass one (`replacementsBefore`, ~35 entries)** happens first, and is what actually inlines `src/shell/*` shared modules - each entry maps a token to a `#hashtag`:

```js
{ pattern: /LEGACYSHELLPLUGINMANAGER/g, file: "#plugins" },
{ pattern: /LEGACYSHELLPICKUPS/g, file: "#items" },
{ pattern: /LEGACYSHELLCOMM/g, file: "#comm" },
// ...
```

For a `file:` entry, the actual inserted content is `misc.hashtagToString(hashtag)` - the shared module's live source, transformed by `prepareForClient` (see [Server-Only Markers](./server-only-markers.md)). This pass is also where plugin-injected client code lands, via the `pluginSourceInsertion` emit (see [Client-Side Code](../04-Plugin%20Development/client-side-code.md)) resolving the `LEGACYSHELLPLUGINSBEFOREBEFORE`/`LEGACYSHELLPLUGINSBEFORE`/`LEGACYSHELLPLUGINSAFTER` tokens. `replacementsBefore` itself is also a documented plugin extension point - a listener can push its own entries onto the array before this pass runs.

**Pass two (`replacementsAfter`)** happens near the end, after minification - it inlines the final `items`/`maps` JSON (now annotated with stamp grid coordinates by `stampsGenerator.js`, hence waiting until after that's done - see [Stamps and Babylons](./stamps-and-babylons.md)), plus the raw Babylon.js library source and its GLSL shaders.

## IIFE wrapping

If `config.client.iif` is true, the whole assembled script gets wrapped in an immediately-invoked function expression - the config comment calls this a mitigation against "console crackers" (people poking at global variables via the browser console). It hides top-level `const`/`let`/`function` declarations from becoming actual `window` globals, though the source is explicit that this is not remotely foolproof - it raises the bar for casual tampering, nothing more.

## Minification

If `config.client.minify` is true, the assembled (and possibly IIFE-wrapped) script is run through `UglifyJS.minify(...)`, with `minificationBefore`/`minificationAfter`/`minificationSkipped` plugin hooks around the step - `minificationBefore` is the one to cancel (`plugins.cancel = true`) if you want to substitute an entirely different minifier/obfuscation pipeline. See [Events (concept)](../04-Plugin%20Development/events-concept.md#plugins-cancel-opting-out-of-default-behavior).

## Cache-busting hashes

A SHA-256 hash of the built `servers.js` (`SERVERJSHASH`) gets computed and embedded into `index.html`, and the `hashes` event fires twice - once early, once again after the final build pass - giving plugins two points to observe or extend the hash set used for cache-busting.

## Common Issues

**My change to a shared `src/shell/*` file isn't showing up in the browser.** The client bundle only rebuilds when the client server (re)starts - there's no watch mode or hot reload for this pipeline. Restart `npm run client` after every change.

**A plugin's client-injected code runs before something it depends on is defined.** See [Client-Side Code](../04-Plugin%20Development/client-side-code.md#the-three-insertion-positions) - `beforebefore`/`before` insertion points run before most `src/shell/*` globals exist in the concatenated script.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
