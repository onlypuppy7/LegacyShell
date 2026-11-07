//plugin: legacylightmaps, browser only
export const LegacyLightmaps = {
    scenes: new WeakMap(),

    async load({ minMap }) {
        var state = { data: LightmapData.cells(minMap), input: null, samples: null };
        this.scenes.set(gameScene, state);
        try {
            if (playOffline) state.input = localStorage.getItem('lightmap');
            else {
                var abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 5000);
                try {
                    var response = await fetch('maps/' + encodeURIComponent(minMap.name) + '.lightmap', { signal: abort.signal, cache: 'no-cache' });
                    if (response.ok) state.input = await response.arrayBuffer();
                } finally { clearTimeout(timeout); };
            };
        } catch (error) { console.warn('legacylightmaps: using normal lighting:', error.message); };
    },

    prepare({ gameScene, minMap }) {
        var state = this.scenes.get(gameScene);
        if (!state?.input) return;
        var reference = LightmapData.reference(BABYLON, gameScene, state.data, mapMeshes);
        var rgb = reference && LightmapData.decode(state.input, reference.positions.length / 3);
        state.samples = LightmapData.samples(reference, rgb);
        state.input = null; state.data = null;
        if (!state.samples) { console.warn('legacylightmaps: lightmap does not fit this map; using normal lighting'); return; };
        //the saved surface is the editor's original geometry. keep it for this map, without changing the player's preference
        if (typeof FranciumMap !== 'undefined') {
            var detail = FranciumMap.scenes.get(gameScene);
            if (detail) detail.enabled = false;
        };
        var sun = BABYLON.Color3.FromHexString(minMap.sun?.color || '#ffffff');
        for (var name of ['map', 'mapNoShadow']) gameScene.getMaterialByName(name)?.setColor3('legacyBakedSun', sun);
    },

    materials({ scene }) {
        for (var name of ['map', 'mapNoShadow']) {
            var mat = scene.getMaterialByName(name);
            if (!mat) continue;
            if (!mat._options.uniforms.includes('legacyBakedSun')) mat._options.uniforms.push('legacyBakedSun');
            mat.setColor3('legacyBakedSun', BABYLON.Color3.White());
        };
    },

    apply(mesh, map, fallback) {
        var matched = LightmapData.apply(mesh, this.scenes.get(mesh.getScene())?.samples, fallback);
        if (matched) console.log('legacylightmaps: lit ' + matched + ' map vertices');
        return matched;
    },
};

plugins.on('game:modifyMinMap', data => LegacyLightmaps.load(data));
plugins.on('game:loadMaterials', data => LegacyLightmaps.materials(data));
plugins.on('game:createMapCells', data => LegacyLightmaps.prepare(data));
