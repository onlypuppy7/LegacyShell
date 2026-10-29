# dynamicmapblocks

Shared kinematic platforms and physics editing for placed map blocks.
This plugin is vibecoded. Version 2 replaces the original `spinningdisk` plugin;
keep only `dynamicmapblocks` installed. Restart the client and game servers together.
Uses generic core extension hooks; platform behavior stays in this plugin.

## Lighting

Moving map models get the map's surface variation automatically during play.
The variation stays attached to the model instead of flickering as it crosses cells.
Editor previews retain the editor's normal material.

**Settings → Graphics → Detail → Moving Block Lighting** adds shading under
static roofs and other cover. It defaults to off, saves per browser, and changes
immediately. It reuses the map's existing sunlight field; it does not cast rays
each frame or rebuild map lighting. Supported GPUs sample a small atlas twice per
vertex. Older devices use a simpler whole-block sample, updated up to 10 times
per second. Turning it off releases the GPU atlas; a compact CPU copy remains so
it can be enabled again without rebuilding the map.
Local Test's older settings panel shows the same option beside Auto Detail.

This approximates static environmental shade. Moving blocks do not cast new
environmental shadows, shade each other, or change the cached field as they move.

Open `/dynamicmapblocks/lighting-profile.html` on any client device to compare
original rendering, surface treatment and environmental shading with 1, 8 or 32
moving models. The page checks rendered pixels before measuring, warms each mode,
and provides downloadable results. Render measurements include GPU completion
with `gl.finish()` and are comparisons rather than normal gameplay FPS. Test on
the target device; desktop timings do not predict Android performance.

On 2026-10-29, Chrome 155 / WebGL 2 on an RTX 3060 Laptop GPU at 1100 × 380
showed 0.054 and 0.060 ms additional completed render time for 32 movers, compared
with the average of the surface-only runs before and after each environmental
run. Eight movers were within measurement noise. Each mode recorded 180 frames
after 30 warm-up frames. Pixel checks also passed under WebGL 1 and WebGL 2.

## Edit block physics

Place a block normally, then open **Physics** and click the block. The selected
block is highlighted. Choose **Spin**, set X/Y/Z (or a custom axis), a centre,
corner or custom pivot, speed and direction, then press **Apply**. Custom pivots
use offsets from the platform origin. The orange marker shows the pivot.
Full, AABB, OBB and triangle-mesh blocks use the same panel and movement metadata.
Models without a collision child can move too: the panel shows a small warning,
and they remain visual-only. Cloned collision children stay hidden in previews and play.
An existing multi-block platform can be edited by selecting any of its blocks.

**Linear path** provides editable XYZ waypoint offsets, loop/back-and-forth mode
and the duration of a complete cycle. Time offset shifts the starting phase.
**Preview** plays the current settings without saving them; stopping it restores
the original block. Preview stays active while editing, applying or resetting; valid edits update it
without resetting its clock, and invalid drafts retain the last valid preview. Clicking another block
stops the old preview and plays the new block's, if it has a movement. Stop it explicitly or close Physics. **Reset** restores the saved settings. Choose **Static** and
**Apply** to remove movement. Close Physics (or press Escape) to build again.
Physics mode selects blocks instead of placing, deleting or rotating them.
Selected movements have coloured path lines, waypoint dots and direction arrows;
green marks the start. The **⋯** button in the panel's corner holds **Show all guides**
(every saved movement's guides, also outside Physics mode), **Preview all** (all saved movements
together, including the selected draft) and Copy/Paste movement. It is underlined when either option is on. Stopping a preview restores the original blocks.

**Circular path** adds a radius, horizontal or vertical plane, direction and cycle
duration. The circle starts at the block's placement and its centre lies one radius
back along the plane's first axis. **Face travel direction** rotates along a linear
or circular path. For waypoint paths, **Turn time** is the rotation time after each
corner: 0 snaps, larger values ease in and out using quaternion interpolation. Long turns are
capped at half the current segment's duration so the next corner remains distinct.
**Facing offset** aligns models whose authored front faces another direction.

A small table sets how players and items (grenades) treat a moving block. **Collide** lets each
stand on and bump into it; switched off, they pass straight through (bullets still hit while either
collides). **Rotate with block** turns players' view horizontally while riding, and carries grenades
round a turn; switched off, grenades stay where they landed as the block turns beneath them.
It is greyed when the matching collide is off, and only shown for spins and travel-facing paths.
Save/open, backups, undo and the normal local/online test buttons retain physics.
Deleting or replacing a block removes its assignment; moving the whole map moves
the platform origins and assigned blocks too. New placements always start static.
Old `extents.spinningDisks` maps migrate to general platform metadata when saved;
the preset disk creation controls have been removed.

The object palette contains **dynamic.spinner.mesh**, an imported static block.
`client/spinner.json` is a static example map using that model; `client/spinner-moving.json`
uses the same block with spin metadata. Both are ordinary map files.
Its `.babylon` asset
is merged into `map.babylon` by the same client/game preparation hooks as other model
plugins. Rebuild the asset with `node plugins_default/dynamicmapblocks/build-model.js`.

## Engine layout

- `motion.js`: pure time-to-transform samplers (`none`, `spin`, `path`, `circle`),
  path heading, turn interpolation and the room clock.
- `geometry.js`: local box/cylinder/triangle geometry, overlap tests and segment raycasts.
- `assets.js`: reloads missing map models from the current merged asset when a browser
  has an older cached model set; existing templates and editor saves are preserved.
- `platforms.js`: validated map definitions, block collision adapters, scoped historical
  queries, bounds, contact detection and passenger transport.
- `shared.js`: the only player/collider integration layer. It also prepares map loading
  so assigned blocks leave both the static collision grid and static rendered map.
- `protocol.js`: room clock and per-player simulation time sent in an independent
  packet before ordinary sync. This also works when another plugin replaces/reorders
  normal sync packets. Client reconciliation restores time before replaying inputs.
- `render.js`: rendering adapters, sampling the same transforms as collision.
- `disk.js`: compatibility with legacy disk data.
- `editor-state.js` / `editor.js`: block assignments, save/load and the physics panel.
- `guides.js`: coloured movement paths, waypoint markers and direction arrows.

Geometry has no knowledge of movement types. Movement has no knowledge of player
physics. Carrying transforms the passenger's local contact position from the previous
platform pose into the next pose; the cylinder does not get a special player path.
Simulation time is included in player snapshots and extrapolated states. Historical
queries are scoped with `world.at(time, callback)` and restore their previous time even
when a callback throws. Physics never reads a rendering mesh's current transform.
Vertical contacts use continuous separating-axis sweeps for triangles and convex
shapes. Transformed triangle bounds and projections are cached per pose, and prediction
reuses recent poses. Custom shapes without sweep support retain the sampled fallback.

## Map definitions

General platforms live in `extents.platforms`. Positions and block coordinates use
the saved map origin. Shape positions and spin pivots are relative to the platform.
Body/shape rotations are radians; block `rx`/`ry`/`rz` retain the map's quarter turns.
Motion speed is degrees per second. `phase` is an optional offset in seconds.

An elevator made from a box:

```json
{
  "id": "lift",
  "position": { "x": 7, "y": 1.5, "z": 7 },
  "shapes": [{
    "type": "box",
    "min": { "x": -2, "y": -0.5, "z": -2 },
    "max": { "x": 2, "y": 0.5, "z": 2 }
  }],
  "motion": {
    "type": "path",
    "points": [{ "y": 0 }, { "y": 4 }],
    "duration": 8,
    "loop": "pingpong"
  }
}
```

`duration` is the time for a complete cycle. Paths follow straight segments at
constant speed. `loop` closes the last waypoint back to the first; `pingpong`
travels to the last waypoint and back; `snap` travels to the last waypoint, then jumps
straight back to the first and goes again (nothing rides the jump: whatever was on or in it stays where it was). Waypoints are local offsets, not world positions.
In the editor, Add waypoint copies the last waypoint's current coordinates, and
Reverse waypoints reverses their order. Press Apply to save either change.
Copy movement stores the current panel settings, including edits not yet applied.
Select another block and use Paste movement, then Preview or Apply. The copied
settings remain available after refreshing the editor. Centre and corner spin
pivots adapt to the destination block; custom pivot offsets are copied as entered.
Path guides keep the block's horizontal centre on the configured waypoints, including
models authored off-centre. Turns use the collision bounds' centre; models without
colliders use visual bounds. Existing height offsets are preserved. Waypoints stay
relative to the block's placement. Gameplay render time advances smoothly through
brief network replay rewinds; collision and player simulation still use exact tick time.
For spin, use `{ "type": "spin", "axis": { "y": 1 }, "pivot": { "x": -2 }, "speed": 30 }`.
Arbitrary axis vectors and pivots are supported by the transform sampler.
For a circle, use `{ "type": "circle", "radius": 3, "plane": "xz", "duration": 8 }`;
`plane` can also be `xy` or `yz`, and `reverse: true` reverses travel.
Path and circle motion accept `orient: true` and `headingOffset` in degrees.
Waypoint paths additionally accept `turnDuration` in seconds (0 means an instant turn).

To move existing map blocks, supply `blocks` instead of, or alongside, `shapes`:

```json
{
  "id": "crate",
  "position": { "x": 7.5, "y": 1.5, "z": 7.5 },
  "blocks": [{ "mesh": "shipyard.crate-wood.full", "x": 7, "y": 1, "z": 7 }],
  "motion": {
    "type": "path",
    "points": [{}, { "x": 4 }],
    "duration": 8,
    "loop": "pingpong"
  }
}
```

`full` uses a local unit cube; moving/rotating it no longer means occupying a fixed
voxel. `aabb` uses the collision child's bounds in the block's model space. `obb`
retains the collision child's orientation. Both include collision descendants, matching
the existing bounds-based engine. `mesh` tests the actual indexed triangles of the
first collision child and all its descendants, including nested transforms and scale.
Use the model name `theme.name.mesh` in the editor just like `theme.name.obb`.
Collision children stay invisible; the visible model is independent of the collider.
Triangle queries use a cached bounding-volume hierarchy and preserve concave gaps.
Closed, watertight collision meshes also detect objects fully inside their volume;
open meshes behave as two-sided surfaces. Collision matches the authored triangles,
so a round collider's precision depends on its segment count.

Static `mesh` blocks and moving `mesh` blocks share the same triangle queries for
players, points, bullets and grenade normals. Geometry extending beyond the placement
cell is included. Adding a block to `extents.platforms` gives it motion; the imported
model itself contains no automatic movement. The spinner uses 96 segments and no
cylinder-specific collision rule.
One platform can contain multiple blocks. A block cannot belong to two platforms.
Source map data and model/collider templates are not mutated.

Limits: 32 platforms, 128 shapes/blocks each, 64 waypoints, spin speed up to 90°/s,
path speed up to 16 blocks/s, circle radius .25–16, and cycles of at least one second.

## Extending it

Register a shape with `PlatformShapes.register(name, createGeometry)`. Geometry supplies
local `vertices`, face `normals`, unique edge directions and `ray(origin, direction)`.
Register its visual builder with `PlatformRender.register(name, buildMesh)`.
An optional geometry `overlap(matrix, queryBox)` can supply an analytic fast path;
otherwise the shared convex separating-axis test is used.
Custom non-convex shapes can supply `contact(matrix, queryBox)`, returning a
separating displacement for moving-platform pushes; convex shapes get this from SAT.

Register motion with `PlatformMotion.register(name, sampleMatrix, maxTravel)`.
`sampleMatrix(motion, seconds)` must be pure. `maxTravel(motion, elapsedSeconds, radius)`
must bound passenger travel so collision checks also cover curved paths and complete
loops. New adapters don't require new branches in the player integration.

## Current limits

This is a kinematic platform foundation, not a rigid-body solver. Passenger transport,
landing, head/side collision, rays, rotation and vertical lifts are covered.
Moving and rotating collision geometry pushes players (including airborne players)
and thrown grenades through a shared, substepped contact solver. Convex solids use SAT
separation; imported meshes resolve actual triangle surfaces. Static terrain and other
platforms block displacement. Motion bounds include turning geometry as well as travel.
Rotated geometry and ray normals work on arbitrary axes, but comfortable slope walking,
crushing responses and platform-to-platform dynamics need further contact-solver work.
Trapped actors are not teleported through walls; a kinematic mover can intersect them
when no valid displacement remains. Blocking a passenger does not stop a platform.
Jumping detaches without adding launch momentum. Explosion occlusion and bot navigation
still use their existing voxel-only systems. Cylinder overlap uses an analytic upright
case and a 64-sided convex approximation when tilted.

Both server and client need the same plugin. Sync packets provide authoritative times;
the tests exercise encoding, client decoding and replay, but are not a multiplayer
latency/load certification.

Run checks: `node plugins_default/dynamicmapblocks/test.js`.

Profile shared player simulation, including two prediction passes per tick:
`node plugins_default/dynamicmapblocks/profile.js latest 3000`.
CPU profiles and timing/call-count reports go in `store/dynamicmapblocks-profile/`.
The benchmark includes full-block wall/corner contact, exact face contact, larger
time steps and six-step replay bursts using the wire format's position quantization.
An optional fourth argument filters cases, e.g. `latest 10000 wall` or `latest 10000 replay`.
It records p95/p99/p99.9, worst ticks, over-budget ticks, map checks and blocked carry.
These shared-physics measurements do not measure browser rendering or network RTT.

## F3 debug info

With `debugf3` installed, F3 shows the platform count, the platform clock, what you are riding, and the platform you are looking at (motion and centre). Nothing is shown on maps without platforms.

## Engine hooks

The plugin uses synchronous cancellable engine events rather than replacing prototypes
or editor functions. These listeners must finish in the current call; do not use async
functions or return promises. Normal async plugin events keep their existing behavior.

Physics events expose `{ this, args, run, result }`. `run(...args)` invokes the ordinary
operation without redispatching that event. A replacement sets `result` and then
`plugins.cancel = true`. Listeners should respect an earlier cancellation. This lets
movement use historical collision time with a try/finally scope around the operation.

| Area | Events (game: prefix) |
| --- | --- |
| Map preparation | roomBuildMap |
| Collider setup | colliderSetParams |
| Collision queries | colliderMeshCell, colliderRayCell, colliderMeshMap, colliderPointMap, colliderRayMap, colliderProjectileCell, colliderGrenadeCell |
| Player physics | playerMovement, playerMoveY, playerSnapshot |
| Grenade physics | grenadeThrow, grenadeUpdate |
| Lighting field | lightmapReady |
| Editor selection | editorPointerDown, editorPointerMove, editorPointerUp |
| Editor lifecycle | editorInitMapBefore/After, editorLoadMapBefore/After |
| Editor serialization and movement | editorExtentsBefore/After, editorSaveMap, editorMoveMapBefore/After |

Editor JavaScript uses `pluginSourceInsertion` with `position: 'editor'`. The remaining
HTML insertion loads the panel stylesheet; shader changes use `shaderSources` and its
existing GLSL anchors. Neither edits game function source text.

`motion.collidePlayers` and `motion.collideItems` default to true; `motion.rotateItems` defaults to true. Players and grenades ride moving blocks through one shared path (`ride()`): carried while grounded on a block and pushed out of a block that moves into them. A snap back is a jump, so nothing rides it. When a moving block pushes a player or grenade towards the map, the map wins by default (they are squeezed against it); set **Pushing into the map** to **Block pushes through** (`motion.pushThroughMap`) to make the block win. The block itself never collides with static map blocks. Their velocity stays in world space; the block's motion is applied by the ride, never stored. With moving blocks in the map a grenade steps like a player does: one box, moved an axis at a time, tested by the same collision the players use. It bounces with core's own factor off whatever it meets, counting how fast that surface is moving, so a block that runs into it knocks it away; it stops once it lands, as a player's landing does. A grenade thrown hard into a crate can bounce back out of the open end, as it would from a still one.

`motion.rotatePlayers` defaults to false. When enabled for spin or travel-facing paths,
a supported player follows horizontal platform rotation while retaining their mouse-look
offset. Pitch and roll stay upright. Local player input records the turn before simulation;
replays and remote players use the recorded yaw, avoiding a second turn.
