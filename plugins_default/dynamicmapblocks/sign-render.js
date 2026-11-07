//plugin: dynamicmapblocks, client and editor
import BABYLON from 'babylonjs';
import { MapSigns } from './signs.js';
import { PlatformMap } from './platforms.js';

export const SignRender = {
    scenes: new WeakMap(),
    connect(scene, view, kind) {
        var state = this.scenes.get(scene);
        if (!state) { state = { signs: new Set(), platforms: new Set() }; this.scenes.set(scene, state); };
        var update = () => state.signs.forEach(signs => signs.follow(Array.from(state.platforms).reverse()));
        state[kind].add(view); update();
        var connected = true;
        return () => { if (!connected) return; connected = false; state[kind].delete(view); update(); if (!state.signs.size && !state.platforms.size) this.scenes.delete(scene); };
    },
    ray(camera) { var matrix = camera.getWorldMatrix(); return camera.getForwardRay(12, matrix, matrix.getTranslation()); },
    text(scene, source, parent, def, cache) {
        var meshes = [], inverse = source.computeWorldMatrix(true).clone().invert();
        for (var helper of source.getChildMeshes().filter(mesh => MapSigns.helper(mesh))) {
            if (!helper.getTotalVertices()) continue;
            var box = helper.getBoundingInfo().boundingBox, size = box.maximum.subtract(box.minimum);
            var aspect = Math.max(.1, Math.min(10, size.x / (size.y || 1)));
            var width = aspect < 1 ? Math.max(64, Math.round(512 * aspect)) : 512, height = aspect < 1 ? 512 : Math.max(64, Math.round(512 / aspect));
            var key = JSON.stringify([def.text, def.color, def.align, width, height]), shared = cache.get(key);
            if (!shared) {
                var texture = new BABYLON.DynamicTexture('sign-letters', { width, height }, scene, false);
                var ctx = texture.getContext(), lines, font;
                for (font = Math.min(100, height * .35); font >= 6; font -= 2) {
                    ctx.font = 'bold ' + font + 'px Arial'; lines = MapSigns.wrap(ctx, def.text, width * .94);
                    if (lines.length * font * 1.15 <= height * .94) break;
                };
                ctx.clearRect(0, 0, width, height); ctx.fillStyle = def.color; ctx.textBaseline = 'middle'; ctx.textAlign = def.align;
                var x = def.align === 'left' ? width * .03 : def.align === 'right' ? width * .97 : width / 2;
                lines.forEach((line, i) => ctx.fillText(line, x, height / 2 + (i - (lines.length - 1) / 2) * font * 1.15));
                texture.hasAlpha = true; texture.update();
                var material = new BABYLON.StandardMaterial('sign-ink', scene);
                material.diffuseTexture = texture; material.useAlphaFromDiffuseTexture = true;
                material.emissiveColor = BABYLON.Color3.White(); material.disableLighting = true; material.specularColor = BABYLON.Color3.Black();
                shared = { material, texture }; cache.set(key, shared);
            };
            var plane = helper.clone('sign-text', parent, true);
            plane.unfreezeWorldMatrix(); plane.rotationQuaternion = new BABYLON.Quaternion();
            helper.computeWorldMatrix(true).multiply(inverse).decompose(plane.scaling, plane.rotationQuaternion, plane.position);
            plane.isVisible = true; plane.setEnabled(true); plane.isPickable = false; plane.material = shared.material; plane.useVertexColors = false;
            meshes.push(plane);
        };
        return meshes;
    },
    create(scene, definitions, sources, options = {}) {
        var cache = new Map(), entries = [], moving = [], lastPoll = -Infinity, bubble, shown;
        for (var def of definitions) {
            var source = PlatformMap.source(sources, def.block.mesh);
            if (!source) continue;
            var root = new BABYLON.Mesh('sign-' + MapSigns.key(def.block), scene);
            root.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll((def.block.ry || 0) * Math.PI / 2, (def.block.rx || 0) * Math.PI / 2, (def.block.rz || 0) * Math.PI / 2);
            root.position.set(def.block.x + (options.editor ? 0 : .5), def.block.y + (options.editor ? 0 : .5), def.block.z + (options.editor ? 0 : .5));
            var entry = { def, root, source, position: root.position.clone(), rotation: root.rotationQuaternion.clone() };
            if (MapSigns.kind(def.block.mesh) === 'SIGNBUBBLE') {
                entry.target = source.clone('sign-target', root, true); entry.target.unfreezeWorldMatrix(); entry.target.position.set(0, 0, 0);
                entry.target.isVisible = false; entry.target.isPickable = false; entry.target.setEnabled(true);
            } else this.text(scene, source, root, def, cache);
            var body = options.world?.bodies.find(body => !body.definition.static && body.definition.blocks.some(block => MapSigns.key(block) === MapSigns.key(def.block)));
            if (body) {
                entry.body = body; entry.local = root.computeWorldMatrix(true).multiply(BABYLON.Matrix.Translation(-body.definition.position.x, -body.definition.position.y, -body.definition.position.z));
                moving.push(entry);
            } else root.freezeWorldMatrix();
            entries.push(entry);
        };
        var targets = entries.filter(entry => entry.target);
        if (targets.length && !options.editor) {
            if (!document.getElementById('dmb-sign-style')) {
                var link = document.createElement('link'); link.id = 'dmb-sign-style'; link.rel = 'stylesheet'; link.href = '/dynamicmapblocks/signs.css'; document.head.appendChild(link);
            };
            bubble = document.createElement('div'); bubble.id = 'dmb-sign-bubble'; bubble.hidden = true; document.body.appendChild(bubble);
        };
        var update = () => {
            for (var entry of moving) if (!entry.root.parent) entry.local.multiply(options.world.pose(entry.body, options.time(), true).matrix).decompose(entry.root.scaling, entry.root.rotationQuaternion, entry.root.position);
            if (!bubble || performance.now() - lastPoll < 100) return;
            lastPoll = performance.now();
            var camera = options.camera?.() || scene.activeCamera;
            var chosen = options.active?.() !== false && camera ? this.target(this.ray(camera), targets, options.occluded) : null;
            if (chosen !== shown) { shown = chosen; bubble.textContent = chosen?.def.text || ''; bubble.hidden = !chosen || !chosen.def.text; };
        };
        var observer = moving.length || bubble ? scene.onBeforeRenderObservable.add(update) : null;
        var disposed = false, dispose = () => {
            if (disposed) return; disposed = true;
            release();
            if (observer) scene.onBeforeRenderObservable.remove(observer);
            if (onDispose) scene.onDisposeObservable.remove(onDispose);
            entries.forEach(entry => entry.root.dispose()); cache.forEach(item => { item.material.dispose(); item.texture.dispose(); }); bubble?.remove();
        };
        var onDispose = scene.onDisposeObservable.add(() => { onDispose = null; dispose(); });
        var view = { entries, cache, update, dispose, follow(platforms) {
            for (var entry of entries) {
                var parent = platforms.map(view => view.blocks.get(MapSigns.key(entry.def.block))).find(Boolean);
                if ((entry.root.parent || null) === (parent || null)) continue;
                entry.root.unfreezeWorldMatrix(); entry.root.parent = parent || null;
                entry.root.scaling.set(1, 1, 1);
                entry.root.position.copyFrom(parent ? BABYLON.Vector3.Zero() : entry.position);
                entry.root.rotationQuaternion.copyFrom(parent ? BABYLON.Quaternion.Identity() : entry.rotation);
                if (!parent && !entry.body) entry.root.freezeWorldMatrix();
            };
        } };
        var release = this.connect(scene, view, 'signs');
        return view;
    },
    target(ray, entries, occluded) {
        var chosen = null, distance = Infinity;
        for (var entry of entries) {
            if (BABYLON.Vector3.DistanceSquared(ray.origin, entry.root.getAbsolutePosition()) > (entry.def.range + 1) ** 2) continue;
            var hit = ray.intersectsMesh(entry.target, false);
            if (hit.hit && hit.distance <= entry.def.range && hit.distance < distance) { chosen = entry; distance = hit.distance; };
        };
        return chosen && !occluded?.(ray, Math.max(0, distance - .03)) ? chosen : null;
    },
};
