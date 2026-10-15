// Engine-free geometry helpers shared by the combat layer (combat.js) and its tactics
// (combat-tactics.js): angle math, line of sight over `room.map`, ground checks. Split out of
// combat.js so neither file has to import the other.

import { isBlockingCell, isLadderCell, isRampCell } from './pathfinding.js';

export const TWO_PI = Math.PI * 2;
export const toRad = (deg) => deg * Math.PI / 180;

export function angleDiff(a, b) { // b - a wrapped to [-PI, PI]
    let d = (b - a) % TWO_PI;
    if (d > Math.PI) d -= TWO_PI;
    else if (d < -Math.PI) d += TWO_PI;
    return d;
}

export function stepAngle(current, target, maxStep) {
    const d = angleDiff(current, target);
    if (Math.abs(d) <= maxStep) return target;
    return current + Math.sign(d) * maxStep;
}

// Forward vector for a (yaw, pitch) pair under the game's convention (yaw = atan2(dx, dz),
// pitch = -asin(dy / dist) - see DeadInternetBot.getDistanceToPlayer).
export function dirFromAngles(yaw, pitch) {
    const cp = Math.cos(pitch);
    return { x: Math.sin(yaw) * cp, y: -Math.sin(pitch), z: Math.cos(yaw) * cp };
}

export function anglesTo(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
    return { yaw: Math.atan2(dx, dz), pitch: -Math.asin(Math.max(-1, Math.min(1, dy / dist))), distance: dist };
}

export function angleBetweenDirs(a, b) {
    const dot = a.x * b.x + a.y * b.y + a.z * b.z;
    return Math.acos(Math.max(-1, Math.min(1, dot)));
}

// Cells that stop a bullet's line of sight. Ramps and ladders are partial geometry that a ray
// at eye height usually clears, so they're treated as see-through - occasionally wasting a shot
// beats refusing to ever shoot past a ramp.
export function blocksSight(cell) {
    return isBlockingCell(cell) && !isRampCell(cell) && !isLadderCell(cell);
}

export function cellAtSafe(map, x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= map.width || y >= map.height || z >= map.depth) return null;
    return map.data[x]?.[y]?.[z] ?? null;
}

// Amanatides-Woo voxel walk from `from` to `to` (both {x,y,z} world points). The first and last
// cell are skipped: the eye and the target's body are inside them, and a half-height block there
// shouldn't count as "something in the way".
export function hasLineOfSight(map, from, to) {
    if (!map || !map.data) return true;
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-6) return true;

    let x = Math.floor(from.x), y = Math.floor(from.y), z = Math.floor(from.z);
    const endX = Math.floor(to.x), endY = Math.floor(to.y), endZ = Math.floor(to.z);
    const stepX = Math.sign(dx), stepY = Math.sign(dy), stepZ = Math.sign(dz);
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tMaxX = dx !== 0 ? ((stepX > 0 ? x + 1 - from.x : from.x - x) * tDeltaX) : Infinity;
    let tMaxY = dy !== 0 ? ((stepY > 0 ? y + 1 - from.y : from.y - y) * tDeltaY) : Infinity;
    let tMaxZ = dz !== 0 ? ((stepZ > 0 ? z + 1 - from.z : from.z - z) * tDeltaZ) : Infinity;

    // Param t runs 0..1 over the segment (the deltas above are per unit of t, since dx/dy/dz are
    // the full displacement).
    for (let guard = 0; guard < 2048; guard++) {
        if (x === endX && y === endY && z === endZ) return true;
        if (tMaxX < tMaxY && tMaxX < tMaxZ) {
            if (tMaxX > 1) return true;
            x += stepX; tMaxX += tDeltaX;
        } else if (tMaxY < tMaxZ) {
            if (tMaxY > 1) return true;
            y += stepY; tMaxY += tDeltaY;
        } else {
            if (tMaxZ > 1) return true;
            z += stepZ; tMaxZ += tDeltaZ;
        };
        if (x === endX && y === endY && z === endZ) return true;
        if (blocksSight(cellAtSafe(map, x, y, z))) return false;
    };
    return true;
}

// Is there something to stand on within `maxDrop` cells below a point `reach` ahead of the bot
// in direction (dirX, dirZ)? Engaged movement (strafing, backing away) shouldn't walk a bot off a
// ledge it was holding - no fall damage in this game, but it'd strand it mid-fight.
export function hasGroundAhead(map, x, y, z, dirX, dirZ, { reach = 0.9, maxDrop = 2 } = {}) {
    if (!map || !map.data) return true;
    const len = Math.hypot(dirX, dirZ) || 1;
    const px = Math.floor(x + (dirX / len) * reach);
    const pz = Math.floor(z + (dirZ / len) * reach);
    const fy = Math.floor(y + 0.05);
    for (let cy = fy - 1; cy >= fy - 1 - maxDrop; cy--) {
        const cell = cellAtSafe(map, px, cy, pz);
        if (cell && isBlockingCell(cell)) return true;
        if (cy < 0) break;
    };
    return false;
}

export function gaussian(rng) {
    const u = Math.max(rng(), 1e-9);
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TWO_PI * v);
}

