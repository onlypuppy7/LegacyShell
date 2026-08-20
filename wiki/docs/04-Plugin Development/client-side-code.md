# Client-Side Code

> **Audience:** Plugin authors · **Prereqs:** [Events (concept)](./events-concept.md)
>
> **Canonical source:** `server-client/src/prepare-modified.js` (`pluginSourceInsertion` handling, lines ~88-110)

The browser game is one statically-built file (`shellshock.min.js`), assembled at build time from `src/shell/*.js` plus a handful of other pieces (see [Codebase Reference](../05-Codebase%20Reference/) once you're there for the full build pipeline). A plugin that needs to run code *in the browser* - modifying UI, reacting to gameplay events client-side, adding a keybind - can't just rely on a normal server-side import. Instead, it hooks into that build step directly.

## The hook

On the **client** server only, `server-client/src/prepare-modified.js` emits `client:pluginSourceInsertion` while assembling the bundle, once per build:

```js
this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));
```

```js
pluginSourceInsertion(data) {
    data.pluginInsertion.files.push({
        insertBefore: '\nconsole.log("inserting before...");',
        filepath: path.join(this.thisDir, 'client.js'),
        insertAfter: '\nconsole.log("inserting after!");',
        position: 'before'
    });
};
```

You push a descriptor describing a **file on disk** (usually inside your own plugin folder) - not inline code - onto `data.pluginInsertion.files`. `insertBefore`/`insertAfter` are optional literal strings wrapped around your file's content (handy as visible markers in the built output while debugging).

Your file gets read, run through the exact same transform every `src/shell/*.js` file goes through (`misc.prepareForClient` - see [Codebase Reference](../05-Codebase%20Reference/) for the full mechanism) - meaning `import`/`export` lines are automatically commented out, and any `//(server-only-start)`/`//(server-only-end)` blocks are stripped - and then concatenated into the final bundle. Practically: **write plain browser JS**, don't worry about stripping your own `import`s, and use the server-only-marker convention if the same file also needs to run server-side.

## The three insertion positions

`position` must be one of three fixed anchor points in the built file:

| Position | Where in the bundle | What's already defined there |
|---|---|---|
| `beforebefore` | The very start of the file. | Almost nothing from `src/shell/` yet - only `isClient`/`isServer` and the `plugins` singleton itself are defined this early. |
| `before` | Right after `beforebefore`, still near the top. | Same as above - still before `constants.js`, `comm.js`, `catalog.js`, `player.js`, etc. are spliced in. |
| `after` | The very end of the file, after the entire game script (including all shared modules) has run. | Everything - safe to reference any shared game object directly. |

::: warning `beforebefore` and `before` run before most shared modules exist
Both real sample plugins in this codebase (`sample1cmd`, `sample2dependency`) use `position: 'before'`, and it works precisely because they only *register event listeners* at the top level - they never reference `Comm`, `catalog`, or other shared globals directly outside of a listener callback. If your inserted file tries to read something like `catalog.someMethod()` at the top level (not inside a function that runs later), and you've used `before`/`beforebefore`, it'll throw - those globals don't exist yet at that point in the concatenated script. Either move that logic inside a listener/callback (which only runs once everything has actually loaded), or use `position: 'after'` if you genuinely need top-level access to fully-loaded game systems.
:::

## The `isClient` guard

Since your file's `import`s get commented out but the rest of the code runs exactly as written, a file meant to be spliced into the browser bundle needs to guard any self-registration so it doesn't also try to run in contexts where it doesn't belong (most plugin authors write one shared file that's both imported normally server-side *and* injected into the client bundle):

```js
import { isClient } from "#constants";

export const samplePlugin = {
    registerListeners: function (pluginManager) {
        this.plugins = pluginManager;
        this.plugins.on('game:startUp', this.startUp.bind(this));
    },
    startUp: function (data) {
        console.log("Client started up");
    },
};

if (isClient) samplePlugin.registerListeners(plugins);
```

The last line only runs client-side (`isClient` is `true` in the browser, `false` on any Node server) - this is what stops the same file from double-registering if it's ever imported server-side too. Note the bare `plugins` reference here (not `this.plugins` or an import) - inside the spliced bundle, `plugins` is a global (see the table above: it's defined before both `before` and `beforebefore`), not something you import.

## Common Issues

**`ReferenceError: X is not defined` in the browser console, only in production builds.** Almost always a `beforebefore`/`before` top-level reference to something not yet loaded at that point - see the warning above. Move the reference inside a callback, or switch to `position: 'after'`.

**My changes don't show up after editing the file.** The client bundle is only rebuilt when the client server (re)starts (see [Codebase Reference](../05-Codebase%20Reference/) for the build pipeline) - there's no hot reload for this, restart `npm run client` after every change.

**I just want to serve a whole folder of static assets (models, images, extra HTML pages), not inject inline JS.** You don't need `pluginSourceInsertion` for that - see [Static Assets](./static-assets.md) instead.

Next: [Static Assets](./static-assets.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
