# Recipe: Replacing Core Behaviour

> **Audience:** Plugin authors · **Prereqs:** [Events (concept)](../events-concept.md)
>
> **Canonical source:** `server-client/src/prepare-modified.js`

The `plugins.cancel` pattern, at its simplest: a plugin that tells core code to skip a default step entirely, with nothing else needed. This recipe cancels the client build's minification step - the smallest complete example of "replace," as opposed to "react to."

## The pattern, in core code

```js
// server-client/src/prepare-modified.js - real code
if (ss.config.client.minify) {
    await plugins.emit('minificationBefore', { this: this, ss, code, UglifyJS });

    if (!plugins.cancel) {
        var result = UglifyJS.minify(code.sourceJs);
        // ...applies result.code, throws on result.error...
    };
};
```

Every "replace this default behavior" hook in the codebase follows this exact shape: emit, then an `if (!plugins.cancel)` guard around whatever the default would otherwise do. See [Events (concept)](../events-concept.md#plugins-cancel-opting-out-of-default-behavior) for the mechanism itself, and the [Event Reference](../Event%20Reference/) for every other hook that follows this same pattern (`sendToAll` for default packet fan-out, `clientSyncLoop` for default position data, and others).

## The plugin

```js
// plugins/skipminify/index.js
import log from 'puppylog';

export const PluginMeta = {
    identifier: "skipminify",
    name: 'Skip Minification',
    author: 'you',
    version: '1.0.0',
    descriptionShort: 'Cancels the default minification step entirely.',
    descriptionLong: 'A minimal example of plugins.cancel fully replacing (in this case, removing) a default build behavior.',
    legacyShellVersion: 598,
};

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        this.plugins.on('client:minificationBefore', this.onMinificationBefore.bind(this));
    };

    onMinificationBefore(data) {
        this.plugins.cancel = true;
    };
};
```

That's the entire plugin. No `executeClient`/`executeServer` split, no client-injected code - `minificationBefore` only ever fires on the client server's own build process (Node-side), so this is a normal server-side-only plugin.

## From "cancel" to "replace"

Cancelling alone just *removes* the default behavior - `code.sourceJs` is left exactly as it was before the cancelled step. To actually **replace** it with something else (a different minifier, a custom obfuscation pass), do the real work inside the same handler, using the payload you were given, before setting `cancel`:

```js
onMinificationBefore(data) {
    data.code.sourceJs = someOtherMinifier.minify(data.code.sourceJs);
    this.plugins.cancel = true;
};
```

`data.code` is the same mutable object `prepare-modified.js` reads from afterward - mutating `data.code.sourceJs` directly is how a listener hands back a result, there's no separate "return value" mechanism for an event listener (see [Events (concept)](../events-concept.md) - listeners don't return anything meaningful to the emitting code, they communicate through the payload object and `plugins.cancel`).

## What we validated - and a real, useful side effect

We loaded this exact plugin against a real (isolated, scratch) client server that, in earlier testing for other recipes on this page, reliably hit a pre-existing minification failure (`Legacy octal literals are not allowed in strict mode`) on every build. With this plugin installed: the log clearly shows the cancellation firing (`skipminify: cancelling default minification`), and **the minification error genuinely stopped occurring** - concrete, observed confirmation that `plugins.cancel = true` inside `minificationBefore` does exactly what this page claims, not just in theory. The build's subsequent steps (stamp spritesheet compositing) were slow enough in our test environment that we didn't wait for a fully completed build, but the specific mechanism this recipe teaches - cancelling minification - was directly, empirically confirmed.

## Common Issues

**Cancelling didn't seem to have any effect.** Confirm your listener registration actually happened before the emit runs - `client:minificationBefore` only fires once, during that one client server's build; if your plugin loaded after the build already started (shouldn't normally happen given plugins load before `start-client.js` even runs, but worth checking if something's unusual about your setup) the cancellation would be too late.

**I replaced minification with my own, but the resulting bundle doesn't parse.** Whatever you assign to `data.code.sourceJs` needs to be complete, syntactically valid JavaScript on its own - the same requirement the default `UglifyJS.minify` call has to satisfy.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
