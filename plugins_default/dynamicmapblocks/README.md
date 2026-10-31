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

A small table sets how players, items (grenades) and shots (bullets and rockets) treat a moving
block. **Collide** lets each stand on and bump into it, or stops the shot; switched off, they pass
straight through. Every cell is **All**, **Off**, **Blue** or **Red**, so a block can be solid to
the blue team's players, the red team's grenades and everyone's bullets (in free for all there are no
teams, so only **All** applies). A map saved before shots had their own column keeps stopping them
while players or items collide. **Rotate with block** turns players' view horizontally while riding, and carries grenades
round a turn; switched off, grenades stay where they landed as the block turns beneath them.
It is greyed when the matching collide is off, and only shown for spins and travel-facing paths. Shots never ride a block, so they have no rotate setting.
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

Two separate settings decide where a block turns and travels. **Centre on** chooses what its path is measured from: *Cell centre* (the default) leaves the block exactly where it was placed, so a thin wall stays flush with its neighbours; *Mesh centre* moves the block so the middle of its mesh sits on the middle of its cell (across, not up), as blocks used to, and the path then runs through the mesh's middle. **Pivot** chooses the point it turns about: the centre, the middle of any of the 6 sides, any of the 8 corners, or a point of your own, measured on the cell or on the mesh according to Centre on. Pivot applies to spins and to path and circle motion that turns (waypoint rotations or facing its way of travel), and waypoints are offsets from the block's start either way.

**Rotate at waypoints** (linear paths only) lets any waypoint carry its own rotation in degrees (X, Y, Z). It is optional per waypoint: tick the box on a waypoint's rotation line to give it one. A waypoint without one keeps the rotation from the waypoint before, and the first starts as the block was placed. Between two rotations the block turns smoothly in step with how far along the segment it is, about its centre, and coming back on a back-and-forth path retraces the same turns. It combines with **Face travel direction** (the waypoint rotation is the block's own, then it faces its way of travel), turns riders if **Rotate with block** is on, and is saved as a `rotation` on the point. Two waypoints in the same place make a turn on the spot, which takes about as long as moving a block of path for every radian turned (a quarter turn is about 1.6 blocks' worth of the cycle).

## Triggered movement

Tick **Only move when triggered** on a spin, linear path or circular path and the block waits until something sets it off. It has a progress from 0 (start) to 1 (end of its track): a path goes along its waypoints once (no loop or back-and-forth), a spin turns by **Turn angle**, a circle goes round once. Cycle time is the time for the whole track.

- **Triggered by:** *Contact* (something touching it; choose **Roof**, **Walls** or **Roof or walls**) or *Zone* (a sphere, cube or cylinder with a size, an offset, and an option to follow the block instead of staying where it started). **Players**, **Items** and **Shots** say who counts, each for everyone, nobody or one team. A shot counts the moment it lands on the block (or inside the zone), so pair it with a latch or cycle to make a block you shoot to open; shots are off by default and only the server sees them land. A shot is dated by the shooter's own clock like a player touching a block, and the server tells every client the moment a block is set going instead of at the next sync. A client never sees a shot land, so it does not guess for a block that shots can set off: it follows the server there (guessing would have it closing the block every tick, and being corrected at every sync). A *Cycle once* block is planned from its start: the moment it sets off, the server (or a guessing client) also schedules what happens when the track runs out, so no client waits to be told when it starts closing, snaps back or reverses. The server decides in the players' clock (up to three seconds ahead of its own, as last seen, taking the middle player's so one cannot move it for the rest) rather than its own, so it notices the end of a track and a restart at the same moment a client does.
- **While triggered:** *Run while triggered*, *Run once, then stay* (latches to the end) or *Cycle once* (runs to the end, then the release setting takes over).
- **On release:** *Pause*, *Reverse*, *Return at own speed* or *Snap to start* (a jump, so nothing rides it).
- **Timing:** start delay (must be triggered this long first), reset delay (stays triggered this long after letting go) and cooldown (after a full run it will not start again from the start for this long).

The server decides when a block is set off and tells the clients where it is headed; progress is a straight line in time between those moments, so everyone works out the same place and late joiners catch up from the next sync. Your own client starts, stops, reverses or snaps a block the instant you set it off or step off it, as a guess marked as predicted (it also counts the other players and grenades it can see, so a block does not stop for you while someone else is still on it). The server back-dates both a start and a release to the moment on the player's own clock that they stepped on or off (up to 0.3 s, and a reset delay still applies), so its answer lands on the same instant the client guessed and a 200 ms ping does not shift the block when the server's version arrives; whatever small difference is left is eased out over about a third of a second instead of snapping. A guess is dropped once the server has spoken of the same moment (within a tenth of a second) or of a later one, or if the server has not agreed within about half a second; a guess newer than anything the server has said stays, so a quick step on and off is not undone while the server is still hearing about it. A cycle the server has already ended and snapped back is not restarted by the client. A player's own clock only runs while they are simulated, so one left behind the blocks' clock by more than half a second (a hidden tab, a death) is put back on it, and a player running ahead of the server is dated by their own clock for up to half a second instead of being pulled back to the server's. The server counts each player's clock a step at a time and it creeps ahead of real time by a few milliseconds a second (so a session's offset was just how long it had been running); the server leans it back towards the blocks' clock by a hair each step, harder when it has wandered over a third of a second. The server also judges who is inside a zone or touching a block a tenth of a block more generously than a client does, since the two never agree to the last hair on where a player is and a guess the server turns down is a block that does not move for someone standing on it. Your own clock goes by state number: the server tells every client its clock for the next state to run, and each state's time is that plus a step on for each state since. After every server update the core replays your last few inputs to check where you should be and snaps you to the result if it is more than 0.2 blocks from where you are; replayed steps used to run on from the end of the real ones, so on a fast lift each was a few tenths of a block out and you were pulled about. Now every replayed step lands on the moment it first did. The F3 screen shows how far your clock is off, how your guesses fared (spot on, near, refused, lost) and where your clock goes each second (steps, replayed steps, what the server sync moved it, and so how far ahead of real time it runs). Triggered blocks are saved as `motion.trigger`.

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

`motion.collidePlayers`, `motion.collideItems`, `motion.collideBullets` and the matching `rotatePlayers`/`rotateItems` and `trigger.players`/`items`/`bullets` take `true` (everyone), `false` or `"blue"`/`"red"`. `collidePlayers` and `collideItems` default to true, `collideBullets` to whatever either of those does, `trigger.bullets` to false; `motion.rotateItems` defaults to true. Players and grenades ride moving blocks through one shared path (`ride()`): carried while grounded on a block and pushed out of a block that moves into them. A snap back is a jump, so nothing rides it. When a moving block pushes a player or grenade towards the map, the map wins by default (they are squeezed against it); set **Pushing into the map** to **Block pushes through** (`motion.pushThroughMap`) to make the block win. The block itself never collides with static map blocks. **Crush** is a third choice for **Pushing into the map**: the map still wins, but a player squeezed between the block and the map takes the **Crush damage** (hp, default 999 = instant kill) every half second, through the normal hit so everyone sees it. Dying this way is the player's own death, so no kill is credited. Only the server applies it, and only to players: grenades are not harmed. Saved as `motion.crush`. Their velocity stays in world space; the block's motion is applied by the ride, never stored. With moving blocks in the map a grenade steps like a player does: one box, moved an axis at a time, tested by the same collision the players use. It bounces with core's own factor off whatever it meets, counting how fast that surface is moving, so a block that runs into it knocks it away; it stops once it lands, as a player's landing does. A grenade thrown hard into a crate can bounce back out of the open end, as it would from a still one.

`motion.rotatePlayers` defaults to false. When enabled for spin or travel-facing paths,
a supported player follows horizontal platform rotation while retaining their mouse-look
offset. Pitch and roll stay upright. Local player input records the turn before simulation;
replays and remote players use the recorded yaw, avoiding a second turn.
