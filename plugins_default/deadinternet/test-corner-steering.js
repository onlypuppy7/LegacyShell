// Steering/cache contracts only; real-map traversal remains the integration gate.
import assert from 'node:assert/strict';
import { simulateEdge, simulateEdgeCached } from './physicsSimulation.js';

const from = { x: 0.5, y: 1, z: 0.5 };
const to = { x: 1.5, y: 1, z: 1.5 };
function fixture(via) {
    const headings = [];
    const p = { ...from, dx: 0, dy: 0, dz: 0, jumping: false, climbing: false,
        climbingCell: {}, modifiers: {},
        Collider: { playerCollidesWithMap: () => true },
        createSnapshot() { return { ...from, climbing: false }; },
        restoreSnapshot(s) { Object.assign(this, s); },
        jump() { return false; },
        simulateMovement() {
            headings.push(this.yaw);
            Object.assign(this, headings.length === 1 ? { ...via, y: 1 } : to);
            this.dy = 0;
        },
    };
    return { p, headings };
}
const turn = { x: 0.5, z: 1.5 };
const f = fixture(turn);
assert.equal(simulateEdge(f.p, from, to, { via: [turn], maxTicks: 4 }).success, true);
assert.deepEqual(f.headings, [0, Math.PI / 2], 'turn only after reaching the intermediate control point');
assert.deepEqual([f.p.x, f.p.y, f.p.z], [from.x, from.y, from.z], 'restore the original player pose');
const room = {};
simulateEdgeCached(room, fixture(turn).p, 'a', 'b', from, to, { via: [turn], maxTicks: 4 });
const otherTurn = { x: 1.5, z: 0.5 };
const other = fixture(otherTurn);
simulateEdgeCached(room, other.p, 'a', 'b', from, to, { via: [otherTurn], maxTicks: 4 });
assert.ok(other.headings.length > 0, 'different turn geometry is verified independently');
const same = fixture(otherTurn);
simulateEdgeCached(room, same.p, 'a', 'b', from, to, { via: [otherTurn], maxTicks: 4 });
assert.equal(same.headings.length, 0, 'identical geometry can reuse its cached result');
console.log('5 corner steering assertions passed');
