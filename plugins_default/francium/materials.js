export const FranciumMaterials = {
    scenes: new WeakMap(),
    patched: false,

    patch() {
        if (this.patched) return;
        this.patched = true;
        const plugin = this;
        const descriptor = Object.getOwnPropertyDescriptor(BABYLON.AbstractMesh.prototype, 'material');
        Object.defineProperty(BABYLON.AbstractMesh.prototype, 'material', {
            ...descriptor,
            set(value) {
                const state = plugin.scenes.get(this.getScene());
                if (state && state.entries.has(this)) state.pending.add(this);
                try { return descriptor.set.call(this, value); }
                finally {
                    if (state && state.entries.has(this)) {
                        plugin.refresh(state, this);
                        state.pending.delete(this);
                    };
                };
            }
        });
        const mark = BABYLON.Material.prototype._markAllSubMeshesAsDirty;
        BABYLON.Material.prototype._markAllSubMeshesAsDirty = function (func) {
            const state = plugin.scenes.get(this.getScene());
            if (!state) return mark.apply(this, arguments);
            state.pending.forEach(mesh => plugin.refresh(state, mesh));
            const material = this;
            const visit = mesh => {
                if (!mesh.subMeshes) return;
                for (const sub of mesh.subMeshes) {
                    if (sub.getMaterial() === material && sub._materialDefines) func(sub._materialDefines);
                };
            };
            const meshes = state.index.get(this);
            if (meshes) meshes.forEach(visit);
            if (this === this.getScene()._defaultMaterial) state.defaults.forEach(visit);
            //multi-material slots can change without a mesh material assignment
            state.fallback.forEach(visit);
        };
        const sync = BABYLON.InstancedMesh.prototype._syncSubMeshes;
        BABYLON.InstancedMesh.prototype._syncSubMeshes = function () {
            const result = sync.apply(this, arguments);
            const state = plugin.scenes.get(this.getScene());
            if (state && state.entries.has(this)) plugin.indexMesh(state, this);
            return result;
        };
    },

    refresh(state, mesh) {
        this.indexMesh(state, mesh);
        if (mesh.instances) mesh.instances.forEach(instance => this.indexMesh(state, instance));
    },

    indexMesh(state, mesh) {
        const entry = state.entries.get(mesh);
        if (!entry || (mesh instanceof BABYLON.InstancedMesh && !mesh._sourceMesh)) return;
        if (entry.material) {
            const old = state.index.get(entry.material);
            if (old) { old.delete(mesh); if (!old.size) state.index.delete(entry.material); };
        };
        state.fallback.delete(mesh);
        state.defaults.delete(mesh);
        entry.material = mesh.material;
        if (!entry.material) state.defaults.add(mesh);
        else if (entry.material.getSubMaterial) state.fallback.add(mesh);
        else {
            if (!state.index.has(entry.material)) state.index.set(entry.material, new Set());
            state.index.get(entry.material).add(mesh);
        };
    },

    attach(scene) {
        if (this.scenes.has(scene)) return;
        this.patch();
        const state = { entries: new Map(), index: new Map(), defaults: new Set(), fallback: new Set(), pending: new Set() };
        this.scenes.set(scene, state);
        const add = mesh => {
            if (state.entries.has(mesh)) return;
            state.entries.set(mesh, { material: null });
            this.indexMesh(state, mesh);
        };
        const remove = mesh => {
            const entry = state.entries.get(mesh);
            if (!entry) return;
            const meshes = state.index.get(entry.material);
            if (meshes) { meshes.delete(mesh); if (!meshes.size) state.index.delete(entry.material); };
            state.fallback.delete(mesh);
            state.defaults.delete(mesh);
            state.pending.delete(mesh);
            state.entries.delete(mesh);
        };
        scene.meshes.forEach(add);
        state.addObserver = scene.onNewMeshAddedObservable.add(add);
        state.removeObserver = scene.onMeshRemovedObservable.add(remove);
        state.disposeObserver = scene.onDisposeObservable.add(() => this.detach(scene));
    },

    detach(scene) {
        const state = this.scenes.get(scene);
        if (!state) return;
        scene.onNewMeshAddedObservable.remove(state.addObserver);
        scene.onMeshRemovedObservable.remove(state.removeObserver);
        scene.onDisposeObservable.remove(state.disposeObserver);
        state.entries.clear(); state.index.clear(); state.defaults.clear(); state.fallback.clear(); state.pending.clear();
        this.scenes.delete(scene);
    },
};
