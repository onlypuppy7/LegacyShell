# Physics and Collision

> **Audience:** Core contributors, AI agents · **Prereqs:** [Shared Shell Layer](./shared-shell-layer.md)
>
> **Canonical source:** `src/shell/collider.js`

The voxel-grid collision engine shared by both client-side prediction and server-side authoritative physics - built on Babylon.js primitives, but purely for its math (no rendering, especially server-side where there's no screen at all).

## Voxel collision meshes, cached and reused

`ColliderConstructor` builds a small set of reusable Babylon mesh primitives once at construction (`fullCollisionMesh`, `wedgeCollisionMesh`, `iwedgeCollisionMesh`, `pointCollisionMesh`) rather than per-cell - these correspond directly to the `colliderType` values from a block's mesh name (see [Map Blocks](../03-Content%20Creation/map-blocks.md#the-naming-convention)). Every occupied grid cell reuses the same shared mesh object, repositioned/tested rather than each getting its own instance - this is a real performance necessity given a map can have thousands of cells.

**Player collision meshes are cached per-scale, not rebuilt every check**: a player's own collision box (`player.playerCollisionMesh`) is only regenerated when their `scale` modifier (see [Users and Ranks](../02-Running%20a%20Server/users-and-ranks.md), the `/change scale` command) actually changes from what was last built (`player.playerCollisionMesh.lastScale`) - a scale-shift gamemode changing a player's size doesn't mean rebuilding a mesh every single tick, only when the value genuinely differs from last time.

## `rayCollidesWithMap` - a real 3D DDA voxel traversal

Used by bullet hit detection and explosion line-of-sight checks. This isn't a naive "step along the ray in small increments and check each point" implementation - it's a proper fast-voxel-traversal algorithm (the same family as Amanatides & Woo's well-known technique): tracking `tMaxX/Y/Z` (distance to the next grid boundary crossing on each axis) and `tDeltaX/Y/Z` (how far one full cell-crossing is along each axis), always advancing whichever axis has the nearest next boundary. This visits **every** voxel cell the ray actually passes through, in order, with no risk of skipping a thin cell at a shallow angle the way fixed-step-size marching can.

## `softness` and raycasts: "verysoft" cells are pass-through

The ray-traversal loop calls back into a caller-supplied function for every occupied cell it visits, but only actually **stops and returns** a hit if that cell's mesh `softness` isn't `"verysoft"`:

```js
var res = callback(origin, direction, { x, y, z });
if (res && "verysoft" != mapMeshes[res.cell.idx].softness) return res;
```

This is the mechanism behind the `SPECIAL.barrier.full.verysoft` blocks mentioned in [Map Blocks](../03-Content%20Creation/map-blocks.md#the-naming-convention) - a "verysoft" collidable block still registers as solid for normal player movement collision, but a *raycast* passes straight through it rather than stopping there. Used for boundary/vision barriers that should physically stop players from walking out of a map without also blocking bullets or explosion line-of-sight checks at that same boundary.

## Collision shapes by `colliderType`

Each shape gets different intersection precision, matching the [Map Blocks](../03-Content%20Creation/map-blocks.md#the-naming-convention) table:

| `colliderType` | Precision | Geometry source |
|---|---|---|
| `full` | Not tested at all - short-circuits to an automatic hit. | `Collider.fullCollisionMesh`, a shared generic 1x1x1 cube built once in the `ColliderConstructor` constructor. Occupying the cell is treated as solid for the entire cell, regardless of the block's actual visual shape. |
| `wedge`, `iwedge` | Precise (per-triangle) - needed since a wedge's actual solid volume is a fraction of its bounding box. | `Collider.wedgeCollisionMesh` / `iwedgeCollisionMesh` - also shared generics, a 1.5-size box rotated 45deg and baked, reused for every `wedge`/`iwedge` block. Not derived from the placed block's own mesh. |
| `aabb` | Bounding-box only, no per-triangle precision. | `mapMeshes[i].colliderMesh`, i.e. the block's own first child mesh (see below) - genuinely per-block geometry, unlike `full`/`wedge`/`iwedge`. |
| `obb` | Precise (per-triangle) collision. | Same per-block child-mesh source as `aabb`, just tested with Babylon's `precise: true`. |
| `ladder` | Bounding-box only. | Same per-block child-mesh source as `aabb`, plus an extra gate - see below. |

## Where `aabb`/`obb`/`ladder` collider meshes actually come from

`full`/`wedge`/`iwedge` collision is intentionally generic (see the table above), but `aabb`/`obb`/`ladder` collide against real, per-block geometry - specifically, **the first child mesh parented under the block's root mesh**, resolved once when the map's models finish loading:

```js
// src/shell/loading.js - onLoadMeshComplete, real code
for (var i = 1; i < mapMeshes.length; i++) {
    var mesh = mapMeshes[i].getChildMeshes()[0];   // first child only - extras are silently ignored
    mesh && (mapMeshes[i].colliderMesh = mesh);
};
```

`buildMapData` then just reads that already-resolved `mesh.colliderMesh` straight through for these three types (`src/shell/loading.js`, the `colliderType` switch). See [Map Blocks](../03-Content%20Creation/map-blocks.md#modeling-a-custom-collision-shape-aabb-obb-ladder) for the content-creator-facing modeling workflow this implies (an invisible, parented collision mesh alongside the visible block).

`ladder` additionally gates on the *tester's* mesh name, not just the cell's `colliderType`:

```js
// src/shell/collider.js - meshCollidesWithCell, real code
case "ladder":
    if ("pc" != mesh.name) return false;   // "pc" = the player's own movement collision box
    break;
```

Every other tester used in this codebase (bullets, grenades, the generic `pointCollisionMesh` used for weather-particle collision) is unnamed or differently named, so this check silently excludes all of them - a `ladder` cell is solid to player movement only, invisible to every other collision system, including the raycast path this page otherwise documents. Climbing itself (converting a movement collision against a `ladder` cell into an upward climb) is a separate mechanic in `player.js`'s `lookForLadder`, gated on the pressed movement key and on the cell's stored `ry` matching the ladder the player is already climbing.

## Projectile-specific collision: `grenadeCollidesWithCell`

Grenades get their own specialized cell-intersection check that also computes a bounce normal - unlike a bullet (which just needs a single hit/no-hit answer), a grenade needs to know *which direction to bounce* off whatever it hit, which requires the surface normal at the point of contact, not just the fact of contact.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
