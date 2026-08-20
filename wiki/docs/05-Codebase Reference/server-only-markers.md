# Server-Only Markers

> **Audience:** Core contributors, AI agents · **Prereqs:** [Shared Shell Layer](./shared-shell-layer.md)
>
> **Canonical source:** `src/shell/general/misc.js` (`prepareForClient`)

The `//(server-only-start)` / `//(server-only-end)` comment convention - a real build-time code-stripping directive, not decoration.

## What it does

From `misc.prepareForClient` (see [Shared Shell Layer](./shared-shell-layer.md) for the full four-step transform this is one part of):

```js
file = file.replaceAll("\n//(server-only-start)", "\n/*(server-only-start)");
file = file.replaceAll("\n//(server-only-end)", "\n(server-only-end)*/");
```

Server-side, these are just two ordinary `//` line comments - inert, the code between them runs normally as part of the real ES module. Client-side, the build step turns them into the *open* and *close* of one real `/* ... */` block comment - **everything between them is deleted from the browser bundle.**

## When to use it

Anything in a `src/shell/*.js` file that would break once flattened into the browser's concatenated script:

- **Node-only imports** - `fs`, `path`, `child_process`, native modules like `@napi-rs/canvas`.
- **Module-local variables that collide with a client-side global** - the browser bundle already declares certain variables elsewhere in `shellshock.min.js`; a shared file re-declaring the same name at its own top level would collide once everything's flattened into one script scope.
- **Server-only logic embedded inside a function the client also uses** - a block that only makes sense with `isServer` true, wrapped defensively even though the client could never reach it via the `isServer` check alone.
- **A `export default` a module-based Node consumer wants but the client bundle has no use for** (the client doesn't have "the default export of this concatenated script" as a meaningful concept).

## Real examples

**`plugins.js`** wraps its entire Node-only import block (`fs`, `path`, `child_process`, `module`) at the very top of the file:

```js
//(server-only-start)
import fs from 'fs';
import path from 'path';
// ...
import { exec, execSync } from 'child_process';
// ...
//(server-only-end)
```

**`bullets.js`** wraps module-local variable declarations *and* a whole function, right after its own (always-present) imports:

```js
//(server-only-start)
var room, Collider;
var tv1 = new BABYLON.Vector3;
var tv2 = new BABYLON.Vector3;

function checkExplosionCollisions (explosion) { /* ... */ };
//(server-only-end)
```

`bullets.js` also wraps a server-only block *inside* `collidesWithPlayer` (lines 197-223, a damage-calculation branch that only makes sense server-side) and a trailing `export default { Bullet, Rocket, Grenade };` (lines 377-385) - three separate marker pairs in one file, each protecting a different kind of server-only content.

**`stringWidth.js`** wraps the `@napi-rs/canvas` import and canvas creation, since the browser has its own native `Canvas` and doesn't need (or have) the Node package.

**`collider.js`** wraps a small module-local variable declaration the same way `bullets.js` does.

## Empty marker pairs are harmless, not a bug

A few files (`catalog.js`, `comm.js`, `math.js`, `permissions.js`, `constants.js`) have marker pairs with nothing between them - apparently boilerplate left in even where nothing ended up needing to be stripped. These are inert either side of the build - don't "clean them up" expecting to fix anything; they're not broken, just unused.

## Common Issues

**Something works server-side but throws in the browser console after a build.** Check whether the failing code references something Node-only, or a variable name that collides with an existing browser global - if so, it needs wrapping in a marker pair (or the collision needs a different variable name if the code has to run client-side too).

**I added a marker pair but the client build didn't change.** Confirm you're actually looking at rebuilt output (`store/client-modified/`, only regenerated when the client server restarts - see [Build Pipeline](./build-pipeline.md)), not a stale bundle from before your edit.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
