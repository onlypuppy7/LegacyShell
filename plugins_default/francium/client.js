export const FranciumPlugin = {
    scenes: new WeakMap(),
    patched: false,

    registerListeners(plugins) {
        plugins.on('game:onMapCompleteBeforeSetup', data => {
            FranciumBenchmark.attach(data.gameScene, data.minMap);
            if (!FranciumHud.improvements) return;
            this.attachScene(data.gameScene);
            FranciumMaterials.attach(data.gameScene);
            FranciumParticles.patch();
            FranciumHud.attach();
        });
        plugins.on('game:reachedEnd', () => {
            FranciumHud.patchFrames();
            if (FranciumHud.improvements) { FranciumWarmup.patch(); FranciumMap.patch(); };
            FranciumBenchmark.patch();
        });
        plugins.on('game:setupComplete', () => FranciumBenchmark.buttons());
        plugins.on('game:permissionsAfterSetup', () => { FranciumMap.settings(); FranciumBenchmark.settings(); });
        plugins.on('game:createMapCells', data => { if (FranciumHud.improvements) FranciumMap.begin(data.gameScene); });
        plugins.on('game:leaveGame', () => { FranciumHud.leave(); FranciumBenchmark.leave(); });
    },

    patchEnabledState() {
        if (this.patched) return true;
        const plugin = this;
        const sync = BABYLON.Node.prototype._syncParentEnabledState;
        if (typeof sync !== "function") return false;
        BABYLON.Node.prototype._syncParentEnabledState = function () {
            const result = sync.apply(this, arguments);
            const state = plugin.scenes.get(this.getScene());
            if (state && state.meshes.has(this)) plugin.updateMesh(state, this);
            return result;
        };
        this.patched = true;
        return true;
    },

    updateMesh(state, mesh) {
        const enabled = mesh.isEnabled();
        if (enabled === state.enabled.has(mesh)) return;
        if (enabled) state.enabled.add(mesh);
        else state.enabled.delete(mesh);
        state.dirty = true;
    },

    attachScene(scene) {
        if (this.scenes.has(scene)) return;
        const original = scene.getActiveMeshCandidates;
        const candidates = original.call(scene);
        //leave octrees and other plugins' candidate providers alone
        if (candidates.data !== scene.meshes || candidates.length !== scene.meshes.length) return;
        if (!this.patchEnabledState()) return;

        const state = {
            meshes: new Map(), enabled: new Set(), nextOrder: 0, dirty: true,
            candidates: { data: [], length: 0 }, cameras: new WeakMap(), selected: new Set(), original
        };
        this.scenes.set(scene, state);
        const add = mesh => {
            if (state.meshes.has(mesh)) return;
            state.meshes.set(mesh, state.nextOrder++);
            this.updateMesh(state, mesh);
        };
        const remove = mesh => {
            state.meshes.delete(mesh);
            if (state.enabled.delete(mesh)) state.dirty = true;
        };
        scene.meshes.forEach(add);
        state.addObserver = scene.onNewMeshAddedObservable.add(add);
        state.removeObserver = scene.onMeshRemovedObservable.add(remove);
        state.provider = function () {
            if (state.dirty) {
                //keep scene order, including source meshes before their instances
                state.candidates.data = Array.from(state.enabled).sort((a, b) => state.meshes.get(a) - state.meshes.get(b));
                state.candidates.length = state.candidates.data.length;
                state.dirty = false;
            };
            const camera = this.activeCamera;
            if (!camera) return state.candidates;
            let candidates = state.cameras.get(camera);
            if (!candidates) {
                candidates = { data: [], length: 0 };
                state.cameras.set(camera, candidates);
            };
            const selected = state.selected;
            selected.clear();
            for (const mesh of state.candidates.data) {
                if ((mesh.layerMask & camera.layerMask) || mesh.alwaysSelectAsActiveMesh || mesh.actionManager ||
                    mesh.onLODLevelSelection || mesh._sourceMesh?.onLODLevelSelection) {
                    selected.add(mesh);
                    if (mesh._sourceMesh) selected.add(mesh._sourceMesh);
                };
            };
            let count = 0;
            //keep sources before instances, even when their layers differ
            for (const mesh of state.candidates.data) if (selected.has(mesh)) candidates.data[count++] = mesh;
            candidates.data.length = candidates.length = count;
            selected.clear();
            return candidates;
        };
        scene.getActiveMeshCandidates = state.provider;
        state.disposeObserver = scene.onDisposeObservable.add(() => this.detachScene(scene));
    },

    detachScene(scene) {
        const state = this.scenes.get(scene);
        if (!state) return;
        if (scene.getActiveMeshCandidates === state.provider) scene.getActiveMeshCandidates = state.original;
        scene.onNewMeshAddedObservable.remove(state.addObserver);
        scene.onMeshRemovedObservable.remove(state.removeObserver);
        scene.onDisposeObservable.remove(state.disposeObserver);
        state.meshes.clear();
        state.enabled.clear();
        state.candidates.data = [];
        state.candidates.length = 0;
        state.cameras = new WeakMap(); state.selected.clear();
        this.scenes.delete(scene);
    },
};

if (typeof isClient !== "undefined" && isClient) FranciumPlugin.registerListeners(plugins);
