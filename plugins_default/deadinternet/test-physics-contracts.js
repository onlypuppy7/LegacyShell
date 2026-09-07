// Verifier/controller contracts, not a substitute for real-map physics tests.
import assert from 'node:assert/strict';
import { simulateEdge, simulateEdgeCached, ladderCatchTarget } from './physicsSimulation.js';

function fixture(move, supported = true) {
    let launches = 0;
    const player = {
        x: 0.5, y: 1, z: 0.5, dx: 0, dy: 0, dz: 0,
        jumping: false, climbing: false, climbingCell: {}, modifiers: {},
        Collider: null,
        createSnapshot() {
            return Object.fromEntries(Object.entries(this).filter(([key, value]) => typeof value !== 'function' && key !== 'Collider'));
        },
        restoreSnapshot(snapshot) { Object.assign(this, snapshot); },
        jump() { launches++; this.jumping = true; return true; },
        simulateMovement() { move(this); },
    };
    player.Collider = { playerCollidesWithMap: () => supported };
    return { player, launches: () => launches };
}

const from = { x: 0.5, y: 1, z: 0.5 };
const target = { x: 1.5, y: 1, z: 0.5 };
const nearTarget = p => { Object.assign(p, target, { dy: 0, jumping: false }); };

const missedCatch = fixture(nearTarget);
assert.equal(simulateEdge(missedCatch.player, from, target, { jump: true, ladderCatch: true, maxTicks: 4 }).success, false,
    'proximity/footing cannot substitute for an actual ladder catch');

const wrongCatch = fixture(p => { nearTarget(p); p.climbing = true; p.climbingCell = { x: 2, y: 1, z: 0 }; });
assert.equal(simulateEdge(wrongCatch.player, from, target, { jump: true, ladderCatch: true, maxTicks: 4 }).success, false,
    'catching another ladder is not success');

const caught = fixture(p => { nearTarget(p); p.climbing = true; p.climbingCell = { x: 1, y: 1, z: 0 }; });
assert.equal(simulateEdge(caught.player, from, target, { jump: true, ladderCatch: true, maxTicks: 4 }).success, true);

const ordinary = fixture(nearTarget);
assert.equal(simulateEdge(ordinary.player, from, target, { maxTicks: 4 }).success, true);

const flat = fixture(p => { p.jumping = false; p.dy = 0; }, false);
simulateEdge(flat.player, from, { x: 5.5, y: 1, z: 0.5 }, { jump: true, maxTicks: 100 });
assert.equal(flat.launches(), 1, 'flat edge must not manufacture repeated launches after intermediate landings');

const ascending = fixture(p => { p.jumping = false; p.dy = 0; }, false);
simulateEdge(ascending.player, from, { x: 5.5, y: 2, z: 0.5 }, { jump: true, maxTicks: 100 });
assert.ok(ascending.launches() > 1, 'retain the live controller ascending-jump behavior');
assert.deepEqual([caught.player.x, caught.player.y, caught.player.z, caught.player.climbing], [0.5, 1, 0.5, false]);

// One graph cell can represent several real landing/takeoff poses on a ramp.
// Caching only the grid keys must not reuse an outcome for a different pose.
let moves = 0;
const cacheFixture = fixture(p => { moves++; nearTarget(p); });
const room = {};
const cached = (start, end, options = {}) => simulateEdgeCached(room, cacheFixture.player,
    '0,1,0', '1,1,0', start, end, { maxTicks: 4, ...options });
cached(from, target);
const firstMoves = moves;
cached({ ...from }, { ...target });
assert.equal(moves, firstMoves, 'identical poses reuse the simulation');
cached({ ...from, y: 1.4 }, target);
assert.ok(moves > firstMoves, 'a different takeoff height requires verification');
const afterSource = moves;
cached(from, { ...target, z: 0.8 });
assert.ok(moves > afterSource, 'a different landing point requires verification');
const afterTarget = moves;
cached(from, target, { fromPartialSupport: true });
assert.ok(moves > afterTarget, 'a different launch controller requires verification');
for (const yaw of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const aim = ladderCatchTarget(from, target, yaw);
    const tangentError = (aim.x - target.x) * Math.cos(yaw) - (aim.z - target.z) * Math.sin(yaw);
    assert.ok(Math.abs(tangentError) < 1e-9, 'catch steering must remain centred laterally');
}
const unsupportedWalk = fixture(nearTarget, false);
assert.equal(simulateEdge(unsupportedWalk.player, from, target, { requireSupport: true, maxTicks: 4 }).success, false,
    'walking past a target in unsupported air is not arrival');
assert.equal(simulateEdge(ordinary.player, from, target, { requireSupport: true, maxTicks: 4 }).success, true,
    'a supported walking arrival remains valid');
const fractional = fixture(p => { p.jumping = false; p.dy = 0; }, false);
simulateEdge(fractional.player, from, {x:5.5,y:1.5,z:0.5}, {jump:true,fractionalRampRise:true,maxTicks:100});
assert.equal(fractional.launches(),1,'fractional ramp landing must settle instead of repeatedly launching');
console.log('18 physics contract assertions passed');
