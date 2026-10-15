// Tactical building blocks for the combat layer: hearing (SoundTracker), finding cover
// (findCover) and lobbing grenades (solveGrenadeThrow). Like combat.js these are engine-free:
// they only read plain properties off the objects handed in, so they're unit-tested offline
// (test-combat.js) with mock players and a synthetic `map.data` grid.

import { isBlockingCell, isRampCell, isLadderCell } from './pathfinding.js';
import { hasLineOfSight, cellAtSafe } from './combat-geometry.js';

// ---------------------------------------------------------------------------------------------
// Hearing
// ---------------------------------------------------------------------------------------------

// Bots hear exactly three kinds of sound: gunshots, grenade throws and explosions - nothing else
// (footsteps, jumps and so on are deliberately not modelled). None of these are announced by the
// game through a single event (each gun emits its own, explosions emit nothing), so instead of
// patching core code this watches state that already exists and infers the sound from it:
//   gunshot   - a player's loaded rounds dropped while holding the same weapon
//   grenade   - a player's grenade count dropped (the throw; the thud, not the bang)
//   explosion - a grenade or rocket that was active last poll is gone now (heard where it was)
//
// One tracker serves a whole room (every bot polls it, only the first poll in each interval does
// any work) and keeps a short ring of events; each bot remembers the id of the last event it saw.
export class SoundTracker {
    // deps: {
    //   iteratePlayers(cb),             // as in constants.js
    //   getProjectiles() -> { grenades: [{x,y,z,player}], rockets: [...] },  // ACTIVE ones
    //   now() -> seconds,
    // }
    constructor({ iteratePlayers, getProjectiles = () => ({ grenades: [], rockets: [] }), now = () => Date.now() / 1000, pollInterval = 0.1 }) {
        this.iteratePlayers = iteratePlayers;
        this.getProjectiles = getProjectiles;
        this.now = now;
        this.pollInterval = pollInterval;
        this.lastPoll = -Infinity;
        this.nextId = 0;
        this.events = [];
        this.playerState = new Map();
        this.tracked = new Map(); // projectile object -> { x, y, z, player, kind }
    }

    get cursor() { return this.nextId; }

    // Every event newer than `cursor`.
    since(cursor) {
        return this.events.filter((e) => e.id > cursor);
    }

    emit(kind, pos, source, loud, t) {
        this.events.push({ id: ++this.nextId, t, kind, x: pos.x, y: pos.y, z: pos.z, source: source ?? null, loud });
        if (this.events.length > 64) this.events.splice(0, this.events.length - 64);
    }

    poll() {
        const t = this.now();
        if (t - this.lastPoll < this.pollInterval) return;
        this.lastPoll = t;

        const seen = new Set();
        this.iteratePlayers((p) => {
            seen.add(p.id);
            if (!p.playing) { this.playerState.delete(p.id); return; };
            const rounds = p.weapon?.ammo?.rounds;
            const idx = p.weaponIdx;
            const grenades = p.grenadeCount;
            const prev = this.playerState.get(p.id);
            if (prev) {
                if (prev.idx === idx && rounds !== undefined && prev.rounds !== undefined && rounds < prev.rounds) {
                    this.emit('gunshot', p, p, 1, t);
                };
                if (grenades !== undefined && prev.grenades !== undefined && grenades < prev.grenades) {
                    this.emit('grenade', p, p, 0.6, t);
                };
            };
            this.playerState.set(p.id, { rounds, idx, grenades });
        });
        for (const id of this.playerState.keys()) if (!seen.has(id)) this.playerState.delete(id);

        const { grenades = [], rockets = [] } = this.getProjectiles() ?? {};
        const live = new Set();
        const track = (list, kind) => {
            for (const proj of list) {
                live.add(proj);
                this.tracked.set(proj, { x: proj.x, y: proj.y, z: proj.z, player: proj.player, kind });
            };
        };
        track(grenades, 'grenade');
        track(rockets, 'rocket');
        for (const [proj, info] of this.tracked) {
            if (live.has(proj)) continue;
            this.tracked.delete(proj);
            this.emit('explosion', info, info.player, 1.8, t);
        };
    }
}

// ---------------------------------------------------------------------------------------------
// Cover
// ---------------------------------------------------------------------------------------------

// Finds the nearest spot within `radius` of `from` that someone standing at `threat` (an eye
// position) can't see: a free cell with head room, solid ground under it, and a blocked line of
// sight to the threat. `isExcluded(cell)` lets the caller skip spots it already failed to reach.
// Returns { x, y, z } (cell centre, y = floor of the standing cell) or null.
//
// Cost is bounded - (2r+1)^2 columns x 5 levels of cheap cell checks, with a line-of-sight ray
// only for cells that pass them - and the caller rate-limits how often it asks.
export function findCover(map, from, threat, { radius = 10, minThreatDistance = 3, isExcluded = null } = {}) {
    if (!map || !map.data) return null;
    const fx = Math.floor(from.x), fy = Math.floor(from.y + 0.05), fz = Math.floor(from.z);
    let best = null, bestScore = Infinity;

    const free = (x, y, z) => !isBlockingCell(cellAtSafe(map, x, y, z));
    const solid = (x, y, z) => {
        const c = cellAtSafe(map, x, y, z);
        return isBlockingCell(c) && !isRampCell(c) && !isLadderCell(c);
    };

    for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
            const cx = fx + dx, cz = fz + dz;
            const flat = Math.hypot(dx, dz);
            if (flat > radius) continue;
            for (let dy = -2; dy <= 2; dy++) {
                const cy = fy + dy;
                if (cy < 1) continue;
                if (!free(cx, cy, cz) || !free(cx, cy + 1, cz) || !solid(cx, cy - 1, cz)) continue;

                const spot = { x: cx + 0.5, y: cy, z: cz + 0.5 };
                if (isExcluded && isExcluded(spot)) continue;
                const threatDist = Math.hypot(spot.x - threat.x, spot.z - threat.z);
                if (threatDist < minThreatDistance) continue;

                // Cheapest rejection first: skip anything already worse than the best found.
                const score = flat + Math.abs(dy) * 2 - Math.min(threatDist, 20) * 0.05;
                if (score >= bestScore) continue;
                if (hasLineOfSight(map, threat, { x: spot.x, y: cy + 0.45, z: spot.z })) continue;

                best = spot; bestScore = score;
            };
        };
    };
    return best;
}

// ---------------------------------------------------------------------------------------------
// Grenades
// ---------------------------------------------------------------------------------------------

// Mirrors Player.throwGrenade() (player.js) and Grenade.update() (bullets.js) closely enough to
// pick a (pitch, power) that lands a grenade on `to` when thrown from a player standing at
// `from`. The yaw is simply toward the target; the throw leaves along a vector (0, .1, 1) rotated
// by (yaw, pitch), at speed .13 * power + .08, from a point slightly in front of the player; each
// tick the grenade moves, loses .003 of dy to gravity and 2% of its horizontal speed to drag. It
// stops dead against solid cells here (the real one bounces) - a throw that clips a wall on the
// way is only accepted if that happens within `tolerance` of the target.
//
// Returns { yaw, pitch, power, error, ticks } or null if nothing lands within `tolerance`.
// `power` is what to pass to player.queueGrenade() (0..1, before the room's throw modifier).
export function solveGrenadeThrow(map, from, to, { throwModifier = 1, scale = 1, tolerance = 1.3 } = {}) {
    const yaw = Math.atan2(to.x - from.x, to.z - from.z);
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    const startY = from.y + Math.max(0.25, 0.3 * scale);
    let best = null;

    for (let powerStep = 10; powerStep >= 3; powerStep--) {
        const power = powerStep / 10;
        const eff = Math.min(1, power) * throwModifier;
        const speed = 0.13 * eff + 0.08;

        for (let pitch = -1.35; pitch <= 0.25; pitch += 0.03) {
            const sp = Math.sin(pitch), cp = Math.cos(pitch);
            const vy = 0.1 * cp - sp, vz = 0.1 * sp + cp;
            const oy = -0.05 * cp - 0.2 * sp, oz = -0.05 * sp + 0.2 * cp;

            let x = from.x + oz * sy, y = startY + oy, z = from.z + oz * cy;
            let dx = vz * sy * speed, dy = vy * speed, dz = vz * cy * speed;
            let err = Infinity, ticks = 0;

            for (let t = 1; t <= 150; t++) {
                x += dx; y += dy; z += dz;
                dy -= 0.003; dx *= 0.98; dz *= 0.98;
                ticks = t;

                const cell = cellAtSafe(map, Math.floor(x), Math.floor(y), Math.floor(z));
                if (map && map.data && isBlockingCell(cell) && !isLadderCell(cell)) {
                    err = Math.hypot(x - to.x, z - to.z) + Math.abs(y - to.y) * 0.5;
                    break;
                };
                if (dy < 0 && y <= to.y + 0.3) {
                    err = Math.hypot(x - to.x, z - to.z);
                    break;
                };
                if (y < -5) break;
            };

            if (err > tolerance) continue;
            if (!best || err < best.error - 0.05 || (Math.abs(err - best.error) <= 0.05 && ticks < best.ticks)) {
                best = { yaw, pitch, power, error: err, ticks };
            };
        };
    };
    return best;
}
