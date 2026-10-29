//plugin: dynamicmapblocks
import BABYLON from 'babylonjs';
import { PlatformMotion, PlatformClock } from './motion.js';
import { PlatformShapes } from './geometry.js';

export const PlatformMap = {
    meshGeometry: new WeakMap(),
    source(sources, name) {
        return sources.find(mesh => mesh && (mesh.name === name ||
            [mesh.theme, mesh.name, mesh.colliderType, mesh.softness].filter(Boolean).join('.') === name));
    },
    fromDisk(disk, index = 0) {
        return { id: 'disk-' + index, position: { x: disk.x, y: disk.y, z: disk.z },
            shapes: [{ type: 'cylinder', radius: disk.radius, height: .25, position: { y: -.125 } }],
            motion: { type: 'spin', axis: { y: 1 }, speed: disk.speed }, appearance: 'disk' };
    },
    finiteVector(value) {
        return value && ['x', 'y', 'z'].every(axis => value[axis] === undefined ||
            (Number.isFinite(value[axis]) && Math.abs(value[axis]) <= 4096));
    },
    read(minMap) {
        if (!minMap) return [];
        var list = Array.isArray(minMap.extents?.platforms) ? minMap.extents.platforms : [];
        var legacy = minMap.extents?.spinningDisks;
        if (Array.isArray(legacy)) list = list.concat(legacy.filter(disk => disk &&
            ['x', 'y', 'z', 'radius', 'speed'].every(key => Number.isFinite(disk[key])) &&
            disk.radius >= .5 && disk.radius <= 8 && Math.abs(disk.speed) <= 90 &&
            disk.x >= disk.radius && disk.z >= disk.radius &&
            disk.x + disk.radius <= minMap.width && disk.z + disk.radius <= minMap.depth &&
            disk.y >= .25 && disk.y <= minMap.height).map((disk, i) => this.fromDisk(disk, i)));
        var ids = new Set(), result = [];
        for (var body of list.slice(0, 32)) {
            if (!body || typeof body.id !== 'string' || !body.id || body.id.length > 64 || ids.has(body.id) ||
                !this.finiteVector(body.position) || !this.finiteVector(body.rotation || {})) continue;
            var motion = body.motion || { type: 'none' };
            if (!PlatformMotion.types.has(motion.type) || !Number.isFinite(motion.phase ?? 0)) continue;
            if (['rotatePlayers', 'rotateItems', 'collidePlayers', 'collideItems', 'pushThroughMap'].some(key => motion[key] !== undefined && typeof motion[key] !== 'boolean')) continue;
            if (motion.orient !== undefined && typeof motion.orient !== 'boolean') continue;
            if (!Number.isFinite(motion.turnDuration ?? 0) || (motion.turnDuration ?? 0) < 0 || (motion.turnDuration ?? 0) > 10 ||
                !Number.isFinite(motion.headingOffset ?? 0) || Math.abs(motion.headingOffset ?? 0) > 3600) continue;
            if (motion.type === 'spin' && (!Number.isFinite(motion.speed) || Math.abs(motion.speed) > 90 ||
                !this.finiteVector(motion.axis || { y: 1 }) || !this.finiteVector(motion.pivot || {}) ||
                PlatformMotion.vector(motion.axis || { y: 1 }).lengthSquared() < 1e-12)) continue;
            if (motion.type === 'path' && (!Array.isArray(motion.points) || motion.points.length < 2 ||
                motion.points.length > 64 || !motion.points.every(point => this.finiteVector(point)) ||
                !Number.isFinite(motion.duration) || motion.duration < 1 || !['loop', 'pingpong', 'snap'].includes(motion.loop))) continue;
            if (motion.type === 'path') {
                var length = 0, points = motion.points.map(point => PlatformMotion.vector(point));
                for (var i = 1; i < points.length; i++) length += BABYLON.Vector3.Distance(points[i - 1], points[i]);
                length = motion.loop === 'pingpong' ? length * 2 : motion.loop === 'snap' ? length : length + BABYLON.Vector3.Distance(points[points.length - 1], points[0]);
                if (length / motion.duration > 16) continue;
            };
            if (motion.type === 'circle' && (!Number.isFinite(motion.radius) || motion.radius < .25 || motion.radius > 16 ||
                !Number.isFinite(motion.duration) || motion.duration < 1 || Math.PI * 2 * motion.radius / motion.duration > 16 ||
                !['xz', 'xy', 'yz'].includes(motion.plane || 'xz') || (motion.reverse !== undefined && typeof motion.reverse !== 'boolean'))) continue;
            var shapes = body.shapes || [], blocks = body.blocks || [];
            if (!Array.isArray(shapes) || !Array.isArray(blocks) || shapes.length + blocks.length === 0 || shapes.length + blocks.length > 128) continue;
            if (!shapes.every(shape => shape && PlatformShapes.types.has(shape.type) && shape.type !== 'mesh' &&
                this.finiteVector(shape.position || {}) && this.finiteVector(shape.rotation || {}) &&
                (shape.type !== 'cylinder' || (Number.isFinite(shape.radius) && shape.radius >= .25 && shape.radius <= 8 &&
                    Number.isFinite(shape.height) && shape.height > 0 && shape.height <= 16)) &&
                (shape.type !== 'box' || (this.finiteVector(shape.min) && this.finiteVector(shape.max) &&
                    ['x', 'y', 'z'].every(axis => shape.max[axis] > shape.min[axis] && shape.max[axis] - shape.min[axis] <= 16))))) continue;
            if (!blocks.every(block => block && typeof block.mesh === 'string' && block.mesh.length <= 256 && block.mesh.split('.').length >= 3 && ['x', 'y', 'z'].every(axis =>
                Number.isInteger(block[axis]) && block[axis] >= 0 && block[axis] < minMap[{ x: 'width', y: 'height', z: 'depth' }[axis]]) &&
                ['rx', 'ry', 'rz'].every(axis => block[axis] === undefined || Number.isInteger(block[axis])))) continue;
            ids.add(body.id);
            result.push(JSON.parse(JSON.stringify({ ...body, position: { x: 0, y: 0, z: 0, ...body.position }, motion, shapes, blocks })));
        };
        return result;
    },
    prepare(minMap) {
        var bodies = this.read(minMap), claimed = new Set();
        for (var body of bodies) for (var block of body.blocks) {
            var key = block.x + ',' + block.y + ',' + block.z;
            if (claimed.has(key)) throw new Error('Block belongs to more than one platform: ' + key);
            claimed.add(key);
        };
        if (!claimed.size) return minMap;
        var copy = { ...minMap, data: {} };
        for (var [mesh, cells] of Object.entries(minMap.data)) {
            copy.data[mesh] = Object.values(cells).filter(cell => !claimed.has(cell.x + ',' + cell.y + ',' + cell.z));
        };
        return copy;
    },
    blockShapes(block, body, sources) {
        var source = this.source(sources, block.mesh);
        var type = source?.colliderType || block.mesh.split('.')[2];
        if (!source) throw new Error('Missing platform model: ' + block.mesh);
        var rotation = BABYLON.Matrix.RotationYawPitchRoll((block.ry || 0) * Math.PI / 2,
            (block.rx || 0) * Math.PI / 2, (block.rz || 0) * Math.PI / 2);
        var placed = rotation.multiply(BABYLON.Matrix.Translation(block.x + .5 - body.position.x,
            block.y + .5 - body.position.y, block.z + .5 - body.position.z));
        var softness = source.softness || block.mesh.split('.')[3];
        if (type === 'full') return [{ definition: { type: 'box', min: { x: -.5, y: -.5, z: -.5 }, max: { x: .5, y: .5, z: .5 } }, matrix: placed, softness }];
        var collider = source.colliderMesh || source.getChildMeshes()[0];
        if (!['aabb', 'obb', 'mesh'].includes(type) || !collider || ![collider, ...collider.getChildMeshes()].some(mesh => mesh.getTotalVertices() > 0)) {
            var box = source.getBoundingInfo().boundingBox;
            return [{ definition: { type: 'box', min: box.minimum, max: box.maximum }, matrix: placed, visualOnly: true }];
        };
        var inverse = source.computeWorldMatrix(true).clone().invert();
        var colliders = [collider, ...collider.getChildMeshes()];
        colliders.forEach(mesh => mesh.computeWorldMatrix(true));
        return colliders.filter(mesh => mesh.getTotalVertices() > 0).map(mesh => {
            var box = mesh.getBoundingInfo().boundingBox;
            var matrix = mesh.computeWorldMatrix(true).multiply(inverse);
            var min = box.minimum, max = box.maximum;
            if (type === 'mesh') {
                if (!this.meshGeometry.has(mesh)) {
                    var definition = { type: 'mesh', positions: Array.from(mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind)),
                        indices: Array.from(mesh.getIndices() || Array.from({ length: mesh.getTotalVertices() }, (_, i) => i)) };
                    this.meshGeometry.set(mesh, { definition, geometry: PlatformShapes.create(definition) });
                };
                return { ...this.meshGeometry.get(mesh), matrix: matrix.multiply(placed), softness };
            };
            if (type === 'aabb') {
                var bounds = PlatformShapes.bounds(PlatformShapes.corners(min, max).map(v => BABYLON.Vector3.TransformCoordinates(v, matrix)));
                min = bounds.min; max = bounds.max; matrix = BABYLON.Matrix.Identity();
            };
            return { definition: { type: 'box', min, max }, matrix: matrix.multiply(placed), softness };
        });
    },
    staticMeshes(minMap) {
        var result = [];
        for (var [mesh, cells] of Object.entries(minMap?.data || {})) {
            if (mesh.split('.')[2] !== 'mesh') continue;
            for (var cell of Object.values(cells)) result.push({ id: 'static-' + cell.x + '-' + cell.y + '-' + cell.z,
                static: true, position: { x: cell.x + .5, y: cell.y + .5, z: cell.z + .5 },
                motion: { type: 'none' }, blocks: [{ ...cell, mesh }],
            });
        };
        return result;
    },
};

export class PlatformWorld {
    constructor(definitions = [], sources = [], clock = new PlatformClock()) {
        this.clock = clock;
        this.time = null;
        this.audience = null;
        this.turnsPassengers = definitions.some(body => body.motion?.rotatePlayers &&
            (body.motion.type === 'spin' || (['path', 'circle'].includes(body.motion.type) && body.motion.orient)));
        this.bodies = definitions.map(definition => {
            var parts = (definition.shapes || []).map(shape => {
                var r = shape.rotation || {}, p = shape.position || {};
                return { definition: shape, softness: shape.softness || definition.softness, matrix: BABYLON.Matrix.RotationYawPitchRoll(r.y || 0, r.x || 0, r.z || 0)
                    .multiply(BABYLON.Matrix.Translation(p.x || 0, p.y || 0, p.z || 0)) };
            });
            for (var block of definition.blocks || []) parts.push(...PlatformMap.blockShapes(block, definition, sources));
            if (['path', 'circle'].includes(definition.motion?.type)) {
                var bounds = PlatformShapes.bounds(parts.flatMap(part => {
                    var geometry = part.geometry || PlatformShapes.create(part.definition);
                    return geometry.vertices.map(vertex => BABYLON.Vector3.TransformCoordinates(vertex, part.matrix));
                }));
                definition = { ...definition, motion: { ...definition.motion, pivot: bounds.min.add(bounds.max).scale(.5),
                    pathAnchor: definition.blocks?.length ? new BABYLON.Vector3(0, (bounds.min.y + bounds.max.y) / 2, 0) : bounds.min.add(bounds.max).scale(.5) } };
            };
            return { definition, parts: parts.map(part => {
                var geometry = part.geometry || PlatformShapes.create(part.definition);
                var bounds = PlatformShapes.bounds(geometry.vertices);
                return { ...part, softness: part.softness ?? definition.softness, geometry, corners: PlatformShapes.corners(bounds.min, bounds.max) };
            }), cache: new Map() };
        });
    };
    now() { return this.time ?? this.clock.now(); };
    as(audience, run) { //'players' or 'items'; other queries (bullets) hit anything solid to either
        var previous = this.audience;
        this.audience = audience;
        try { return run(); } finally { this.audience = previous; };
    };
    solid(body) {
        var motion = body.definition.motion || {};
        if (this.audience === 'items') return motion.collideItems !== false;
        if (this.audience === 'players') return motion.collidePlayers !== false;
        return motion.collidePlayers !== false || motion.collideItems !== false;
    };
    at(time, run) {
        var previous = this.time;
        this.time = time;
        try { return run(); } finally { this.time = previous; };
    };
    pose(body, time) {
        if (!body.definition.motion || body.definition.motion.type === 'none') time = 0;
        if (body.cache.has(time)) return body.cache.get(time);
        var matrix = PlatformMotion.sample(body.definition, time);
        var parts = body.parts.map(part => {
            var transform = part.matrix.multiply(matrix);
            return { ...part, matrix: transform, bounds: PlatformShapes.bounds(part.corners.map(v => BABYLON.Vector3.TransformCoordinates(v, transform))) };
        });
        var pose = { matrix, inverse: matrix.clone().invert(), parts, bounds: PlatformShapes.bounds(parts.flatMap(part => [part.bounds.min, part.bounds.max])) };
        if (body.cache.size >= 8) body.cache.delete(body.cache.keys().next().value);
        body.cache.set(time, pose);
        return pose;
    };
    sweptBounds(body) {
        var definition = body.definition, motion = definition.motion || { type: 'none' };
        var base = PlatformMotion.sample({ ...definition, motion: { type: 'none' } }, 0);
        var vertices = body.parts.flatMap(part => part.geometry.vertices.map(v => BABYLON.Vector3.TransformCoordinates(v, part.matrix)));
        var pivot = PlatformMotion.vector(motion.pivot), anchor = PlatformMotion.vector(motion.pathAnchor ?? motion.pivot);
        if (motion.type === 'path') {
            if (motion.orient) {
                var radius = vertices.reduce((radius, v) => Math.max(radius, BABYLON.Vector3.Distance(v, pivot)), 0);
                var corners = PlatformShapes.corners(new BABYLON.Vector3(-radius, -radius, -radius), new BABYLON.Vector3(radius, radius, radius));
                return PlatformShapes.bounds(corners.flatMap(v => motion.points.map(point => BABYLON.Vector3.TransformCoordinates(v.add(anchor).add(PlatformMotion.vector(point)), base))));
            };
            return PlatformShapes.bounds(vertices.flatMap(v => motion.points.map(point =>
                BABYLON.Vector3.TransformCoordinates(v.subtract(pivot).add(anchor).add(PlatformMotion.vector(point)), base))));
        };
        if (motion.type === 'circle') {
            var basis = { xz: [BABYLON.Axis.X, BABYLON.Axis.Z], xy: [BABYLON.Axis.X, BABYLON.Axis.Y], yz: [BABYLON.Axis.Y, BABYLON.Axis.Z] }[motion.plane || 'xz'];
            var u = BABYLON.Vector3.TransformNormal(basis[0], base), v = BABYLON.Vector3.TransformNormal(basis[1], base);
            var extra = motion.orient ? vertices.reduce((radius, point) => Math.max(radius, BABYLON.Vector3.Distance(point, pivot)), 0) : 0;
            var reach = new BABYLON.Vector3(...['x', 'y', 'z'].map(axis => motion.radius * Math.hypot(u[axis], v[axis]) + extra));
            return PlatformShapes.bounds((motion.orient ? [anchor] : vertices.map(point => point.subtract(pivot).add(anchor))).flatMap(point => {
                var centre = BABYLON.Vector3.TransformCoordinates(point.subtract(basis[0].scale(motion.radius)), base);
                return [centre.subtract(reach), centre.add(reach)];
            }));
        };
        if (motion.type === 'spin' && motion.speed !== 0) {
            var pivot = PlatformMotion.vector(motion.pivot), axis = PlatformMotion.vector(motion.axis || { y: 1 }).normalize();
            var corners = [];
            for (var v of vertices) {
                var relative = v.subtract(pivot), parallel = axis.scale(BABYLON.Vector3.Dot(relative, axis));
                var u = relative.subtract(parallel), cross = BABYLON.Vector3.Cross(axis, u);
                var centre = BABYLON.Vector3.TransformCoordinates(pivot.add(parallel), base);
                u = BABYLON.Vector3.TransformNormal(u, base); cross = BABYLON.Vector3.TransformNormal(cross, base);
                var radius = new BABYLON.Vector3(Math.hypot(u.x, cross.x), Math.hypot(u.y, cross.y), Math.hypot(u.z, cross.z));
                corners.push(centre.subtract(radius), centre.add(radius));
            };
            return PlatformShapes.bounds(corners);
        };
        return PlatformShapes.bounds(vertices.map(v => BABYLON.Vector3.TransformCoordinates(v, base)));
    };
    box(pos, bounds) {
        return { min: new BABYLON.Vector3(pos.x + bounds.min.x, pos.y + bounds.min.y, pos.z + bounds.min.z),
            max: new BABYLON.Vector3(pos.x + bounds.max.x, pos.y + bounds.max.y, pos.z + bounds.max.z) };
    };
    overlap(pos, bounds, time = this.now(), ignore, ignoreSoft = false, except) { //except: one softness level to pass through
        var box = this.box(pos, bounds);
        for (var body of this.bodies) {
            if (body === ignore || !this.solid(body)) continue;
            var pose = this.pose(body, time);
            if (!PlatformShapes.intersects(pose.bounds, box)) continue;
            for (var part of pose.parts) {
                if (part.visualOnly) continue;
                if (ignoreSoft && part.softness || except && part.softness === except) continue;
                if (!PlatformShapes.intersects(part.bounds, box)) continue;
                if (PlatformShapes.overlap(part.geometry, part.matrix, box)) return { body, part };
            };
        };
        return false;
    };
    surfaceVelocity(body, pos, time) { //how fast the block's surface at pos is moving, per tick, at this instant
        var local = BABYLON.Vector3.TransformCoordinates(PlatformMotion.vector(pos), this.pose(body, time).inverse);
        return BABYLON.Vector3.TransformCoordinates(local, this.pose(body, time + .001).matrix).subtract(PlatformMotion.vector(pos)).scale(1 / .06);
    };
    ray(origin, direction, time = this.now(), ignoreSoft = false) {
        var hits = [];
        for (var body of this.bodies) for (var part of this.solid(body) ? this.pose(body, time).parts : []) {
            if (part.visualOnly) continue;
            if (ignoreSoft && part.softness) continue;
            var inverse = part.matrix.clone().invert();
            var hit = part.geometry.ray(BABYLON.Vector3.TransformCoordinates(origin, inverse), BABYLON.Vector3.TransformNormal(direction, inverse));
            if (hit) hits.push({ ...hit, body, softness: part.softness, point: origin.add(direction.scale(hit.t)),
                normal: BABYLON.Vector3.TransformNormal(hit.normal, inverse.transpose()).normalize() });
        };
        return hits.sort((a, b) => a.t - b.t);
    };
    vertical(pos, distance, bounds, time = this.now()) {
        if (!distance || this.overlap(pos, bounds, time)) return false;
        var box = this.box(pos, bounds), swept = { min: box.min.clone(), max: box.max.clone() };
        swept.min.y += Math.min(0, distance); swept.max.y += Math.max(0, distance);
        var contact = false, closest = 1, fallback = false;
        for (var body of this.bodies) {
            if (!this.solid(body)) continue;
            var pose = this.pose(body, time);
            if (!PlatformShapes.intersects(pose.bounds, swept)) continue;
            for (var part of pose.parts) {
                if (part.visualOnly) continue;
                if (!PlatformShapes.intersects(part.bounds, swept)) continue;
                var fraction = PlatformShapes.sweep(part.geometry, part.matrix, box, distance);
                if (fraction === undefined) { fallback = true; break; };
                if (fraction !== false && (!contact || fraction < closest)) { closest = fraction; contact = { body, part }; };
            };
            if (fallback) break;
        };
        if (!fallback) return contact ? { ...contact, y: pos.y + distance * Math.max(0, closest - 1e-9 / Math.abs(distance)) } : false;
        var steps = Math.max(1, Math.ceil(Math.abs(distance) / .04));
        var previous = 0;
        for (var i = 1; i <= steps; i++) {
            var fraction = i / steps;
            var hit = this.overlap({ ...pos, y: pos.y + distance * fraction }, bounds, time);
            if (hit) {
                var low = previous, high = fraction;
                for (var j = 0; j < 20; j++) {
                    var mid = (low + high) / 2;
                    if (this.overlap({ ...pos, y: pos.y + distance * mid }, bounds, time)) high = mid;
                    else low = mid;
                };
                return { ...hit, y: pos.y + distance * low };
            };
            previous = fraction;
        };
        return false;
    };
    passengerTurn(pos, bounds, from, to) {
        if (!this.turnsPassengers) return 0;
        var support = this.vertical(pos, -.02, bounds, from);
        if (!support || Math.abs(pos.y - support.y) > .015 || !support.body.definition.motion.rotatePlayers) return 0;
        var body = support.body, motion = body.definition.motion;
        if (motion.type !== 'spin' && !motion.orient) return 0;
        var relative = this.pose(body, from).inverse.multiply(this.pose(body, to).matrix);
        var rotation = BABYLON.Quaternion.FromRotationMatrix(relative);
        var yaw = 2 * Math.atan2(rotation.y, rotation.w);
        return Math.atan2(Math.sin(yaw), Math.cos(yaw));
    };
    carry(pos, bounds, from, to, blocked) {
        var support = this.vertical(pos, -.02, bounds, from);
        if (!support || Math.abs(pos.y - support.y) > .015) return pos;
        var body = support.body;
        if (!body.definition.motion || body.definition.motion.type === 'none') return pos;
        var local = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(pos.x, pos.y, pos.z), this.pose(body, from).inverse);
        var end = BABYLON.Vector3.TransformCoordinates(local, this.pose(body, to).matrix);
        var pivot = PlatformMotion.vector(body.definition.motion?.pivot);
        var travel = PlatformMotion.travel(body.definition, from, to, BABYLON.Vector3.Distance(local, pivot));
        var steps = Math.max(1, Math.ceil(Math.max(BABYLON.Vector3.Distance(end, PlatformMotion.vector(pos)), travel) / .06));
        for (var i = 1; i <= steps; i++) {
            var time = from + (to - from) * i / steps;
            var next = BABYLON.Vector3.TransformCoordinates(local, this.pose(body, time).matrix);
            if (blocked(next, time, body)) break;
            pos = { x: next.x, y: next.y, z: next.z };
        };
        return pos;
    };
    contact(body, pos, bounds, time) {
        var box = this.box(pos, bounds), best = false;
        for (var part of this.pose(body, time).parts) {
            if (part.visualOnly || !PlatformShapes.intersects(part.bounds, box)) continue;
            var move = PlatformShapes.contact(part.geometry, part.matrix, box);
            if (move && (!best || move.lengthSquared() < best.lengthSquared())) best = move;
        };
        return best;
    };
    transport(pos, bounds, from, to, blocked, carry = true, reach = .015) { //reach: how far above a surface still counts as riding it
        this.carrier = null; //who carried the last thing moved, for callers that follow its frame
        this.pushed = null; //and the last block that shoved it out of the way, with the way it shoved
        if (from === to) return pos;
        var support = carry && this.vertical(pos, -reach - .005, bounds, from);
        var carrier = support && Math.abs(pos.y - support.y) <= reach && support.body.definition.motion?.type !== 'none' ? support.body : null;
        if (carrier && PlatformMotion.jumps(carrier.definition.motion, from, to)) carrier = null;
        var carrierTravel = carrier ? PlatformMotion.travel(carrier.definition, from, to,
            BABYLON.Vector3.Distance(BABYLON.Vector3.TransformCoordinates(PlatformMotion.vector(pos), this.pose(carrier, from).inverse),
                PlatformMotion.vector(carrier.definition.motion?.pivot))) : 0;
        var query = this.box(pos, bounds), gap = carrierTravel + .01 + (carrier ? reach : 0), expand = new BABYLON.Vector3(gap, gap, gap);
        query = { min: query.min.subtract(expand), max: query.max.add(expand) };
        var near = [], maxTravel = carrierTravel;
        for (var body of this.bodies) {
            if (body.definition.motion?.type === 'none' || !body.parts.some(part => !part.visualOnly) || !this.solid(body)) continue;
            if (!body.envelope) body.envelope = this.sweptBounds(body);
            if (!PlatformShapes.intersects(body.envelope, query)) continue;
            if (body.radius === undefined) {
                var pivot = PlatformMotion.vector(body.definition.motion?.pivot);
                body.radius = body.parts.reduce((radius, part) => Math.max(radius, ...part.corners.map(v =>
                    BABYLON.Vector3.Distance(BABYLON.Vector3.TransformCoordinates(v, part.matrix), pivot))), 0);
            };
            var travel = PlatformMotion.travel(body.definition, from, to, body.radius);
            if (travel < 1e-12) continue;
            var first = this.pose(body, from).bounds, last = this.pose(body, to).bounds;
            var margin = new BABYLON.Vector3(travel, travel, travel);
            var swept = { min: BABYLON.Vector3.Minimize(first.min, last.min).subtract(margin), max: BABYLON.Vector3.Maximize(first.max, last.max).add(margin) };
            if (!PlatformShapes.intersects(swept, query)) continue;
            near.push(body); maxTravel = Math.max(maxTravel, travel);
        };
        if (!near.length) return pos;
        var steps = Math.max(1, Math.ceil(maxTravel / .045));
        var previous = from;
        this.carrier = carrier;
        for (var i = 1; i <= steps; i++) {
            var time = from + (to - from) * i / steps;
            if (carrier) {
                var local = BABYLON.Vector3.TransformCoordinates(PlatformMotion.vector(pos), this.pose(carrier, previous).inverse);
                var matrix = this.pose(carrier, time).matrix, pivot = PlatformMotion.vector(carrier.definition.motion?.pivot);
                var next = this.audience === 'items' && carrier.definition.motion?.rotateItems === false ? //slides under the turn, follows only where the block goes
                    BABYLON.Vector3.TransformCoordinates(pivot, matrix).subtract(BABYLON.Vector3.TransformCoordinates(pivot, this.pose(carrier, previous).matrix)).add(PlatformMotion.vector(pos))
                    : BABYLON.Vector3.TransformCoordinates(local, matrix);
                if (!blocked(next, time, carrier)) pos = { x: next.x, y: next.y, z: next.z };
                else this.carrier = carrier = null;
            };
            for (var body of near) {
                if (body === carrier) continue;
                for (var attempt = 0; attempt < 12; attempt++) {
                    var move = this.contact(body, pos, bounds, time);
                    if (!move) break;
                    if (move.lengthSquared() > 1e-12) this.pushed = { body, normal: move.normalizeToNew() };
                    var start = PlatformMotion.vector(pos), checks = Math.max(1, Math.ceil(move.length() / .04)), stopped = false;
                    for (var j = 1; j <= checks; j++) {
                        var next = start.add(move.scale(j / checks));
                        if (blocked(next, time, body)) { stopped = true; break; }
                        pos = { x: next.x, y: next.y, z: next.z };
                    };
                    if (stopped) break;
                };
            };
            previous = time;
        };
        return pos;
    };
};
