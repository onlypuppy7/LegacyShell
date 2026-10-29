//plugin: dynamicmapblocks
import BABYLON from 'babylonjs';
import { PlatformMap, PlatformWorld } from './platforms.js';
import { PlatformLighting } from './lighting.js';

export class PlatformRenderClock {
    constructor(sample, source = () => performance.now() / 1000) {
        this.sample = sample; this.source = source;
        this.time = null; this.last = null;
    };
    now() {
        var target = this.sample(), now = this.source();
        if (!Number.isFinite(target)) return this.time ?? 0;
        var delta = this.last === null ? 0 : Math.max(0, now - this.last);
        if (this.time === null || delta > 1 || Math.abs(target - this.time) > 1) this.time = target;
        else {
            var expected = this.time + delta, correction = target - expected;
            this.time = expected + Math.max(-delta * .25, Math.min(delta * .25, correction));
        };
        this.last = now;
        return this.time;
    };
};

export const PlatformRender = {
    builders: new Map(),
    register(type, build) { this.builders.set(type, build); },
    create(scene, world, sources = [], sampleTime = () => world.now(), offset = {}, options = {}) {
        var nodes = [], clock = options.smoothTime ? new PlatformRenderClock(sampleTime) : null;
        var base = new BABYLON.StandardMaterial('platform-base', scene);
        base.diffuseColor = new BABYLON.Color3(.22, .25, .28);
        base.specularColor = new BABYLON.Color3(.15, .15, .15);
        var stripe = new BABYLON.StandardMaterial('platform-stripe', scene);
        stripe.diffuseColor = new BABYLON.Color3(1, .55, .06);
        stripe.emissiveColor = new BABYLON.Color3(.18, .07, 0);
        var bodies = world.bodies.filter(body => !body.definition.static);
        bodies.forEach(body => {
            var root = new BABYLON.AbstractMesh('platform-' + body.definition.id, scene);
            root.rotationQuaternion = BABYLON.Quaternion.Identity();
            for (var shape of body.definition.shapes || []) {
                var builder = this.builders.get(shape.type);
                if (!builder) throw new Error('Missing platform renderer: ' + shape.type);
                var mesh = builder(shape, scene);
                mesh.parent = root;
                mesh.position.copyFromFloats(shape.position?.x || 0, shape.position?.y || 0, shape.position?.z || 0);
                mesh.rotation.set(shape.rotation?.x || 0, shape.rotation?.y || 0, shape.rotation?.z || 0);
                mesh.material = base;
                mesh.receiveShadows = true;
                mesh.isPickable = false;
                if (body.definition.appearance === 'disk' && shape.type === 'cylinder') {
                    for (var i = 0; i < 4; i++) {
                        var spoke = BABYLON.MeshBuilder.CreateBox('platform-spoke', { width: shape.radius * .78, height: .006, depth: .12 }, scene);
                        spoke.parent = mesh;
                        var angle = i * Math.PI / 2;
                        spoke.position.set(Math.cos(angle) * shape.radius * .53, shape.height / 2 + .004, Math.sin(angle) * shape.radius * .53);
                        spoke.rotation.y = -angle; spoke.material = stripe; spoke.isPickable = false;
                    };
                    var hub = BABYLON.MeshBuilder.CreateCylinder('platform-hub', { diameter: .35, height: .012, tessellation: 24 }, scene);
                    hub.parent = mesh; hub.position.y = shape.height / 2 + .007; hub.material = stripe; hub.isPickable = false;
                };
            };
            for (var block of body.definition.blocks || []) {
                var source = PlatformMap.source(sources, block.mesh);
                var mesh = source.clone('platform-block', root);
                mesh.unfreezeWorldMatrix(); mesh.setEnabled(true); mesh.isPickable = false;
                mesh.rotationQuaternion = null;
                mesh.position.set(block.x + .5 - body.definition.position.x, block.y + .5 - body.definition.position.y, block.z + .5 - body.definition.position.z);
                mesh.rotation.set((block.rx || 0) * Math.PI / 2, (block.ry || 0) * Math.PI / 2, (block.rz || 0) * Math.PI / 2);
                mesh.getChildMeshes().forEach(child => { child.unfreezeWorldMatrix(); child.isPickable = false; });
                var collider = ['aabb', 'obb', 'mesh'].includes(source.colliderType || block.mesh.split('.')[2]) ? source.colliderMesh || source.getChildMeshes()[0] : null;
                var collisionClone = mesh.getChildMeshes()[source.getChildMeshes().indexOf(collider)];
                if (collisionClone) {
                    collisionClone.setEnabled(false); collisionClone.isVisible = false;
                    collisionClone.getChildMeshes().forEach(child => { child.setEnabled(false); child.isVisible = false; });
                };
            };
            nodes.push(root);
        });
        var lighting;
        var update = () => {
            var time = clock ? clock.now() : sampleTime();
            nodes.forEach((node, index) => {
                world.pose(bodies[index], time).matrix.decompose(node.scaling, node.rotationQuaternion, node.position);
                node.position.x -= offset.x || 0; node.position.y -= offset.y || 0; node.position.z -= offset.z || 0;
            });
            if (lighting) lighting.update(time);
        };
        update();
        if (options.lighting) lighting = PlatformLighting.create(scene, nodes);
        var observer = scene.onBeforeRenderObservable.add(update);
        return {
            nodes,
            dispose() {
                scene.onBeforeRenderObservable.remove(observer);
                if (lighting) lighting.dispose();
                nodes.forEach(node => node.dispose());
                base.dispose(); stripe.dispose();
            },
        };
    },
};

PlatformRender.register('cylinder', (shape, scene) => BABYLON.MeshBuilder.CreateCylinder('platform-cylinder', {
    diameter: shape.radius * 2, height: shape.height, tessellation: 96,
}, scene));
PlatformRender.register('box', (shape, scene) => {
    var min = shape.min, max = shape.max;
    var mesh = BABYLON.MeshBuilder.CreateBox('platform-box', { width: max.x - min.x, height: max.y - min.y, depth: max.z - min.z }, scene);
    mesh.position.set((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
    mesh.bakeCurrentTransformIntoVertices();
    return mesh;
});

export const SpinDiskRender = {
    create(scene, disks) { return PlatformRender.create(scene, new PlatformWorld(disks.map((disk, index) => PlatformMap.fromDisk(disk, index)))); },
};
