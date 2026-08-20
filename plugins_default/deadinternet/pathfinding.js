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
    maxJumpLevels: 1, // how many grid levels a standing jump can clear
    maxFallLevels: 4, // how far a bot will voluntarily walk off a ledge (no fall damage in this game, but an unbounded drop looks unnatural and can strand a bot in an unreachable pit)
    arrivalRadius: 0.3, // how close (horizontally) to a waypoint counts as "reached it" - keep below 0.5 (half a cell) so a bot never overshoots into the next cell before advancing
};

const HORIZONTAL_8 = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
];
const HORIZONTAL_4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function inBounds(map, x, y, z) {
    return x >= 0 && x < map.width && y >= 0 && y < map.height && z >= 0 && z < map.depth;
}

function cellAt(map, x, y, z) {
    if (!inBounds(map, x, y, z)) return null;
    return map.data[x][y][z];
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

// A cell that doesn't block horizontal movement through it - either genuinely empty, or a
// ramp/ladder a player can walk into (same "passable" set isStandable treats specially).
function isPassable(map, x, y, z, player) {
    const cell = cellAt(map, x, y, z);
    return !isBlockedAt(map, x, y, z, player) || isRampCell(cell) || isLadderCell(cell);
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

    if (isRampCell(here)) return true;

    return hasRealSupport(map, x, y, z, player);
}

// Vertical drop to the first standable cell below (x,z), starting the search at y-1. Returns
// `null` if nothing standable is found within MOVEMENT_PROFILE.maxFallLevels.
function findLandingBelow(map, x, y, z, player) {
    for (let dy = 1; dy <= MOVEMENT_PROFILE.maxFallLevels; dy++) {
        const cy = y - dy;
        if (cy < 0) return null;
        if (isStandable(map, x, cy, z, player)) return { x, y: cy, z, drop: dy };
    }
    return null;
}

// Headroom check for a jump/walk into (x,y,z): the destination cell and the cell above the
// takeoff point both need to be clear, or a standing player (0.6 tall, well under 1 cell) would
// bonk their head mid-jump. Real collision check when a player is available (see isBlockedAt) -
// not exact when it falls back to the colliderType guess, but the physics simulation is still the
// actual arbiter of whether a generated candidate really works either way.
function hasHeadroom(map, fromX, fromY, fromZ, toX, toY, toZ, player) {
    const above = Math.max(fromY, toY) + 1;
    return !isBlockedAt(map, fromX, above - 1, fromZ, player) && !isBlockedAt(map, toX, above - 1, toZ, player);
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
        const up = cellAt(map, x, y + 1, z);
        if (isLadderCell(up) && up.ry === hereCell.ry) {
            neighbors.push({ x, y: y + 1, z, type: EDGE_TYPE.LADDER, cost: 1 });
        } else if (isStandable(map, x, y + 1, z, player)) {
            // top of the ladder - stepping off onto solid ground directly above it, same as
            // climbing out at the top of a real ladder.
            neighbors.push({ x, y: y + 1, z, type: EDGE_TYPE.LADDER, cost: 1 });
        };
        const down = cellAt(map, x, y - 1, z);
        if (down && (isLadderCell(down) ? down.ry === hereCell.ry : isStandable(map, x, y - 1, z, player))) {
            neighbors.push({ x, y: y - 1, z, type: EDGE_TYPE.LADDER, cost: 1 });
        };
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
        const cornerClear = !isDiagonal || (isPassable(map, x + dx, y, z, player) && isPassable(map, x, y, z + dz, player));
        if (cornerClear && isStandable(map, nx, y, nz, player) && hasHeadroom(map, x, y, z, nx, y, nz, player)) {
            const cost = isDiagonal ? Math.SQRT2 : 1;
            neighbors.push({ x: nx, y, z: nz, type: EDGE_TYPE.WALK, cost });
        };
    };

    for (const [dx, dz] of HORIZONTAL_4) {
        const nx = x + dx, nz = z + dz;

        // Up one level - via ramp (cheap, no jump needed) or a standing jump (more expensive,
        // and capped by MOVEMENT_PROFILE.maxJumpLevels).
        if (isStandable(map, nx, y + 1, nz, player) && hasHeadroom(map, x, y, z, nx, y + 1, nz, player)) {
            const viaRamp = isRampCell(cellAt(map, nx, y, nz)) || isRampCell(hereCell);
            // Jumps are weighted heavily against, not just mildly - real in-game testing showed
            // a standing jump clearing a full level is frequently unreliable in practice (the
            // estimated MOVEMENT_PROFILE clearance doesn't always match what the real physics
            // engine actually lets a standing jump clear), so the planner should only reach for
            // one when there's genuinely no walk/ramp/fall route around it, not whenever one is
            // merely the shortest option on paper.
            neighbors.push({
                x: nx, y: y + 1, z: nz,
                type: viaRamp ? EDGE_TYPE.RAMP : EDGE_TYPE.JUMP,
                cost: viaRamp ? 1.1 : 4,
            });
        };

        // Down - walking off a ledge. Falls further than one level still cost more (mildly
        // discourages routing a bot off a cliff when a gentler path exists), but are allowed up
        // to maxFallLevels since there's no fall damage in this game.
        if (!isStandable(map, nx, y, nz, player)) {
            const landing = findLandingBelow(map, nx, y, nz, player);
            if (landing && hasHeadroom(map, x, y, z, nx, y, nz, player)) {
                neighbors.push({ x: nx, y: landing.y, z: nz, type: EDGE_TYPE.FALL, cost: 1 + landing.drop * 0.3 });
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
    // same real player also backs every isStandable/isPassable/hasHeadroom check below (see
    // isBlockedAt/hasRealSupport) - real, live-geometry candidate generation whenever a real
    // player is available, the same colliderType-based guess as before only when one isn't.
    const player = canSimulate(start) ? start : null;

    let sx = Math.floor(start.x), sy = Math.floor(start.y), sz = Math.floor(start.z);
    const gx = Math.floor(goal.x), gy = Math.floor(goal.y), gz = Math.floor(goal.z);

    // The start position is wherever the bot actually is, which might not itself read as
    // "standable" this exact tick (mid-jump, mid-fall, right at a cell boundary) - fall back to
    // searching from the nearest standable cell under/around it rather than failing outright.
    if (!isStandable(map, sx, sy, sz, player)) {
        const landing = findLandingBelow(map, sx, sy + 1, sz, player);
        if (landing) { sy = landing.y; } else if (isStandable(map, sx, sy - 1, sz, player)) { sy -= 1; };
    };

    if (!inBounds(map, sx, sy, sz) || !inBounds(map, gx, gy, gz)) return null;
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

    while (open.size) {
        const current = open.pop();
        const currentKey = key(current.x, current.y, current.z);
        if (visited.has(currentKey)) continue;
        visited.add(currentKey);

        if (currentKey === goalKey) return reconstructPath(cameFrom, currentKey);

        if (++expansions > maxExpansions) return null;

        // What edge type actually got us TO `current` - used below to penalize chaining a jump
        // directly off another jump/fall with no flat run-up in between (see cost comment).
        const incomingType = cameFrom.get(currentKey)?.type;

        for (const neighbor of getNeighbors(map, current.x, current.y, current.z, player)) {
            const nKey = key(neighbor.x, neighbor.y, neighbor.z);
            if (visited.has(nKey)) continue;
            if (avoidEdges && avoidEdges.has(`${currentKey}->${nKey}`)) continue;

            // Real-physics verification: don't just trust the static classification below - when
            // a real player is available, actually run the edge through real game physics and
            // only offer it if the player genuinely arrives. LADDER stays on the static path -
            // it's a simple, deterministic mechanic (matching consecutive ry values) that hasn't
            // shown any of the real-geometry mismatches WALK/RAMP/JUMP/FALL have.
            if (player && neighbor.type !== EDGE_TYPE.LADDER) {
                const fromCenter = { x: current.x + 0.5, y: current.y, z: current.z + 0.5 };
                const toCenter = { x: neighbor.x + 0.5, y: neighbor.y, z: neighbor.z + 0.5 };
                const simResult = simulateEdgeCached(room, player, currentKey, nKey, fromCenter, toCenter, { jump: neighbor.type === EDGE_TYPE.JUMP });
                if (!simResult.success) {
                    const describe = (cell) => cell?.mesh ? { colliderType: cell.mesh.colliderType, name: cell.mesh.name, rx: cell.rx, ry: cell.ry, rz: cell.rz } : cell ? 'empty' : 'out-of-bounds';
                    console.log('[pathfinding DEBUG] rejected', neighbor.type, currentKey, '->', nKey, {
                        hereCell: describe(cellAt(map, current.x, current.y, current.z)),
                        neighborCellAtSameY: describe(cellAt(map, neighbor.x, current.y, neighbor.z)),
                        neighborCellBelow: describe(cellAt(map, neighbor.x, neighbor.y - 1, neighbor.z)),
                    });
                    continue;
                };
            };

            let edgeCost = neighbor.cost;
            if (neighbor.type === EDGE_TYPE.JUMP && (incomingType === EDGE_TYPE.JUMP || incomingType === EDGE_TYPE.FALL)) {
                // A standing jump barely clears one level on a good approach with a flat run-up
                // (see MOVEMENT_PROFILE's header comment) - landing straight out of another jump
                // or a fall leaves no room to build that approach, so back-to-back jumps are
                // markedly less reliable in practice than the same jump preceded by a walk (live
                // testing on the "Castle" map confirmed this: chained jumps were the dominant
                // cause of stuck/replan events). Heavily discouraged, not forbidden - a route that
                // genuinely has no flat cell to land on still needs to be reachable, and the
                // self-correcting stuck/replan logic in DeadInternetBot covers the rest.
                edgeCost += 6;
            };

            const tentativeG = gScore.get(currentKey) + edgeCost;
            if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
                gScore.set(nKey, tentativeG);
                cameFrom.set(nKey, { from: currentKey, type: neighbor.type, x: neighbor.x, y: neighbor.y, z: neighbor.z });
                open.push({ x: neighbor.x, y: neighbor.y, z: neighbor.z, f: tentativeG + heuristic(neighbor.x, neighbor.y, neighbor.z, gx, gy, gz) });
            };
        };
    };

    if (player) {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const k of visited) {
            const [vx, , vz] = k.split(',').map(Number);
            if (vx < minX) minX = vx; if (vx > maxX) maxX = vx;
            if (vz < minZ) minZ = vz; if (vz > maxZ) maxZ = vz;
        };
        console.log('[pathfinding DEBUG] exhausted search', { start: { sx, sy, sz }, goal: { gx, gy, gz }, expansions, visitedCount: visited.size, visitedBounds: { minX, maxX, minZ, maxZ } });

        // Was the goal ever actually reachable in principle? Check each of its own 8 horizontal
        // neighbors (plus straight up/down) directly: was it visited, and if so, why didn't
        // getNeighbors from there ever offer the goal itself as a candidate?
        for (const [dx, dz] of [...HORIZONTAL_8, [0, 0]]) {
            for (const dy of [0, 1, -1]) {
                const nx = gx + dx, ny = gy + dy, nz = gz + dz;
                const nKeyCheck = key(nx, ny, nz);
                if (!visited.has(nKeyCheck)) continue;
                const theirNeighbors = getNeighbors(map, nx, ny, nz, player).map(n => `${n.x},${n.y},${n.z}(${n.type})`);
                console.log('[pathfinding DEBUG] goal-adjacent visited node', nKeyCheck, 'offers:', theirNeighbors, 'includes goal:', theirNeighbors.some(n => n.startsWith(`${gx},${gy},${gz}(`)));
            };
        };
    };

    return null;
};

function reconstructPath(cameFrom, goalKey) {
    const waypoints = [];
    let currentKey = goalKey;
    while (cameFrom.has(currentKey)) {
        const step = cameFrom.get(currentKey);
        waypoints.push({ x: step.x + 0.5, y: step.y, z: step.z + 0.5, type: step.type });
        currentKey = step.from;
    };
    waypoints.reverse();
    return waypoints;
};
