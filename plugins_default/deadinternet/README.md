# DeadInternet

Adds bot players to your game. As of this version, DeadInternet also ships a general-purpose
**A\* pathfinding engine** over the game's real voxel collision grid, so bots (or any other
plugin) can navigate maps naturally — walking, using ramps, jumping single-level gaps, falling
off ledges, and climbing ladders.

## Files

| File | Role |
|---|---|
| `index.js` | The plugin's public API surface. Other plugins should import from here. |
| `pathfinding.js` | The A\* engine itself. Pure/framework-agnostic — takes a `room`-shaped object and plain `{x,y,z}` positions, knows nothing about bots or players. |
| `shared.js` | Demo/test commands only (`/bots add`, `/bots pathtest`) and the client-side plugin registration glue. Not the reusable API — see "Scope" below. |
| `test-pathfinding.js` | Standalone unit tests for `pathfinding.js`. No server needed. |
| `test-ingame.js` | Live integration test — drives a real running game server as a raw WebSocket client and triggers `/bots pathtest`. |

## Scope: index.js is the API, shared.js is the demo

`index.js` (plus the pathfinding functions it re-exports from `pathfinding.js`) is meant to be
the thing other plugins import from:

```js
import { DeadInternetBot, findPath, isStandable, EDGE_TYPE, MOVEMENT_PROFILE } from '../deadinternet/index.js';
```

`shared.js`'s two commands (`/bots add`, `/bots pathtest`) are real working examples of driving a
bot, kept there deliberately so the test/demo surface stays separate from the API other plugins
build against. If you're looking for how to *use* `DeadInternetBot`, read `shared.js` for
working examples — but depend on `index.js`, not `shared.js`.

## Pathfinding API (`pathfinding.js`, re-exported from `index.js`)

### `findPath(room, start, goal, opts = {})`

A\* search from `start` to `goal` (both `{x, y, z}` world positions — a real `Player` instance
works directly since it has those properties). Returns an array of waypoints, or `null` if no
path exists.

Each waypoint is `{ x, y, z, type }`: `x`/`z` are cell centers, `y` is the standing height at
that cell, and `type` (one of `EDGE_TYPE`) describes how to get from the *previous* waypoint to
this one.

`opts`:
- `maxExpansions` (default `4000`) — search node budget before giving up.
- `avoidEdges` — a `Set` of `"x,y,z->x,y,z"` strings naming edges to skip entirely. Used by
  `DeadInternetBot`'s stuck-recovery to route around an edge that turned out not to be
  physically traversable, without the exact same edge just getting re-selected on the next
  search (see "Self-correcting execution" below).

The start position doesn't need to land exactly on a standable cell — `findPath` searches
around/below it first (handles being mid-jump, mid-fall, or right at a cell boundary when the
search is triggered).

### `EDGE_TYPE`

```js
{ WALK: 'walk', RAMP: 'ramp', JUMP: 'jump', FALL: 'fall', LADDER: 'ladder' }
```

- **WALK** — same-level move, 8-directional (includes diagonals).
- **RAMP** — one level up via a `wedge`/`iwedge` collider (cheap — no jump needed).
- **JUMP** — one level up via a standing jump, no ramp involved. Weighted heavily (cost `4` vs.
  `1.1` for a ramp, `1` for a walk) because live testing showed a standing jump clearing a full
  level is frequently unreliable in practice — the planner only reaches for one when there's
  genuinely no walk/ramp/fall route around it.
- **FALL** — walking off a ledge, landing up to `MOVEMENT_PROFILE.maxFallLevels` cells below.
  There's no fall damage in this game, so these are allowed fairly liberally, just cost-weighted
  by drop distance so a gentler path is preferred when one exists.
- **LADDER** — climbing a stack of `ladder` collider cells, including stepping off at the top
  onto solid ground.

### `MOVEMENT_PROFILE`

```js
{ maxJumpLevels: 1, maxFallLevels: 4, arrivalRadius: 0.3 }
```

These are **estimates**, not exact physics — derived from reading `player.js`'s real movement
constants (jump initial velocity, gravity, the documented "a jump pad's dy=0.13 clears approx 3
blocks" comment used as a calibration anchor), not hand-tuned to match the physics engine
exactly. `test-pathfinding.js` sanity-checks them; `DeadInternetBot.followPath()`/`checkStuck()`
are what actually make an imperfect value harmless at runtime (see below) rather than stranding
a bot.

### `isStandable(map, x, y, z)` / `isBlockingCell(cell)` / `isLadderCell(cell)` / `isRampCell(cell)`

Lower-level cell classification helpers, exported in case a consuming plugin wants to reason
about the grid directly rather than only through `findPath`.

## Collision model handled

Every real `colliderType` from `buildMapData` (`src/shell/loading.js`) is accounted for:

- `full` — blocks fully, no edge offered through it.
- `wedge` / `iwedge` — ramps; walkable up onto, and enables the cheap RAMP edge type for an
  adjacent level-up move.
- `aabb` / `obb` — custom collision geometry; treated as fully blocking (same as `full`) for
  pathfinding purposes.
- `ladder` — climbable via dedicated LADDER edges, matched by `ry` between stacked ladder cells
  the same way `player.js`'s real `lookForLadder` does, so the planner never offers a climb the
  physics engine would reject.
- `none` — passable, no collision.

## `DeadInternetBot` pathfinding methods (`index.js`)

- **`pathTo(target, opts = {})`** — computes/recomputes a route to `target` (anything with
  `x`/`y`/`z`, including a `Player`). Throttled to at most once per second by default
  (`opts.recomputeIntervalMs`) unless `opts.force: true` — safe to call every tick to chase a
  moving target without re-running A\* 60 times a second. Clears the bot's avoided-edges set
  whenever the destination itself changes.
- **`followPath()`** — call once per tick (typically from `onUpdate`) to steer along the last
  computed path: sets yaw, holds forward, jumps when the active waypoint is a JUMP edge. Returns
  `'idle'` (no path), `'following'`, or `'arrived'`.
- **`stopPath()`** — clears the current path/progress state.

### Self-correcting execution

`MOVEMENT_PROFILE`'s constants are estimates, and other players/bots can wander into a planned
route — rather than trying to model every failure case up front, `followPath()`/`checkStuck()`
detect when the bot hasn't actually made horizontal progress in a while and react in two stages:

1. **~600–900ms stuck** — a cheap `jump()` nudge (fixes most "technically blocked by a lip"
   cases).
2. **≥1800ms stuck** — blacklists the specific failing edge into the bot's own
   `pathAvoidedEdges` set and forces a full replan via `pathTo(..., { force: true })`. Blacklisting
   the exact edge (not just "try again") matters — without it, a replan from the same position
   just finds and re-selects the same bad edge forever, since nothing about the map changed.

This is why `MOVEMENT_PROFILE` doesn't need to be physically exact: an imperfect estimate costs
at most ~1.8s of stall before the bot routes around it.

## `/bots pathtest` (shared.js, demo command)

`permissionLevel: [Guest, Guest, false]`, not `isCheat` — deliberately low-ceremony since it's a
read-only debug aid rather than anything gameplay-affecting. Anyone in the room can run it, no
game-owner requirement.

Spawns one bot that **wanders forever between random spawn points** on the map (`room.spawnPoints`,
the same list the real spawn-selection logic in `rooms.js` draws from) — not to wherever you're
standing. Each time it picks a new destination, and each time it arrives, it announces it via
`ctx.room.notify` (visible in chat) and logs the full detail server-side:

- On picking a destination: the target coordinates and the route's waypoint count/edge-type
  breakdown (e.g. "5 walk, 1 ramp, 1 jump").
- On arrival: the arrival position, followed 1 second later by a new random destination.
- If a particular spawn point turns out unreachable, it says so and tries another after the same
  1-second beat, rather than getting stuck.

Targeting random spawn points instead of your position is deliberate: spawn points are scattered
around the map by design, so routes between them reliably exercise ramps/jumps/falls/ladders on
their own — no need to manually go stand somewhere tricky first. Just run the command and watch
it go; it'll keep looping (including respawning and resuming after it dies) until you stop the
bot yourself (e.g. by removing it from the room).

## Testing

### `test-pathfinding.js` — unit tests, no server required

```bash
node plugins_default/deadinternet/test-pathfinding.js
```

Builds synthetic `room.map`-shaped fixtures and asserts on `findPath`'s output for: flat floor,
wall with a gap, jumpable parapet, an unclimbable wall (correct refusal), a ramp, a ladder shaft
(exactly the expected LADDER-only edges), a sealed/unreachable goal (correct refusal), an
imprecise start position, and direct `isStandable` checks. 21 assertions, all passing.

### `test-ingame.js` — live integration test against a real running server

```bash
node plugins_default/deadinternet/test-ingame.js [gameHost] [gamePort]
```

Defaults to `localhost:13372`. Requires `services` + `game` already running. Connects as a raw
WebSocket client (using the real `Comm` class for correct wire framing — no browser, no
rendering), joins a fresh private room, sends `requestRespawn` to get a real position, then
issues `/bots pathtest`. The actual proof of correctness is the **game server's own console
output** (route summary, 1s position samples, arrival time) — this script deliberately doesn't
fully parse incoming payloads itself; watch the server log while it runs.

Confirmed via repeated live runs against the "Two Towers" map: consistent successful arrivals in
the 14–16 second range, including routes requiring ramps, falls, and (when unavoidable) jumps,
with automatic recovery via the replan/avoid-edge mechanism on the rare edge that didn't clear
as estimated.

**Gotchas if you're testing from a non-git-cloned working copy** (e.g. a scratch/throwaway
server instance):
- Every plugin folder must be its own git repo with at least one commit — the plugin loader
  (`src/shell/plugins.js`) silently skips (never instantiates) any plugin whose
  `git rev-parse HEAD` fails, with no fatal error.
- A raw WS test client like `test-ingame.js` needs to send `requestRespawn` before it has a real
  position — without it, a target position of `(0,0,0)` isn't on the map and `findPath` will
  (correctly) refuse it as unreachable.
- Chat messages must be packed with `packLongString`, not `packString` — `client.js`'s chat
  handler reads a 2-byte length prefix; the 1-byte-prefix `packString` garbles the text.

## Not yet implemented

Aiming, firing, and other "natural player-like" combat behavior — out of scope for this pass.
Pathfinding/navigation only.
