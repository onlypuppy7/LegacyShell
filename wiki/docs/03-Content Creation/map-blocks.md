# Map Blocks

> **Audience:** Map/model makers · **Prereqs:** [Maps](./maps.md), [Dealing with Babylon Models](./dealing-with-models.md)
>
> **Canonical source:** `src/shell/loading.js` (`buildMapData`, mesh-name parsing), `src/shell/collider.js` (`ColliderConstructor`, `meshCollidesWithCell`)

Adding a new placeable, collidable block type to the map editor - distinct from [Maps](./maps.md) (arranging existing blocks into a map) and general [model work](./dealing-with-models.md) (this page is specifically about the naming convention that makes a model behave as a map block).

## Where block models live

All map block models are in `map.babylon` (see [Dealing with Babylon Models](./dealing-with-models.md) for the full model-file reference table). Per the existing docs there: "simply adding a model here with a correctly formatted name is all that is needed to add a functioning, collidable block to the game" - the mesh's *name* is what does the work, not any separate registration step.

## The naming convention

A block mesh name is dot-separated fields, parsed directly by `buildMapData`:

```
theme.name.colliderType
theme.name.colliderType.softness   (optional 4th field)
```

Real examples from the shipped maps: `generic.grass.full`, `town.shop1.full`, `SPECIAL.spawn-blue.none`, `SPECIAL.barrier.full.verysoft`.

- **`theme`** - a loose grouping (`generic`, `town`, `nature`, `SPECIAL` for engine-special blocks like spawn points and barriers) - mostly organizational, doesn't change behavior, but keep it consistent with the palette conventions other maps already use so your block sorts sensibly in the editor's block picker.
- **`name`** - whatever you want, shown in the editor.
- **`colliderType`** - **this is the field that actually matters** - it selects which collision shape the physics engine uses for this block:

| `colliderType` | Collision shape | Where the geometry actually comes from | Notes |
|---|---|---|---|
| `full` | A full solid 1x1x1 cube. | **Not your model at all** - a single shared generic cube, reused for every `full` cell in the game. | The common case for a standard wall/floor/crate block. Even if your visual mesh is an odd shape, the collision volume is always the entire cell - see below. |
| `wedge` | A ramp/wedge shape. | **Not your model** - a single shared generic 45deg ramp, reused for every `wedge` block in the game. | Precise (per-triangle) collision against that *generic* ramp, not your mesh's actual triangles - see below. |
| `iwedge` | An inverted wedge. | Same shared generic ramp as `wedge`, mirrored. | Same precision as `wedge`. |
| `aabb` | Axis-aligned bounding box. | **Your own model** - see "Modeling a custom collision shape" below. | Bounding-box-only test - cheaper than `obb`, use for blocks that are never rotated in practice. |
| `obb` | Per-triangle-precise shape. | **Your own model** - same mechanism as `aabb`. | Exact per-triangle collision against your mesh - the right choice for anything that isn't a plain box, or that gets placed at an angle. |
| `ladder` | Climbable bounding box. | **Your own model** - same mechanism as `aabb`/`obb`. | Only ever tested against the player's own movement box - see "Ladders are special" below. |
| `none` | No collision at all. | N/A | Used by engine-special markers like `SPECIAL.spawn-blue.none` - the block exists as a placement marker in the editor but generates no physical geometry. |

- **`softness`** (optional) - a free-form string, not a fixed enum. In practice only `verysoft` is used anywhere in the shipped content (the `SPECIAL.barrier` blocks, `.full.verysoft`), but any non-empty value has effects - see "What `softness` actually changes" below.

## Where the collision geometry actually comes from

This is the part that trips people up: **your visual model's geometry is often not what generates collision at all.** `ColliderConstructor` (`src/shell/collider.js`) builds a small, fixed set of reusable collision primitives once, at scene startup, and every occupied grid cell reuses one of those same shared mesh objects rather than testing against your block's own triangles:

```js
// src/shell/collider.js - real code, constructor
this.wedgeCollisionMesh = BABYLON.MeshBuilder.CreateBox("", { size: 1.5 }, scene);
this.wedgeCollisionMesh.position.y = -0.75;
this.wedgeCollisionMesh.bakeCurrentTransformIntoVertices();
this.wedgeCollisionMesh.rotation.x = -Math.PI / 4;   // the 45deg cut that makes it a ramp
this.wedgeCollisionMesh.bakeTransformIntoVertices(this.wedgeCollisionMesh.getWorldMatrix());

this.fullCollisionMesh = BABYLON.MeshBuilder.CreateBox("", { size: 1 }, scene);
```

`buildMapData` (`src/shell/loading.js`) picks one of these three shared meshes for every `full`/`wedge`/`iwedge` cell:

```js
switch (mesh.colliderType) {
    case "full":   colliderMesh = Collider.fullCollisionMesh;   colliderChildren = colliderPrecise = false; break;
    case "wedge":  colliderMesh = Collider.wedgeCollisionMesh;  colliderChildren = !(colliderPrecise = true); break;
    case "iwedge": colliderMesh = Collider.iwedgeCollisionMesh; colliderChildren = !(colliderPrecise = true); break;
    // ...
};
```

**This means you cannot sculpt a custom ramp angle, a custom crate silhouette, or anything else out of `full`/`wedge`/`iwedge` collision.** A `full` block is always exactly a 1x1x1 solid cube of grid space - `meshCollidesWithCell` even special-cases `full` to return a hit immediately without testing any geometry at all, since occupying the cell is by definition solid the whole way through:

```js
// src/shell/collider.js - meshCollidesWithCell, real code
switch (mapMesh.colliderType) {
    case "full":
        return { x: cx, y: cy, z: cz, cell: cell, mesh: this.fullCollisionMesh };
    // ...
```

A `wedge`/`iwedge` block is always exactly that same generic diagonal-half-cube ramp, no matter how your actual ramp model looks - a steeper or shallower visual ramp still collides at 45 degrees. If you need a different angle or a non-box silhouette, `full`/`wedge`/`iwedge` are the wrong tool - use `aabb`/`obb` with your own collision geometry instead, described next.

## Modeling a custom collision shape (`aabb` / `obb` / `ladder`)

For these three types, `buildMapData` doesn't use a shared primitive - it uses `mesh.colliderMesh`, which was set once, when the map's models finished loading, to **the first child mesh parented under your block's root mesh**:

```js
// src/shell/loading.js - onLoadMeshComplete, real code
for (var i = 1; i < mapMeshes.length; i++) {
    var mesh = mapMeshes[i].getChildMeshes()[0];   // first child only
    mesh && (mapMeshes[i].colliderMesh = mesh);
};
```

Concretely, this means:

1. **Model your visible block as usual** - this is the mesh whose name follows the `theme.name.colliderType` convention.
2. **Add a second mesh object in the same Blender file, parented to the visible one, positioned/scaled however the collision volume should actually be.** It doesn't need its own name convention or any special naming at all - only its *position in the scene hierarchy* (being the block's first child) matters. Give it a simple, low-poly shape if you're going for `obb` (per-triangle intersection is more expensive than a box test, so don't parent a 5,000-triangle decorative mesh as your `obb` collider).
3. **This child mesh never renders** - it exists purely as collision geometry; keep it out of your material/texture workflow entirely (an invisible collision proxy, the same idea as an invisible "collision box" object in most game engines).
4. **If you have more than one child mesh, only the first one Babylon returns counts** - `getChildMeshes()[0]` takes whichever child comes first, silently ignoring the rest. A block with two child meshes (e.g. a leftover reference/guide object you forgot to delete) will get whichever one happens to load first as its actual collider - don't leave stray children under a block's root mesh.
5. **`aabb` vs `obb` is purely the `precise` flag passed to Babylon's `intersectsMesh`** - `aabb` does a cheap bounding-box test, `obb` does exact per-triangle collision against your child mesh's real geometry. Both get the *player/bullet/point* being tested transformed into the block's own locally-rotated frame first (via the cell's stored `rx`/`ry`/`rz`), which is how a placed-at-an-angle block's collision correctly follows its visual rotation for either type - `aabb` just approximates the result with an axis-aligned box in that local frame instead of testing real triangles.

## Ladders are special: player-only, and orientation-sensitive

`ladder` uses the exact same child-mesh mechanism as `aabb` (a bounding-box test, not per-triangle), but `meshCollidesWithCell` adds one more gate specific to it:

```js
// src/shell/collider.js - real code
case "ladder":
    if ("pc" != mesh.name) return false;   // "pc" = the player's own movement collision box
    break;
```

Every collision check passes in whichever mesh is actually being tested - the player's movement box is internally named `"pc"`, while bullets/points use an unnamed, differently-shaped probe. Since a ladder only ever matches when the tester is literally named `"pc"`, **a ladder block is invisible to everything except player movement** - bullets, explosions, and grenades pass straight through it as if it had `colliderType: none`, even though it's fully solid to a walking player.

Climbing itself is a separate mechanic in `player.js`'s `lookForLadder` - pressing the forward key into a cell whose `colliderType` is `ladder` switches the player into a climbing state, which then re-checks `cell.ry === this.climbingCell.ry` every tick to decide whether it's still on the same ladder:

```js
// src/shell/player.js - lookForLadder, real code
if (collide && collide.cell && this.controlKeys & CONTROL.up && "ladder" == this.mapMeshes[collide.cell.idx].colliderType) {
    // ...
    this.climbingCell.ry = collide.cell.ry;
    this.climbing = true;
```

**Practical consequence: if you stack multiple ladder cells to build a tall climbable surface, they need the same rotation (`ry`) as each other**, or the climb breaks the moment the player crosses into a differently-rotated cell (the orientation check above fails and `climbing` gets reset to `false`).

## What `softness` actually changes

`softness` is read by three unrelated systems, each with slightly different behavior - it's not a single simple "make this less solid" switch:

- **Raycasts** (`rayCollidesWithMap`, used by bullet hits and explosion line-of-sight) specifically check for the string `"verysoft"` - a `verysoft` cell still stops normal player movement collision, but a ray passes straight through it without registering a hit. This is the actual mechanism behind `SPECIAL.barrier.full.verysoft`: solid enough to keep players inside the map boundary, but invisible to gunfire and explosion checks at that same boundary. See [Physics and Collision](../05-Codebase%20Reference/physics-and-collision.md#softness-and-raycasts-verysoft-cells-are-pass-through) for the full raycast mechanism.
- **Collidable particle effects** (rain/snow puddling, and the general "does this particle stop on impact" check in the client renderer) check for *any* non-empty `softness` value, not just `verysoft` - a block with any softness set is treated as pass-through for those effects.
- **Bullet-hole/impact decal placement** (`MunitionsManagerConstructor.getMapIntersectionPoint`) only attempts a precise, mesh-accurate impact point when a block has **no** softness at all - a softened block skips that precise raycast against its visible geometry entirely.

For an ordinary solid content block, just omit the field. Reach for `softness` only if you're building something in the same family as a boundary barrier - a collidable-to-players-but-invisible-to-everything-else surface.

## Adding your own

1. Model your block in Blender, following [Dealing with Babylon Models](./dealing-with-models.md) for the export process.
2. Decide which `colliderType` you actually need: `full` for a plain solid cube (any visual shape, but always cube collision), `wedge`/`iwedge` if the generic 45deg ramp is good enough as-is, or `aabb`/`obb`/`ladder` if you need collision that actually matches a custom shape - in which case, also model and parent a second, invisible child mesh as described above.
3. Name the *visible* mesh following the `theme.name.colliderType[.softness]` convention above - this is the part that's easy to get wrong invisibly (a block that looks solid but uses `none`, or a rotatable block using `aabb` so its hitbox doesn't rotate with it).
4. Export into `map.babylon` (or your own plugin's model file, merged in via [Content Packs](../04-Plugin%20Development/content-packs.md#models) if you're shipping this as a plugin rather than editing the base game).
5. Restart the affected server(s) - the block should now appear in the editor's palette and behave physically as specified.

## Common Issues

**My block is visible but players walk straight through it.** Check the `colliderType` field isn't `none` and is actually spelled correctly - `buildMapData`'s `switch` only recognizes the exact strings in the table above; anything else falls through with no case matched (silently produces `colliderMesh: undefined` for that block, i.e. also no working collision).

**A rotated block's hitbox doesn't match its visible orientation.** You used `aabb` on a block meant to be rotated - switch to `obb`, which does per-triangle collision against your child mesh in its correctly-rotated local frame.

**I gave my `aabb`/`obb`/`ladder` block a custom collision mesh, but collision still looks wrong or generic.** Confirm the collision mesh is actually *parented* to the visible block mesh in Blender (a sibling or unparented object won't be found by `getChildMeshes()[0]`), and that it's the *only* child - a second stray child mesh will silently win instead of the one you intended.

**I built a custom-shaped ramp, but the collision doesn't match its silhouette.** Expected - `wedge`/`iwedge` always use the same shared generic 45deg ramp regardless of your model's actual geometry. Use `obb` with your own child mesh if you need a different ramp angle or shape.

**My ladder block stops bullets/grenades.** It shouldn't, and if it does, something else in the scene is providing that collision - `ladder` cells are explicitly excluded from every collision check except the player's own movement box (see "Ladders are special" above).

**Climbing stops partway up a multi-cell ladder.** The cells don't share the same rotation (`ry`) - re-place them with identical orientation so `cell.ry === this.climbingCell.ry` keeps matching as the player climbs through each cell.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
