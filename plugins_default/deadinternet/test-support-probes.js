import assert from 'node:assert/strict';
import { findSupportedY } from './pathfinding.js';

const player = collision => ({ Collider: { playerCollidesWithMap: (_, pose) => collision(pose) } });
const slope = player(p => p.y < 2 + p.x * 0.5);
for (const x of [0.1, 0.5, 0.9]) {
    const height = findSupportedY(slope, x, 0.5, 1.98, 3.02);
    assert.ok(height > 2 + x * 0.5 && height < 2 + x * 0.5 + 0.002);
}
assert.equal(findSupportedY(player(() => false), 0.5, 0.5, 1.98, 3.02), null, 'air is not support');
assert.equal(findSupportedY(player(() => true), 0.5, 0.5, 1.98, 3.02), null, 'solid volume has no clear standing pose');
const lowCeiling = player(p => p.y > 2.7 || p.y < 2.2);
assert.ok(Math.abs(findSupportedY(lowCeiling, 0.5, 0.5, 1.98, 3.02) - 2.201) < 0.001);
console.log('6 support probe assertions passed');
