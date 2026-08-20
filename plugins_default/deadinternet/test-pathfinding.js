// Standalone tests for pathfinding.js - pure logic, no running server needed. Builds small
// synthetic maps shaped exactly like buildMapData's real output (src/shell/loading.js) and
// checks the planner finds (or correctly refuses to find) a route across walls, ramps, ladders,
// jumps, and drops.
//
// Run with: node plugins_default/deadinternet/test-pathfinding.js
//
// This covers the algorithm in isolation. It does NOT prove a bot can actually walk the
// resulting waypoints in the real physics engine - see "In-game verification" in
// plugins_default/deadinternet/README.md for how that part is checked, since that needs an
// actual running room and can't be done from a plain Node script.

import { findPath, isStandable, EDGE_TYPE, MOVEMENT_PROFILE } from './pathfinding.js';

let passed = 0, failed = 0;

function assert(name, condition, detail = '') {
    if (condition) {
        passed++;
        console.log(`  ok - ${name}`);
    } else {
        failed++;
        console.log(`  FAIL - ${name}${detail ? ` (${detail})` : ''}`);
    };
};

function makeMap(width, height, depth) {
    const data = [];
    for (let x = 0; x < width; x++) {
        data[x] = [];
        for (let y = 0; y < height; y++) {
            data[x][y] = [];
            for (let z = 0; z < depth; z++) data[x][y][z] = {};
        };
    };
    return { data, width, height, depth };
};

function setCell(map, x, y, z, colliderType, ry = 0) {
    map.data[x][y][z] = { idx: 1, mesh: { colliderType }, rx: 0, ry, rz: 0 };
};

// Solid floor at y=0 across the given x/z rectangle (inclusive), so everything at y=1 is
// standable ground - the default "flat room" starting point most tests build on.
function fillFloor(map, x0, x1, z0, z1, y = 0) {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) setCell(map, x, y, z, 'full');
};

function pathTypes(path) {
    return path.map(w => w.type);
};

// --- Test 1: flat open floor, straight shot ---
{
    console.log('Test: flat open floor');
    const map = makeMap(6, 3, 6);
    fillFloor(map, 0, 5, 0, 5);
    const room = { map };

    const path = findPath(room, { x: 0.5, y: 1, z: 0.5 }, { x: 4.5, y: 1, z: 4.5 });
    assert('finds a path', !!path, 'got null');
    if (path) {
        assert('ends at the goal cell', path[path.length - 1].x === 4.5 && path[path.length - 1].z === 4.5);
        assert('every step is a walk (no obstacles to jump/fall/climb)', pathTypes(path).every(t => t === EDGE_TYPE.WALK), pathTypes(path).join(','));
    };
};

// --- Test 2: wall with a single gap forces a detour ---
{
    console.log('Test: wall with one gap');
    const map = makeMap(6, 3, 6);
    fillFloor(map, 0, 5, 0, 5);
    // full-height wall across z=2 for x=0..3, leaving x=4-5 open
    for (let x = 0; x <= 3; x++) { setCell(map, x, 1, 2, 'full'); setCell(map, x, 2, 2, 'full'); };
    const room = { map };

    const path = findPath(room, { x: 0.5, y: 1, z: 0.5 }, { x: 0.5, y: 1, z: 4.5 });
    assert('finds a path around the wall', !!path, 'got null');
    if (path) {
        assert('detours through the gap (x reaches 4 or 5 at some point)', path.some(w => w.x >= 4.5), path.map(w => `${w.x},${w.z}`).join(' '));
        assert('never crosses the wall line directly (no waypoint at blocked x with z=2)', !path.some(w => w.x <= 3.5 && Math.abs(w.z - 2.5) < 0.1));
    };
};

// --- Test 3: one-block-high parapet - jump onto it, fall off the other side ---
{
    console.log('Test: jumpable parapet');
    const map = makeMap(5, 4, 5);
    fillFloor(map, 0, 4, 0, 4);
    for (let x = 0; x <= 4; x++) setCell(map, x, 1, 2, 'full'); // one block tall, top surface at y=2
    const room = { map };

    const path = findPath(room, { x: 2.5, y: 1, z: 0.5 }, { x: 2.5, y: 1, z: 4.5 });
    assert('finds a path over the parapet', !!path, 'got null');
    if (path) {
        assert('uses a jump edge to get on top', pathTypes(path).includes(EDGE_TYPE.JUMP), pathTypes(path).join(','));
        assert('uses a fall edge to get back down', pathTypes(path).includes(EDGE_TYPE.FALL), pathTypes(path).join(','));
        assert('respects maxJumpLevels (only rises 1 level per jump edge)', path.every((w, i) => w.type !== EDGE_TYPE.JUMP || (w.y - (path[i - 1]?.y ?? 1)) <= MOVEMENT_PROFILE.maxJumpLevels));
    };
};

// --- Test 4: wall too tall to jump - no path without a ramp/ladder ---
{
    console.log('Test: wall taller than a jump can clear');
    const map = makeMap(5, 5, 5);
    fillFloor(map, 0, 4, 0, 4);
    for (let x = 0; x <= 4; x++) { setCell(map, x, 1, 2, 'full'); setCell(map, x, 2, 2, 'full'); setCell(map, x, 3, 2, 'full'); }; // 3 tall
    const room = { map };

    const path = findPath(room, { x: 2.5, y: 1, z: 0.5 }, { x: 2.5, y: 1, z: 4.5 });
    assert('correctly refuses (no path exists)', path === null, path ? JSON.stringify(path) : '');
};

// --- Test 5: ramp gets a bot up a level without a jump edge ---
{
    console.log('Test: ramp');
    const map = makeMap(5, 4, 5);
    fillFloor(map, 0, 4, 0, 1); // low floor, z=0..1
    fillFloor(map, 0, 4, 3, 4, 1); // raised floor (y=1 solid), standable at y=2, z=3..4
    setCell(map, 2, 1, 2, 'wedge'); // ramp bridging the two levels at z=2
    const room = { map };

    const path = findPath(room, { x: 2.5, y: 1, z: 0.5 }, { x: 2.5, y: 2, z: 4.5 });
    assert('finds a path via the ramp', !!path, 'got null');
    if (path) {
        assert('uses a ramp edge, not a jump, to gain the level', pathTypes(path).includes(EDGE_TYPE.RAMP) && !pathTypes(path).includes(EDGE_TYPE.JUMP), pathTypes(path).join(','));
    };
};

// --- Test 6: ladder is the only way up a shaft too tall to jump ---
{
    console.log('Test: ladder shaft');
    const map = makeMap(3, 7, 3);
    fillFloor(map, 0, 2, 0, 2, 0);
    fillFloor(map, 0, 2, 0, 2, 4); // high floor 4 levels up, standable at y=5
    // wall off the high floor on all sides, one level taller than the floor itself (y=1..5) so
    // there's no walkable ledge on TOP of the walls either - the ladder has to be the only route.
    for (let y = 1; y <= 5; y++) {
        setCell(map, 0, y, 1, 'full'); setCell(map, 2, y, 1, 'full');
        setCell(map, 1, y, 0, 'full'); setCell(map, 1, y, 2, 'full');
    };
    setCell(map, 1, 1, 1, 'ladder', 0);
    setCell(map, 1, 2, 1, 'ladder', 0);
    setCell(map, 1, 3, 1, 'ladder', 0);
    setCell(map, 1, 4, 1, 'ladder', 0); // top rung sits in the hole punched through the high floor
    const room = { map };

    const path = findPath(room, { x: 1.5, y: 1, z: 1.5 }, { x: 1.5, y: 5, z: 1.5 });
    assert('finds a path up the ladder', !!path, 'got null');
    if (path) {
        assert('uses only ladder edges (no other route exists)', pathTypes(path).every(t => t === EDGE_TYPE.LADDER), pathTypes(path).join(','));
        assert('climbs the shaft in exactly 4 steps (3 rungs + stepping off onto the goal)', pathTypes(path).length === 4, pathTypes(path).join(','));
    };
};

// --- Test 7: goal fully sealed off - must return null, not hang or throw ---
{
    console.log('Test: unreachable goal');
    const map = makeMap(5, 3, 5);
    fillFloor(map, 0, 4, 0, 4);
    // box the goal cell in completely, walls too tall to jump and no gap
    for (let x = 1; x <= 3; x++) for (let z = 1; z <= 3; z++) {
        if (x === 2 && z === 2) continue;
        setCell(map, x, 1, z, 'full');
        setCell(map, x, 2, z, 'full');
    };
    const room = { map };

    const path = findPath(room, { x: 0.5, y: 1, z: 0.5 }, { x: 2.5, y: 1, z: 2.5 });
    assert('correctly refuses (goal is sealed off)', path === null, path ? JSON.stringify(path) : '');
};

// --- Test 8: start position slightly off standable (e.g. mid-air this tick) still resolves ---
{
    console.log('Test: imprecise start position');
    const map = makeMap(5, 4, 5);
    fillFloor(map, 0, 4, 0, 4);
    const room = { map };

    const path = findPath(room, { x: 1.5, y: 1.4, z: 1.5 }, { x: 3.5, y: 1, z: 3.5 });
    assert('still finds a path from a slightly-airborne start', !!path, 'got null');
};

// --- Test 9: isStandable sanity checks used directly ---
{
    console.log('Test: isStandable direct checks');
    const map = makeMap(3, 3, 3);
    fillFloor(map, 0, 2, 0, 2);
    setCell(map, 1, 1, 1, 'full');
    assert('open floor cell is standable', isStandable(map, 0, 1, 0));
    assert('cell occupied by a full block is not standable', !isStandable(map, 1, 1, 1));
    assert('cell with nothing below it is not standable', !isStandable(map, 0, 2, 0));
};

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
