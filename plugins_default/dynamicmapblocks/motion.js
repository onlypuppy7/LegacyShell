//plugin: dynamicmapblocks
import BABYLON from 'babylonjs';

export const PlatformMotion = {
    types: new Map(),
    paths: new WeakMap(),
    register(name, sample, travel = () => 0) { this.types.set(name, { sample, travel }); },
    vector(value = {}) { return new BABYLON.Vector3(value.x || 0, value.y || 0, value.z || 0); },
    travelPose(motion, rotation, position) {
        var pivot = this.vector(motion.pivot), anchor = this.vector(motion.pathAnchor ?? motion.pivot);
        return BABYLON.Matrix.Translation(-pivot.x, -pivot.y, -pivot.z).multiply(rotation)
            .multiply(BABYLON.Matrix.Translation(anchor.x + position.x, anchor.y + position.y, anchor.z + position.z));
    },
    ease(value) { value = Math.max(0, Math.min(1, value)); return value * value * (3 - 2 * value); },
    heading(direction, offset = 0) {
        var rotation = BABYLON.Quaternion.RotationYawPitchRoll(Math.atan2(direction.x, direction.z),
            -Math.atan2(direction.y, Math.hypot(direction.x, direction.z)), 0);
        if (!offset) return rotation;
        return BABYLON.Quaternion.FromRotationMatrix(BABYLON.Matrix.RotationY(offset * Math.PI / 180)
            .multiply(BABYLON.Matrix.Compose(BABYLON.Vector3.One(), rotation, BABYLON.Vector3.Zero())));
    },
    path(motion) {
        if (this.paths.has(motion)) return this.paths.get(motion);
        var points = motion.points.map(point => this.vector(point)), route = points.slice();
        if (motion.loop === 'pingpong') route.push(...points.slice(0, -1).reverse());
        else if (motion.loop !== 'snap') route.push(points[0]); //snap just ends at the last point and starts over
        var segments = [], length = 0;
        for (var i = 1; i < route.length; i++) {
            var direction = route[i].subtract(route[i - 1]), distance = direction.length();
            if (distance < 1e-10) continue;
            segments.push({ from: route[i - 1], to: route[i], distance, start: length,
                rotation: this.heading(direction, motion.headingOffset || 0) });
            length += distance;
        };
        for (var i = 0; i < segments.length; i++) {
            var segment = segments[i], previous = segments[(i + segments.length - 1) % segments.length];
            segment.time = segment.start / length * motion.duration;
            var snapped = motion.loop === 'snap' && i === 0; //it jumps back facing the first way, nothing to turn through
            segment.turn = snapped ? 0 : Math.min(motion.turnDuration || 0, segment.distance / length * motion.duration * .5);
            segment.angle = snapped ? 0 : 2 * Math.acos(Math.min(1, Math.abs(BABYLON.Quaternion.Dot(previous.rotation, segment.rotation))));
        };
        var result = { points, segments, length };
        this.paths.set(motion, result); return result;
    },
    jumps(motion, from, to) { //a snap back is the block vanishing and reappearing, not travel: nothing rides it
        if (motion?.type !== 'path' || motion.loop !== 'snap') return false;
        var cycle = time => Math.floor((time + (motion.phase || 0)) / motion.duration);
        return cycle(from) !== cycle(to);
    },
    pathAt(motion, seconds) {
        var path = this.path(motion), phase = ((seconds / motion.duration) % 1 + 1) % 1;
        var distance = phase * path.length;
        for (var i = 0; i < path.segments.length; i++) {
            var segment = path.segments[i];
            if (distance < segment.start + segment.distance || i === path.segments.length - 1) {
                var fraction = Math.max(0, Math.min(1, (distance - segment.start) / segment.distance));
                var elapsed = phase * motion.duration - segment.time;
                var previous = path.segments[(i + path.segments.length - 1) % path.segments.length];
                return { position: BABYLON.Vector3.Lerp(segment.from, segment.to, fraction),
                    rotation: segment.turn > 0 ? BABYLON.Quaternion.Slerp(previous.rotation, segment.rotation,
                        this.ease(elapsed / segment.turn)) : segment.rotation };
            };
        };
        return { position: path.points[0], rotation: BABYLON.Quaternion.Identity() };
    },
    circle(motion, seconds) {
        var basis = { xz: [BABYLON.Axis.X, BABYLON.Axis.Z], xy: [BABYLON.Axis.X, BABYLON.Axis.Y], yz: [BABYLON.Axis.Y, BABYLON.Axis.Z] }[motion.plane || 'xz'];
        var sign = motion.reverse ? -1 : 1, angle = seconds / motion.duration * Math.PI * 2 * sign;
        var u = basis[0], v = basis[1];
        var position = u.scale(motion.radius * (Math.cos(angle) - 1)).add(v.scale(motion.radius * Math.sin(angle)));
        var rotation = BABYLON.Matrix.Compose(BABYLON.Vector3.One(), this.heading(v.scale(sign)), BABYLON.Vector3.Zero());
        rotation = BABYLON.Matrix.RotationY((motion.headingOffset || 0) * Math.PI / 180).multiply(rotation)
            .multiply(BABYLON.Matrix.RotationAxis(BABYLON.Vector3.Cross(u, v), angle));
        return { position, rotation };
    },
    angularTravel(motion, from, to) {
        if (!motion.orient || from === to) return 0;
        if (motion.type === 'circle') return Math.PI * 2 * Math.abs(to - from) / motion.duration;
        if (motion.type !== 'path') return 0;
        var low = Math.min(from, to) + (motion.phase || 0), high = Math.max(from, to) + (motion.phase || 0);
        var total = 0;
        for (var segment of this.path(motion).segments) {
            var integral = time => {
                var cycles = Math.floor((time - segment.time) / motion.duration);
                var rest = time - segment.time - cycles * motion.duration;
                return segment.angle * (cycles + (segment.turn ? this.ease(rest / segment.turn) : 1));
            };
            total += integral(high) - integral(low);
        };
        return total;
    },
    travel(body, from, to, radius) {
        var motion = body.motion || { type: 'none' };
        return this.types.get(motion.type).travel(motion, to - from, radius) + this.angularTravel(motion, from, to) * radius;
    },
    sample(body, seconds) {
        var motion = body.motion || { type: 'none' };
        var adapter = this.types.get(motion.type);
        if (!adapter) throw new Error('Unknown platform motion: ' + motion.type);
        var local = adapter.sample(motion, seconds + (motion.phase || 0));
        var rotation = body.rotation || {};
        var base = BABYLON.Matrix.RotationYawPitchRoll(rotation.y || 0, rotation.x || 0, rotation.z || 0);
        return local.multiply(base).multiply(BABYLON.Matrix.Translation(body.position.x, body.position.y, body.position.z));
    },
};

PlatformMotion.register('none', () => BABYLON.Matrix.Identity());
PlatformMotion.register('spin', (motion, seconds) => {
    var pivot = PlatformMotion.vector(motion.pivot);
    var axis = PlatformMotion.vector(motion.axis || { y: 1 }).normalize();
    var angle = ((motion.speed || 0) * seconds % 360) * Math.PI / 180;
    return BABYLON.Matrix.Translation(-pivot.x, -pivot.y, -pivot.z)
        .multiply(BABYLON.Matrix.RotationAxis(axis, angle))
        .multiply(BABYLON.Matrix.Translation(pivot.x, pivot.y, pivot.z));
}, (motion, seconds, radius) => Math.abs(motion.speed || 0) * Math.PI / 180 * Math.abs(seconds) * radius);
PlatformMotion.register('path', (motion, seconds) => {
    var sample = PlatformMotion.pathAt(motion, seconds);
    var rotation = BABYLON.Matrix.Compose(BABYLON.Vector3.One(), motion.orient ? sample.rotation : BABYLON.Quaternion.Identity(), BABYLON.Vector3.Zero());
    return PlatformMotion.travelPose(motion, rotation, sample.position);
}, (motion, seconds) => PlatformMotion.path(motion).length * Math.abs(seconds) / motion.duration);
PlatformMotion.register('circle', (motion, seconds) => {
    var sample = PlatformMotion.circle(motion, seconds);
    return PlatformMotion.travelPose(motion, motion.orient ? sample.rotation : BABYLON.Matrix.Identity(), sample.position);
}, (motion, seconds) => Math.PI * 2 * motion.radius * Math.abs(seconds) / motion.duration);

export class PlatformClock {
    constructor(source = () => performance.now() / 1000) {
        this.source = source;
        this.anchor = source();
        this.seconds = 0;
    };
    now() { return this.seconds + this.source() - this.anchor; };
    observe(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0) return;
        this.seconds = seconds;
        this.anchor = this.source();
    };
};
