# dynamicmapblocks

Shared kinematic platforms, physics editing, teleporters and signs for placed map blocks.
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

**Group blocks** makes several blocks one platform: they spin, travel and carry riders together,
as a single rigid body with one set of settings. With a block selected, press **Group blocks**
(or just hold Shift) and click more blocks to add them; click a block that is already in the group
to drop it again. Each block of a group is outlined on its own, and the panel says how many move as one.
Nothing is saved until **Apply**. A block can only be in one group, and a group holds up to 128 blocks.
Centre and corner pivots are measured on the whole group, so **Centre** turns the group about its middle.
Dropping every block but one leaves an ordinary single block; choosing **Static** and **Apply**
breaks a saved group up. A new group needs a movement first, as a static group is no group at all.

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
back along the plane's first axis. **Offset** (X/Y/Z blocks) moves that centre, and **Rotate** (X/Y/Z degrees) turns the whole circle about its centre, so the block starts somewhere else on it; use both to place an orbit around any point at any angle. **Face travel direction** rotates along a linear
or circular path. For waypoint paths, **Turn time** is the rotation time after each
corner: 0 snaps, larger values ease in and out using quaternion interpolation. Choose whether
the turn happens **after the corner** (the default), **before the corner**, or **half before, half after**.
Long turns are capped at half the neighbouring segment's duration on each side so the next corner remains distinct.
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

## Signs

Pick a block from **SIGNWALL**, **SIGNSTAND** or **SIGNBUBBLE** and place it. Its message
and settings open straight away. **Apply** finishes the placement; **Cancel** removes
a new sign. Click a sign to edit it, or open **Signs** and pick one. Hold Shift to
eyedrop its model, rotation, message and settings, then place another. Shift-click
with the normal building tool to build against an existing sign instead of editing it.
Signs place one at a time, including when a fill tool is selected.

**SIGNWALL** and **SIGNSTAND** each have wood and metal boards. Their words are drawn
on the board, with an ink colour, left/centre/right alignment, automatic wrapping and
fitting. **SIGNBUBBLE** has a question-mark plaque, question-mark pedestal, speaker
box, mailbox and open book on a lectern. Look directly at one within its **Read within**
distance (1–12 blocks) to see its message. Walls block the view. Leaving, looking away
or dying hides it. Messages are plain text, up to 512 characters and 12 lines; HTML
is never interpreted. There can be 128 configured signs per map.

The normal save/open, backups, undo, map movement and local/online tests keep signs.
Deleting or replacing their block removes the assignment. Text follows a block's
quarter turns and platform movement too. `client/signs.json` shows all nine models;
`client/signs-stress.json` has 128 signs, half written boards and half bubble props.

### Making sign models

Use `SIGNWALL.name.mesh`, `SIGNSTAND.name.mesh` or `SIGNBUBBLE.name.mesh`. The root
holds the merged visible geometry. For boards, add one or more child plane meshes
whose names contain **TEXT** (case insensitive). Their geometry, UVs and full local
transforms define where and how large the writing is. Move, rotate or scale the
plane in the model; there is no table of text offsets in the plugin. Optional root
`metadata.signInk` sets the editor's default ink colour (pale on the bundled boards).
The TEXT planes
are hidden helpers, replaced with non-pickable lettering when rendered. Other child
meshes supply regular triangle collision, irrespective of their order. TEXT never
collides. Bubble props need no TEXT plane. The block viewer's **Text surfaces** button
shows the helpers in blue, separately from the orange collision overlay, and its
definitions explain the two behaviours. Imports/exports retain the authored helpers.

Rebuild the bundled models with `node plugins_default/dynamicmapblocks/build-model.js`;
`build-signs.js` supplies the sign parts. Restart the client and game servers together.

Saved under `extents.signs`:

```json
{ "block": { "mesh": "SIGNSTAND.wood.mesh", "x": 4, "y": 1, "z": 7 },
  "text": "WATCH YOUR SHELL", "color": "#302315", "align": "center", "range": 5 }
```

Positions use the saved map origin, as for platforms. Rotation comes from the block.
Bad or duplicate entries are discarded independently; assignments to missing blocks
are ignored. No sign-specific opcode or server simulation loop is added.

### Sign checks and performance

Run `node plugins_default/dynamicmapblocks/test-signs.js`, the existing `test.js`,
and `node plugins_default/blockviewer/test-viewer.mjs`. Checks cover authored transforms,
child order and collision, validation, origin changes, deletion, wrapping, moving text,
gameplay model names, parented and multiple cameras, range, occlusion, shared textures
and repeated disposal. Browser checks covered placement, cancel, editing, eyedrop,
single-step undo, save/reload, both message types and the viewer overlay.

`node plugins_default/dynamicmapblocks/profile-signs.js` measures 10,000 targeting
queries after warming up. On 2026-10-31, Node 20 measured 0.003 ms per query with 128
distant props and 0.018 ms while aiming at one (99th percentile 0.037 ms). This excludes
browser occlusion and rendering. Static boards have no frame callback, letters are
uploaded once, and equal messages on equal-sized surfaces share a texture. Bubble
queries run at most ten times a second and only change the DOM when the target changes.

In the actual game's Local Test, Chrome 155 / WebGL 2 on an RTX 3060 Laptop GPU at
1280 × 720, four alternating 4-second samples on the 128-sign stress map measured
2.86 / 5.27 / 4.48 / 3.03 ms of render CPU time (off / on / on / off). The same map
geometry remained loaded throughout: this isolates lettering and bubble handling.
The difference was about 1.9 ms per rendered frame. Targeting including occlusion
averaged 0.10–0.17 ms per query. These measure JavaScript and render submission, not
completed GPU time or an FPS guarantee. Disposing signs returned textures from 76
to 12 and scene meshes from 3163 to 2907 in both baseline samples.

`node plugins_default/dynamicmapblocks/test-ingame.js 4 20 signs localhost 13372`
also exercised the stress map on a live game server with four headless clients;
`nosigns` repeats the same geometry without message metadata. Both runs joined
and continued exchanging updates. Initial map transfer is larger with messages;
normal sync does not carry sign text.

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
- `teleporters.js`: pad definitions and limits, the shared step-in rule, destinations and how an egg, grenade or shot leaves.
- `editor-teleporters.js`: the **Teleport** panel. `TeleporterEditorState` (`editor-state.js`) keeps its pads, `TeleporterGuides` (`guides.js`) and `TeleporterRender` (`render.js`) draw them.

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
`circleOffset` (blocks, up to 64) moves the centre and `circleRotation` (`{x, y, z}` degrees, yaw/pitch/roll order) turns the circle about it.
Path and circle motion accept `orient: true` and `headingOffset` in degrees.
Waypoint paths additionally accept `turnDuration` in seconds (0 means an instant turn) and
`turnWhen`: `"after"` (default), `"before"` or `"both"` for when that turn happens around the corner.

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

## Teleporters

Pads that send whatever steps into them somewhere else. Open **Teleport** (beside **Physics**), click a block and choose **Sends eggs** (a pad that sends), **Exit only** (a pad eggs can only come out of) or **Off**, then press **Apply**. A pad is a plain block that stays where it is: it can also be a moving platform, and deleting or replacing the block removes the pad. **Preview** plays the draft (or, from **⋯**, every pad with **Preview all**) with a ghost egg hopping along its arc; **Show all links** draws every pad's zone, link and exit, green marking the way in. **Copy settings** and **Paste settings** carry a pad's settings to another block.

- **Sends to:** *Another teleporter* (choose one, or press **Pick** and click a block: a block that is not a pad yet becomes an exit-only one; **Both ways** makes the other send back here too), *A point* (absolute coordinates) or *An offset* (from this block's centre), the last two with their own exit facing.
- **Exit** is where eggs land when something is sent *to* this pad (X/Y/Z from the block's centre, 0.5 up is the top of a full block) and **Facing** is the way they face (0 is +Z, 90 is +X). **Keep position in zone** comes out as far off the middle as it went in, turned round with the exit.
- **Zone** is a cylinder, sphere or cube (same size controls as a trigger zone) with an offset. The default covers an egg walking over a floor pad or standing on a block. **Side** puts the pad on the top, the bottom or any of the four walls of its block (choosing one moves the zone, exit and facing to suit that face), and **Spin** turns the zone about that face. The zone's own axes follow the side: its height runs out of the face and a cube's half sizes are along and across it. The portal lies on the face too, and a cube zone gets a square frame instead of a ring. Going into a wall pad means heading against its face, so something sent from one comes out of another pad's face heading straight out of it.
- **Who it sends:** players, items (thrown grenades) and shots (bullets and rockets), each for everyone, nobody or one team. Shots are off by default.
- **On the way:** *Speed* is kept, stopped dead, turned round with the exit or launched (a speed in blocks/second, which friction soon eats), and *View* is kept, turned with the exit or set to face it. **Charge** is how long something must stand in the zone first, **Cooldown** how long before the same thing can be sent again.
- **Powered by** a triggered block: it only works once that has moved, while it is at its end, or while it is at its start.
- **Look:** a colour, **Show portal** and a **Puff of smoke** where it goes in and comes out. A pad with a power block also has a deactivated look: **When off** is a *Dim ring*, *Hidden* or the *Full portal*, with an optional **Off colour**, and the portal switches as the block's progress does. **Show deactivated look** in **⋯** previews it.

Something is sent when it comes *in from outside* a zone, so what is put inside one (a spawn, an exit, a block that just landed) is never sent straight back, and has to leave and come back in first. Nothing extra is sent over the network: the server and every client run the same rule on the same position, each thing carrying a ledger of the pad it was in last tick (kept per state for you, so replays after a server correction land the same way). A hop the client missed is put right by the server's normal correction. Your view turns through the yaw you send as input, so the server hears it like any other turn. An exit that is inside something is tried up to a block higher, and a send is refused (with no cooldown) if it cannot be placed. Shots go through the first pad their path crosses, are sent on from the exit with their range worked out again, and go through at most 8 pads. A pad on a moving block stays where it was placed, and bots and explosions do not know about pads.

Saved as `extents.teleporters`, positions as for platforms (the saved map's origin). Only `id` and `block` are needed:

```json
{ "id": "tp-a", "block": { "mesh": "shipyard.crate-wood.full", "x": 4, "y": 0, "z": 4 },
  "to": { "type": "link", "id": "tp-b" }, "facing": 45, "bullets": true,
  "zone": { "shape": "cylinder", "radius": 0.45, "height": 0.75, "offset": { "y": 0.4 } },
  "velocity": "turn", "view": "turn", "charge": 0, "cooldown": 0.5,
  "power": { "id": "door", "when": "moved" }, "look": { "color": 0 } }
```

`to` is `{ "type": "link", "id" }`, `{ "type": "point", "x", "y", "z", "facing" }` or `{ "type": "offset", ... }`. `send` is false for exit-only. `side` is `top` (the default), `bottom`, `x+`, `x-`, `z+` or `z-`, and `rotation` is the spin in degrees; neither is written for a pad on top that is not turned. `look.off` is `dim` (the default), `hide` or `keep`, and `look.offColor` a colour number. `players`, `items` and `bullets` take `true`, `false`, `"blue"` or `"red"`. `velocity` is `keep`, `stop`, `turn` or `set` (with `speed`, 0–30) and `view` is `keep`, `turn` or `face`. `power.when` is `moved`, `end` or `start`. `client/teleporters.json` is a small example map with a two-way pair, a one-way pad to the top of a tower, and a pad on the tower's wall that only works once you have stepped on the pressure plate (dim coral until then, lime after). `client/teleporters-showcase.json` ("Teleporter Showcase", 30 × 12 × 33) shows off all of it at once, using all 32 pads and three physics blocks, with a wooden standing sign explaining each station and pad. Spawn in the middle and walk to each station: **A** (north west) a two-way pair that turns your view; **B** (north) speed stopped, turned and launched; **C** (north east) sent to a point and to an offset, onto a platform in the air; **D** (west) a cube with a pad on every face sending you round it, a spun cube zone, and a pad on the underside of a block to walk under; **E** (south west) pads for blue only, red only, grenades only and shots only (the team ones need the Teams mode; throw a grenade or shoot at the others); **F** (east) charge two seconds, a four second cooldown, and keep position in zone; **G** (south) three pads powered by a pressure plate (once it has moved, while it is down, until it is pressed, each with its own deactivated look), a pad that sends you onto a spinning disk to be carried round, and a pad that sends you onto a lift that rises while you stand on it. Limits: 32 pads, one per block, zones .25–64, charge up to 10 seconds, cooldown up to 60. A bad pad is dropped on its own and the rest still work. F3 (with `debugf3`) shows the pad count and the last hop.

Performance (2026-10-31, Node 20 and Chrome 152 on an RTX 3060 Laptop GPU). `node plugins_default/dynamicmapblocks/profile-teleporters.js latest 3000` puts a standing player's tick at .041 ms with no pads, .054 ms with 32 and .047 ms hopping every tick; 100 shots in flight near 32 shot pads cost .06 ms a tick (the worst case, every shot hopping every tick, is .5 ms with a 3 ms 99th percentile) and 20 grenades .02 ms. `node plugins_default/dynamicmapblocks/test-ingame.js 6 40 pads` (headless bots in one room on a running game server, `nopads` for the same map without them) kept a real room at 60 ticks a second with the room worker 5.4–5.9% busy against 5.3–5.5% without pads and the same 3.0 KiB/s a bot either way; each player step through the pad rule took 1–3 µs. In a real browser (the editor's Test, patrolling back and forth through the pads, three runs each way in turn on the same map), the game's frame callbacks took 78.8 ms of JavaScript a second on average against 76.5 without pads (99th percentile 3.6 ms against 3.5 ms), a difference smaller than the spread between runs. The portal is drawn from static meshes with one ring moving up each beam: fading a material's alpha every frame made Babylon re-check it and cost more than the rest of the portal together (188 ms a second), so only positions and scales are animated.

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

Teleporters also use `game:updateBefore` (turning the view), `game:onPlayerDeath`, `game:inGameSync2` and `game:inGameSync3` (a snap instead of a glide after a correction), and watch `Bullet` and `Rocket` `update` the way `fireThis` is already watched.

Editor JavaScript uses `pluginSourceInsertion` with `position: 'editor'`. The remaining
HTML insertion loads the panel stylesheet; shader changes use `shaderSources` and its
existing GLSL anchors. Neither edits game function source text.

`motion.collidePlayers`, `motion.collideItems`, `motion.collideBullets` and the matching `rotatePlayers`/`rotateItems` and `trigger.players`/`items`/`bullets` take `true` (everyone), `false` or `"blue"`/`"red"`. `collidePlayers` and `collideItems` default to true, `collideBullets` to whatever either of those does, `trigger.bullets` to false; `motion.rotateItems` defaults to true. Players and grenades ride moving blocks through one shared path (`ride()`): carried while grounded on a block and pushed out of a block that moves into them. A snap back is a jump, so nothing rides it. When a moving block pushes a player or grenade towards the map, the map wins by default (they are squeezed against it); set **Pushing into the map** to **Block pushes through** (`motion.pushThroughMap`) to make the block win. The block itself never collides with static map blocks. **Crush** is a third choice for **Pushing into the map**: the map still wins, but a player squeezed between the block and the map takes the **Crush damage** (hp, default 999 = instant kill) every half second, through the normal hit so everyone sees it. Dying this way is the player's own death, so no kill is credited. Only the server applies it, and only to players: grenades are not harmed. Saved as `motion.crush`. Their velocity stays in world space; the block's motion is applied by the ride, never stored. With moving blocks in the map a grenade steps like a player does: one box, moved an axis at a time, tested by the same collision the players use. It bounces with core's own factor off whatever it meets, counting how fast that surface is moving, so a block that runs into it knocks it away; it stops once it lands, as a player's landing does. A grenade thrown hard into a crate can bounce back out of the open end, as it would from a still one.

`motion.rotatePlayers` defaults to false. When enabled for spin or travel-facing paths,
a supported player follows horizontal platform rotation while retaining their mouse-look
offset. Pitch and roll stay upright. Local player input records the turn before simulation;
replays and remote players use the recorded yaw, avoiding a second turn.
