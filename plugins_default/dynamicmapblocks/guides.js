//plugin: dynamicmapblocks, editor only
import BABYLON from 'babylonjs';
import { PlatformMotion } from './motion.js';
import { PlatformWorld } from './platforms.js';
import { PlatformTriggers } from './triggers.js';
import { PlatformTeleporters } from './teleporters.js';

export const TeleporterGuides = { //each pad's zone, and an arc to where it sends: green where it goes in, a dot where it comes out and an arrow for which way that faces
    create(scene, list, offset = {}, selected) {
        var nodes = [], materials = [], shift = PlatformTeleporters.vector(offset), index = new Map(list.map(def => [def.id, def])), world = { teleporterIndex: index };
        var line = (name, points, color) => {
            var mesh = BABYLON.MeshBuilder.CreateLines(name, { points }, scene);
            mesh.color = color; mesh.isPickable = false; mesh.renderingGroupId = 1; nodes.push(mesh);
        };
        var dot = (name, point, diameter, color) => {
            var material = new BABYLON.StandardMaterial(name, scene), mesh = BABYLON.MeshBuilder.CreateSphere(name, { diameter, segments: 8 }, scene);
            material.disableLighting = true; material.emissiveColor = color; materials.push(material);
            mesh.position.copyFrom(point); mesh.material = material; mesh.isPickable = false; mesh.renderingGroupId = 1; nodes.push(mesh);
        };
        var arrow = (from, to, color, size = .22) => {
            var direction = to.subtract(from);
            if (direction.lengthSquared() < 1e-8) return;
            direction.normalize();
            var side = BABYLON.Vector3.Cross(direction, Math.abs(direction.y) < .9 ? BABYLON.Axis.Y : BABYLON.Axis.X).normalize().scale(size / 2);
            line('teleporter-arrow', [to.subtract(direction.scale(size)).add(side), to, to.subtract(direction.scale(size)).subtract(side)], color);
        };
        for (var def of list) {
            var k = PlatformTeleporters.info(def), z = k.c.zone, colour = BABYLON.Color3.FromHexString(PlatformTeleporters.palette[k.c.look.color][1]);
            var middle = new BABYLON.Vector3(k.zone.x, k.zone.y, k.zone.z).subtract(shift), picked = def.id === selected, X = k.basis.u, Y = k.basis.v, Z = k.basis.w; //the zone's own axes: Y is out of the face it sits on
            var ring = (axisA, axisB, radius, height = 0) => Array.from({ length: 33 }, (_, i) => middle.add(axisA.scale(Math.cos(i / 32 * Math.PI * 2) * radius)).add(axisB.scale(Math.sin(i / 32 * Math.PI * 2) * radius)).add(Y.scale(height)));
            if (z.shape === 'box') {
                var s = z.size, corners = [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(zz => middle.add(X.scale(x * s.x)).add(Y.scale(y * s.y)).add(Z.scale(zz * s.z)))));
                for (var [a, b] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) line('teleporter-zone', [corners[a], corners[b]], colour);
            } else if (z.shape === 'cylinder') {
                line('teleporter-zone', ring(X, Z, z.radius, z.height), colour); line('teleporter-zone', ring(X, Z, z.radius, -z.height), colour);
                for (var side of [X, Z]) for (var sign of [-1, 1]) line('teleporter-zone', [middle.add(side.scale(sign * z.radius)).subtract(Y.scale(z.height)), middle.add(side.scale(sign * z.radius)).add(Y.scale(z.height))], colour);
            } else for (var [u, v] of [[X, Y], [X, Z], [Y, Z]]) line('teleporter-zone', ring(u, v, z.radius), colour);
            dot('teleporter-in', middle, picked ? .24 : .2, new BABYLON.Color3(.2, 1, .35));
            var spot = k.c.send && PlatformTeleporters.resolve(world, def, null);
            if (!spot) continue;
            var out = new BABYLON.Vector3(spot.x, spot.y + .3, spot.z).subtract(shift), distance = BABYLON.Vector3.Distance(middle, out);
            var partner = k.c.to.type === 'link' && index.get(k.c.to.id), mutual = partner && partner.to?.type !== 'point' && partner.to?.id === def.id;
            var sideways = mutual ? BABYLON.Vector3.Cross(out.subtract(middle), BABYLON.Axis.Y).normalize().scale(def.id < partner.id ? .2 : -.2) : BABYLON.Vector3.Zero();
            var lift = BABYLON.Axis.Y.scale(Math.max(1, distance * .25)), control = middle.add(out).scale(.5).add(lift).add(sideways);
            var points = Array.from({ length: 25 }, (_, i) => { var t = i / 24; return middle.scale((1 - t) * (1 - t)).add(control.scale(2 * t * (1 - t))).add(out.scale(t * t)); });
            line('teleporter-link', points, colour); arrow(points[11], points[13], colour);
            dot('teleporter-out', out, .12, colour);
            var heading = new BABYLON.Vector3(Math.sin(spot.facing * Math.PI / 180), 0, Math.cos(spot.facing * Math.PI / 180));
            line('teleporter-facing', [out, out.add(heading.scale(.6))], colour); arrow(out, out.add(heading.scale(.6)), colour, .15);
        };
        return { nodes, dispose() { nodes.forEach(node => node.dispose()); materials.forEach(material => material.dispose()); } };
    },
};

export const PlatformGuides = {
    create(scene, definitions, offset = {}, sources = []) {
        var nodes = [], materials = [];
        var palette = ['#20dfff', '#ffb13b', '#fa70d7', '#a3ed45', '#ad9cff', '#ff8577'];
        var shift = PlatformMotion.vector(offset);
        function line(name, points, color) {
            if (points.length < 2) return;
            var mesh = BABYLON.MeshBuilder.CreateLines(name, { points }, scene);
            mesh.color = color; mesh.isPickable = false; mesh.renderingGroupId = 1; nodes.push(mesh);
        };
        for (var { definition: body } of new PlatformWorld(definitions, sources).bodies) {
            var motion = body.motion || { type: 'none' };
            if (!['path', 'circle', 'spin'].includes(motion.type)) continue;
            var hash = Array.from(body.id).reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);
            var color = BABYLON.Color3.FromHexString(palette[hash % palette.length]);
            var base = PlatformMotion.sample({ ...body, motion: { type: 'none' } }, 0);
            var world = value => BABYLON.Vector3.TransformCoordinates(value, base).subtract(shift);
            var centre = ['path', 'circle'].includes(motion.type) ? PlatformMotion.vector(motion.pathReference ?? motion.pathAnchor ?? motion.pivot) : BABYLON.Vector3.Zero();
            var points;
            if (motion.type === 'path') {
                points = motion.points.map(point => world(centre.add(PlatformMotion.vector(point))));
                if (motion.loop === 'loop') points.push(points[0]);
            } else {
                var duration = motion.type === 'circle' ? motion.duration : 360 / (Math.abs(motion.speed) || 30);
                points = Array.from({ length: 97 }, (_, i) => {
                    var matrix = PlatformMotion.sample({ ...body, motion: { ...motion, orient: false, phase: 0 } }, duration * i / 96);
                    return BABYLON.Vector3.TransformCoordinates(motion.type === 'circle' ? PlatformMotion.vector(motion.pivot) : centre, matrix).subtract(shift);
                });
            };
            line('physics-path-' + body.id, points, color);
            if (motion.trigger?.source === 'zone') { //where the block is set off from
                var z = PlatformTriggers.config(motion).zone, start = new PlatformWorld([{ ...body, motion: { type: 'none' } }], sources).bodies[0];
                var middle = BABYLON.Vector3.TransformCoordinates(PlatformTriggers.centre(start), PlatformMotion.sample({ ...body, motion: { type: 'none' } }, 0)).add(PlatformMotion.vector(z.offset)).subtract(shift);
                var ring = (axisA, axisB, radius, height = 0) => Array.from({ length: 33 }, (_, i) => middle.add(axisA.scale(Math.cos(i / 32 * Math.PI * 2) * radius)).add(axisB.scale(Math.sin(i / 32 * Math.PI * 2) * radius)).add(BABYLON.Axis.Y.scale(height)));
                if (z.shape === 'box') {
                    var s = z.size, corners = [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(zz => middle.add(new BABYLON.Vector3(x * s.x, y * s.y, zz * s.z)))));
                    for (var [a, b] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) line('physics-zone', [corners[a], corners[b]], color);
                } else if (z.shape === 'cylinder') {
                    line('physics-zone', ring(BABYLON.Axis.X, BABYLON.Axis.Z, z.radius, z.height), color); line('physics-zone', ring(BABYLON.Axis.X, BABYLON.Axis.Z, z.radius, -z.height), color);
                    for (var side of [BABYLON.Axis.X, BABYLON.Axis.Z]) for (var sign of [-1, 1]) line('physics-zone', [middle.add(side.scale(sign * z.radius)).add(BABYLON.Axis.Y.scale(-z.height)), middle.add(side.scale(sign * z.radius)).add(BABYLON.Axis.Y.scale(z.height))], color);
                } else for (var [u, v] of [[BABYLON.Axis.X, BABYLON.Axis.Y], [BABYLON.Axis.X, BABYLON.Axis.Z], [BABYLON.Axis.Y, BABYLON.Axis.Z]]) line('physics-zone', ring(u, v, z.radius), color);
            };
            var material = new BABYLON.StandardMaterial('physics-waypoints', scene);
            material.disableLighting = true; material.emissiveColor = color; materials.push(material);
            var startMaterial = new BABYLON.StandardMaterial('physics-start', scene);
            startMaterial.disableLighting = true; startMaterial.emissiveColor = new BABYLON.Color3(.2, 1, .35); materials.push(startMaterial);
            var markers = motion.type === 'path' ? points.slice(0, motion.points.length) : [points[0]];
            markers.forEach((point, index) => {
                var marker = BABYLON.MeshBuilder.CreateSphere('physics-waypoint-' + (index + 1), { diameter: index ? .12 : .2, segments: 8 }, scene);
                marker.position.copyFrom(point); marker.material = index ? material : startMaterial;
                marker.isPickable = false; marker.renderingGroupId = 1; nodes.push(marker);
            });
            for (var i = 1; i < points.length; i += motion.type === 'path' ? 1 : 12) {
                var a = points[i - 1], b = points[Math.min(i + (motion.type === 'path' ? 0 : 7), points.length - 1)];
                var direction = b.subtract(a);
                if (direction.lengthSquared() < 1e-8) continue;
                direction.normalize();
                var normal = BABYLON.Vector3.Cross(direction, Math.abs(direction.y) < .9 ? BABYLON.Axis.Y : BABYLON.Axis.X).normalize();
                var tip = a.add(b).scale(.5), tail = tip.subtract(direction.scale(.22));
                line('physics-direction', [tail.add(normal.scale(.11)), tip, tail.subtract(normal.scale(.11))], color);
                if (motion.type === 'path' && motion.loop === 'pingpong') {
                    tip = tip.add(normal.scale(.18)); tail = tip.add(direction.scale(.22));
                    line('physics-return', [tail.add(normal.scale(.11)), tip, tail.subtract(normal.scale(.11))], color);
                };
            };
            if (motion.type === 'spin') {
                var pivot = PlatformMotion.vector(motion.pivot), axis = PlatformMotion.vector(motion.axis || { y: 1 }).normalize();
                line('physics-axis', [world(pivot.subtract(axis.scale(2))), world(pivot.add(axis.scale(2)))], color);
            };
        };
        return { nodes, dispose() { nodes.forEach(node => node.dispose()); materials.forEach(material => material.dispose()); } };
    },
};
