//plugin: dynamicmapblocks, client rendering only
import BABYLON from 'babylonjs';

export const PlatformLighting = {
    states: new WeakMap(),
    active: new Set(),
    enabled: false,
    registerSettings() {
        if (typeof LegacySettings === 'undefined') return;
        if (!this.option) {
            LegacySettings.addTab('Graphics', [1, 1]);
            this.option = LegacySettings.addOption('Graphics', { type: 'checkbox', key: 'movingBlockLighting', label: 'Moving Block Lighting', default: false,
                tooltip: 'Shade moving blocks under cover. Turn off for better performance. Applies immediately.',
                onChange: value => this.setEnabled(value) }, 1, 'Detail');
        };
        this.setEnabled(LegacySettings.get('movingBlockLighting', false));
        if (typeof playOffline !== 'undefined' && playOffline && !LegacySettings.finalised && !document.getElementById('dmb-environment-setting')) {
            var detail = document.getElementById('autoDetail');
            if (!detail) return;
            var row = document.createElement('div'), input = document.createElement('input'), label = document.createElement('label');
            input.type = 'checkbox'; input.className = 'ss_checkbox'; input.id = 'dmb-environment-setting'; input.checked = this.enabled;
            label.htmlFor = input.id; label.className = 'label'; label.textContent = 'Moving Block Lighting';
            row.title = 'Shade moving blocks under cover. Turn off for better performance.';
            input.onchange = () => { LegacySettings.set('movingBlockLighting', input.checked); this.setEnabled(input.checked); };
            row.append(input, label); detail.parentNode.after(row);
        };
    },
    setEnabled(value) {
        this.enabled = !!value;
        for (var state of this.active) this.refresh(state);
    },
    pack(grid, width, height, depth, limit = 4096) {
        var low = Math.ceil(depth / Math.floor(limit / height)), high = Math.min(depth, Math.floor(limit / width));
        if (low > high || low < 1) return null;
        var columns = Math.max(low, Math.min(high, Math.ceil(Math.sqrt(depth * height / width))));
        var textureWidth = columns * width, textureHeight = Math.ceil(depth / columns) * height;
        var data = new Uint8Array(textureWidth * textureHeight);
        for (var z = 0; z < depth; z++) for (var y = 0; y < height; y++) for (var x = 0; x < width; x++) {
            var index = (Math.floor(z / columns) * height + y) * textureWidth + z % columns * width + x;
            data[index] = Math.round(Math.max(0, Math.min(1.5, grid[x][y][z])) / 1.5 * 255);
        };
        return { data, width, height, depth, columns, textureWidth, textureHeight };
    },
    sample(field, position) {
        if (!field || ['x', 'y', 'z'].some((axis, i) => position[axis] < 0 || position[axis] > [field.width, field.height, field.depth][i] - 1)) return 1;
        var point = [position.x, position.y, position.z], size = [field.width, field.height, field.depth];
        var low = point.map(Math.floor), high = low.map((value, i) => Math.min(value + 1, size[i] - 1)), fraction = point.map((value, i) => value - low[i]);
        var value = 0;
        for (var i = 0; i < 8; i++) {
            var x = i & 1 ? high[0] : low[0], y = i & 2 ? high[1] : low[1], z = i & 4 ? high[2] : low[2];
            var index = (Math.floor(z / field.columns) * field.height + y) * field.textureWidth + z % field.columns * field.width + x;
            value += field.data[index] / 255 * 1.5 * (i & 1 ? fraction[0] : 1 - fraction[0]) *
                (i & 2 ? fraction[1] : 1 - fraction[1]) * (i & 4 ? fraction[2] : 1 - fraction[2]);
        };
        return Math.max(.5, Math.min(1, value));
    },
    capture(scene, grid, width, height, depth) {
        var state = this.states.get(scene);
        if (!state) return;
        if (state.texture) state.texture.dispose(); state.texture = null;
        state.field = this.pack(grid, width, height, depth, scene.getEngine().getCaps().maxTextureSize);
        this.refresh(state);
    },
    refresh(state) {
        var environmental = this.enabled && !!state.field;
        if (environmental && state.gpu && !state.texture) {
            var field = state.field;
            state.texture = BABYLON.RawTexture.CreateLuminanceTexture(field.data, field.textureWidth, field.textureHeight,
                state.scene, false, false, BABYLON.Texture.BILINEAR_SAMPLINGMODE);
            state.texture.wrapU = state.texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        };
        for (var binding of state.bindings) {
            for (var [mesh, entry] of binding.meshes) mesh.material = environmental ? entry.pair.environment : entry.pair.surface;
            if (environmental && state.gpu) for (var pair of binding.pairs.values()) {
                pair.environment.setTexture('dmbLightSampler', state.texture);
                pair.environment.setVector4('dmbGrid', new BABYLON.Vector4(state.field.width, state.field.height, state.field.depth, state.field.columns));
                pair.environment.setVector2('dmbAtlasSize', new BABYLON.Vector2(state.field.textureWidth, state.field.textureHeight));
            };
        };
        if (!environmental && state.texture) { state.texture.dispose(); state.texture = null; };
    },
    create(scene, nodes) {
        var meshes = nodes.flatMap(node => node.getChildMeshes()).filter(mesh => mesh.isEnabled() && mesh.isVisible &&
            mesh.material instanceof BABYLON.ShaderMaterial && mesh.material._shaderPath === 'standard');
        if (!meshes.length) return { update() {}, dispose() {} };
        var state = this.states.get(scene);
        if (!state) {
            state = { scene, gpu: scene.getEngine().getCaps().maxVertexTextureImageUnits > 0, bindings: new Set(), field: null, texture: null };
            this.states.set(scene, state); this.active.add(state);
            state.observer = scene.onDisposeObservable.add(() => { for (var binding of Array.from(state.bindings)) binding.dispose(); });
        };
        var binding = { meshes: new Map(), pairs: new Map() }, lastSample = -Infinity;
        for (var mesh of meshes) {
            var source = mesh.material, pair = binding.pairs.get(source);
            if (!pair) {
                var make = (source, environmental) => {
                    var options = Object.fromEntries(Object.entries(source._options).map(([key, value]) => [key, Array.isArray(value) ? value.slice() : value]));
                    options.defines = (options.defines || []).filter(define => !define.includes('DIRT')).concat('#define DMB_SURFACE');
                    options.uniforms = (options.uniforms || []).concat('dmbRestWorld');
                    if (environmental) {
                        options.defines.push(state.gpu ? '#define DMB_ENVIRONMENT' : '#define DMB_ENVIRONMENT_UNIFORM');
                        options.uniforms.push('dmbGrid', 'dmbAtlasSize', 'dmbShade');
                        options.samplers = (options.samplers || []).concat('dmbLightSampler');
                    };
                    var material = new BABYLON.ShaderMaterial('moving-block-' + (environmental ? 'environment' : 'surface'), scene, 'standard', options);
                    material.onError = source.onError;
                    material.backFaceCulling = source.backFaceCulling; material.alpha = source.alpha;
                    material.onBind = mesh => {
                        source.onBindObservable.notifyObservers(mesh);
                        var entry = binding.meshes.get(mesh), effect = material.getEffect();
                        if (!entry || !effect) return;
                        effect.setMatrix('dmbRestWorld', entry.rest);
                        if (environmental && !state.gpu) effect.setFloat('dmbShade', entry.shade);
                    };
                    return material;
                };
                pair = { surface: make(source, false), environment: make(source, true) }; binding.pairs.set(source, pair);
            };
            binding.meshes.set(mesh, { source, pair, rest: mesh.computeWorldMatrix(true).clone(), shade: 1 });
        };
        state.bindings.add(binding); this.refresh(state);
        if (typeof WeatherRender !== 'undefined') { WeatherRender.hookMaterials(scene); };
        var disposed = false;
        var handle = {
            update: time => {
                if (!this.enabled || !state.field || state.gpu || Math.abs(time - lastSample) < .1) return;
                lastSample = time;
                for (var [mesh, entry] of binding.meshes) {
                    mesh.computeWorldMatrix(true);
                    entry.shade = this.sample(state.field, mesh.getBoundingInfo().boundingBox.centerWorld);
                };
            },
            dispose: () => {
                if (disposed) return; disposed = true;
                state.bindings.delete(binding);
                var materials = Array.from(binding.pairs.values()).flatMap(pair => [pair.surface, pair.environment]);
                for (var [mesh, entry] of binding.meshes) if (!mesh.isDisposed()) mesh.material = entry.source;
                materials.forEach(material => material.dispose());
                if (typeof WeatherRender !== 'undefined') {
                    WeatherRender.allWetMats = WeatherRender.allWetMats.filter(material => !materials.includes(material));
                    WeatherRender.wetMats = WeatherRender.wetMats.filter(material => !materials.includes(material));
                };
                if (!state.bindings.size) {
                    if (state.texture) state.texture.dispose();
                    scene.onDisposeObservable.remove(state.observer);
                    this.active.delete(state); this.states.delete(scene);
                };
            },
        };
        binding.dispose = handle.dispose;
        return handle;
    },
};
