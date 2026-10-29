//plugin: dynamicmapblocks
import BABYLON from 'babylonjs';

export const PlatformShapes = {
    types: new Map(),
    convexCache: new WeakMap(),
    register(name, create) { this.types.set(name, create); },
    create(definition) {
        var create = this.types.get(definition.type);
        if (!create) throw new Error('Unknown platform shape: ' + definition.type);
        return create(definition);
    },
    corners(min, max) {
        var result = [];
        for (var x of [min.x, max.x]) for (var y of [min.y, max.y]) for (var z of [min.z, max.z]) {
            result.push(new BABYLON.Vector3(x, y, z));
        };
        return result;
    },
    bounds(vertices) {
        var min = new BABYLON.Vector3(Infinity, Infinity, Infinity), max = min.negate();
        for (var v of vertices) { min.minimizeInPlace(v); max.maximizeInPlace(v); };
        return { min, max };
    },
    intersects(a, b) {
        return a.min.x < b.max.x - 1e-7 && a.max.x > b.min.x + 1e-7 &&
            a.min.y < b.max.y - 1e-7 && a.max.y > b.min.y + 1e-7 &&
            a.min.z < b.max.z - 1e-7 && a.max.z > b.min.z + 1e-7;
    },
    axes(vertices, directions) {
        var result = [];
        for (var axis of directions) {
            if (axis.lengthSquared() < 1e-16) continue;
            axis = axis.normalize();
            var min = Infinity, max = -Infinity;
            for (var vertex of vertices) {
                var projection = vertex.x * axis.x + vertex.y * axis.y + vertex.z * axis.z;
                min = Math.min(min, projection); max = Math.max(max, projection);
            };
            result.push({ x: axis.x, y: axis.y, z: axis.z, min, max });
        };
        return result;
    },
    axesOverlap(axes, box) {
        var x = (box.min.x + box.max.x) * .5, y = (box.min.y + box.max.y) * .5, z = (box.min.z + box.max.z) * .5;
        var hx = (box.max.x - box.min.x) * .5, hy = (box.max.y - box.min.y) * .5, hz = (box.max.z - box.min.z) * .5;
        for (var axis of axes) {
            var mid = x * axis.x + y * axis.y + z * axis.z;
            var radius = Math.abs(axis.x) * hx + Math.abs(axis.y) * hy + Math.abs(axis.z) * hz;
            if (axis.max <= mid - radius + 1e-7 || axis.min >= mid + radius - 1e-7) return false;
        };
        return true;
    },
    axesContact(axes, box) {
        var x = (box.min.x + box.max.x) * .5, y = (box.min.y + box.max.y) * .5, z = (box.min.z + box.max.z) * .5;
        var hx = (box.max.x - box.min.x) * .5, hy = (box.max.y - box.min.y) * .5, hz = (box.max.z - box.min.z) * .5;
        var best, depth = Infinity;
        for (var axis of axes) {
            var mid = x * axis.x + y * axis.y + z * axis.z;
            var radius = Math.abs(axis.x) * hx + Math.abs(axis.y) * hy + Math.abs(axis.z) * hz;
            var positive = axis.max - mid + radius, negative = mid + radius - axis.min;
            if (positive <= 1e-7 || negative <= 1e-7) return false;
            var distance = Math.min(positive, negative);
            if (distance < depth) {
                depth = distance;
                var sign = positive < negative ? 1 : -1;
                best = new BABYLON.Vector3(axis.x * sign, axis.y * sign, axis.z * sign).scale(distance + 2e-6);
            };
        };
        return best || false;
    },
    contact(geometry, matrix, box) {
        if (geometry.contact) return geometry.contact(matrix, box);
        if (!geometry.normals || !geometry.edges) return false;
        var query = this.convex(geometry, matrix);
        return this.intersects(query.bounds, box) && this.axesContact(query.axes, box);
    },
    axesSweep(axes, box, distance) {
        var x = (box.min.x + box.max.x) * .5, y = (box.min.y + box.max.y) * .5, z = (box.min.z + box.max.z) * .5;
        var hx = (box.max.x - box.min.x) * .5, hy = (box.max.y - box.min.y) * .5, hz = (box.max.z - box.min.z) * .5;
        var enter = 0, exit = 1;
        for (var axis of axes) {
            var mid = x * axis.x + y * axis.y + z * axis.z;
            var radius = Math.abs(axis.x) * hx + Math.abs(axis.y) * hy + Math.abs(axis.z) * hz;
            var speed = axis.y * distance;
            if (Math.abs(speed) < 1e-14) {
                if (axis.max <= mid - radius + 1e-7 || axis.min >= mid + radius - 1e-7) return false;
            } else {
                var a = (axis.min - radius - mid) / speed, b = (axis.max + radius - mid) / speed;
                enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
                if (enter >= exit) return false;
            };
        };
        return enter;
    },
    convex(geometry, matrix) {
        var cache = this.convexCache.get(geometry);
        if (!cache) this.convexCache.set(geometry, cache = new WeakMap());
        if (cache.get(matrix)?.version === matrix.updateFlag) return cache.get(matrix);
        var vertices = geometry.vertices.map(v => BABYLON.Vector3.TransformCoordinates(v, matrix));
        var worldAxes = [BABYLON.Axis.X, BABYLON.Axis.Y, BABYLON.Axis.Z];
        var normalMatrix = matrix.clone().invert().transpose();
        var directions = worldAxes.concat(geometry.normals.map(v => BABYLON.Vector3.TransformNormal(v, normalMatrix)));
        for (var edge of geometry.edges) for (var axis of worldAxes) directions.push(BABYLON.Vector3.Cross(BABYLON.Vector3.TransformNormal(edge, matrix), axis));
        var query = { bounds: this.bounds(vertices), axes: this.axes(vertices, directions), version: matrix.updateFlag };
        cache.set(matrix, query);
        return query;
    },
    sweep(geometry, matrix, box, distance) {
        if (geometry.sweep) {
            var result = geometry.sweep(matrix, box, distance);
            if (result !== undefined) return result;
        };
        if (!geometry.normals || !geometry.edges) return;
        return this.axesSweep(this.convex(geometry, matrix).axes, box, distance);
    },
    overlap(geometry, matrix, box) {
        if (geometry.overlap) {
            var result = geometry.overlap(matrix, box);
            if (result !== undefined) return result;
        };
        var query = this.convex(geometry, matrix);
        return this.intersects(query.bounds, box) && this.axesOverlap(query.axes, box);
    },
};

PlatformShapes.register('box', definition => {
    var min = definition.min || { x: -.5, y: -.5, z: -.5 };
    var max = definition.max || { x: .5, y: .5, z: .5 };
    var axes = [BABYLON.Axis.X, BABYLON.Axis.Y, BABYLON.Axis.Z];
    return {
        vertices: PlatformShapes.corners(min, max), normals: axes, edges: axes,
        ray(origin, direction) {
            var enter = -Infinity, exit = Infinity, normal;
            for (var axis of ['x', 'y', 'z']) {
                if (Math.abs(direction[axis]) < 1e-12) {
                    if (origin[axis] < min[axis] || origin[axis] > max[axis]) return false;
                    continue;
                };
                var a = (min[axis] - origin[axis]) / direction[axis], b = (max[axis] - origin[axis]) / direction[axis];
                var n = new BABYLON.Vector3(); n[axis] = direction[axis] > 0 ? -1 : 1;
                if (Math.min(a, b) > enter) { enter = Math.min(a, b); normal = n; };
                exit = Math.min(exit, Math.max(a, b));
                if (enter > exit) return false;
            };
            if (exit < 0 || enter > 1 || !normal) return false;
            return { t: Math.max(0, enter), normal };
        },
    };
});

PlatformShapes.register('cylinder', definition => {
    var radius = definition.radius, halfHeight = definition.height / 2;
    var vertices = [], normals = [BABYLON.Axis.Y], edges = [BABYLON.Axis.Y];
    for (var i = 0; i < 64; i++) {
        var angle = i * Math.PI * 2 / 64, next = (i + 1) * Math.PI * 2 / 64;
        for (var y of [-halfHeight, halfHeight]) vertices.push(new BABYLON.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
        normals.push(new BABYLON.Vector3(Math.cos((angle + next) / 2), 0, Math.sin((angle + next) / 2)));
        edges.push(new BABYLON.Vector3(Math.cos(next) - Math.cos(angle), 0, Math.sin(next) - Math.sin(angle)));
    };
    return {
        vertices, normals, edges,
        sweep(matrix, box, distance) {
            var m = matrix.m;
            if (Math.abs(m[5]) < .999999) return;
            var x = Math.max(box.min.x, Math.min(m[12], box.max.x)) - m[12];
            var z = Math.max(box.min.z, Math.min(m[14], box.max.z)) - m[14];
            if (x * x + z * z >= radius * radius - 1e-7) return false;
            return PlatformShapes.axesSweep([{ x: 0, y: 1, z: 0, min: m[13] - halfHeight, max: m[13] + halfHeight }], box, distance);
        },
        overlap(matrix, box) {
            var up = BABYLON.Vector3.TransformNormal(BABYLON.Axis.Y, matrix);
            if (Math.abs(up.y) < .999999) return;
            var centre = BABYLON.Vector3.TransformCoordinates(BABYLON.Vector3.Zero(), matrix);
            if (box.min.y >= centre.y + halfHeight - 1e-7 || box.max.y <= centre.y - halfHeight + 1e-7) return false;
            var x = Math.max(box.min.x, Math.min(centre.x, box.max.x)) - centre.x;
            var z = Math.max(box.min.z, Math.min(centre.z, box.max.z)) - centre.z;
            return x * x + z * z < radius * radius - 1e-7;
        },
        ray(origin, direction) {
            var hits = [];
            if (Math.abs(direction.y) > 1e-12) for (var y of [-halfHeight, halfHeight]) {
                var t = (y - origin.y) / direction.y;
                if ((origin.x + direction.x * t) ** 2 + (origin.z + direction.z * t) ** 2 <= radius ** 2 + 1e-7) {
                    hits.push({ t, normal: new BABYLON.Vector3(0, y < 0 ? -1 : 1, 0) });
                };
            };
            var a = direction.x ** 2 + direction.z ** 2, b = origin.x * direction.x + origin.z * direction.z;
            var c = origin.x ** 2 + origin.z ** 2 - radius ** 2, d = b * b - a * c;
            if (a > 1e-12 && d >= 0) for (var t of [(-b - Math.sqrt(d)) / a, (-b + Math.sqrt(d)) / a]) {
                var y = origin.y + direction.y * t;
                if (Math.abs(y) <= halfHeight + 1e-7) hits.push({ t,
                    normal: new BABYLON.Vector3((origin.x + direction.x * t) / radius, 0, (origin.z + direction.z * t) / radius) });
            };
            return hits.filter(hit => hit.t >= 0 && hit.t <= 1).sort((a, b) => a.t - b.t)[0] || false;
        },
    };
});

PlatformShapes.register('mesh', definition => {
    var positions = definition.positions, indices = definition.indices;
    var vertices = [];
    for (var i = 0; i < positions.length; i += 3) vertices.push(new BABYLON.Vector3(positions[i], positions[i + 1], positions[i + 2]));
    var triangles = [], edges = new Map();
    var key = v => [v.x, v.y, v.z].map(n => Math.round(n * 1e6)).join(',');
    for (var i = 0; i < indices.length; i += 3) {
        var points = [indices[i], indices[i + 1], indices[i + 2]].map(index => vertices[index]);
        if (BABYLON.Vector3.Cross(points[1].subtract(points[0]), points[2].subtract(points[0])).lengthSquared() < 1e-16) continue;
        triangles.push({ points, bounds: PlatformShapes.bounds(points), edgeA: points[1].subtract(points[0]), edgeB: points[2].subtract(points[0]) });
        for (var j = 0; j < 3; j++) {
            var edge = [key(points[j]), key(points[(j + 1) % 3])].sort().join('/');
            edges.set(edge, (edges.get(edge) || 0) + 1);
        };
    };
    var closed = edges.size > 0 && Array.from(edges.values()).every(count => count === 2);
    function tree(list) {
        var bounds = PlatformShapes.bounds(list.flatMap(triangle => [triangle.bounds.min, triangle.bounds.max]));
        if (list.length <= 8) return { bounds, triangles: list };
        var size = bounds.max.subtract(bounds.min);
        var axis = ['x', 'y', 'z'].sort((a, b) => size[b] - size[a])[0];
        list.sort((a, b) => a.bounds.min[axis] + a.bounds.max[axis] - b.bounds.min[axis] - b.bounds.max[axis]);
        var middle = Math.floor(list.length / 2);
        return { bounds, children: [tree(list.slice(0, middle)), tree(list.slice(middle))] };
    };
    var root = tree(triangles);
    function rayTriangle(origin, direction, triangle) {
        var a = triangle.edgeA, b = triangle.edgeB;
        var cx = direction.y * b.z - direction.z * b.y, cy = direction.z * b.x - direction.x * b.z, cz = direction.x * b.y - direction.y * b.x;
        var determinant = a.x * cx + a.y * cy + a.z * cz;
        if (Math.abs(determinant) < 1e-12) return false;
        var x = origin.x - triangle.points[0].x, y = origin.y - triangle.points[0].y, z = origin.z - triangle.points[0].z;
        var u = (x * cx + y * cy + z * cz) / determinant;
        if (u < -1e-8 || u > 1 + 1e-8) return false;
        var qx = y * a.z - z * a.y, qy = z * a.x - x * a.z, qz = x * a.y - y * a.x;
        var v = (direction.x * qx + direction.y * qy + direction.z * qz) / determinant;
        if (v < -1e-8 || u + v > 1 + 1e-8) return false;
        var t = (b.x * qx + b.y * qy + b.z * qz) / determinant;
        return t >= 0 ? { t, normal: BABYLON.Vector3.Cross(b, a).normalize() } : false;
    };
    function rayBounds(origin, direction, bounds, limit) {
        var enter = 0, exit = limit;
        for (var axis of ['x', 'y', 'z']) {
            if (Math.abs(direction[axis]) < 1e-12) {
                if (origin[axis] < bounds.min[axis] || origin[axis] > bounds.max[axis]) return false;
            } else {
                var a = (bounds.min[axis] - origin[axis]) / direction[axis], b = (bounds.max[axis] - origin[axis]) / direction[axis];
                enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
                if (enter > exit) return false;
            };
        };
        return true;
    };
    function cast(node, origin, direction, limit, hits) {
        if (!rayBounds(origin, direction, node.bounds, limit)) return;
        if (node.children) return node.children.forEach(child => cast(child, origin, direction, limit, hits));
        for (var triangle of node.triangles) {
            var hit = rayTriangle(origin, direction, triangle);
            if (hit && hit.t <= limit) hits.push(hit);
        };
    };
    function contains(point) {
        if (!closed) return false;
        if (point.x < root.bounds.min.x || point.x > root.bounds.max.x || point.y < root.bounds.min.y || point.y > root.bounds.max.y ||
            point.z < root.bounds.min.z || point.z > root.bounds.max.z) return false;
        var hits = [];
        cast(root, point, new BABYLON.Vector3(1, .371390676, .694746591), Infinity, hits);
        hits.sort((a, b) => a.t - b.t);
        return hits.filter((hit, i) => hit.t > 1e-7 && (!i || hit.t - hits[i - 1].t > 1e-7)).length % 2 === 1;
    };
    var cache = new WeakMap();
    function prepare(matrix) {
        if (cache.get(matrix)?.version === matrix.updateFlag) return cache.get(matrix);
        var bounds = new Map(), axes = new Map(), points = new Map(), m = matrix.m;
        var query = {
            version: matrix.updateFlag,
            inverse: matrix.clone().invert(),
            bounds(node) {
                if (bounds.has(node)) return bounds.get(node);
                var min = node.bounds.min, max = node.bounds.max;
                var x = (min.x + max.x) * .5, y = (min.y + max.y) * .5, z = (min.z + max.z) * .5;
                var hx = (max.x - min.x) * .5, hy = (max.y - min.y) * .5, hz = (max.z - min.z) * .5;
                var wx = x * m[0] + y * m[4] + z * m[8] + m[12], wy = x * m[1] + y * m[5] + z * m[9] + m[13], wz = x * m[2] + y * m[6] + z * m[10] + m[14];
                var rx = Math.abs(m[0]) * hx + Math.abs(m[4]) * hy + Math.abs(m[8]) * hz;
                var ry = Math.abs(m[1]) * hx + Math.abs(m[5]) * hy + Math.abs(m[9]) * hz;
                var rz = Math.abs(m[2]) * hx + Math.abs(m[6]) * hy + Math.abs(m[10]) * hz;
                var box = { min: new BABYLON.Vector3(wx - rx, wy - ry, wz - rz), max: new BABYLON.Vector3(wx + rx, wy + ry, wz + rz) };
                bounds.set(node, box);
                return box;
            },
            axes(triangle) {
                if (axes.has(triangle)) return axes.get(triangle);
                var world = triangle.points.map(v => {
                    if (!points.has(v)) points.set(v, BABYLON.Vector3.TransformCoordinates(v, matrix));
                    return points.get(v);
                });
                var edges = world.map((v, i) => world[(i + 1) % 3].subtract(v));
                var directions = [BABYLON.Axis.X, BABYLON.Axis.Y, BABYLON.Axis.Z, BABYLON.Vector3.Cross(edges[0], edges[1])];
                for (var edge of edges) for (var axis of [BABYLON.Axis.X, BABYLON.Axis.Y, BABYLON.Axis.Z]) directions.push(BABYLON.Vector3.Cross(edge, axis));
                var result = PlatformShapes.axes(world, directions);
                axes.set(triangle, result);
                return result;
            },
        };
        cache.set(matrix, query);
        return query;
    };
    return {
        vertices,
        contact(matrix, box) {
            var query = prepare(matrix), best = false;
            function visit(node) {
                if (!PlatformShapes.intersects(query.bounds(node), box)) return;
                if (node.children) { node.children.forEach(visit); return; }
                for (var triangle of node.triangles) {
                    var axes = query.axes(triangle);
                    if (!PlatformShapes.axesOverlap(axes, box)) continue;
                    var move = PlatformShapes.axesContact([axes[3]], box);
                    if (move && (!best || move.lengthSquared() < best.lengthSquared())) best = move;
                };
            };
            visit(root); return best;
        },
        overlap(matrix, box) {
            var query = prepare(matrix);
            function visit(node) {
                if (!PlatformShapes.intersects(query.bounds(node), box)) return false;
                if (node.children) return node.children.some(visit);
                for (var triangle of node.triangles) if (PlatformShapes.axesOverlap(query.axes(triangle), box)) return true;
                return false;
            };
            return visit(root) || contains(BABYLON.Vector3.TransformCoordinates(box.min.add(box.max).scale(.5), query.inverse));
        },
        sweep(matrix, box, distance) {
            var query = prepare(matrix), best = false;
            var swept = { min: box.min.clone(), max: box.max.clone() };
            swept.min.y += Math.min(0, distance); swept.max.y += Math.max(0, distance);
            function visit(node) {
                if (!PlatformShapes.intersects(query.bounds(node), swept)) return;
                if (node.children) {
                    for (var child of node.children) { visit(child); if (best === 0) return; };
                } else for (var triangle of node.triangles) {
                    var fraction = PlatformShapes.axesSweep(query.axes(triangle), box, distance);
                    if (fraction !== false && (best === false || fraction < best)) best = fraction;
                    if (best === 0) return;
                };
            };
            visit(root);
            return best;
        },
        ray(origin, direction) {
            var hits = [];
            cast(root, origin, direction, 1, hits);
            return hits.sort((a, b) => a.t - b.t)[0] || false;
        },
    };
});
