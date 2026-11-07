//plugin: dynamicmapblocks
import BABYLON from 'babylonjs';
import { PlatformMap, PlatformWorld } from './platforms.js';
import { PlatformTeleporters } from './teleporters.js';
import { PlatformLighting } from './lighting.js';
import { SignRender } from './sign-render.js';

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
        var nodes = [], blocks = new Map(), clock = options.smoothTime ? new PlatformRenderClock(sampleTime) : null;
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
                blocks.set([block.x, block.y, block.z].join(','), mesh);
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
                if (/^SIGN(WALL|STAND|BUBBLE)\./.test(block.mesh)) mesh.getChildMeshes().forEach(child => { child.setEnabled(false); child.isVisible = false; });
            };
            nodes.push(root);
        });
        var lighting, dressed = !options.material;
        var dress = () => { //the cloned blocks come without a material, so they would ignore the sun, fog and weather: give them the map's own
            if (dressed) return;
            var material = options.material();
            if (!material) return;
            dressed = true;
            for (var mesh of nodes.flatMap(node => node.getChildMeshes())) if (mesh.isEnabled() && mesh.isVisible && !mesh.material && mesh.getTotalVertices() > 0) mesh.material = material;
            if (options.lighting && !options.material) lighting = PlatformLighting.create(scene, nodes);
        };
        var update = () => {
            dress();
            var time = clock ? clock.now() : sampleTime();
            nodes.forEach((node, index) => {
                world.pose(bodies[index], time, true).matrix.decompose(node.scaling, node.rotationQuaternion, node.position);
                node.position.x -= offset.x || 0; node.position.y -= offset.y || 0; node.position.z -= offset.z || 0;
            });
            if (lighting) lighting.update(time);
        };
        update();
        if (options.lighting) lighting = PlatformLighting.create(scene, nodes);
        var observer = scene.onBeforeRenderObservable.add(update);
        var view = {
            nodes, blocks,
            dispose() {
                release();
                scene.onBeforeRenderObservable.remove(observer);
                if (lighting) lighting.dispose();
                nodes.forEach(node => node.dispose());
                base.dispose(); stripe.dispose();
            },
        };
        var release = SignRender.connect(scene, view, 'platforms');
        return view;
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

export const TeleporterRender = { //a ring on the pad, a faint beam above it and a ring that keeps climbing the beam; a pad that only receives is just a dim ring
    //it all lies on the pad's own face (a cube zone gets a square frame), and only transforms are animated: changing a material's alpha every frame makes it re-check itself, which cost more than all the rest of the portal put together.
    //a pad with power is built twice, lit and unlit, and options.active says which is showing (switching is just which one is enabled)
    create(scene, list = [], offset = {}, options = {}) {
        var nodes = [], roots = [], materials = new Map(), rises = [], powered = [], shift = new BABYLON.Vector3(offset.x || 0, offset.y || 0, offset.z || 0), corner = Math.SQRT2; //a four sided ring turned an eighth round is a square with half sides of one
        var glow = (colour, alpha) => { //one material for each colour and see-through-ness, shared by every pad that has them
            var key = colour.toHexString() + alpha;
            if (!materials.has(key)) {
                var material = new BABYLON.StandardMaterial('teleporter-glow', scene);
                material.disableLighting = true; material.emissiveColor = colour; material.alpha = alpha; material.backFaceCulling = false;
                materials.set(key, material);
            };
            return materials.get(key);
        };
        var build = (def, k, colour, dim) => {
            var c = k.c, z = c.zone, b = k.basis, box = z.shape === 'box';
            var across = box ? [z.size.x, z.size.z] : [z.radius, z.radius], half = box ? z.size.y : z.shape === 'cylinder' ? z.height : z.radius;
            var middle = PlatformTeleporters.centre(def), away = new BABYLON.Vector3(k.zone.x - middle.x, k.zone.y - middle.y, k.zone.z - middle.z);
            var out = BABYLON.Vector3.Dot(away, b.v), sideways = away.subtract(b.v.scale(out)); //how far out of the face the zone's middle is, and how far along it
            var onFace = Math.max(Math.abs(sideways.x), Math.abs(sideways.y), Math.abs(sideways.z)) < .5; //a ring that low would be hidden inside its own block
            var low = onFace ? Math.max(out - half, .52) : out - half, length = Math.min(out + half, low + 1.4) - low;
            var root = new BABYLON.AbstractMesh('teleporter-pad', scene), frame = new BABYLON.AbstractMesh('teleporter-frame', scene);
            root.position = new BABYLON.Vector3(middle.x, middle.y, middle.z).add(sideways).add(b.v.scale(low)).subtract(shift);
            root.rotationQuaternion = BABYLON.Quaternion.RotationQuaternionFromAxis(b.u, b.v, b.w);
            frame.parent = root; frame.scaling.set(across[0], 1, across[1]); //the ring's own size, so a cube zone can be longer one way
            roots.push(root); nodes.push(root, frame);
            var sides = box ? 4 : 48, thin = (across[0] + across[1]) / 2; //the frame scales what is in it, so the tubes are made thinner to come out the same
            var ring = BABYLON.MeshBuilder.CreateTorus('teleporter-ring', { diameter: box ? 2 * corner : 2, thickness: .05 / thin, tessellation: sides }, scene);
            ring.parent = frame; ring.material = glow(colour, dim ? .35 : c.send ? 1 : .45); ring.isPickable = false; nodes.push(ring);
            if (box) ring.rotation.y = Math.PI / 4;
            if (dim || !c.send) return root;
            var beam = BABYLON.MeshBuilder.CreateCylinder('teleporter-beam', { diameter: box ? 2 * corner * .95 : 1.9, height: length, tessellation: box ? 4 : 32, cap: BABYLON.Mesh.NO_CAP }, scene);
            beam.parent = frame; beam.position.y = length / 2; beam.material = glow(colour, .16); beam.isPickable = false; nodes.push(beam);
            if (box) beam.rotation.y = Math.PI / 4;
            var rise = BABYLON.MeshBuilder.CreateTorus('teleporter-rise', { diameter: box ? 2 * corner * .9 : 1.8, thickness: .03 / thin, tessellation: box ? 4 : 32 }, scene);
            rise.parent = frame; rise.material = glow(colour, .6); rise.isPickable = false; nodes.push(rise);
            if (box) rise.rotation.y = Math.PI / 4;
            rises.push({ mesh: rise, root, length, phase: Math.random() });
            return root;
        };
        for (var def of list) {
            var k = PlatformTeleporters.info(def), c = k.c, palette = PlatformTeleporters.palette;
            if (!c.look.pad && !options.always) continue;
            var lit = build(def, k, BABYLON.Color3.FromHexString(palette[c.look.color][1]), false);
            if (!c.power) continue;
            var look = c.look.off, unlit = look === 'hide' ? null : build(def, k, BABYLON.Color3.FromHexString(palette[c.look.offColor ?? c.look.color][1]), look !== 'keep');
            var active = options.active ? options.active(def) : true;
            lit.setEnabled(active); unlit?.setEnabled(!active);
            powered.push({ def, lit, unlit, active });
        };
        var observer = (rises.length || powered.length) && scene.onBeforeRenderObservable.add(() => {
            for (var pad of powered) { //which of the two is showing follows whether it has power
                var active = options.active ? options.active(pad.def) : true;
                if (active !== pad.active) { pad.active = active; pad.lit.setEnabled(active); pad.unlit?.setEnabled(!active); };
            };
            var t = performance.now() / 1000;
            for (var item of rises) { //up the beam, and smaller as it goes
                if (!item.root.isEnabled()) continue;
                var along = (t * .7 + item.phase) % 1;
                item.mesh.position.y = item.length * along; item.mesh.scaling.set(1 - .4 * along, 1, 1 - .4 * along);
            };
        });
        return { nodes, dispose() {
            if (observer) scene.onBeforeRenderObservable.remove(observer);
            roots.forEach(root => root.dispose()); materials.forEach(material => material.dispose());
        } };
    },
};

export const SpinDiskRender = {
    create(scene, disks) { return PlatformRender.create(scene, new PlatformWorld(disks.map((disk, index) => PlatformMap.fromDisk(disk, index)))); },
};
