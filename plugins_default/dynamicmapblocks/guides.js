//plugin: dynamicmapblocks, editor only
import BABYLON from 'babylonjs';
import { PlatformMotion } from './motion.js';
import { PlatformWorld } from './platforms.js';

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
            var centre = ['path', 'circle'].includes(motion.type) ? PlatformMotion.vector(motion.pathAnchor ?? motion.pivot) : BABYLON.Vector3.Zero();
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
