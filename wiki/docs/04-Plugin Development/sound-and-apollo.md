# Sound and Apollo

> **Audience:** Plugin authors adding or triggering sound effects · **Prereqs:** [Client-Side Code](./client-side-code.md)
>
> **Canonical source:** `server-client/src/client-static/src/apollon/Apollo.js` (imported client-side via `#apollo`), `plugins.emit("loadSounds", ...)` in `server-client/src/client-static/src/shellshock.min.js:3914`

**Apollo** is LegacyShell's own audio wrapper around [Howler.js](https://howlerjs.com), spliced into the browser bundle the same way `src/shell/*` modules are, despite physically living outside that folder. [Sounds](../03-Content%20Creation/sounds.md) covers the asset side - file formats, where files live, replacing an existing sound. This page covers the code side: how a plugin actually registers a new sound and plays it.

Every function below is a client-side global once Apollo has loaded into the bundle - there's nothing to import.

## Registering a new sound file

The base game builds one big `soundsList` of `[src, name]` pairs and fires `loadSounds` before loading them, specifically so plugins can append to the same list:

```js
// shellshock.min.js:3914 - real code
await plugins.emit("loadSounds", { soundsList });
// ...
loadSoundsFromList(soundsList, onComplete);
```

A plugin hooks it and pushes its own entries - this is the exact code `5_crackshot` uses to add its M24 sounds:

```js
// plugins_default/5_crackshot/shared.js:113-123 - real code
loadSounds(data) {
    const additionalSounds = [
        ["sound/m24/boltClose.mp3", "m24.boltClose"],
        ["sound/m24/boltOpen.mp3", "m24.boltOpen"],
        ["sound/m24/fire.mp3", "m24.fire"]
    ];

    data.soundsList.push(...additionalSounds);
},
```

`loadSounds` only ever fires client-side (it's emitted from the browser bundle itself, never from server code), so there's no need to guard this listener with `isClient` - it simply never fires on a game server.

Sound paths are resolved the same way the base game's own sounds are - relative to `server-client/src/client-static/sound/` if you're shipping through core, or your plugin's own served static directory if you're serving the file yourself (see [Static Assets](./static-assets.md)). Apollo automatically retries a failed `.mp3` load as `.ogg` at the same path - see [Sounds - Format and fallback](../03-Content%20Creation/sounds.md#format-and-fallback).

## Playing a sound

Which function you want depends on whether the sound has a position, and whether it should follow something moving:

| Situation | Use |
|---|---|
| One-off sound at a fixed point in the 3D world (an explosion, an impact) | `playSoundIndependent(name, { pos, rate, loop, vol })` |
| One-off sound with no position (a UI click, a notification) | `playSoundIndependent2D(name, { rate, loop, vol })` |
| A sound that should keep following a moving object (footsteps, an engine, anything attached to a mesh) | `new Emitter(parentTransformNode)`, then `.play(name, rate)` |

`playSoundIndependent` is what grenade/rocket explosions use:

```js
// src/shell/bullets.js:284 - real code
var pos = new BABYLON.Vector3(this.x, this.y, this.z);
playSoundIndependent(this.actor.explodeSound, {pos});
```

`pos` gets run through Apollo's own axis translation before being handed to Howler - pass a plain `BABYLON.Vector3`, don't pre-translate it yourself.

### `Emitter` - sounds that follow something

```js
const engineEmitter = new Emitter(vehicleMesh);   // parent: any BABYLON.TransformNode (Mesh included)
engineEmitter.play("vehicle.engine", 1.0);
```

An `Emitter` subscribes to its parent's `onBeforeRenderObservable` and repositions every playing sound on that emitter each frame automatically - you don't need your own update loop. Pass no parent (`new Emitter()`) for a 2D emitter that isn't attached to anything in the scene. `Emitter.activeEmitters` holds every emitter ever created, if you need to enumerate them.

### `Cue` - a pool of variations played as one logical sound

Useful for anything that shouldn't sound identical every time - footsteps, death screams, ambient thunder. Load a cue once, then treat its name exactly like a normal sound everywhere else (`playSoundIndependent`, `Emitter.play`, etc.) - Apollo resolves it to one of its sounds at play time:

```js
// shellshock.min.js:3924-3938 - real code, the base game's own death-scream cue
let deathsSrcs = [];
for (var i = 1; i < 11; i++) {
    deathsSrcs.push("sound/death/scream" + i + ".mp3");
}
loadCue("death.scream", deathsSrcs);

// later, played exactly like any other sound name:
playSoundIndependent("death.scream", { pos });
```

The default `selectSound` picks uniformly at random. Override it on the `Cue` instance for non-random selection (e.g. cycling in order, weighting toward a rarer variant).

## Global controls

- `apolloSetVolume(vol)` - sets Howler's master volume (`0`-`1`); `0` mutes without needing to pause/suspend anything.
- `stopAllSounds()` - a thin wrapper over `Howler.stop()`, stops every currently-playing sound immediately.

## Gotchas

**All sound names share one global namespace.** `sounds` is a single flat object keyed by name - there's no per-plugin prefixing built in. Registering a name that already exists (from another plugin, or the base game) logs a warning and **unloads the old sound**, replacing it outright. Prefix your own names the way `5_crackshot` does (`m24.boltClose`, `m24.fire`) rather than something generic like `fire` or `hit` that's likely already taken.

**Two names are reserved.** `""` (blank) and `"reserved"` both log a console error if used (`APOLLO_FORBIDDEN` in `Apollo.js`) - this doesn't hard-fail, the sound still gets registered, but it means something's likely wrong with how the name was constructed (an unset variable interpolated into a template string, for instance).

**Code that calls Apollo functions immediately (not just registering a listener for later) needs `position: 'after'`** in its `pluginSourceInsertion` entry, same as any code that reads a real game object at parse time - see [Recipe: UI Modification](./Recipes/ui-modification.md#why-me-works-here-and-why-position-after-still-matters) for why. Reacting to `loadSounds` itself is fine at any position, since it doesn't fire until well after the whole bundle is assembled.

**A sound that never loads plays the fallback tone, not silence.** If you hear the same generic tone for a sound you just added, the file failed to load in both formats - see [Sounds - Common Issues](../03-Content%20Creation/sounds.md#common-issues).

Next: [Sounds](../03-Content%20Creation/sounds.md) for the asset side, or [Client-Side Code](./client-side-code.md) for `pluginSourceInsertion` in general.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
