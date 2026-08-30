// A* pathfinding over the same voxel grid `#collider`/`player.js` use for real collision -
// `room.map.data[x][y][z]`, populated by `buildMapData` (src/shell/loading.js). Deliberately
// independent of DeadInternetBot/Player - everything here takes a plain `room`-shaped object
// ({ map: { data, width, height, depth } }) and plain {x,y,z} positions, so any plugin can use
// it without pulling in the bot-spawning machinery from index.js.
//
// Cell shape (see buildMapData, the canonical source for this): `{}` for empty/passable cells,
// or `{ idx, mesh: { colliderType, theme, name, softness }, rx, ry, rz, ... }` for occupied ones.
// `colliderType` is one of full/wedge/iwedge/aabb/obb/ladder/none - see
// wiki/docs/03-Content Creation/map-blocks.md for what each one actually means physically.
//
// Movement-capability constants below (jump height/gap, step height, fall tolerance) are used to
// generate CANDIDATE edges cheaply (topology discovery) and as the offline fallback when no real
// player is available to verify against (see test-pathfinding.js's synthetic fixtures). Whenever
// a real, live player IS available (the normal in-game case - see physicsSimulation.js's
// canSimulate()), every WALK/RAMP/JUMP/FALL candidate this file generates gets verified against
// real game physics before being offered to the planner, rather than trusted on the strength of
// these estimates alone - see the simulateEdgeCached() call in findPath() below. That's the
// actual fix for the class of bugs these estimates alone kept producing (corner-cutting through
// walls, "walkable" cells whose real footprint is thinner than a grid cell, jump-height guesses
// that didn't match real physics) - no amount of tuning constants fixes a model that's
// approximating something a few lines of real simulation can just check directly.

import { simulateEdgeCached, canSimulate } from './physicsSimulation.js';

export const EDGE_TYPE = {
    WALK: 'walk',
    RAMP: 'ramp',
    JUMP: 'jump',
    FALL: 'fall',
    LADDER: 'ladder',
};


export const MOVEMENT_PROFILE = {
    maxJumpLevels: 1, // how many grid levels a standing jump can clear at the DEFAULT (1.0x) modifiers - see effectiveMaxJumpLevels for the modifier-scaled version actually used
    maxFallLevels: 4, // how far a bot will voluntarily walk off a ledge (no fall damage in this game, but an unbounded drop looks unnatural and can strand a bot in an unreachable pit)
    maxJumpGapCells: 3, // furthest horizontal distance (in cells) a running jump across a gap will attempt at the DEFAULT modifiers - see effectiveMaxJumpGapCells
    arrivalRadius: 0.3, // how close (horizontally) to a waypoint counts as "reached it" - keep below 0.5 (half a cell) so a bot never overshoots into the next cell before advancing
};

// The constants above assume default (1.0x) gameOptions modifiers - a gamemode with
// jumpBoostModifier: 2 genuinely lets a real player clear more than one level, but candidate
// generation used to hardcode "one level, y+1" no matter what, so the planner would never even
// TRY a jump the real physics would happily allow. These derive the actual achievable range from
// the same modifiers player.js's own physics reads (this.dy = 0.06 * jumpBoostModifier for jump
// impulse, gravity decel = 0.003 * gravityModifier, horizontal speed = base * speedModifier - see
// player.js's simulateMovement), so a boosted/low-gravity/fast gamemode widens what's worth
// trying, and a nerfed one narrows it, without needing an exact physics match - real-physics
// verification (simulateEdgeCached) is still what actually decides whether any given candidate
// this widening offers really works, same as every other candidate this file generates.
function effectiveMaxJumpLevels(player) {
    const jumpBoost = player?.modifiers?.jumpBoostModifier ?? 1;
    const gravity = player?.modifiers?.gravityModifier ?? 1;
    if (jumpBoost === 1 && gravity === 1) return MOVEMENT_PROFILE.maxJumpLevels;
    // Apex height for a fixed initial impulse v0 under constant deceleration g is v0^2/(2g) - v0
    // itself scales linearly with jumpBoostModifier, so height scales with jumpBoost^2/gravity.
    const scale = (jumpBoost * jumpBoost) / Math.max(gravity, 0.01);
    return Math.max(1, Math.round(MOVEMENT_PROFILE.maxJumpLevels * scale));
}
function effectiveMaxJumpGapCells(player) {
    const jumpBoost = player?.modifiers?.jumpBoostModifier ?? 1;
    const gravity = player?.modifiers?.gravityModifier ?? 1;
    const speed = player?.modifiers?.speedModifier ?? 1;
    if (jumpBoost === 1 && gravity === 1 && speed === 1) return MOVEMENT_PROFILE.maxJumpGapCells;
    // Time-to-apex (and so total hang time) for the same impulse/decel pair scales linearly with
    // jumpBoost/gravity (t = v0/g); horizontal range is that hang time times ground speed.
    const scale = speed * (jumpBoost / Math.max(gravity, 0.01));
    return Math.max(2, Math.round(MOVEMENT_PROFILE.maxJumpGapCells * scale));
}

const HORIZONTAL_8 = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
];
const HORIZONTAL_4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function inBounds(map, x, y, z) {
    return x >= 0 && x < map.width && y >= 0 && y < map.height && z >= 0 && z < map.depth;
}

// Floors y defensively - most callers already pass an integer, but a half-height aabb/obb step
// (see findAabbStandY / the half-step neighbor generator) can leave a genuinely fractional y on a
// graph node, and `map.data[x][y][z]` with a non-integer y is a bare array index into nothing,
// throwing rather than returning undefined. "Which integer cell contains this fractional height"
// is exactly the question a caller actually wants answered here (e.g. "is the cell THIS half-step
// sits on top of a ramp") - confirmed by testing: without the floor, this crashed the whole room
// worker on "HalfTestMap" the moment a half-step node reached the physics-verification step.
function cellAt(map, x, y, z) {
    const fy = Math.floor(y);
    if (!inBounds(map, x, fy, z)) return null;
    return map.data[x][fy][z];
}

// A cell "blocks" the player's body if it's occupied by anything other than `none` - `ladder`
// included, since ladder cells DO collide with the player (see collider.js's meshCollidesWithCell
// - the ladder case only skips collision for non-player probes like bullets). Climbing through a
// ladder cell is a distinct mechanic (player.js's lookForLadder), not "the cell is passable".
export function isBlockingCell(cell) {
    if (!cell || !cell.idx || !cell.mesh) return false;
    return cell.mesh.colliderType !== 'none';
}

export function isLadderCell(cell) {
    return !!(cell && cell.idx && cell.mesh && cell.mesh.colliderType === 'ladder');
}

export function isRampCell(cell) {
    return !!(cell && cell.idx && cell.mesh && (cell.mesh.colliderType === 'wedge' || cell.mesh.colliderType === 'iwedge'));
}

// A wedge/iwedge's real collision mesh (see collider.js's wedgeCollisionMesh/iwedgeCollisionMesh)
// is a box tilted -45 degrees around X, giving it a genuine diagonal slope along the Z axis at
// ry=0 - the per-instance `ry` then rotates that whole slope around Y, so which horizontal axis
// is actually climbable depends on ry, not just "is this cell a ramp". Approaching along the
// WRONG axis hits the wedge's flat, vertical end faces instead of the slope - a solid wall, which
// no amount of run-up or jump timing clears. Confirmed on "PathTestMap": a wedge with ry=0 (slope
// along Z) completely blocked every X-axis approach in real physics, at every height tried,
// while its own comment already noted ramps "may not register a collision right at the center-top
// point" - both symptoms of the same thing, treating a directional incline as if it were
// omnidirectionally walkable.
//
// The raw map FILE stores ry as a 0-3 facing index (confirmed directly by the map author), but
// the RUNTIME cell object this function actually receives (from cellAt(), sourced from the loaded
// map/mesh data) already carries that converted to radians by the loading pipeline before this
// code ever sees it - confirmed directly by inspecting a live cell's ry: exactly
// Math.PI (3.14159...) for a raw ry=2 wedge, not the integer 2. Multiplying by Math.PI/2 again
// here (an earlier version of this function did exactly that, following the raw-file format
// instead of the runtime one) double-converts an already-converted value into nonsense - the
// direct cause of a real regression, confirmed live: it broke a previously-working, already-
// verified wedge entry the moment it landed. cell.ry is used as-is, in radians, matching the
// runtime data this function actually operates on.
function rampClimbAxisIsX(cell) {
    return Math.abs(Math.sin(cell.ry)) > 0.5;
}

// The EXACT uphill direction (unit vector, x/z), not just which axis it's mostly along -
// rampClimbAxisIsX only answers "is this closer to X or Z", useless for aiming a sweep precisely.
// At ry=0 the canonical mesh's slope rises along +Z (see rampClimbAxisIsX's own comment on the
// wedge's bake order); a per-instance ry is a rotation around Y, which carries that same direction
// to (sin(ry), cos(ry)) - cell.ry already in radians at runtime (see rampClimbAxisIsX's own
// comment on why no extra conversion belongs here). Used to derive the exact sweep direction for
// findRampExitXZ.
function rampSlopeAxis(cell) {
    return { x: Math.sin(cell.ry), z: Math.cos(cell.ry) };
}

// True when moving (dx,dz) into/out of a ramp cell would approach PURELY from the wrong axis - a
// solid wall from the ramp's perspective, not a climbable slope. Only blocks a move with ZERO
// component along the climb axis, not a diagonal one - reported live by the map author (and
// confirmed as intentional map design, not a fluke) that a genuinely diagonal approach onto a
// wedge at "PathJumpHardTest" checkpoint5->goal is the actually-intended, fully-traversable route,
// which a blanket "any cross-axis component blocks it" version ruled out at the static-
// classification stage before the edge was ever even offered for real-physics verification. This
// only matters for the WALK generator (see its own HORIZONTAL_8/diagonal handling) - the ramp-
// climb generator a few lines below only ever iterates cardinal (dx,dz) pairs via HORIZONTAL_4, so
// dx*dz is always 0 there and this change is a no-op for it. Loosening the STATIC gate, not
// declaring diagonal ramp approaches universally safe - simulateEdgeCached (see getNeighbors'
// verification block) still has to actually approve any edge this lets through, the same real-
// physics check every other WALK/RAMP/JUMP/FALL edge in this file already answers to, so a
// genuinely bad diagonal approach on some OTHER ramp still gets rejected there, not here.
function rampBlocksDirection(cell, dx, dz) {
    if (!isRampCell(cell)) return false;
    return rampClimbAxisIsX(cell) ? (dz !== 0 && dx === 0) : (dx !== 0 && dz === 0);
}

// A ramp/wedge cell's real collision mesh is a diagonal incline, not a flat floor at the cell's
// nominal integer y - simulating a player starting exactly at that y, at the cell's horizontal
// center, can land them BELOW the incline's actual surface at that xz point (partway up the
// slope, on the low side, or even inside the raised/vertical face on the high side depending on
// the wedge's `ry` orientation), embedding them in solid geometry with no direction to escape.
// A single fixed offset (e.g. always y+0.5) isn't reliable across every ry/iwedge combination -
// confirmed on "PathTestMap": two different wedges, different ry, both left the player unable to
// move in ANY direction at y+0.5. Probing a small ladder of candidate heights and using the real
// collider to find one that's actually clear sidesteps needing to decode the wedge's exact slope
// direction from ry by hand. Falls back to the old +0.5 guess offline (no real player/Collider to
// probe with - test-pathfinding.js's synthetic fixtures).
function findRampRestY(map, x, y, z, player) {
    if (!player) return y + 0.5;
    for (const dy of [0.5, 0.75, 0.25, 0.9, 0.1]) {
        if (!player.Collider.playerCollidesWithMap(player, { x: x + 0.5, y: y + dy, z: z + 0.5 })) return y + dy;
    };
    return y + 0.5;
}

// Where a bot departing a ramp toward (dirX,dirZ) would actually be standing when it commits to
// the jump - the ramp's real far edge in that direction, not the cell's geometric center.
// findRampRestY (above) already fixes the Y half of this same problem; this is the X/Z half,
// which surfaced separately because nothing needed it until a jump departs a ramp toward open air
// on a specific side of the cell rather than just resting centered on it.
//
// A real bot walks a ramp to its edge before jumping - it doesn't jump from the cell's midpoint
// with half the ramp still ahead of it. Verifying from cell-center therefore both UNDERSTATES the
// bot's real approach (loses however much of the cell lies between center and the true edge) and,
// worse, can plant the simulated player somewhere that isn't even a valid ramp surface at that
// exact (x,z) for a diagonally-oriented wedge. Confirmed on "PathJumpHardTest" checkpoint4->5: the
// ramp at (7,2,5) verified its departing jump from z=5.5 (cell center) needing 3.0 units of travel
// to reach checkpoint5's platform at z=2.5, and reliably fell ~0.75 short - a real, reproducible
// gap this file had otherwise resolved to a physics-reliability question rather than a routing one.
//
// Sweeps from center toward the neighbor in small steps, using the SAME real-collider height probe
// findRampRestY uses at each point, and keeps the farthest one that's still a valid ramp surface -
// the true edge, whatever the wedge's ry happens to be, without needing to decode its rotation by
// hand. Falls back to plain cell-center + findRampRestY's own y when no player is available (the
// offline/no-collider path), identical to every other edge type's existing behavior.
function findRampExitXZ(map, x, y, z, dirX, dirZ, player) {
    const cx = x + 0.5, cz = z + 0.5;
    if (!player) return { x: cx, y: findRampRestY(map, x, y, z, player), z: cz };
    let bestX = cx, bestZ = cz, bestY = findRampRestY(map, x, y, z, player);
    for (let d = 0.05; d <= 0.45; d += 0.05) {
        const px = cx + dirX * d, pz = cz + dirZ * d;
        let found = null;
        for (const dy of [0.5, 0.75, 0.25, 0.9, 0.1]) {
            if (!player.Collider.playerCollidesWithMap(player, { x: px, y: y + dy, z: pz })) { found = y + dy; break; };
        };
        if (found === null) break; // walked off the ramp's real surface - previous point was the edge
        bestX = px; bestZ = pz; bestY = found;
    };
    return { x: bestX, y: bestY, z: bestZ };
}

// Whether real game geometry actually occupies (x,y,z) at roughly body height (0.3 units up from
// the cell floor - inside a standing player's ~0.6-tall collision box, see collider.js). Plugins
// get the real room/Collider/Player objects handed to them, not a parallel copy of the game to
// approximate - so wherever this file needs to know if a cell would actually block a player's
// body, it asks the SAME collision code real gameplay uses (room.Collider, already set up with
// the map's real mesh/rotation data - see findPath) rather than guessing from colliderType. Falls
// back to the coarser colliderType-based guess only when no real player is available at all - the
// offline unit-test path (test-pathfinding.js's synthetic `{ map }` fixtures, which have no real
// collision geometry to check against in the first place).
//
// Uses playerCollidesWithMap (the real player's own actual-sized collision box), not a tiny
// single-point test - a point sample can land on a thin sliver of an irregular shape (a curved
// "round-out" brick, say) that reads as solid even though the real player's full body would
// never actually be supported there, or vice versa. Confirmed on "Castle": an earlier point-based
// version of this reported real support under an `obb` "gray-brick-round-out" piece that the
// genuine per-tick player physics simulation then fell straight through - the point test and the
// real movement collision were checking two different things. playerCollidesWithMap is the exact
// same call real gameplay's collidesWithMap() makes every tick (see player.js), so there's no
// second, parallel approximation of "does the player fit here" left to disagree with it.
function isBlockedAt(map, x, y, z, player) {
    if (!player) return isBlockingCell(cellAt(map, x, y, z));
    return !!player.Collider.playerCollidesWithMap(player, { x: x + 0.5, y, z: z + 0.5 });
}

// `aabb`/`obb` are the only two colliderTypes loading.js gives an author-defined arbitrary shape
// (`mesh.colliderMesh` - a round pillar, a thin decorative piece, anything smaller or offset
// within the cell) rather than a predictable, cell-filling one: `full` is the shared, pre-built
// unit cube (`Collider.fullCollisionMesh`), and `wedge`/`iwedge` (ramps) and `ladder` all have
// their own dedicated, already-correct handling elsewhere in this file (isRampCell's "counts as
// its own support"; the ladder branch's step-off case in getNeighbors) - only aabb/obb can't be
// trusted to cover the cell center `isStandable` samples just from knowing the type. This is the
// offline/no-player fallback only (see hasRealSupport below for the accurate version) - used
// verbatim by test-pathfinding.js's synthetic fixtures, which have no real player/Collider to
// check against.
function hasFullFootprint(cell) {
    if (!cell || !cell.idx || !cell.mesh) return false;
    const type = cell.mesh.colliderType;
    return type !== 'aabb' && type !== 'obb';
}

// Whether the cell below (x,y,z) actually has solid geometry a real player would land on (the
// cell's XZ center - see findPath's fromCenter/toCenter). Ramp and ladder cells keep their
// existing, already-correct handling (see hasFullFootprint's comment - both have known,
// predictable shapes and their own dedicated logic elsewhere) rather than a raw collision test,
// since a ramp's real collision mesh is a diagonal incline that may not register a collision
// right at its own center-top point even though standing at the top of it is exactly the
// intended, correct outcome. For anything else, when a real `player` is available (the normal
// in-game case - the calling bot's own live Player, already wired to room.Collider with the map's
// real mesh data), this calls playerCollidesWithMap - the SAME collision check real gameplay's
// moveY() calls every tick to detect ground contact - with the player's feet dipped a hair below
// the boundary, rather than guessing from colliderType alone or (an earlier version of this)
// sampling a single point that can disagree with what the real, full-sized player box actually
// experiences. Falls back to the coarser heuristic when no real player is available (the offline
// unit-test path).
function hasRealSupport(map, x, y, z, player) {
    const below = cellAt(map, x, y - 1, z);
    if (!below) return false;
    if (isRampCell(below) || isLadderCell(below)) return true;
    if (!player) return hasFullFootprint(below);

    // y is the boundary between cell y (here) and cell y-1 (below) - dip a hair under it so the
    // player's feet actually land inside the block below, not exactly on its surface.
    return player.Collider.playerCollidesWithMap(player, { x: x + 0.5, y: y - 0.05, z: z + 0.5 });
}

// A cell a bot's feet could occupy: not itself blocking (or it's a ramp/ladder, both of which a
// player can stand inside), and real support immediately below to actually stand on - a ramp
// counts as its own support (that's the whole point of a ramp), everything else needs
// hasRealSupport (see above) to hold at that exact standing point. The "here" check uses the same
// real-collider test as hasRealSupport (via isBlockedAt), not the coarse isBlockingCell guess -
// a non-full block (aabb/obb) can occupy this grid cell nominally without actually intersecting
// the exact point a player's body would stand at, which isBlockingCell alone can't tell apart
// from a genuine obstruction (confirmed on "Castle": this was misclassifying real, walkable
// ground next to a decorative aabb/obb piece as blocked, forcing a FALL candidate - and the real
// player physics check - onto ground it never actually needed to fall to reach).
export function isStandable(map, x, y, z, player) {
    const here = cellAt(map, x, y, z);
    if (!here) return false;
    if (isBlockedAt(map, x, y, z, player) && !isRampCell(here) && !isLadderCell(here)) return false;

    // A ladder cell is its own support, same as a ramp - a player grabs the rung directly
    // (player.js's lookForLadder attaches to any cell with colliderType 'ladder' the player's
    // body is against, regardless of what's below it), it doesn't need solid floor underneath the
    // way ordinary standing does. Falling through to hasRealSupport below (which requires a
    // real floor immediately under the cell) was rejecting a wall-mounted ladder whose base has
    // open space beneath it - confirmed on the "PathTestMap" ladder-tower test course: this made
    // the entire top of the tower statically unreachable (every pair touching it failed even the
    // algorithmic, no-physics connectivity pass), not merely hard to physically execute.
    if (isRampCell(here) || isLadderCell(here)) return true;

    return hasRealSupport(map, x, y, z, player);
}

// An aabb/obb cell's real collision shape can be ANY sub-cell size (a half-height block, a thin
// decorative piece, an offset pillar) - hasFullFootprint's "not aabb/obb" exemption already
// covers "don't assume this fills the cell", but that only ever produced INTEGER-y outcomes
// (either the cell counts as a full step or it doesn't). A genuine half-height block (like
// "generic.grass-half.aabb") has a real, standable top surface at a FRACTIONAL y that the
// integer-only grid has no way to represent at all - confirmed on "HalfTestMap": a staircase
// built entirely from half-height aabb steps (top surfaces at y+0.5, y+1, y+1.5, y+2) was
// completely invisible to the planner, since every check here only ever asked "is height exactly
// y standable" for integer y.
//
// Probes downward from just under the cell's top, looking for the highest point that's clear to
// stand at (no collision) with solid ground confirmed just below it (a collision a hair lower) -
// the same "dip a hair below the boundary" logic hasRealSupport already uses for full blocks,
// just walked in small steps instead of assumed at a fixed y. Returns null if this cell isn't an
// aabb/obb (nothing to probe) or if no clear resting spot was found up to y+1 (e.g. no player to
// probe with, or genuinely solid the whole way through).

// Returns { y, cx, cz } (the resting height and the real-world x/z the player would actually
// stand at) or null. cx/cz usually equal the cell's own center (x+0.5, z+0.5) - only differ when
// the coarse footprint scan below finds the object's solid volume isn't centered in its cell.
function findAabbStandY(map, x, y, z, player) {
    if (!player) return null;
    const cell = cellAt(map, x, y, z);
    if (!cell || !cell.mesh || (cell.mesh.colliderType !== 'aabb' && cell.mesh.colliderType !== 'obb')) return null;
    const cellCx = x + 0.5, cellCz = z + 0.5;

    // Locate the actual solid footprint's center within this cell rather than assuming it's
    // simply the cell's geometric center - some AABB placements (a small crate, an off-grid-
    // aligned prop) aren't centered in their cell at all. Confirmed live on "PathJumpHardTest":
    // a "small crate" (shipyard.crate-wood-sml-single.aabb, ry:2) had its entire solid volume
    // sitting in roughly the negative-x half of its cell, leaving the geometric center - and
    // every one of the (now-removed) fixed ±0.2 diagonal probe points that used to surround it -
    // landing either right on the boundary or fully in the empty half. None of them ever found solid ground at
    // any height, so this AABB was never offered as climbable at all, stranding the entire route
    // on the far side of it (findPath's search explored 84 same-level cells around the start and
    // never found a way up - traced live). A coarse grid scan at a fixed low probe height (0.06
    // above the cell floor - close enough to intersect almost any real AABB's base) finds
    // whichever points are actually solid and centers the rest of this function on their
    // average instead of the cell's blind center. Just fixing the reachability check here
    // wouldn't be enough on its own, either - the waypoint this produces has to actually BE where
    // the solid ground is, or the live bot would walk to the same empty spot and fall through;
    // see getNeighbors()' smallHop candidate push and reconstructPath()'s waypoint building,
    // which both thread standX/standZ through for exactly this case.
    // The probe height (0.06 above the cell floor) assumed every aabb/obb's solid mass starts
    // near the BOTTOM of its cell, true for a "half-height step" or a crate resting on the floor.
    // It isn't true in general - an object's `ry` rotation can place its mass anywhere in the
    // cell, including the top half. Confirmed on "Castle": `gray-brick-half` at ry:2 found zero
    // hits at y+0.06 (its actual mass sits higher in the cell at that rotation), so this returned
    // null for a cell that's genuinely climbable/standable, silently telling isStandable's WALK-
    // support check "nothing here" for a real half-height step. Trying a handful of base heights
    // and stopping at the first one that finds any solid ground generalizes the same technique
    // (already proven for the crate's off-center footprint) to the vertical axis too, instead of
    // assuming one fixed low probe height covers every possible orientation.
    let sumOx = 0, sumOz = 0, hits = 0;
    for (const baseH of [0.06, 0.3, 0.55, 0.8]) {
        for (let sox = -0.45; sox <= 0.45; sox += 0.15) {
            for (let soz = -0.45; soz <= 0.45; soz += 0.15) {
                if (player.Collider.pointCollidesWithMap({ x: cellCx + sox, y: y + baseH, z: cellCz + soz })) {
                    sumOx += sox; sumOz += soz; hits++;
                };
            };
        };
        if (hits > 0) break;
    };
    const cx = hits > 0 ? cellCx + sumOx / hits : cellCx;
    const cz = hits > 0 ? cellCz + sumOz / hits : cellCz;
    // Only bother sweeping at all if the coarse scan actually found solid ground somewhere -
    // skips straight to "nothing here" for a genuinely empty aabb/obb cell (e.g. probed from the
    // wrong side) instead of running the full height sweep below for no reason.
    if (hits === 0) return null;

    // pointCollidesWithMap uses a near-zero-size probe mesh (see collider.js's
    // pointCollisionMesh, size 0.01) - far cheaper than the full player box, so it's affordable
    // to sweep at fine (0.02) resolution. Only the CENTER offset is checked here, deliberately -
    // a ±0.2 diagonal spread (this function's first version) assumes a footprint at least ~0.4
    // units across, which a genuinely small object (this whole function exists for "half-height aabb/obb
    // steps", not full blocks) can easily be narrower than. Confirmed live on
    // "PathJumpHardTest": a "small crate" (shipyard.crate-wood-sml-single.aabb) had a real
    // footprint only ~0.3 units across even at its refined (non-cell-center) centroid above - the
    // diagonal offsets landed outside its solid volume at every single height in the sweep, so it
    // was never found climbable at all despite the centroid fix correctly locating it. The
    // player-sized box check right after this loop is the real, authoritative arbiter of whether
    // a full player actually fits (that's what it's FOR - it doesn't just repeat what the point
    // sweep already proved), so relying on it alone here isn't a weaker check, just a differently
    // shaped one that doesn't assume a minimum footprint width the object might not have.
    for (let h = 0.98; h >= 0.02; h -= 0.02) {
        const candidateY = y + h;
        const clearAbove = !player.Collider.pointCollidesWithMap({ x: cx, y: candidateY, z: cz });
        const supportedBelow = player.Collider.pointCollidesWithMap({ x: cx, y: candidateY - 0.1, z: cz });
        if (!clearAbove || !supportedBelow) continue;
        // The point check only proves the center clears, not that the player's whole box does (a
        // point can slip through a gap the real body would clip) - the real player-sized box is
        // the actual arbiter, checked here at the refined center, which is where the resulting
        // waypoint will actually sit.
        if (!player.Collider.playerCollidesWithMap(player, { x: cx, y: candidateY, z: cz })) {
            return { y: candidateY, cx, cz };
        };
    };
    return null;
}

// Vertical drop to the first standable cell below (x,z), starting the search at y-1. Returns
// `null` if nothing standable is found within MOVEMENT_PROFILE.maxFallLevels.
//
// Also probes each level for a fractional aabb/obb resting surface (findAabbStandY) alongside the
// ordinary full-height isStandable check, not just the latter - this used to be isStandable-only,
// which silently made falling/jumping DOWN onto a half-height aabb/obb step (a crate, a low ledge)
// undiscoverable as a candidate at all, even though climbing UP onto the exact same kind of step
// has been supported (via getNeighbors()' own findAabbStandY probing) since findAabbStandY was
// introduced - see that function's own header for why an aabb/obb's real standable top can't be
// assumed from colliderType/placement alone. Confirmed on "PathEasyParkourTestA": a chain of small
// crates forming a stepping-stone path is only ever approached from ABOVE (jumping down onto the
// first one off a raised walkway) - every candidate that could reach it fell through this same
// isStandable-only gap, since the crates' real solid mass sits well above their placement index's
// naive "full block" top and isStandable correctly refuses to stand at a height still inside that
// mass. Every caller already threads a `landing.y` straight into a neighbor's `y` and (as of this
// change) `standX`/`standZ` into `standX`/`standZ` - both already fractional/off-center-aware
// throughout the rest of this file - so returning a fractional, refined landing here needs no
// further plumbing changes downstream.
function findLandingBelow(map, x, y, z, player) {
    for (let dy = 1; dy <= MOVEMENT_PROFILE.maxFallLevels; dy++) {
        const cy = y - dy;
        if (cy < 0) return null;
        if (isStandable(map, x, cy, z, player)) return { x, y: cy, z, drop: dy };
        const stand = findAabbStandY(map, x, cy, z, player);
        if (stand !== null) return { x, y: stand.y, z, drop: y - stand.y, standX: stand.cx, standZ: stand.cz };
    }
    return null;
}

// Headroom check for a jump/walk into (x,y,z): the destination cell and the cell above the
// takeoff point both need to be clear, or a standing player (0.6 tall, well under 1 cell) would
// bonk their head mid-jump. Real collision check when a player is available (see isBlockedAt) -
// not exact when it falls back to the colliderType guess, but the physics simulation is still the
// actual arbiter of whether a generated candidate really works either way.
//
// A ramp or ladder cell is exempted from the "blocked" half of this check, same as isStandable's
// own exemption - both DO register a real collision (a ladder rung is solid geometry a player's
// box intersects), but that's exactly the point of entering one, not an obstruction blocking
// entry. Without this, hasHeadroom rejected the ordinary WALK edge that steps a player directly
// into a ladder cell from the side - confirmed on "PathTestMap": the search could reliably reach
// right up to the ladder's own entrance cell, then almost never take the one further step onto
// the ladder itself, making the whole tower above it statically unreachable.
function hasHeadroom(map, fromX, fromY, fromZ, toX, toY, toZ, player) {
    // Descending moves start and finish at different standing heights. Checking both endpoint
    // columns at the higher takeoff slice incorrectly rejects a real landing beneath an
    // overhang. Check each endpoint at its own standing slice; the edge physics simulation still
    // decides whether the airborne path between them clips anything.
    if (toY < fromY) {
        const fromCell = cellAt(map, fromX, fromY, fromZ);
        const toCell = cellAt(map, toX, toY, toZ);
        const fromClear = isRampCell(fromCell) || isLadderCell(fromCell) || !isBlockedAt(map, fromX, fromY, fromZ, player);
        const toClear = isRampCell(toCell) || isLadderCell(toCell) || !isBlockedAt(map, toX, toY, toZ, player);
        return fromClear && toClear;
    };

    // A multi-level jump (effectiveMaxJumpLevels > 1 under a boosted gamemode) passes through
    // every intermediate height on its way up, not just the final landing level - checking only
    // the top slice would miss a ceiling one level below the target blocking the jump partway
    // through. Same-level and descending calls (the overwhelmingly common case) still only ever
    // check the single slice the original single-check version did - Math.max(fromY, toY) - so
    // this is exactly backward compatible for everything but a genuine multi-level climb.
    const startY = toY > fromY ? fromY + 1 : Math.max(fromY, toY);
    const endY = Math.max(fromY, toY);
    for (let checkY = startY; checkY <= endY; checkY++) {
        const fromCell = cellAt(map, fromX, checkY, fromZ);
        const toCell = cellAt(map, toX, checkY, toZ);
        const fromClear = isRampCell(fromCell) || isLadderCell(fromCell) || !isBlockedAt(map, fromX, checkY, fromZ, player);
        const toClear = isRampCell(toCell) || isLadderCell(toCell) || !isBlockedAt(map, toX, checkY, toZ, player);
        if (!fromClear || !toClear) return false;
    };
    return true;
}

function key(x, y, z) {
    return `${x},${y},${z}`;
}

// Every reachable neighbor of (x,y,z), each as { x, y, z, type, cost }.
function getNeighbors(map, x, y, z, player) {
    const neighbors = [];

    // Ladder: climb straight up/down through a stack of ladder cells. player.js's own climbing
    // logic additionally requires matching `ry` between consecutive cells (see lookForLadder) -
    // checked here too so the planner doesn't offer a climb the physics engine would reject.
    const hereCell = cellAt(map, x, y, z);
    if (isLadderCell(hereCell)) {
        // Math.floor(y), not y, for the same reason the jump generators below use it: `y` can
        // already be FRACTIONAL when the bot is standing on a half-height aabb/obb step or a ramp
        // (findAabbStandY / findRampRestY both return real sub-cell resting heights). Ladder rungs
        // are whole cells, so "one rung up" has to mean the next whole level, not the step's own
        // sub-height plus one. Without this, standing at y=2.92 produced a node at 3.92, and since
        // key() uses the raw y that .92 offset then propagated up the entire climb - building a
        // parallel family of fractional ladder nodes that never unify with the integer ones, and
        // waypoints asking the bot to stop at heights a ladder never actually rests it at.
        // Confirmed live on "Castle": `13,2.92,0 -> 13,3.92,0 (ladder)` failed with 4 stuck events,
        // in two separate legs of the same tour. cellAt() already floors internally, so every
        // occupancy check here was always looking at the right CELL - it's only the pushed
        // waypoint height that was wrong, which is why this survived the earlier fractional-y
        // sweep that fixed the three jump generators. A no-op for every integer-y case.
        const ladderBaseY = Math.floor(y);
        const up = cellAt(map, x, ladderBaseY + 1, z);
        if (isLadderCell(up) && up.ry === hereCell.ry) {
            neighbors.push({ x, y: ladderBaseY + 1, z, type: EDGE_TYPE.LADDER, cost: 1 });
        } else {
            // Top of the ladder - stepping off onto solid ground directly above it, same as
            // climbing out at the top of a real ladder. Deliberately NOT plain isStandable: its
            // hasRealSupport treats "a ladder directly below" as valid support on its own - true
            // for standing ON a rung mid-climb, but the cell directly below THIS step-off target
            // is, by construction, always this same ladder's own top rung - so that shortcut made
            // this check pass unconditionally, regardless of whether real ground exists up there
            // at all. Confirmed on "Castle": the ladder at (18,*,10) has nothing above its top
            // rung (18,4,10 is genuinely empty air), yet this branch kept offering a step-off edge
            // into it - the bot climbed to the top, found nowhere real to land, and fell straight
            // back down, causing a repeated stuck/replan cycle. This was the single most common
            // "ladder" stuck-event across today's Castle runs, on several unrelated ladders - not
            // an isolated case. Checks the SAME real collider hasRealSupport uses for an ordinary
            // full block, just without going through the ladder-implies-support shortcut first.
            const stepOffCell = cellAt(map, x, ladderBaseY + 1, z);
            const hasRealFooting = stepOffCell && !isBlockedAt(map, x, ladderBaseY + 1, z, player) &&
                (player
                    ? player.Collider.playerCollidesWithMap(player, { x: x + 0.5, y: ladderBaseY + 1 - 0.05, z: z + 0.5 })
                    : hasFullFootprint(cellAt(map, x, ladderBaseY, z)));
            if (hasRealFooting) {
                neighbors.push({ x, y: ladderBaseY + 1, z, type: EDGE_TYPE.LADDER, cost: 1 });
            };
            // A ladder's top rung doesn't always have anywhere to step off directly above it - a
            // real ladder is frequently bolted to the SIDE of whatever it's meant to reach, with
            // the actual landing (another ledge, a taller crate, a second ladder segment starting
            // higher up) one cell over, not straight up. The same-column check above only ever
            // considers straight up, so a ladder whose only continuation is sideways looked like a
            // dead end and got no edge here at all - not a wrong edge, no edge whatsoever. Confirmed
            // on "PathShipyardTest": a 2-rung ladder climbing a container stack has genuinely empty
            // air directly above its top rung (the same column keeps going up as a THIRD container,
            // not more ladder), with the only real continuation a cardinal step onto the adjacent
            // container's top, one cell over and one level up - findPath returned null for the
            // whole leg because of it, not just a slow/roundabout route. Only tried when the
            // straight-up step-off itself failed - a ladder that already has a clean landing directly
            // above it doesn't need this, and same real-collider footing check as the same-column
            // case just above, at each of the 4 cardinal neighbors instead of (x,z) itself.
            if (!hasRealFooting) {
                for (const [dx, dz] of HORIZONTAL_4) {
                    const nx = x + dx, nz = z + dz;
                    if (!inBounds(map, nx, ladderBaseY + 1, nz)) continue;
                    // isStandable, not a hand-rolled footing check - the earlier version re-tested
                    // solid-ground collision directly, which is wrong for the exact case this
                    // exists to catch: the adjacent structure is very often ANOTHER ladder (its own
                    // self-supporting rung, no solid floor underneath - see isStandable's own ramp/
                    // ladder special case), not solid ground, and a plain ground-collision probe
                    // finds nothing there at all. Confirmed on "PathShipyardTest": the real
                    // continuation one cell over from this exact ladder's top rung is a second,
                    // separate ladder segment starting one level higher - reusing isStandable
                    // (already correct for every one of these cases, ramp/ladder/real-support
                    // alike) instead of a second, narrower reimplementation of the same check.
                    if (isStandable(map, nx, ladderBaseY + 1, nz, player) && hasHeadroom(map, x, ladderBaseY, z, nx, ladderBaseY + 1, nz, player)) {
                        // JUMP, not WALK - this gains a full level (ladderBaseY -> ladderBaseY+1),
                        // same shape as the ordinary up-one-level crate-mantle jump elsewhere in
                        // this file, not a same-level step. Classifying it as WALK would both read
                        // wrong (EDGE_TYPE's own convention: WALK is same-level only) and skip the
                        // real-physics jump verification this kind of step-up genuinely needs.
                        neighbors.push({ x: nx, y: ladderBaseY + 1, z: nz, type: EDGE_TYPE.JUMP, cost: 1.2 });
                    };
                };
            };
        };
        const down = cellAt(map, x, ladderBaseY - 1, z);
        if (down && (isLadderCell(down) ? down.ry === hereCell.ry : isStandable(map, x, ladderBaseY - 1, z, player))) {
            neighbors.push({ x, y: ladderBaseY - 1, z, type: EDGE_TYPE.LADDER, cost: 1 });
        };
    // hasRealSupport (see isStandable) treats a ladder cell directly below as valid support on
    // its own, the same way it does for a full block - correct for "standing on the ledge right
    // above a ladder's own top rung", but that leaves the CURRENT cell genuinely empty (not
    // itself a ladder), so the ladder-climb block just above never fires here at all (its own
    // gate is isLadderCell(hereCell), and hereCell isn't one). The result: this spot is walkable
    // TO, but the only way further down - stepping into the ladder's actual top rung one level
    // below - had no edge offered anywhere, a dead end the search couldn't see past. Confirmed on
    // "PathShipyardTest": a ledge exactly one level above a 2-rung ladder (itself the only route
    // down off that ledge) reached this exact state - isStandable was correctly satisfied, and
    // findPath still couldn't progress, because "descend into the ladder from here" was simply
    // never generated as a candidate. Mirrors the sideways step-OFF fix above (same asymmetry,
    // opposite direction: that one covers leaving a ladder sideways when there's nothing directly
    // above its top rung, this one covers entering a ladder from directly above when the current
    // cell itself isn't part of it).
    } else if (isLadderCell(cellAt(map, x, Math.floor(y) - 1, z))) {
        // Math.floor(y), same reasoning as ladderBaseY above - a fractional current y (a ramp/
        // half-step rest height) still means "the next whole level down", not y-1 itself.
        neighbors.push({ x, y: Math.floor(y) - 1, z, type: EDGE_TYPE.LADDER, cost: 1 });
    };

    // Same-level walk (8-directional) and single-level ramp/jump (4-directional only - a
    // diagonal jump across a gap is a much less reliable input to actually execute than a
    // cardinal one, not worth offering the planner).
    for (const [dx, dz] of HORIZONTAL_8) {
        const nx = x + dx, nz = z + dz;
        const isDiagonal = dx !== 0 && dz !== 0;
        // Corner-cut guard: a diagonal move whose destination is clear can still cut directly
        // through a solid wall corner if one of the two orthogonal "side" cells is blocked -
        // real testing on the "Castle" map found exactly this (a diagonal step the algorithm
        // thought was a plain walk actually clipped a corner and dropped the bot off the edge of
        // the platform into an unrecoverable fall). Require both sides clear, same as any
        // reasonable grid-movement implementation.
        // isPassable alone isn't enough here - it only rules out a solid wall corner, not an open
        // LEDGE corner (a side cell with nothing blocking it but also no floor underneath). Real
        // physics testing on "LadderTest" found exactly that gap: a diagonal walk off a ladder-top
        // platform whose side cell was open-but-unsupported clipped through it and fell a full
        // level, landing well past the intended target. isStandable requires actual support (or a
        // ramp/ladder exemption), which closes that gap too.
        //
        // Exempts a diagonal move landing ON a ramp cell from the two-side-clear requirement -
        // this guard's whole premise is a FLAT floor corner (the two side cells' emptiness is
        // what makes the corner a real hole to fall through), which doesn't hold for a wedge's
        // own tilted mass sitting diagonally adjacent. Reported live and confirmed as intentional
        // map design on "PathJumpHardTest" checkpoint5->goal: the correct route walks diagonally
        // onto a wedge whose own two orthogonal neighbor cells are genuinely empty air (nothing to
        // corner-cut INTO - they're not a false floor, they're just not part of the route), which
        // this guard was rejecting outright before the edge ever reached real-physics
        // verification. Scoped to the target being a ramp specifically - an ordinary flat-floor
        // diagonal still needs both sides genuinely clear, same as before.
        const targetCell = cellAt(map, nx, y, nz);
        const cornerClear = !isDiagonal || isRampCell(targetCell) || (isStandable(map, x + dx, y, z, player) && isStandable(map, x, y, z + dz, player));
        // Two adjacent ramps whose slope axes are genuinely perpendicular are a deliberate peak
        // turn junction (see reconstructPath's peak-insertion pass and the matching verification
        // exemption further down this file for the full reasoning), not a wrong-axis approach
        // into a wall - rampBlocksDirection alone can't tell the two apart, since the move that
        // aligns with one ramp's climb axis is BY DEFINITION off-axis for the other (that's what
        // makes it a turn, not a straight continuation). Without this, the two ramps' individual
        // axis checks contradict each other and this edge is never generated as a static
        // candidate at all, regardless of what the later verification exemption allows.
        const rampAxisTurn = isRampCell(targetCell) && isRampCell(hereCell)
            && Math.abs(rampSlopeAxis(targetCell).x * rampSlopeAxis(hereCell).x + rampSlopeAxis(targetCell).z * rampSlopeAxis(hereCell).z) <= 0.3;
        const rampDirBlocked = !rampAxisTurn && (rampBlocksDirection(targetCell, dx, dz) || rampBlocksDirection(hereCell, dx, dz));
        if (!rampDirBlocked && cornerClear && isStandable(map, nx, y, nz, player) && hasHeadroom(map, x, y, z, nx, y, nz, player)) {
            const cost = isDiagonal ? Math.SQRT2 : 1;
            neighbors.push({ x: nx, y, z: nz, type: EDGE_TYPE.WALK, cost });
        };
    };

    for (const [dx, dz] of HORIZONTAL_4) {
        const nx = x + dx, nz = z + dz;

        // Up one level - via ramp (cheap, no jump needed, single level only - ramps in this
        // engine are always a one-cell-tall incline, see rampClimbAxisIsX's header) or a standing
        // jump (more expensive, and now capable of clearing MORE than one level when
        // effectiveMaxJumpLevels says a boosted jumpBoostModifier/lowered gravityModifier
        // actually allows it - default modifiers still cap this at exactly one level, same as
        // before).
        const rampAtTarget = cellAt(map, nx, y, nz);
        const viaRamp = isRampCell(rampAtTarget) || isRampCell(hereCell);
        // "One level up" from a FRACTIONAL current y (standing on a half-height aabb/obb step -
        // see findAabbStandY) means the next whole level up from the cell that step's IN, not
        // literally y+1 - a jump from y=1.6 (a small crate's real top, one such step found live on
        // "PathJumpHardTest") needs to land at y=2 exactly, not 2.6, to actually reach a normal
        // full-block platform. Math.floor(y) is a no-op for every ordinary integer-y case (all of
        // this generator's non-aabb candidates), so existing behavior is unchanged there - it only
        // does something different once y itself is already fractional. Confirmed live: without
        // this, standing on the crate only ever offered same-level steps back down to the floor
        // around it (the aabb half-step loop's own short-range candidates), nothing upward at
        // all - the search reached the crate but had no way off it toward the rest of the route.
        const climbBaseY = Math.floor(y);
        // rampAtTarget above is looked up at the CURRENT y, which is wrong for judging whether
        // this climb is blocked when the real target ramp sits a level higher (the ordinary
        // "climbing a ramp" case) - two adjacent ramps a level apart, like "PathJumpHardTest"
        // checkpoint5->goal's second wedge, need the cell at the actual landing height to even
        // recognize a ramp-to-ramp axis-turn junction is happening; at the current y that cell is
        // just empty air, so isRampCell on it is always false and the exemption below could never
        // trigger. See the matching WALK-generator exemption above for the full peak-turn
        // reasoning - this is the same case, just reached by climbing a level instead of a
        // same-level step.
        const climbTargetCell = cellAt(map, nx, climbBaseY + 1, nz);
        const climbAxisTurn = isRampCell(climbTargetCell) && isRampCell(hereCell)
            && Math.abs(rampSlopeAxis(climbTargetCell).x * rampSlopeAxis(hereCell).x + rampSlopeAxis(climbTargetCell).z * rampSlopeAxis(hereCell).z) <= 0.3;
        const rampClimbBlocked = !climbAxisTurn && (rampBlocksDirection(rampAtTarget, dx, dz) || rampBlocksDirection(hereCell, dx, dz));
        if (!rampClimbBlocked && viaRamp && isStandable(map, nx, climbBaseY + 1, nz, player) && hasHeadroom(map, x, y, z, nx, climbBaseY + 1, nz, player)) {
            // A perpendicular ramp-to-ramp junction (climbAxisTurn) was previously classified as
            // an ordinary RAMP edge and trusted structurally at verification time (see the
            // rampAxisTurn exemption below) on the theory that it's just a two-segment walk the
            // offline verifier can't model, not a real physics failure. Confirmed live on
            // "PathJumpHardTest" checkpoint5->goal that theory was wrong: a live trace showed the
            // bot's x pinned dead at the exact same coordinate every attempt, walking straight
            // into solid geometry at the seam between the two wedges - not a verifier limitation,
            // a genuine collision gap a plain walk can't cross. What DOES cross it, confirmed by
            // watching the search's own fallback after the walk edge got blacklisted twice: a
            // JUMP from the first ramp's peak to the second ramp's entry, using the exact same two
            // points (reconstructPath's peak-insertion pass and the rampEntry computation below)
            // already computed for the walk attempt - they're the right takeoff/landing points
            // either way, only the edge TYPE was wrong. Classifying it as JUMP here routes it
            // through real verification (the WALK||RAMP-only rampAxisTurn check below no longer
            // matches) and reuses the ramp-aware run-up/charge/ground-ahead machinery already
            // built for checkpoint4->5's own ramp-departure jump, rather than inventing a second
            // mechanism for what turned out to be the same kind of edge.
            neighbors.push({ x: nx, y: climbBaseY + 1, z: nz, type: climbAxisTurn ? EDGE_TYPE.JUMP : EDGE_TYPE.RAMP, cost: climbAxisTurn ? 8 : 1.1 });
        } else if (!rampClimbBlocked && !viaRamp) {
            for (let levels = 1; levels <= effectiveMaxJumpLevels(player); levels++) {
                const targetY = climbBaseY + levels;
                if (!isStandable(map, nx, targetY, nz, player) || !hasHeadroom(map, x, y, z, nx, targetY, nz, player)) continue;
                // Jumps are weighted heavily against, not just mildly - real in-game testing
                // showed a standing jump clearing a full level is frequently unreliable in
                // practice (the estimated MOVEMENT_PROFILE clearance doesn't always match what
                // the real physics engine actually lets a standing jump clear), so the planner
                // should only reach for one when there's genuinely no walk/ramp/fall route
                // around it, not whenever one is merely the shortest option on paper. A cost of 4
                // turned out to still lose to a fall+jump shortcut over even modest walk/ladder
                // detours (observed on LadderTest: an 8.3-cost fall+jump edge beat a 9.3-cost
                // ladder detour by just 1) - 8 gives a walk or ladder route enough margin to win
                // against a several-cell-longer detour while still letting a jump through when
                // it's genuinely the only way across. Each extra level beyond the first adds a
                // further penalty on top - a taller jump is a harder one, same reasoning as the
                // gap-jump distance penalty below.
                neighbors.push({
                    x: nx, y: targetY, z: nz,
                    type: EDGE_TYPE.JUMP,
                    cost: 8 + (levels - 1) * 4,
                });
            };
        };

        // Down - walking off a ledge. Falls further than one level still cost more (mildly
        // discourages routing a bot off a cliff when a gentler path exists), but are allowed up
        // to maxFallLevels since there's no fall damage in this game.
        if (!isStandable(map, nx, y, nz, player)) {
            const landing = findLandingBelow(map, nx, y, nz, player);
            if (landing && hasHeadroom(map, x, y, z, nx, y, nz, player)) {
                neighbors.push({ x: nx, y: landing.y, z: nz, type: EDGE_TYPE.FALL, cost: 1 + landing.drop * 0.3, standX: landing.standX, standZ: landing.standZ });
            };
        };
    };

    // Gap jump - a running jump across a horizontal gap wider than one cell, in any of the 8
    // directions (diagonal included - unlike the up-one-level jump above, a diagonal gap-jump
    // doesn't need a precise vertical apex to land on, just distance and direction, and real
    // players clear these routinely), landing same-level, up one, or several levels down. The
    // up-one-level jump above and the FALL edges above only cover "adjacent cell, different
    // height" and "adjacent cell, no floor" - neither models a gap you have to actually jump
    // across, which showed up as a flatly unbridgeable "no path" on "PathTestMap" (a same-height,
    // 2-cell gap with an easy real-world jump) before this existed at all. Direction, distance,
    // and landing height are all discovered dynamically per candidate rather than assuming one
    // fixed shape, since real maps put these gaps at every combination of the three - real physics
    // verification (see findPath's simulateEdgeCached call) is still what actually decides whether
    // a specific candidate is reachable; this only needs to offer it as a candidate.
    const maxGapCells = effectiveMaxJumpGapCells(player);

    // A wall-mounted ladder can be the landing target of a jump even when there is no floor at
    // the destination: the player enters the ladder cell while airborne and lookForLadder()
    // catches the rung. Ordinary gap-jump generation only targets isStandable landing surfaces,
    // so without an explicit airborne-entry edge the graph skips these catches and may instead
    // attempt a much longer jump past the ladder to the platform it serves. Offer nearby ladder
    // cells at the takeoff height or one level below; real-physics verification remains the final
    // authority on whether the approach actually reaches and attaches to the rung.
    for (let jdx = -maxGapCells; jdx <= maxGapCells; jdx++) {
        for (let jdz = -maxGapCells; jdz <= maxGapCells; jdz++) {
            if (jdx === 0 && jdz === 0) continue;
            const dist = Math.sqrt(jdx * jdx + jdz * jdz);
            if (dist <= 1 || dist > maxGapCells) continue;
            const jx = x + jdx, jz = z + jdz;
            for (const ladderY of [Math.floor(y), Math.floor(y) - 1]) {
                if (!inBounds(map, jx, ladderY, jz)) continue;
                const ladderCell = cellAt(map, jx, ladderY, jz);
                if (!isLadderCell(ladderCell) || !hasHeadroom(map, x, y, z, jx, ladderY, jz, player)) continue;
                let blocked = false;
                for (let t = 0.25; t < 1; t += 0.25) {
                    const sx = Math.round(x + jdx * t), sz = Math.round(z + jdz * t);
                    if ((sx === x && sz === z) || (sx === jx && sz === jz)) continue;
                    if (isBlockedAt(map, sx, y, sz, player) && !isLadderCell(cellAt(map, sx, y, sz))) {
                        blocked = true;
                        break;
                    };
                };
                if (!blocked) neighbors.push({ x: jx, y: ladderY, z: jz, type: EDGE_TYPE.JUMP, cost: dist + 0.5, ladderCatch: true });
            };
        };
    };

    for (const [jdx, jdz] of HORIZONTAL_8) {
        for (let dist = 2; dist <= maxGapCells; dist++) {
            const jx = x + jdx * dist, jz = z + jdz * dist;
            if (!inBounds(map, jx, y, jz)) break;

            // Only worth a dedicated JUMP edge when the straight-line approach actually has an
            // open gap in it, not a wall - if every cell in between is itself standable ground,
            // ordinary WALK edges already connect the same two points more cheaply and reliably
            // (this would just be a redundant, cost-inflated duplicate of that route); if any cell
            // in between is genuinely BLOCKED by solid geometry rather than just missing a floor,
            // that's a wall to route around, not a gap to jump - a jump doesn't clear an obstacle
            // in front of it just because there's also no floor underneath.
            let hasGap = false;
            let blocked = false;
            for (let step = 1; step < dist; step++) {
                const stepX = x + jdx * step, stepZ = z + jdz * step;
                if (isBlockedAt(map, stepX, y, stepZ, player) && !isRampCell(cellAt(map, stepX, y, stepZ)) && !isLadderCell(cellAt(map, stepX, y, stepZ))) {
                    blocked = true;
                    break;
                };
                if (!isStandable(map, stepX, y, stepZ, player)) hasGap = true;
            };
            if (blocked || !hasGap) continue;

            if (isStandable(map, jx, y, jz, player) && hasHeadroom(map, x, y, z, jx, y, jz, player)) {
                // A same-level jump right at the far edge of maxGapCells (the absolute limit this
                // file will ever offer, not just "a longer jump") is a fundamentally different bet
                // than one comfortably inside it - it's attempting the physics engine's actual
                // maximum range, not a wide-margin real one. simulateEdgeCached still verifies it
                // before it's ever offered, so this isn't ruled out - genuinely isolated platforms
                // that only a max-range jump can reach still get it - but the cheap dist+1 cost put
                // it on equal footing with, or even cheaper than, a fully reliable short detour
                // (e.g. a nearby ladder), so the planner picked the marginal jump purely because it
                // looked shorter on paper. Confirmed live on "PathLadderTest": the checkpoint2->
                // checkpoint3 leg (a flat, exactly-3-cell, exactly-maxGapCells jump with a fully
                // viable ladder alternative right next to it) kept getting planned as a jump and
                // needed its own live stuck/replan/ladder-fallback cycle to actually complete, even
                // after the run-up fix made the jump itself land reliably enough to occasionally
                // succeed - the jump was never actually the right choice once a reliable
                // alternative existed, the cost model just never said so. Same magnitude premium
                // (roughly matching the existing +20 for the OTHER known-marginal category, a level-
                // up jump) rather than a smaller nudge, since a smaller bump left this exact edge's
                // cost still competitive with the ladder detour on further testing.
                const maxRangePremium = dist === maxGapCells ? 20 : 0;
                neighbors.push({ x: jx, y, z: jz, type: EDGE_TYPE.JUMP, cost: dist + 1 + maxRangePremium });
            // Math.floor(y), not y, for the same reason as the up-one-level jump above: a
            // fractional CURRENT y (standing on a half-height aabb/obb step) needs "one level up"
            // to mean the next whole level up from the cell that step's in, not the step's own
            // sub-height plus one - confirmed live on "PathJumpHardTest" (a small crate's real
            // top at y=1.6 jumping to a full-block platform at y=2, not 2.6).
            } else if (isStandable(map, jx, Math.floor(y) + 1, jz, player) && hasHeadroom(map, x, y, z, jx, Math.floor(y) + 1, jz, player)) {
                // Landing a level higher than takeoff relies on the same marginal step-up-on-
                // collision quirk the up-one-level jump above does, PLUS covering real horizontal
                // distance mid-arc at the same time - a genuinely harder, less reliable jump than
                // either a plain gap-jump or a plain level-up jump alone (see MOVEMENT_PROFILE's
                // "diagonal/knight's-move + height-gain jumps have a real reliability gap" - the
                // same category flagged across Castle, PathHalfTest, and PathMapTest this
                // session), so this needs a bigger premium than +8-ish over the base jump cost.
                // Confirmed by testing on "PathHalfTest": at the old cost (8 + dist-2, ~9 for a
                // 3-cell gap) the planner preferred a single risky diagonal jump like this one
                // OVER a fully reliable multi-step half-block staircase route that was only
                // marginally more expensive on paper - the two routes' costs were too close for
                // the cost model to reflect how much less reliable the risky jump actually is in
                // practice. 20 (instead of 8) as the base premium was the smallest bump that
                // actually flipped the planner's preference to the reliable route in that test.
                neighbors.push({ x: jx, y: Math.floor(y) + 1, z: jz, type: EDGE_TYPE.JUMP, cost: 20 + (dist - 2) });
            } else {
                const landing = findLandingBelow(map, jx, Math.floor(y) + 1, jz, player);
                if (landing && landing.drop <= MOVEMENT_PROFILE.maxFallLevels && hasHeadroom(map, x, y, z, jx, landing.y, jz, player)) {
                    // A gap-jump that comes down onto a fractional aabb/obb top (a crate, a narrow
                    // ledge) is landing on a much smaller, more precisely-placed target than the
                    // open floor this branch was originally built for - real physics testing on
                    // "PathEasyParkourTestA" showed exactly this kind of jump chosen by the planner
                    // (a single, longer risky landing) actually failing/getting stuck live, while a
                    // real player's own recorded route instead crossed the same gap via several
                    // short, reliable diagonal hops between the SAME crates (see the half-step
                    // generator's own HORIZONTAL_8 comment). Same reasoning and same shape as the
                    // level-up branch's own +20 premium two lines up - scaled a little lighter here
                    // since landing DOWN onto a step is inherently more forgiving than climbing UP
                    // onto one, and still scoped only to the fractional-landing case so an ordinary
                    // fall onto open floor keeps its original, already-reliable cost.
                    const aabbLandingPremium = landing.standX !== undefined ? 10 + (dist - 2) * 5 : 0;
                    // A falling result above the takeoff height is actually a height-gaining jump,
                    // not a cheap descent. Keep that risk visible to A* while leaving true
                    // same-level/downward fractional landings unchanged.
                    const fractionalRisePremium = landing.y > y + 0.05 ? 10 : 0;
                    // Diagonal approaches to narrow fractional supports are less tolerant than
                    // face-aligned ones. Prefer a short alignment walk when available, but retain
                    // the jump as a fallback for layouts where it is the only route.
                    const narrowDiagonalPremium = landing.standX !== undefined && Number.isInteger(y) && jdx !== 0 && jdz !== 0 ? 4 : 0;
                    neighbors.push({ x: jx, y: landing.y, z: jz, type: EDGE_TYPE.JUMP, cost: dist + 1 + landing.drop * 0.3 + aabbLandingPremium + fractionalRisePremium + narrowDiagonalPremium, standX: landing.standX, standZ: landing.standZ });
                };
            };
        };
    };

    // Uneven ("knight's move") gap jump - same idea as the gap jump above, but for a landing spot
    // that isn't on a cardinal or 45-degree line from here at all, like (dx=2, dz=-1). The
    // cardinal/diagonal-only generator above walks straight lines and can never reach these, so a
    // real, easy, same-height jump between two ledges that happen to be offset like this was
    // completely invisible to the planner - it fell back to a "climb down, walk around, climb
    // back up" detour instead, and if that detour needed an up-one-level climb the physics engine
    // can't reliably clear, the WHOLE pair looked unreachable even though the actual intended jump
    // was trivial. Confirmed on "JumpTestMap": two adjacent same-height pedestals offset by
    // exactly (2, -1) had no valid direct candidate at all before this.
    //
    // Every non-cardinal, non-45-degree integer offset within maxGapCells, not a fixed list of the
    // 8 "true knight's move" (2,1)-style ratios specifically - a real landing spot can sit at ANY
    // integer ratio relative to the takeoff cell, and there's nothing special about 2:1 over, say,
    // 1:3. Confirmed live on "PathJumpHardTest" checkpoint5->goal: the actual intended jump off the
    // second wedge's peak is a (dx=1, dz=3) offset - not a knight's move, not a cardinal/diagonal
    // line, and genuinely unreachable by ANY fixed short list, only by covering every ratio in
    // range. Bounded to maxGapCells per axis (the same bound the cardinal/diagonal generator above
    // already uses) rather than inflated further for this - the extra reach an elevated takeoff
    // (like a ramp's peak) provides is exactly what simulateEdgeCached's real-physics check is for,
    // not something this candidate list needs to guess at by widening its own search radius.
    const unevenOffsets = [];
    for (let jdx = -maxGapCells; jdx <= maxGapCells; jdx++) {
        for (let jdz = -maxGapCells; jdz <= maxGapCells; jdz++) {
            if (jdx === 0 || jdz === 0 || Math.abs(jdx) === Math.abs(jdz)) continue;
            unevenOffsets.push([jdx, jdz]);
        };
    };
    for (const [jdx, jdz] of unevenOffsets) {
        const jx = x + jdx, jz = z + jdz;
        if (!inBounds(map, jx, y, jz)) continue;
        const dist = Math.sqrt(jdx * jdx + jdz * jdz);

        // No single shared grid line to walk cell-by-cell here (unlike the cardinal/diagonal gap
        // jump above), so sample a few points ALONG the real straight-line path instead and
        // reject if any of them hit solid geometry - without this, a "knight's move" jump could
        // sail straight through a wall the same way the cardinal check above prevents. Confirmed
        // by testing: without this, the offline "wall taller than a jump can clear" and
        // "unreachable goal" fixtures both got a bogus path straight through their sealing walls.
        // Checked at a given height rather than baked in, because a jump that's GAINING a level
        // doesn't fly flat at takeoff height the whole way - it arcs up toward the landing height,
        // so an obstruction that only occupies the takeoff's own level (a single-level "full"
        // block, not a genuine floor-to-ceiling wall) shouldn't rule out a level-up landing past
        // it. Confirmed live on "PathJumpHardTest": a level-up knight's-move jump from a small
        // crate's real (fractional) top at y=1.6 toward a platform at y=2 sampled a mid-path point
        // that lands inside an ordinary one-level-tall "full" block at that SAME y=1.6 - correctly
        // blocked for a same-level jump, but that block doesn't reach anywhere near y=2, so it's
        // not actually in the way of a jump landing there instead.
        const isBlockedAlongLineAt = (checkY) => {
            for (let t = 0.25; t < 1; t += 0.25) {
                const sx = Math.round(x + jdx * t), sz = Math.round(z + jdz * t);
                if ((sx === x && sz === z) || (sx === jx && sz === jz)) continue;
                if (isBlockedAt(map, sx, checkY, sz, player) && !isRampCell(cellAt(map, sx, checkY, sz)) && !isLadderCell(cellAt(map, sx, checkY, sz))) return true;
            };
            return false;
        };
        // No single early "continue" here on purpose - same-level and falling candidates both
        // need the ORIGINAL, stricter takeoff-height-only check (a fall's real trajectory stays
        // close to takeoff height, not the possibly-much-higher floor(y)+1 relaxation below, so it
        // gets no benefit from that reasoning and shouldn't get the weaker check either), but that
        // check can't gate the WHOLE candidate up front, or a takeoff-height obstruction (like the
        // one-level "full" block below the level-up branch's own reasoning is about) would reject
        // the level-up branch before it ever got a chance to run its own, separately-relevant
        // check - confirmed live: exactly this happened on "PathJumpHardTest" until this was
        // split apart. Each branch below checks the height that's actually relevant to it.
        if (!isBlockedAlongLineAt(y) && isStandable(map, jx, y, jz, player) && hasHeadroom(map, x, y, z, jx, y, jz, player)) {
            // Past the first two world units, extra jump distance reduces landing margin. Price
            // that risk gradually so a short alignment walk can beat a longer diagonal shortcut
            // when both are available, while leaving ordinary short hops unchanged.
            const distanceReliabilityPremium = Math.max(0, dist - 2);
            neighbors.push({ x: jx, y, z: jz, type: EDGE_TYPE.JUMP, cost: dist + 1 + distanceReliabilityPremium });
        // Math.floor(y), not y - see the identical fractional-current-y fix and its own comment
        // on the cardinal/45°-diagonal gap-jump above (same underlying cause, confirmed on the
        // same live case: "PathJumpHardTest"'s checkpoint1->2 crate-to-platform jump is itself a
        // (dx=2, dz=1) knight's-move offset, so it's THIS branch, not the cardinal one, that
        // needed the fix for that specific edge to be found at all). This branch specifically
        // checks blocked-along-line at the landing height, independent of whatever the takeoff
        // height's own check found - see the header comment on this whole block for why.
        };
        if (!isBlockedAlongLineAt(Math.floor(y) + 1) && isStandable(map, jx, Math.floor(y) + 1, jz, player) && hasHeadroom(map, x, y, z, jx, Math.floor(y) + 1, jz, player)) {
            // Same marginal step-up-on-collision quirk as every other level-up jump, PLUS a
            // non-cardinal knight's-move approach angle on top - see the identical reasoning on
            // the cardinal/45°-diagonal gap-jump's own "+1 level" cost a bit above (same fix,
            // same "PathHalfTest planner preferred an unreliable one-shot jump over a reliable
            // multi-step route because the old cost model didn't price the risk gap widely
            // enough" finding, same empirically-validated premium).
            neighbors.push({ x: jx, y: Math.floor(y) + 1, z: jz, type: EDGE_TYPE.JUMP, cost: 20 + dist });
        // Falling keeps the ORIGINAL takeoff-height-only check (see the header comment above) -
        // its real trajectory stays close to takeoff height, not the level-up branch's landing-
        // height relaxation, so a takeoff-height obstruction still correctly rules it out here.
        };
        if (!isBlockedAlongLineAt(y)) {
            const landing = findLandingBelow(map, jx, Math.floor(y) + 1, jz, player);
            // standX/standZ (see findLandingBelow's own comment) - without this, a knight's-move
            // landing on an off-center aabb/obb (like this branch's own "PathJumpHardTest" crate,
            // referenced two branches up) fell back to plain cell-center for every LATER edge
            // launched from here, since cameFrom never got a real stand position to hand back.
            // Confirmed live: cell-center is close enough to this specific crate's actual (off-
            // center, see findAabbStandY's own header) footprint that the takeoff itself looked
            // fine, but the subsequent jump off of it consistently failed real-physics
            // verification anyway - a silent, easy-to-miss omission, not a wrong value.
            if (landing && landing.drop <= MOVEMENT_PROFILE.maxFallLevels && hasHeadroom(map, x, y, z, jx, landing.y, jz, player)) {
                // Same fractional-landing premium as the cardinal/45° gap-jump's own fall branch
                // above - see that one's comment for the full reasoning ("PathEasyParkourTestA").
                const aabbLandingPremium = landing.standX !== undefined ? 10 + (dist - 2) * 5 : 0;
                const fractionalRisePremium = landing.y > y + 0.05 ? 10 : 0;
                const narrowUnevenPremium = landing.standX !== undefined && Number.isInteger(y) ? 4 : 0;
                neighbors.push({ x: jx, y: landing.y, z: jz, type: EDGE_TYPE.JUMP, cost: dist + 1 + landing.drop * 0.3 + aabbLandingPremium + fractionalRisePremium + narrowUnevenPremium, standX: landing.standX, standZ: landing.standZ });
            };
        };
    };

    // Half-height step generator - covers two things the ORIGINAL integer-only loops above can't:
    // (1) stepping onto/off an aabb/obb block whose real support height is a FRACTION of a cell
    // (like "generic.grass-half.aabb", top surface at y+0.5 not y+1), and (2) any adjacent-cell
    // step at all once the CURRENT position is itself such a fractional height - cellAt (used
    // throughout the loops above) silently returns undefined for a non-integer array index, so
    // once a search reaches a half-step node, the EXISTING loops can't see anything from there at
    // all, ordinary full-height floor included. Confirmed on "HalfTestMap": a staircase built
    // from alternating half-aabb/full blocks was completely unreachable past its first (integer-
    // height) step, since nothing after that first fractional step could resolve any further
    // neighbors. Only runs with a real player - findAabbStandY needs the real collider to probe
    // with, and there's no static colliderType-based guess for an author-arbitrary aabb/obb shape
    // the way there is for a full block or a ramp.
    if (player) {
        // Math.floor(y) - 1, not just floor(y)/floor(y)+1/ceil(y) - without the level below, this
        // loop could only ever find a fractional aabb/obb target at or above the current height,
        // so a DIAGONAL step down onto one (dist=1, not a straight orthogonal drop - see the
        // dedicated "down" FALL case a few lines above - and not far enough to be a gap-jump
        // either) had no candidate-generation path anywhere in this file at all. Confirmed on
        // "PathEasyParkourTestA": the crate stepping-stone chain this block's own HORIZONTAL_8
        // comment describes is only reachable by stepping DOWN onto the first crate diagonally
        // from a raised walkway one level up - every other crate-to-crate hop in that same chain
        // is itself a same-level (or near-same-level) diagonal step this loop already covered, but
        // that very first entry step was still invisible, silently forcing the planner to route
        // around the whole chain via one long, marginal gap-jump instead (verified live: not a
        // single one of the chain's short hops was ever even attempted).
        const nearbyIntegerYs = [Math.floor(y) - 1, Math.floor(y), Math.floor(y) + 1, Math.ceil(y)];
        // HORIZONTAL_8, not HORIZONTAL_4 - unlike the ordinary standing-jump climb loop above
        // (deliberately cardinal-only, see its own comment: a diagonal STANDING jump clearing a
        // full level is a much less reliable input to execute), a hop between two adjacent
        // half-height aabb/obb steps is a much smaller, flatter motion - closer to a diagonal WALK
        // (already offered in all 8 directions, see the corner-cut-guarded loop above) than to a
        // full standing jump - and real physics verification (simulateEdgeCached, in findPath)
        // still decides whether any specific diagonal candidate this offers actually works, same
        // as every other candidate in this file. Confirmed necessary on "PathEasyParkourTestA": a
        // chain of small crates used as stepping stones is laid out diagonally (no orthogonal path
        // between consecutive crates exists at all, only empty air), and a manual recording of a
        // real player crossing it shows exactly this - short, repeated, diagonal hop-to-hop
        // traversal between crate tops - confirming it's a genuine, reliable, intended technique on
        // this map rather than a marginal edge case worth excluding the way the full-level
        // standing-jump diagonal is.
        for (const [dx, dz] of HORIZONTAL_8) {
            const nx = x + dx, nz = z + dz;
            const candidates = new Map(); // targetY -> {cx,cz} (aabb-probed real stand position) | null (plain cell-center)
            const fractionalTargets = new Set();
            // Normal, full-height standable cells near the current height - needed even for an
            // ordinary integer-to-integer step whenever the CURRENT y is fractional, since the
            // walk loop above can't resolve any neighbors from a fractional y at all. These are
            // NOT half-steps - an ordinary "climb onto a full block" candidate duplicated here
            // must keep the SAME cost/run-up treatment the main walk/jump loop above gives it
            // (a real climb needs the run-up), not the cheap smallHop one below. Confirmed on
            // "PathMapTest": this loop was tagging a completely ordinary 1-unit climb onto a
            // full block (nothing fractional about it) as smallHop just because the loop that
            // found it also handles fractional heights, causing the live bot to attempt it as a
            // plain standing jump (no run-up) and fail every time - the A* search then always
            // preferred this bogus cheap (cost 5, wrongly no-run-up) edge over the correct one
            // the main loop already generates (cost 8, real run-up), so the ONLY route offered
            // to climb this wall was the one that couldn't actually be executed.
            for (const checkY of nearbyIntegerYs) {
                if (Math.abs(checkY - y) <= 1.0 && isStandable(map, nx, checkY, nz, player)) candidates.set(checkY, null);
            };
            // Half-height aabb/obb steps, probed for their real (possibly fractional, possibly
            // off-cell-center - see findAabbStandY's own comment) resting position rather than
            // assumed from colliderType alone. These ARE genuine small hops - a standing jump
            // already clears them, so they're marked separately below.
            for (const checkY of nearbyIntegerYs) {
                const stand = findAabbStandY(map, nx, checkY, nz, player);
                if (stand !== null && Math.abs(stand.y - y) <= 1.0) {
                    candidates.set(stand.y, { cx: stand.cx, cz: stand.cz });
                    fractionalTargets.add(stand.y);
                };
            };
            for (const [targetY, standPos] of candidates) {
                const rise = targetY - y;
                // Skipped as "not a real step" ONLY for the plain full-height duplicate (standPos
                // null, see that loop's own comment) - there, a near-zero rise really is redundant
                // with the ordinary same-level WALK loop above, which already covers it whenever
                // the CURRENT y is an integer (the only case that duplicate loop exists for in the
                // first place). That redundancy assumption doesn't hold for a genuine aabb/obb
                // candidate (standPos set): two ADJACENT half-height steps at nearly the same real
                // height are extremely common (two crates of the same size, same collision
                // profile), and a horizontal-only hop between them has NO other way to be
                // generated at all - the ordinary WALK loop can't resolve anything from a
                // fractional current y (see this whole block's own header comment), so skipping a
                // near-zero rise here doesn't defer to some other edge that covers the same move,
                // it just deletes the move outright. Confirmed live on "PathEasyParkourTestA": a
                // crate-to-crate chain's own middle links (each hop landing within a few hundredths
                // of a unit of the previous crate's height) were silently absent from every
                // candidate list, forcing the planner into far less reliable long-range jumps
                // around the gap instead - the crates were reachable, just never to EACH OTHER.
                if (!standPos && Math.abs(rise) < 0.05) continue;
                // Headroom at the landing spot - a standing player is ~0.6 tall, well under one
                // cell, so a hair above the resting height is enough to sample real clearance.
                // Uses the refined stand position when one exists (see findAabbStandY) rather
                // than blindly the cell center, for the same off-center-AABB reason.
                const headroomX = standPos ? standPos.cx : nx + 0.5, headroomZ = standPos ? standPos.cz : nz + 0.5;
                if (player.Collider.playerCollidesWithMap(player, { x: headroomX, y: targetY + 0.3, z: headroomZ })) continue;
                const isSmallHop = fractionalTargets.has(targetY);
                // Adjacent fractional-height supports may be separated by open air even when
                // their grid cells touch. Sample the real player-sized footing along the segment;
                // unsupported samples require a hop instead of a false WALK edge.
                const departureStand = [Math.floor(y), Math.floor(y) - 1]
                    .map(checkY => findAabbStandY(map, x, checkY, z, player))
                    .find(stand => stand !== null && Math.abs(stand.y - y) < 0.05);
                const departureX = departureStand?.cx ?? x + 0.5;
                const departureZ = departureStand?.cz ?? z + 0.5;
                const hasContinuousSupport = [0.25, 0.5, 0.75].every(t =>
                    player.Collider.playerCollidesWithMap(player, {
                        x: departureX + (headroomX - departureX) * t,
                        y: y + rise * t - 0.05,
                        z: departureZ + (headroomZ - departureZ) * t,
                    })
                );
                // Climbing onto a half-height ledge is just a smaller version of the ordinary
                // "up one level" case a few lines above - the player's box hits the ledge's
                // vertical face and stops dead, same as it would at a full block, so this can't
                // be a WALK edge (no jump input) any more than a full-height climb can. Confirmed
                // on "HalfTestMap": tagging this WALK meant physicsSimulation always ran it with
                // jump:false (see the type -> jump mapping in findPath's edge verification), and
                // every attempt to mount a half-block from ground level failed identically -
                // endPos.y never left the approach height, the sim just walked into the face and
                // stalled short of the target. A downward or same-height step needs no such input
                // (gravity and normal ground collision carry the player down/across on their
                // own), so only the ascending case is retyped. A genuine half-step is costed well
                // below a full-level jump (a 0.5-unit hop is far more reliable than clearing a
                // whole level), but an ordinary full climb reuses the main loop's own cost (8) so
                // it doesn't out-compete the correctly-typed edge on price.
                const type = rise > 0 || !hasContinuousSupport ? EDGE_TYPE.JUMP : EDGE_TYPE.WALK;
                const departsFromHalfStep = isSmallHop || !Number.isInteger(y);
                const cost = type === EDGE_TYPE.WALK
                    ? 1 + Math.abs(rise) * 0.3
                    : departsFromHalfStep ? 3 + Math.abs(rise) * 2 : 8;
                // standX/standZ carry the real off-center stand position through to
                // reconstructPath()'s waypoint building (see findAabbStandY's own comment) -
                // undefined for every other edge type, which just falls back to cell-center there
                // exactly as before this existed.
                neighbors.push({ x: nx, y: targetY, z: nz, type, cost, smallHop: departsFromHalfStep && type === EDGE_TYPE.JUMP, standX: standPos?.cx, standZ: standPos?.cz });
            };
        };
    };

    return neighbors;
}

// Minimal binary min-heap keyed by `.f` - map sizes here are small enough that this is plenty
// fast without pulling in a dependency for it.
class MinHeap {
    constructor() { this.items = []; };

    push(item) {
        const items = this.items;
        items.push(item);
        let i = items.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (items[parent].f <= items[i].f) break;
            [items[parent], items[i]] = [items[i], items[parent]];
            i = parent;
        };
    };

    pop() {
        const items = this.items;
        const top = items[0];
        const last = items.pop();
        if (items.length) {
            items[0] = last;
            let i = 0;
            for (; ;) {
                const l = 2 * i + 1, r = 2 * i + 2;
                let smallest = i;
                if (l < items.length && items[l].f < items[smallest].f) smallest = l;
                if (r < items.length && items[r].f < items[smallest].f) smallest = r;
                if (smallest === i) break;
                [items[smallest], items[i]] = [items[i], items[smallest]];
                i = smallest;
            };
        };
        return top;
    };

    get size() { return this.items.length; };
};

function heuristic(x, y, z, gx, gy, gz) {
    const dx = x - gx, dy = y - gy, dz = z - gz;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// A* from `start` to `goal` (both {x,y,z} world positions - floored to voxel indices). Returns
// `null` if no path exists (or the search exceeds `maxExpansions`), otherwise an array of
// { x, y, z, type } - {x,z} are cell centers, `y` is the standing/feet height at that cell,
// `type` is how to get FROM the previous waypoint TO this one (see EDGE_TYPE).
// opts: { maxExpansions, avoidEdges: Set<"x,y,z->x,y,z"> }
export function findPath(room, start, goal, opts = {}) {
    const map = room.map;
    if (!map || !map.data) return null;

    const maxExpansions = opts.maxExpansions ?? 4000;
    // Set of "x,y,z->x,y,z" strings for edges to skip entirely - lets a caller route around an
    // edge that turned out not to actually be traversable (an estimated jump that didn't clear a
    // wall, etc.) without that edge just getting immediately re-selected on the next search,
    // since nothing about the map itself changed. See DeadInternetBot.checkStuck() in index.js.
    const avoidEdges = opts.avoidEdges || null;

    // `start` is the calling bot's real, live Player in the normal in-game case (see
    // DeadInternetBot.pathTo(), which passes `this.player`) - a plain {x,y,z} object otherwise
    // (test-pathfinding.js's synthetic fixtures, the algorithmic all-pairs check in shared.js,
    // which deliberately wants the fast static-only path since it's checking connectivity across
    // thousands of pairs, not verifying execution). See physicsSimulation.js's canSimulate(). This
    // same real player also backs every isStandable/hasHeadroom check below (see
    // isBlockedAt/hasRealSupport) - real, live-geometry candidate generation whenever a real
    // player is available, the same colliderType-based guess as before only when one isn't.
    const player = canSimulate(start) ? start : null;

    // A real player standing on solid ground settles to y values like 1.999999990463257, not a
    // clean 2.0 - gravity/collision resolution converges toward the boundary rather than snapping
    // to it exactly. A bare Math.floor() reads that as y=1 (one full cell below where the player
    // actually stands), landing sy on a non-standable cell and failing the search immediately even
    // though the player is genuinely standing on solid ground one cell up. Confirmed as the actual
    // cause of "no path" on legs that worked fine in isolation (a fresh respawn() teleport lands on
    // an exact y with no float drift, masking this everywhere except a bot chaining real,
    // physics-settled movement across several legs in a row, e.g. mid-tour in pathtestall). The
    // epsilon is small enough it can't flip a genuinely-below position (mid-fall y values aren't
    // this close to an integer).
    let sx = Math.floor(start.x), sy = Math.floor(start.y + 1e-6), sz = Math.floor(start.z);
    const gx = Math.floor(goal.x), gy = Math.floor(goal.y), gz = Math.floor(goal.z);

    // The start position is wherever the bot actually is, which might not itself read as
    // "standable" this exact tick (mid-jump, mid-fall, right at a cell boundary) - fall back to
    // searching from the nearest standable cell under/around it rather than failing outright.
    if (!isStandable(map, sx, sy, sz, player)) {
        const landing = findLandingBelow(map, sx, sy + 1, sz, player);
        if (landing) { sy = landing.y; } else if (isStandable(map, sx, sy - 1, sz, player)) { sy -= 1; };
    };

    if (!inBounds(map, sx, sy, sz) || !inBounds(map, gx, gy, gz)) return null;
    // Both recovery attempts above can fail (no standable landing within maxFallLevels, and the
    // cell directly below isn't standable either) - without this check the search silently
    // proceeded from whatever unresolved, non-standable cell floor(start) happened to land on
    // anyway, seeding the open queue with an invalid node. Confirmed by testing: this let a
    // genuinely non-standable cell (embedded in solid geometry - real floor() there requires a
    // full 2-level column, not 1) get treated as a legitimate "current" node, generating bogus
    // candidate edges from a position a real player could never actually occupy.
    if (!isStandable(map, sx, sy, sz, player)) return null;
    if (!isStandable(map, gx, gy, gz, player)) return null;

    const startKey = key(sx, sy, sz);
    const goalKey = key(gx, gy, gz);
    if (startKey === goalKey) return [];

    const open = new MinHeap();
    const gScore = new Map([[startKey, 0]]);
    const cameFrom = new Map();
    open.push({ x: sx, y: sy, z: sz, f: heuristic(sx, sy, sz, gx, gy, gz) });

    const visited = new Set();
    let expansions = 0;
    // Tracked purely for diagnosing a "no path found" result - a plain null return gives no clue
    // WHERE the reachable region actually stops, forcing a slow manual reconstruction of the map's
    // geometry by hand every time (confirmed painful on "PathShipyardTest": several minutes spent
    // hand-parsing the raw per-mesh-type map JSON before realizing this was even needed). The
    // closest-by-heuristic node ever popped off the open set, updated as a side effect of the
    // search's own normal expansion loop, is exactly "how far did the search actually get" -
    // reported on every failure path below, at effectively zero cost since heuristic() is already
    // computed for every node either way.
    let closestNode = { x: sx, y: sy, z: sz }, closestDist = heuristic(sx, sy, sz, gx, gy, gz);

    while (open.size) {
        const current = open.pop();
        const currentKey = key(current.x, current.y, current.z);
        if (visited.has(currentKey)) continue;
        visited.add(currentKey);

        if (currentKey === goalKey) return reconstructPath(cameFrom, currentKey, map, player);

        const currentDist = heuristic(current.x, current.y, current.z, gx, gy, gz);
        if (currentDist < closestDist) { closestDist = currentDist; closestNode = current; };

        if (++expansions > maxExpansions) {
            console.log(`[deadinternet findPath] no path found (expansion limit) - closest reached: ${closestNode.x},${closestNode.y},${closestNode.z} (${closestDist.toFixed(1)} from goal ${gx},${gy},${gz})`);
            return null;
        };

        // What edge type actually got us TO `current` - used below to penalize chaining a jump
        // directly off another jump/fall with no flat run-up in between (see cost comment), and
        // to recover the real (possibly off-center, see findAabbStandY) stand position `current`
        // represents - `current` itself is just the plain {x,y,z} cell popped off the open-set
        // heap (see the `open.push` calls above), it never carries standX/standZ itself.
        const incomingEntry = cameFrom.get(currentKey);
        const incomingType = incomingEntry?.type;
        const incomingWasSmallHop = !!incomingEntry?.smallHop;

        for (const neighbor of getNeighbors(map, current.x, current.y, current.z, player)) {
            const nKey = key(neighbor.x, neighbor.y, neighbor.z);
            if (visited.has(nKey)) continue;
            if (avoidEdges && avoidEdges.has(`${currentKey}->${nKey}`)) continue;

            // Real-physics verification: don't just trust the static classification below - when
            // a real player is available, actually run the edge through real game physics and
            // only offer it if the player genuinely arrives. LADDER stays on the static path -
            // it's a simple, deterministic mechanic (matching consecutive ry values) that hasn't
            // shown any of the real-geometry mismatches WALK/RAMP/JUMP/FALL have.
            // Declared here, outside the verification block below, so cameFrom.set() further down
            // (which needs it to give the live bot's waypoint the same corrected position the
            // verifier just checked) can still see it - see findAabbStandY's WALK-support case.
            let toSupportStandY = null;
            let fractionalRampRise = false;
            if (player && neighbor.type !== EDGE_TYPE.LADDER) {
                // A ramp cell's real collision mesh is a diagonal incline, not a flat floor at the
                // cell's nominal integer y - placing the simulated player exactly at that y, at the
                // cell's horizontal center, can land them BELOW (or even inside the raised face of)
                // the incline's actual surface at that xz point, embedding them in solid geometry
                // and blocking every direction of movement. A single fixed offset isn't reliable
                // across every ry/iwedge combination - see findRampRestY, which probes for an
                // actually-clear height with the real collider instead of guessing one.
                const fromCell = cellAt(map, current.x, current.y, current.z);
                const toCell = cellAt(map, neighbor.x, neighbor.y, neighbor.z);
                // A jump departing a ramp needs the real exit edge (see findRampExitXZ), not just
                // the corrected rest height findRampRestY already gives every other ramp case
                // (walking onto/off one, or landing on one) - only scoped to JUMP so an ordinary
                // walk across a ramp still uses its own existing center-based handling untouched.
                const rampExit = (isRampCell(fromCell) && neighbor.type === EDGE_TYPE.JUMP)
                    ? findRampExitXZ(map, current.x, current.y, current.z, neighbor.x - current.x, neighbor.z - current.z, player)
                    : null;
                // The landing-side mirror of rampExit above: a jump ONTO a ramp was, until now,
                // still verified/aimed at plain cell-center + findRampRestY's height-only sweep -
                // fine for a flat cell, but for a diagonal wedge that combination can land the
                // target well up the slope's HIGH side (findRampRestY's sweep order [0.5,0.75,...]
                // has no notion of "which side is the approaching player coming from", it just
                // returns the first clear height at dead-center). Confirmed live on
                // "PathJumpHardTest": the replanned checkpoint3->wedge fallback jump aimed at
                // (7.5, 2.9, ~5.5) - near the wedge's PEAK - which is a far longer, barely-
                // reachable leap than the wedge actually requires; real physics traced this exact
                // jump: apex only reached y=2.77 (short of 2.9), horizontal velocity got killed
                // dead mid-arc at x=6.74 (0.76 short of the wedge), and the bot fell straight into
                // the gap it was trying to cross. findRampExitXZ already solves the identical
                // problem the other direction (sweeping from a ramp's own center toward a
                // departure direction to find the true far edge) - reusing it here with the
                // direction reversed (from the ramp's center back toward the APPROACHING cell)
                // finds the near/low edge instead, which is what a jump landing on a ramp should
                // actually aim for: the closest valid point on the slope, not its summit.
                // Reported live by the map author, from actually playing this jump by hand: a
                // dead-on square approach doesn't work here - the fix is to angle slightly LEFT
                // (relative to the direction of travel) going into the jump, which lets the
                // player's collision box glance/slide onto the slope instead of catching its edge
                // square-on the way a perfectly centered approach does. Blended into the entry
                // sweep direction below, not just the final landing point - findRampExitXZ sweeps
                // outward from the ramp's own center, and every phase of the run-up/flight re-aims
                // at that same waypoint every tick (see physicsSimulation.js/index.js), so biasing
                // the target here carries the same left angle through the whole approach, not only
                // the touchdown spot. "Left" is CONTROL.left's own convention (player.js: ddx -=
                // cos(yaw), ddz += sin(yaw)), which for a direction vector (dx,dz) works out to the
                // perpendicular (-dz,dx) - rotate the approach direction 90 degrees the same way a
                // player strafing left while facing it would.
                // A "landing a level higher than takeoff" JUMP (see the dedicated diagonal/
                // knight's-move jump generator further up this file) can ALSO be resting on a
                // ramp without the target cell itself being classified as one - isStandable's
                // hasRealSupport treats "a ramp directly below" as automatic support, so a jump
                // targeting the empty cell one level above a wedge (e.g. (7,3,5) above the wedge
                // at (7,2,5)) is real and valid, but toCell here is that empty cell, not the ramp
                // itself - isRampCell(toCell) alone misses it entirely. Checking the cell directly
                // below the target catches this second ramp-adjacent case too, using the RAMP's
                // own (x, y-1, z) as the anchor for the same entry-point/left-bias correction
                // above, since that's where the real sloped geometry actually lives.
                const belowToCell = cellAt(map, neighbor.x, neighbor.y - 1, neighbor.z);
                const rampBelowTarget = !isRampCell(toCell) && isRampCell(belowToCell);
                let rampEntry = null;
                // Also applies to a plain RAMP-type edge (walking up the slope from an adjacent
                // cell, not jumping onto it) - confirmed live this same left/near-edge correction
                // was needed there too: the cheapest (cost 1.1) route onto this exact wedge from
                // checkpoint4 is a RAMP edge, not a JUMP, and it was landing at dead cell-center +
                // raw uncorrected y (no findRampRestY, no entry-point sweep at all - toSupportY
                // only ever covered WALK) purely because the isRampCell(toCell)/rampBelowTarget
                // checks above were gated to JUMP only, so this cheaper, more-often-chosen edge
                // silently bypassed the whole fix.
                //
                // NOTE: this verification-time value only feeds simulateEdgeCached below - it is
                // NOT what the live bot ends up aiming at for a waypoint that also has an outgoing
                // jump, since reconstructPath's departure-correction pass (see its own comment)
                // runs afterward and recomputes x/y/z from the OUTGOING direction, which the
                // search loop can't know yet at this point (the next edge isn't chosen until
                // after the whole path is found). That pass runs the same slope-axis projection
                // with the incoming direction available there - the two independently reach
                // compatible (not necessarily identical) answers by design, the same way a
                // verified edge and its live execution are never pixel-identical elsewhere in
                // this file either.
                // Also applies to a plain WALK-classified edge landing on a ramp - a same-level
                // move onto/between ramp cells (e.g. two adjacent wedges near the same nominal Y,
                // like "PathJumpHardTest" checkpoint5->goal's ramp-to-ramp step) is generated by
                // the ordinary same-level WALK loop, not the up-one-level RAMP-climb generator,
                // since it isn't gaining a whole level by the graph's own integer-Y bookkeeping.
                // Confirmed live: this exact transition was still landing at the ramp's raw,
                // uncorrected findRampRestY height (no correction, no near-edge sweep) purely
                // because WALK wasn't in this type gate - same silent-bypass shape as the RAMP
                // case above, just one more edge type wide.
                if ((isRampCell(toCell) || rampBelowTarget) && (neighbor.type === EDGE_TYPE.JUMP || neighbor.type === EDGE_TYPE.RAMP || neighbor.type === EDGE_TYPE.WALK)) {
                    const rampAnchorY = rampBelowTarget ? neighbor.y - 1 : neighbor.y;
                    // Sweep along the ramp's OWN exact slope axis (see rampSlopeAxis), not the
                    // raw cardinal travel direction and not an empirically-tuned lateral bias -
                    // but WHICH of the two directions along that axis (uphill or downhill) is the
                    // near/entry side can't always be picked by dot-producting against the travel
                    // vector: when the approach is exactly perpendicular to the slope axis (a real
                    // case, not a corner case - confirmed live on "PathJumpHardTest" checkpoint3-
                    // >wedge1, a pure-X approach onto a pure-Z-axis ramp), that dot product is
                    // exactly zero and carries no information at all, silently defaulting to
                    // whichever sign the tie-break happens to favor regardless of which is
                    // actually right. Trying BOTH real candidate points and keeping whichever
                    // lands closer to where the player is ACTUALLY coming from sidesteps the
                    // degenerate case entirely - it's a real distance comparison, not a direction
                    // heuristic that can cancel to nothing.
                    const anchorCell = cellAt(map, neighbor.x, rampAnchorY, neighbor.z);
                    const slopeAxis = rampSlopeAxis(isRampCell(anchorCell) ? anchorCell : toCell);
                    const candidatePos = findRampExitXZ(map, neighbor.x, rampAnchorY, neighbor.z, slopeAxis.x, slopeAxis.z, player);
                    const candidateNeg = findRampExitXZ(map, neighbor.x, rampAnchorY, neighbor.z, -slopeAxis.x, -slopeAxis.z, player);
                    const distToCurrentPos = Math.length2(candidatePos.x - current.x, candidatePos.z - current.z);
                    const distToCurrentNeg = Math.length2(candidateNeg.x - current.x, candidateNeg.z - current.z);
                    rampEntry = distToCurrentPos <= distToCurrentNeg ? candidatePos : candidateNeg;
                };
                // A cell resting on a half-height (or otherwise non-cell-filling) aabb/obb support
                // - e.g. a "gray-brick-half" step - has no mesh of its own at its nominal integer y
                // at all; it's genuinely empty air there, held up only by whatever's in the cell
                // BELOW it. isStandable's hasRealSupport (see its own comment) correctly detects
                // that support is present using the real collider, but a presence check isn't a
                // height check: the player's collision BOX can register solid contact near the
                // probe point even when the actual resting surface sits well below the assumed
                // integer y, exactly like the crate takeoff bug findAabbStandY was built for -
                // just triggered through the support check instead of the standing cell itself.
                // Scoped to a genuinely same-level WALK, the only edge type this file has ever
                // found it on: confirmed on "Castle", the long-standing `18,3,6->19,3,6` failure -
                // (18,2,6) is a half-height aabb, (19,2,6) is a full block, and the plain WALK
                // classification silently assumed both sides rest at the same flat y=3 when the
                // real height gap between them is roughly half a unit.
                const fromSupportY = (!isRampCell(fromCell) && neighbor.type === EDGE_TYPE.WALK)
                    ? findAabbStandY(map, current.x, current.y - 1, current.z, player) : null;
                const toSupportY = (!isRampCell(toCell) && neighbor.type === EDGE_TYPE.WALK)
                    ? findAabbStandY(map, neighbor.x, neighbor.y - 1, neighbor.z, player) : null;
                const fromY = rampExit ? rampExit.y : isRampCell(fromCell) ? findRampRestY(map, current.x, current.y, current.z, player) : fromSupportY ? fromSupportY.y : current.y;
                const toY = rampEntry ? rampEntry.y : isRampCell(toCell) ? findRampRestY(map, neighbor.x, neighbor.y, neighbor.z, player) : toSupportY ? toSupportY.y : neighbor.y;
                // Verify from where the bot would REALLY be standing, not the cell's nominal
                // center - for an off-center AABB stand (e.g. a crate whose solid mass isn't
                // centered in its cell, see findAabbStandY), cell-center can be several tenths of
                // a unit away from the real takeoff point, silently verifying a different jump
                // (different distance/angle to the target) than the one the live bot ever
                // actually attempts. incomingEntry is undefined for the search's start node, which
                // falls back to plain cell-center same as before.
                const fromCenter = {
                    x: rampExit ? rampExit.x : incomingEntry?.standX ?? fromSupportY?.cx ?? (current.x + 0.5), y: fromY,
                    z: rampExit ? rampExit.z : incomingEntry?.standZ ?? fromSupportY?.cz ?? (current.z + 0.5),
                };
                const toCenter = {
                    x: rampEntry ? rampEntry.x : toSupportY?.cx ?? (neighbor.x + 0.5), y: toY,
                    z: rampEntry ? rampEntry.z : toSupportY?.cz ?? (neighbor.z + 0.5),
                };
                fractionalRampRise = neighbor.type === EDGE_TYPE.JUMP && !!rampEntry
                    && toCenter.y > fromCenter.y && toCenter.y - fromCenter.y < 0.75;
                // A straight-line WALK crossing two ramps whose slope axes are genuinely
                // perpendicular (see reconstructPath's peak-insertion pass for the full
                // reasoning) is structurally NOT something this offline verifier can model
                // correctly - simulateEdge only ever re-aims at ONE fixed target the whole
                // simulated approach, tracing a straight line, while the real crossing needs two
                // straight segments joined by an actual turn at the first ramp's peak. Confirmed
                // live on "PathJumpHardTest" checkpoint5->goal: the single-target simulation
                // genuinely can't reach the far side, bailing every time, which starves the
                // search of the only edge that bridges the two ramps and leaves no path at all -
                // not because the live bot can't make the crossing (reconstructPath's peak
                // insertion lets it do exactly the two-segment walk this verifier can't
                // simulate), only because this check has no way to model it. Trusted structurally
                // instead, the same way LADDER already is above (a simple, deterministic
                // geometric relationship, not the kind of real-geometry mismatch this
                // verification exists to catch).
                const rampAxisTurn = isRampCell(fromCell) && isRampCell(toCell)
                    && (neighbor.type === EDGE_TYPE.WALK || neighbor.type === EDGE_TYPE.RAMP)
                    && Math.abs(rampSlopeAxis(fromCell).x * rampSlopeAxis(toCell).x + rampSlopeAxis(fromCell).z * rampSlopeAxis(toCell).z) <= 0.3;
                const simResult = rampAxisTurn ? { success: true } : simulateEdgeCached(room, player, currentKey, nKey, fromCenter, toCenter, {
                    jump: neighbor.type === EDGE_TYPE.JUMP, fractionalRampRise, ladderCatch: neighbor.ladderCatch,
                });
                if (!simResult.success) continue;
                // toSupportY carries into cameFrom.set() below (via toSupportStandY, hoisted above
                // this if-block) - NOT by overwriting neighbor.y itself, which is already baked into
                // nKey and the open-heap push above this block; changing it here would desync the
                // search graph's own node identity from what's actually on the heap. standX/standZ
                // (see findAabbStandY) are the established channel for "the real position differs
                // from cell-center" without touching graph identity - toSupportStandY reuses it.
                // rampEntry reuses the same channel (reshaped to findAabbStandY's {cx,cz,y} shape)
                // so the live bot's waypoint gets the exact same corrected near-edge landing point
                // the verifier above just checked, not the plain cell-center the graph node itself
                // still carries.
                toSupportStandY = rampEntry ? { cx: rampEntry.x, cz: rampEntry.z, y: rampEntry.y } : toSupportY;
            };

            let edgeCost = neighbor.cost;
            if (
                neighbor.type === EDGE_TYPE.JUMP && !neighbor.smallHop &&
                (incomingType === EDGE_TYPE.JUMP || incomingType === EDGE_TYPE.FALL) && !incomingWasSmallHop
            ) {
                // A standing jump barely clears one level on a good approach with a flat run-up
                // (see MOVEMENT_PROFILE's header comment) - landing straight out of another jump
                // or a fall leaves no room to build that approach, so back-to-back jumps are
                // markedly less reliable in practice than the same jump preceded by a walk (live
                // testing on the "Castle" map confirmed this: chained jumps were the dominant
                // cause of stuck/replan events). Heavily discouraged, not forbidden - a route that
                // genuinely has no flat cell to land on still needs to be reachable, and the
                // self-correcting stuck/replan logic in DeadInternetBot covers the rest.
                //
                // Doesn't apply when either side of the chain is a smallHop (a half-height
                // aabb/obb step) - a smallHop only ever needs a plain standing jump in the first
                // place (see followPath's needsHeight/smallHop handling), not the elaborate
                // run-up this penalty exists to protect. Without this exemption, an ordinary
                // half-block STAIRCASE (necessarily two consecutive smallHop-ish JUMP edges in a
                // row) priced out well above a single risky diagonal/knight's-move shortcut jump
                // straight past it - confirmed on "PathHalfTest": the planner chose that one-shot
                // knight's-move jump over the proven-reliable staircase specifically because the
                // staircase's second jump was getting this +6 penalty and the shortcut wasn't,
                // even though the shortcut is the one that actually struggles to execute live.
                edgeCost += 6;
            };

            const tentativeG = gScore.get(currentKey) + edgeCost;
            if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
                gScore.set(nKey, tentativeG);
                cameFrom.set(nKey, {
                    from: currentKey, type: neighbor.type, x: neighbor.x,
                    y: toSupportStandY ? toSupportStandY.y : neighbor.y, z: neighbor.z,
                    smallHop: neighbor.smallHop,
                    fractionalRampRise,
                    ladderCatch: neighbor.ladderCatch,
                    standX: neighbor.standX ?? toSupportStandY?.cx, standZ: neighbor.standZ ?? toSupportStandY?.cz,
                });
                open.push({ x: neighbor.x, y: neighbor.y, z: neighbor.z, f: tentativeG + heuristic(neighbor.x, neighbor.y, neighbor.z, gx, gy, gz) });
            };
        };
    };

    console.log(`[deadinternet findPath] no path found (open set exhausted) - closest reached: ${closestNode.x},${closestNode.y},${closestNode.z} (${closestDist.toFixed(1)} from goal ${gx},${gy},${gz})`);
    return null;
};

function reconstructPath(cameFrom, goalKey, map, player) {
    const waypoints = [];
    let currentKey = goalKey;
    while (cameFrom.has(currentKey)) {
        const step = cameFrom.get(currentKey);
        // standX/standZ (see findAabbStandY/getNeighbors) override the plain cell-center for an
        // off-center AABB stand position - undefined for every other edge type, which keeps the
        // original x+0.5/z+0.5 exactly as before this existed. gridX/Y/Z (raw, non-centered) are
        // kept alongside for the ramp-exit pass below and stripped before returning.
        // onRamp - whether THIS waypoint's own cell is a ramp/wedge, independent of edge type -
        // lets followPath() (index.js) know its takeoff cell for an outgoing jump is a ramp
        // without re-deriving map/collider state live; see its own use for why that matters
        // (jumpRunupTargetDist's fixed 0.5-unit "near edge of THIS cell" assumption doesn't hold
        // for a ramp, which can offer real, valid ground well past half a cell along the slope).
        waypoints.push({
            x: step.standX ?? (step.x + 0.5), y: step.y, z: step.standZ ?? (step.z + 0.5),
            type: step.type, smallHop: step.smallHop, fractionalRampRise: step.fractionalRampRise,
            ladderCatch: step.ladderCatch,
            onRamp: isRampCell(cellAt(map, step.x, step.y, step.z)),
            gridX: step.x, gridY: step.y, gridZ: step.z,
        });
        currentKey = step.from;
    };
    waypoints.reverse();

    // Two adjacent ramps whose slope axes are NOT roughly parallel can't be crossed by aiming at
    // a single target the whole way - every other movement mechanic in this file (WALK, JUMP,
    // reconstructPath's own departure correction below) continuously re-aims at ONE fixed point,
    // which traces a straight line, not the two-segment "walk to the peak, turn, walk onto the
    // next slope" a real perpendicular ramp junction actually needs. Reported live and confirmed
    // as intentional, fully-traversable map design on "PathJumpHardTest" checkpoint5->goal (one
    // ramp climbing along Z meeting a second climbing along X): the live bot stalled right at the
    // seam between them, short of a single combined target, because a straight line from its
    // start to that target doesn't correspond to any real walkable path across two differently-
    // oriented slopes. Splitting this into a genuine intermediate stop at the FIRST ramp's own
    // true peak (rampSlopeAxis's uphill direction specifically, not the distance-based pick used
    // elsewhere in this file for entry/exit ambiguity - a peak junction is a real, singular point,
    // not a choice between two candidates) turns the crossing into two straight segments joined by
    // an actual turn, which is exactly the shape of the map author's own description of the route.
    // Scoped to a real axis mismatch (dot product near zero) so two ramps that already share an
    // axis - the ordinary single-ramp case, or two ramps climbing the same direction - are left as
    // the single-target straight walk they always were, unaffected.
    if (player) {
        const expanded = [];
        for (let i = 0; i < waypoints.length; i++) {
            const w = waypoints[i];
            expanded.push(w);
            const next = waypoints[i + 1];
            if (!next) continue;
            const wCell = cellAt(map, w.gridX, w.gridY, w.gridZ);
            const nextCell = cellAt(map, next.gridX, next.gridY, next.gridZ);
            if (!isRampCell(wCell) || !isRampCell(nextCell)) continue;
            const wAxis = rampSlopeAxis(wCell);
            const nextAxis = rampSlopeAxis(nextCell);
            const axisDot = wAxis.x * nextAxis.x + wAxis.z * nextAxis.z;
            if (Math.abs(axisDot) > 0.3) continue;
            const peak = findRampExitXZ(map, w.gridX, w.gridY, w.gridZ, wAxis.x, wAxis.z, player);
            expanded.push({
                x: peak.x, y: peak.y, z: peak.z, type: EDGE_TYPE.WALK, smallHop: false, onRamp: true,
                gridX: w.gridX, gridY: peak.y, gridZ: w.gridZ,
            });
        };
        waypoints.length = 0;
        waypoints.push(...expanded);
    };

    // A JUMP departing a ramp needs to start from the ramp's real edge, not its geometric center
    // (see findRampExitXZ) - but which edge that is depends on which DIRECTION the bot leaves in,
    // and that's only known once the NEXT waypoint is known too. findPath's own edge-verification
    // loop discovers this ramp waypoint before its outgoing edge is chosen, so it can't apply this
    // there; reconstructPath already has the full ordered sequence, so it's the natural place to
    // look one step ahead and correct it. Confirmed on "PathJumpHardTest" checkpoint4->5: without
    // this, the live bot walked to the ramp's cell-center and jumped from there, needing 3.0 units
    // of real travel to reach the landing platform against a measured ~2.2-2.3 unit reach - a
    // consistent ~0.75 unit shortfall, not borderline jitter.
    if (player) {
        const expanded = [];
        for (let i = 0; i < waypoints.length; i++) {
            const w = waypoints[i];
            expanded.push(w);
            const next = waypoints[i + 1];
            if (!next || next.type !== EDGE_TYPE.JUMP) continue;
            const cell = cellAt(map, w.gridX, w.gridY, w.gridZ);
            if (!isRampCell(cell)) continue;
            // Sweeping along the ramp's own exact slope axis (see rampSlopeAxis) here too - not
            // the raw outgoing direction - keeps this pass and getNeighbors' verification-time
            // computation geometrically consistent by construction, since both derive the same
            // axis from the same cell instead of independently approximating it.
            //
            // Which of the two directions along that axis is the departure side gets picked by
            // trying both real candidates and keeping whichever lands closer to the NEXT
            // waypoint, not a dot product against the raw outgoing vector - the same degenerate-
            // when-perpendicular problem as the entry side above applies here too (a departure
            // exactly perpendicular to the slope axis would zero the dot product out), so this
            // uses the same real-distance comparison instead.
            const slopeAxis = rampSlopeAxis(cell);
            const candidatePos = findRampExitXZ(map, w.gridX, w.gridY, w.gridZ, slopeAxis.x, slopeAxis.z, player);
            const candidateNeg = findRampExitXZ(map, w.gridX, w.gridY, w.gridZ, -slopeAxis.x, -slopeAxis.z, player);
            const distToNextPos = Math.length2(candidatePos.x - next.gridX - 0.5, candidatePos.z - next.gridZ - 0.5);
            const distToNextNeg = Math.length2(candidateNeg.x - next.gridX - 0.5, candidateNeg.z - next.gridZ - 0.5);
            const exit = distToNextPos <= distToNextNeg ? candidatePos : candidateNeg;
            // This pass used to overwrite w.x/y/z unconditionally - correct for a waypoint that's
            // ONLY a takeoff point (checkpoint3->wedge: the bot arrives near the ramp's center and
            // only the departure edge matters), but wrong whenever w is ALSO a genuine ARRIVAL
            // target for a preceding WALK/RAMP-climb edge from a different ramp (confirmed live on
            // "PathJumpHardTest" checkpoint5->goal: w here is the corrected NEAR/entry edge coming
            // off ramp1's perpendicular turn - see the peak-insertion pass above - and overwriting
            // it in place with the FAR/exit edge silently discarded the entry point the incoming
            // walk needs, sending the live bot on a straight line from ramp1's peak toward the
            // exit edge instead, which walks it straight into the ramp's own solid geometry short
            // of ever reaching a climbable surface - stuck at the seam, never able to progress).
            // Inserting the corrected exit as its own extra waypoint instead of mutating w keeps
            // both real positions intact: walk to the entry edge, THEN walk the short remaining
            // distance to the takeoff edge, THEN jump - exactly what a real player does, and
            // strictly more correct even for the single-ramp case this pass originally targeted
            // (entry and exit collapse to (near-)identical points there, so the extra waypoint is
            // a negligible no-op hop rather than a behavior change).
            const exitDist = Math.length2(exit.x - w.x, exit.z - w.z);
            if (exitDist > 0.15) {
                expanded.push({
                    x: exit.x, y: exit.y, z: exit.z, type: EDGE_TYPE.WALK, smallHop: false, onRamp: true,
                    gridX: w.gridX, gridY: w.gridY, gridZ: w.gridZ,
                });
            } else {
                w.x = exit.x; w.y = exit.y; w.z = exit.z;
            };
        };
        waypoints.length = 0;
        waypoints.push(...expanded);
    };

    for (const w of waypoints) { delete w.gridX; delete w.gridY; delete w.gridZ; };
    return waypoints;
};
