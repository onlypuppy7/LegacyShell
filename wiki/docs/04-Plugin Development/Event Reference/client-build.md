<!-- GENERATED — do not edit by hand. Run `npm run gen-docs` to regenerate. See src/scripts/gen-wiki-reference.js. -->

# `client:` events — client server & build pipeline

> **Audience:** Plugin authors and AI agents · **Prereqs:** [Events (concept)](../events-concept.md)

Every `plugins.emit(...)` call site found in the files below, extracted directly from source - not hand-maintained. Unprefixed at the call site; `PluginManager.emit` adds `client:` before checking for listeners, so e.g. the first row below actually fires as `client:onLoad`.

| Event | Location | Payload | Fires when |
|---|---|---|---|
| `onLoad` | `server-client/start-client.js:39` | `{ ss }` | Client process finished its own init, before connecting to services. |
| `onStartServer` | `server-client/start-client.js:53` | `{ ss, app, ws }` | The Express app instance was just created — the hook plugins use to mount `express.static(...)` for their own assets. |
| `onRequest` | `server-client/start-client.js:80` | `{ ss, req, res, next }` | Global middleware fired on every incoming HTTP request; a listener can set `plugins.cancel` to skip the default `next()`. |
| `closedBeforeDefault` | `server-client/start-client.js:85` | `{ ss, app }` | Before the "closed" maintenance-mode route setup runs. |
| `closedAfterDefault` | `server-client/start-client.js:96` | `{ ss, app }` | After the "closed" maintenance-mode route setup runs. |
| `openBeforeDefault` | `server-client/start-client.js:100` | `{ ss, app }` | Before the "open" mode static-file route setup runs. |
| `openAfterDefault` | `server-client/start-client.js:127` | `{ ss, app }` | After the "open" mode static-file route setup runs. |
| `onServerRunning` | `server-client/start-client.js:178` | `{ ss, app }` | The Express server is now listening. |
| `onCheckPassword` | `server-client/start-client.js:219` | `{ ss, req, res, next, login, password, auth }` | HTTP Basic Auth check, when `config.client.login.enabled`. |
| `filepaths` | `server-client/start-client.js:240` | `{ ss, filepaths }` | The list of static file paths to serve is being assembled. |
| `onConnectWebSocket` | `server-client/start-client.js:245` | `{ ss, retryCount, nextTimeout }` | Before (re)connecting the outbound websocket to services. |
| `onMsg` | `server-client/start-client.js:262` | `{ this: this, ss, msg }` | Any message received on the services websocket. |
| `onConfigInfoReceived` | `server-client/start-client.js:270` | `{ ss, configInfo: msg }` | Specifically a `requestConfig` response was received. |
| `onLoadThing` | `server-client/start-client.js:273` | `{ ss, thing, filePath }` | Per-item within the config load (an item/map/server entry). |
| `loadingThings` | `server-client/start-client.js:296` | `{ ss, load, filepaths }` | The batch load of cached config things is running. |
| `onConfigInfoLoaded` | `server-client/start-client.js:328` | `{ ss, configInfo: msg }` | Config load fully processed and applied to `ss`. |
| `onServicesRestart` | `server-client/start-client.js:341` | `{ ss, configInfo: msg }` | Services reported a newer `startTime` — the client is about to self-restart via `process.exit(1337)`. |
| `serversJs` | `server-client/src/prepare-modified.js:75` | `{ ss, code }` | The `servers.js` template (server list + ports) has been generated. |
| `hashes` | `server-client/src/prepare-modified.js:85` | `{ ss, hashes }` | Cache-busting file hashes computed — this fires twice per build (once early, once again after the final build pass), both sharing the same event name. |
| `pluginSourceInsertion` | `server-client/src/prepare-modified.js:95` | `{ this: this, ss, pluginInsertion }` | The main hook for shipping plugin JS into the browser bundle — push `{filepath, insertBefore, insertAfter, position}` onto `pluginInsertion.files`. |
| `doReplacements` | `server-client/src/prepare-modified.js:118` | `{ this: this, ss, replacements, code }` | The token-replacement pass that inlines `#hashtag` shared-source files into the bundle — fires once overall, before the per-entry loop below. |
| `doReplacementsLoop` | `server-client/src/prepare-modified.js:124` | `{ this: this, ss, replacement, code, insertion, name }` | The token-replacement pass — fires once per replacement entry being applied. |
| `replacementsBefore` | `server-client/src/prepare-modified.js:207` | `{ this: this, ss, code, replacementsBefore }` | Before the `LEGACYSHELLXXX` → `#hashtag` replacement table is applied — plugins can add their own entries here. |
| `minificationBefore` | `server-client/src/prepare-modified.js:221` | `{ this: this, ss, code, UglifyJS }` | Before the UglifyJS minification step; set `plugins.cancel` here to fully replace minification with a different tool/pipeline entirely. |
| `minificationAfter` | `server-client/src/prepare-modified.js:228` | `{ this: this, ss, code, result }` | After the UglifyJS minification step has run. |
| `minificationSkipped` | `server-client/src/prepare-modified.js:243` | `{ this: this, ss, code }` | Minification was skipped (`config.client.minify` is falsy). |
| `replacementsAfter` | `server-client/src/prepare-modified.js:263` | `{ ss, replacementAfter, code }` | The second replacement pass that inlines final `items`/`maps` JSON and the Babylon.js library source. |
| `hashes` | `server-client/src/prepare-modified.js:281` | `{ ss, hashes }` | Cache-busting file hashes computed — this fires twice per build (once early, once again after the final build pass), both sharing the same event name. |
| `htmlContent` | `server-client/src/prepare-modified.js:283` | `{ ss, code }` | The generated `index.html` content, just before it's written to disk. |
| `stampImageDirs` | `server-client/src/stampsGenerator.js:56` | `{this: this, stampImageDirs, stampImages}` | Before scanning for stamp source images — plugins push their own image directories here. |
| `stampsPreparedSkip` | `server-client/src/stampsGenerator.js:241` | `{this: this, items, composites, image, output: outputImagePath}` | The stamp spritesheet was already up to date and regeneration was skipped (hash match). |
| `stampsPrepared` | `server-client/src/stampsGenerator.js:264` | `{this: this, items, composites, image, output: outputImagePath}` | The stamp spritesheet was (re)generated. |

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
