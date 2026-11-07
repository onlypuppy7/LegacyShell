export const FranciumWarmup = {
    scenes: new WeakMap(),
    patched: false,

    patch() {
        if (this.patched) return;
        this.patched = true;
        const plugin = this;
        const start = startRendering;
        startRendering = function () {
            plugin.prepare(gameScene);
            return start.apply(this, arguments);
        };
        const add = addPlayer;
        addPlayer = function (data) {
            const result = add.apply(this, arguments);
            const player = players_by_id[data.id];
            if (player && player.actor) plugin.queue(gameScene, player.actor.mesh.getChildMeshes());
            return result;
        };
    },

    signature(mesh, material, instances) {
        const attributes = ['position', 'normal', 'uv', 'uv2', 'color', 'matricesIndices', 'matricesWeights', 'matricesIndicesExtra', 'matricesWeightsExtra'];
        return [attributes.map(kind => mesh.isVerticesDataPresent(kind) ? 1 : 0).join(''),
            mesh.useBones && mesh.computeBonesUsingShaders && mesh.skeleton ? mesh.skeleton.bones.length : 0,
            mesh.numBoneInfluencers, !!mesh.hasVertexAlpha, !!mesh._nonUniformScaling, instances,
            material.fogEnabled, material.alpha < 1, mesh.visibility < 1,
            material._options ? material._options.defines.join('\n') : '',
            mesh.getScene().fogMode, mesh.getScene().fogEnabled].join('|');
    },

    canPrepare() {
        return typeof me === 'undefined' || !me || !me.playing;
    },

    state(scene) {
        let state = this.scenes.get(scene);
        if (!state) {
            state = { seen: new Map(), pending: [], queued: new Set(), full: false, timer: null };
            this.scenes.set(scene, state);
            scene.onDisposeObservable.add(() => {
                if (state.timer !== null) clearTimeout(state.timer);
                state.pending.length = 0; state.seen.clear(); state.queued.clear();
                this.scenes.delete(scene);
            });
        };
        return state;
    },

    queue(scene, meshes) {
        if (!scene || scene.isDisposed) return;
        const state = this.state(scene);
        if (meshes) meshes.forEach(mesh => state.queued.add(mesh));
        else state.full = true;
        this.retry(scene, state);
    },

    prepare(scene, meshes, immediate = true) {
        if (!scene || scene.isDisposed) return;
        if (!this.canPrepare()) return this.queue(scene, meshes);
        const state = this.state(scene);
        const jobs = [];
        const add = (mesh, sub, material, instances, outline) => {
            if (!material) return;
            const key = this.signature(mesh, material, instances) + '|' + !!outline;
            if (!state.seen.has(material)) state.seen.set(material, new Set());
            const seen = state.seen.get(material);
            if (seen.has(key) || jobs.length >= 64) return;
            seen.add(key);
            jobs.push({ mesh, sub, material, instances, outline, tries: 0 });
        };
        const candidates = meshes || scene.meshes.slice().sort((a, b) => Number(b.isEnabled()) - Number(a.isEnabled()));
        for (const candidate of candidates) {
            if (candidate.isDisposed()) continue;
            const mesh = candidate._sourceMesh || candidate;
            if (!mesh.subMeshes || !mesh.getTotalVertices()) continue;
            mesh.computeWorldMatrix();
            const modes = scene.getEngine().getCaps().instancedArrays ? [false, true] : [false];
            for (const sub of mesh.subMeshes) {
                const material = sub.getMaterial();
                for (const instances of modes) {
                    add(mesh, sub, material, instances, false);
                    if (mesh.renderOverlay || mesh.renderOutline || mesh.name === 'egg' || mesh.name === 'hands') {
                        add(mesh, sub, material, instances, true);
                    };
                    if (mesh.name === 'egg') add(mesh, sub, scene.getMaterialByName('eggShell'), instances, false);
                };
            };
        };
        for (const job of jobs) if (!immediate || !this.compile(job)) state.pending.push(job);
        this.retry(scene, state);
        scene.resetCachedMaterial();
    },

    compile(job) {
        if (job.mesh.isDisposed()) return true;
        job.tries++;
        const material = job.material;
        //warm every variant through the normal readiness path, without retaining its fast-path cache
        material._renderId = -1;
        let ready;
        try {
            if (job.outline) ready = job.mesh.getScene().getOutlineRenderer().isReady(job.sub, job.instances);
            else if (material.storeEffectOnSubMeshes) ready = material.isReadyForSubMesh(job.mesh, job.sub, job.instances);
            else ready = material.isReady(job.mesh, job.instances);
        } catch (error) {
            console.warn('Francium: shader preparation skipped', error);
            ready = true;
        } finally {
            material._renderId = -1;
            material._wasPreviouslyReady = false;
            if (job.sub._materialDefines) job.sub._materialDefines.markAllAsDirty();
        };
        return ready || job.tries >= 40;
    },

    retry(scene, state) {
        if ((!state.pending.length && !state.queued.size && !state.full) || state.timer !== null) return;
        state.timer = setTimeout(() => {
            state.timer = null;
            if (scene.isDisposed) return;
            //joins only queue work; shader queries and mesh preparation wait for the lobby
            if (this.canPrepare()) {
                if (state.full) {
                    state.full = false;
                    scene.meshes.slice().sort((a, b) => Number(b.isEnabled()) - Number(a.isEnabled()))
                        .forEach(mesh => state.queued.add(mesh));
                };
                if (state.queued.size) {
                    const mesh = state.queued.values().next().value;
                    state.queued.delete(mesh);
                    this.prepare(scene, [mesh], false);
                };
                const job = state.pending.shift();
                if (job) {
                    if (!this.compile(job)) state.pending.push(job);
                    scene.resetCachedMaterial();
                };
            };
            this.retry(scene, state);
        }, this.canPrepare() ? 16 : 250);
    },
};
