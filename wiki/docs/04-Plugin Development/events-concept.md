# Events (Concept)

> **Audience:** Plugin authors · **Prereqs:** [Dependencies](./dependencies.md)
>
> **Canonical source:** `src/shell/plugins.js` (`PluginManager.on`, `.emit`)

The entire plugin API is one mechanism: a `PluginManager` with `on(event, listener)` and `emit(event, ...args)`. Everything else in this codebase - commands, content packs, client code injection - is just a convention built on top of this one primitive. This page covers the mechanism itself; see the [Event Reference](./Event%20Reference/) for the actual list of events available.

## At a glance

<svg viewBox="0 0 640 630" xmlns="http://www.w3.org/2000/svg" fill="currentColor" style="max-width:100%;height:auto;font-family:system-ui,sans-serif" role="img" aria-label="Diagram: emit resets cancel to false, prefixes the event name, then awaits every registered listener in registration order inside a try/catch; any listener may set plugins.cancel to true; after the loop, the emitting code checks that flag to decide whether to still run its own default behavior.">
  <defs>
    <marker id="ev-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
    </marker>
  </defs>

  <rect x="170" y="10" width="300" height="42" rx="6" fill="none" stroke="currentColor" stroke-width="2" />
  <text x="320" y="35" text-anchor="middle" font-size="11" font-weight="bold">plugins.emit('eventName', payload)</text>

  <line x1="320" y1="52" x2="320" y2="72" stroke="currentColor" stroke-width="1.5" marker-end="url(#ev-arrow)" />
  <rect x="210" y="74" width="220" height="32" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" />
  <text x="320" y="94" text-anchor="middle" font-size="10">this.cancel = false</text>

  <line x1="320" y1="106" x2="320" y2="124" stroke="currentColor" stroke-width="1.5" marker-end="url(#ev-arrow)" />
  <rect x="160" y="126" width="320" height="32" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" />
  <text x="320" y="146" text-anchor="middle" font-size="10">event = `${this.type}:${eventName}`</text>

  <line x1="320" y1="158" x2="320" y2="178" stroke="currentColor" stroke-width="1.5" marker-end="url(#ev-arrow)" />

  <rect x="60" y="180" width="520" height="215" rx="8" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="4 3" />
  <text x="320" y="200" text-anchor="middle" font-size="11">for each listener in listeners[event], in registration order</text>

  <rect x="90" y="210" width="460" height="42" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" />
  <text x="320" y="228" text-anchor="middle" font-size="10" font-weight="bold">Listener 1</text>
  <text x="320" y="243" text-anchor="middle" font-size="9">await listener(...args) - try/catch, errors logged not thrown</text>

  <line x1="320" y1="252" x2="320" y2="262" stroke="currentColor" stroke-width="1.5" marker-end="url(#ev-arrow)" />

  <rect x="90" y="264" width="460" height="42" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" />
  <text x="320" y="282" text-anchor="middle" font-size="10" font-weight="bold">Listener 2</text>
  <text x="320" y="297" text-anchor="middle" font-size="9">may set plugins.cancel = true</text>

  <line x1="320" y1="306" x2="320" y2="316" stroke="currentColor" stroke-width="1.5" marker-end="url(#ev-arrow)" />

  <rect x="90" y="318" width="460" height="28" rx="6" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" />
  <text x="320" y="336" text-anchor="middle" font-size="9">... more listeners, sequential, not parallel</text>

  <line x1="320" y1="395" x2="320" y2="413" stroke="currentColor" stroke-width="1.5" marker-end="url(#ev-arrow)" />

  <polygon points="320,413 430,460 320,507 210,460" fill="none" stroke="currentColor" stroke-width="1.5" />
  <text x="320" y="456" text-anchor="middle" font-size="10">plugins.cancel</text>
  <text x="320" y="470" text-anchor="middle" font-size="10">after loop?</text>

  <line x1="245" y1="480" x2="140" y2="540" stroke="currentColor" stroke-width="1.5" marker-end="url(#ev-arrow)" />
  <text x="160" y="520" font-size="10">false</text>
  <line x1="395" y1="480" x2="480" y2="540" stroke="currentColor" stroke-width="1.5" marker-end="url(#ev-arrow)" />
  <text x="460" y="520" font-size="10">true</text>

  <rect x="30" y="545" width="280" height="65" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" />
  <text x="170" y="568" text-anchor="middle" font-size="10" font-weight="bold">Default behavior runs</text>
  <text x="170" y="584" text-anchor="middle" font-size="9">e.g. if (!plugins.cancel)</text>
  <text x="170" y="598" text-anchor="middle" font-size="9">Bullet.fire(...)</text>

  <rect x="330" y="545" width="280" height="65" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" />
  <text x="470" y="568" text-anchor="middle" font-size="10" font-weight="bold">Default behavior skipped</text>
  <text x="470" y="584" text-anchor="middle" font-size="9">a listener fully replaced it -</text>
  <text x="470" y="598" text-anchor="middle" font-size="9">see "opting out" below</text>
</svg>

## `on` and `emit`

```js
this.plugins.on('game:onPlayerDeath', this.handleDeath.bind(this));
```

```js
// (core code, not something you write)
plugins.emit('onPlayerDeath', { player, firedId });
```

Two things to notice immediately:

1. **`on` uses the full, prefixed event name** (`game:onPlayerDeath`) - you always type the prefix yourself when registering a listener.
2. **`emit` is called with the *unprefixed* name** at the call site (`onPlayerDeath`) - `PluginManager.emit` adds the `${this.type}:` prefix automatically before checking for listeners.

`this.type` is whichever server type is currently loading plugins (`'services'`, `'game'`, or `'client'` - see [Lifecycle](./lifecycle.md)). This is why the *same* event name, emitted from shared code that runs on multiple server types, ends up firing under different prefixes depending on which process is running it - `eventsInit` and the shop-rotation events are the clearest examples of this in the actual event catalog.

## Multiple listeners, one event

Nothing stops two plugins (or two listeners in the same plugin) from registering on the same event - `PluginManager.listeners[event]` is just an array, and `emit` awaits each one in the order they were registered (which, since registration happens inside each plugin's constructor, follows plugin load order - see [Lifecycle](./lifecycle.md)).

```js
async emit(event, ...args) {
    this.cancel = false;
    event = `${this.type}:${event}`;

    if (this.listeners[event]) {
        for (const listener of this.listeners[event]) {
            try {
                if (isObject(args[0])) args[0].EVENT = event;
                await listener(...args, this);
            } catch (error) {
                console.error(`Error in listener for event ${event}:`, error);
            };
        };
    };
};
```

Two consequences worth knowing:

- **A listener that throws doesn't stop the others.** Each listener is individually try/caught - one broken plugin logs an error but doesn't prevent the next listener (or the emitting code's own default behavior) from running.
- **Listeners run in registration order, awaited sequentially, not in parallel.** A slow `async` listener genuinely delays every listener registered after it for that same event, and delays whatever the emitting code does next.

## The payload

Whatever object you passed as the first argument to `emit` is what your listener receives, with one addition: `args[0].EVENT` gets set to the fully-prefixed event name before your listener runs (only if the first argument is an object - primitives are left alone). This is occasionally useful if one listener function is registered against several different events and needs to know which one just fired.

A near-universal convention in this codebase: the emitting object passes itself as `this` inside the payload (`plugins.emit('roomInit', { this: this })`), so your handler can reach back into the room/client/permissions instance that's currently running:

```js
somePlugin(data) {
    const room = data.this;       // the RoomConstructor instance
    room.notify("hello from a plugin");
};
```

This is why you'll see `var ctx = data.this;` or similar destructuring throughout real plugin code - `data.this` is how you get at the actual live object, not just whatever narrower fields happened to be included in the emit call.

## `plugins.cancel` - opting out of default behavior

Some emit call sites are followed immediately by the core code's own default action, guarded by a check of `plugins.cancel`:

```js
// (core code)
plugins.emit("fireEggk47", { this: this, pos, dir, Eggk47 });
if (!plugins.cancel) Bullet.fire(pos, dir, this);
```

`emit()` resets `this.cancel = false` at the very start of every call. A listener sets it to `true` to tell that *specific* emitting code to skip its own default follow-up:

```js
someHandler(data) {
    // ...do something instead of the default...
    this.plugins.cancel = true;
};
```

This is the mechanism behind LegacyShell's most powerful plugin capability - fully replacing core behavior rather than just reacting to it. Two examples of how far this can go: a plugin can cancel the default minification step in the client build pipeline and substitute its own obfuscation pipeline entirely (a different tool, a different pass structure - whatever it wants), or cancel the default player-sync packet building and substitute its own logic, such as occlusion-based filtering that omits players a given client shouldn't be able to see (a common anti-cheat technique against ESP-style cheats).

::: warning `cancel` is one flag, shared by every listener on that event
It isn't scoped per-listener. If two plugins both listen to the same event and only one of them means to cancel the default, the other one's listener still runs against a `plugins.cancel` that's already `true` by the time it checks it (since listeners run sequentially and the flag is set as soon as any earlier listener sets it) - and any code checking `plugins.cancel` *after* your listener runs sees whatever the last listener left it as. Only set it when you specifically mean to suppress the default for that particular emit, and be aware that plugin load order (see [Lifecycle](./lifecycle.md)) determines which listener runs, and therefore which one's cancel decision "wins" if they disagree.
:::

## `onConstructor` - a small convenience wrapper

```js
this.on = plugins.onConstructor(PluginMeta);
```

`plugins.onConstructor(pluginMeta)` returns a bound version of `on` that automatically tags your registrations with `pluginMeta.identifier` for logging purposes, instead of the default `"<anonymous>"`. Purely cosmetic (it changes what shows up in the `registering emitter` boot log lines) - most plugins in this codebase skip it and just call `this.plugins.on(...)` directly, which is equally correct.

## What's next

The [Event Reference](./Event%20Reference/) is the actual list of events - what fires, from where, with what payload. This page was the mechanism; that's the vocabulary.

For the two biggest event-driven capabilities specifically, see their own pages: [Commands](./commands.md) (built on `permissionsAfterSetup`) and [Client-Side Code](./client-side-code.md) (built on `pluginSourceInsertion`).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
