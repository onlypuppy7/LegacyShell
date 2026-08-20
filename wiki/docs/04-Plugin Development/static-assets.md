# Static Assets

> **Audience:** Plugin authors · **Prereqs:** [Events (concept)](./events-concept.md)
>
> **Canonical source:** `server-client/start-client.js` (`onStartServer` emit site), `plugins_default/legacyshellcore/index.js` (real example)

If your plugin needs to serve whole files - 3D models, textures, sounds, extra HTML pages - rather than inject inline JS, you don't need [Client-Side Code](./client-side-code.md)'s build-time splicing. Just mount your own folder as a normal Express static route.

## The hook

`client:onStartServer` fires once the client server's Express app has just been created, before it starts listening:

```js
this.plugins.on('client:onStartServer', this.onStartServer.bind(this));
```

```js
async onStartServer(data) {
    let app = data.app;
    app.use(express.static(path.join(this.thisDir, 'client')));
};
```

That's the entire pattern - `data.app` is the live Express instance, `express.static(...)` is the same middleware any Express app uses to serve a folder verbatim. This exact snippet (usually pointed at a `client/` subfolder inside the plugin's own directory) is used throughout the first-party plugins in this codebase - `legacyshellcore`, `parkourmode`, `5_crackshot`, `timemachine`, `fancygraphics`, `whatsapptheme`, and the third-party `plugins/_mcblocks` all follow it.

## Folder convention

There's no requirement to name your assets folder `client/` - it's just the convention every existing plugin uses, chosen to make clear "this is what gets served to browsers" as distinct from server-only files sitting elsewhere in the same plugin folder (item definitions, maps, plugin logic). A typical layout:

```
plugins/yourplugin/
  index.js
  client/            <- mounted as a static route, contents served verbatim
    models/
      custom.babylon
    textures/
      skin.png
  items/              <- NOT served to the browser - read server-side by a content-pack hook instead, see below
    ...
```

## Files end up served at the site root

`express.static` mounts the folder's contents starting from wherever `app.use` was called - here, with no path prefix, that's the site root. A file at `plugins/yourplugin/client/models/custom.babylon` becomes reachable at `http://localhost:13370/models/custom.babylon`, indistinguishable from any other static asset the base game serves. This is convenient (no extra path segment for the browser code that references it to know about) but also means **plugins share one flat namespace** - two plugins serving a file at the same relative path will silently conflict, whichever plugin's `onStartServer` listener happened to register first (or last, depending on how Express resolves overlapping static middlewares) wins. Keep your asset paths reasonably unique to your plugin to avoid this.

## When you actually want this vs. content packs

Serving raw files is only half of "adding models" - the game also needs to know an item/map *references* that file, which is a database-level concern, not a static-serving one. If you're adding new items, hats, stamps, or maps (not just raw file hosting), see [Content Packs](./content-packs.md) for the other half of that story - `client:onStartServer` for the files, plus `services:initTablesBefore`/`initTablesMaps` for registering them.

Next: [Content Packs](./content-packs.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
