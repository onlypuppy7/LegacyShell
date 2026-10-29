//plugin: dynamicmapblocks, standalone browser benchmark
(() => {
    var $ = id => document.getElementById(id), engine = new BABYLON.Engine($('view'), false,
        { preserveDrawingBuffer: true, disableWebGL2Support: new URLSearchParams(location.search).has('webgl1') });
    engine.setHardwareScalingLevel(1);
    engine.enableOfflineSupport = false;
    var scene = new BABYLON.Scene(engine), camera = new BABYLON.ArcRotateCamera('view', -.9, .95, 30, new BABYLON.Vector3(10, 2, 10), scene);
    scene.clearColor = new BABYLON.Color4(.6, .68, .75, 1); scene.fogColor = new BABYLON.Color3(.6, .68, .75); scene.fogDensity = .002;
    scene.sunLight = { diffuse: BABYLON.Color3.White() }; camera.attachControl($('view'), true);
    BABYLON.Effect.ShadersStore.standardVertexShader = dmbProfileShaders.vertex;
    BABYLON.Effect.ShadersStore.standardPixelShader = dmbProfileShaders.pixel;
    var source = new BABYLON.ShaderMaterial('standard', scene, 'standard', { attributes: ['position', 'normal', 'color', 'uv'],
        uniforms: ['world', 'view', 'viewProjection', 'vFogInfos', 'vFogColor', 'colorMult', 'sunColor'], defines: ['#define COLORMULT'] });
    var shaderError;
    source.onError = (effect, error) => { shaderError = error; $('status').textContent = error; $('details').textContent = effect._vertexSourceCode; };
    source.onBind = mesh => {
        var effect = mesh.material.getEffect();
        effect.setFloat4('vFogInfos', 2, 0, 100, .002); effect.setColor3('vFogColor', scene.fogColor);
        effect.setColor3('colorMult', BABYLON.Color3.White()); effect.setColor3('sunColor', BABYLON.Color3.White());
    };
    var floor = BABYLON.MeshBuilder.CreateGround('floor', { width: 30, height: 30 }, scene);
    floor.position.set(10, 0, 10); floor.material = new BABYLON.StandardMaterial('floor', scene); floor.material.diffuseColor.set(.55, .43, .28);
    new BABYLON.HemisphericLight('light', new BABYLON.Vector3(.2, 1, .1), scene);
    var roof = BABYLON.MeshBuilder.CreateBox('roof', { width: 11, depth: 23, height: .2 }, scene);
    roof.position.set(15, 5, 10); roof.material = new BABYLON.StandardMaterial('roof', scene); roof.material.alpha = .18; roof.material.diffuseColor.set(.25, .3, .35);
    var width = 25, height = 9, depth = 25;
    var grid = Array.from({ length: width }, (_, x) => Array.from({ length: height }, (_, y) =>
        Array.from({ length: depth }, () => x >= 10 && x <= 20 && y < 5 ? .2 : 1.5)));
    var render, mode = 'original', time = 0, running = false, paused = false, results = [], templates;
    function build() {
        if (render) render.dispose(); shaderError = null;
        var count = Number($('count').value);
        var definitions = Array.from({ length: count }, (_, i) => {
            var x = 2 + i % 8 * 2, z = 2 + Math.floor(i / 8) * 5;
            return { id: 'profile-' + i, position: { x: x + .5, y: 1.5, z: z + .5 }, shapes: [],
                blocks: [{ mesh: templates[i % templates.length].name, x, y: 1, z }],
                motion: { type: 'path', points: [{ x: -1 }, { x: 3 }], duration: 8, loop: 'pingpong', orient: true, turnDuration: .5 } };
        });
        render = PlatformRender.create(scene, new PlatformWorld(definitions, templates), templates, () => time, {}, { lighting: mode !== 'original' });
        PlatformLighting.setEnabled(mode === 'environment');
        var start = performance.now(); PlatformLighting.capture(scene, grid, width, height, depth);
        return performance.now() - start;
    };
    function percentile(list, fraction) { return list.slice().sort((a, b) => a - b)[Math.floor((list.length - 1) * fraction)]; };
    function mean(list) { return list.reduce((a, b) => a + b, 0) / list.length; };
    function frame() { return new Promise(resolve => requestAnimationFrame(resolve)); };
    async function checkLighting() {
        var test = new BABYLON.Scene(engine), camera = new BABYLON.FreeCamera('check', new BABYLON.Vector3(1, 6, 1), test);
        camera.upVector.set(0, 0, 1); camera.setTarget(new BABYLON.Vector3(1, 1, 1)); camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
        camera.orthoLeft = camera.orthoBottom = -2; camera.orthoRight = camera.orthoTop = 2;
        var material = new BABYLON.ShaderMaterial('check', test, 'standard', { ...source._options,
            attributes: source._options.attributes.slice(), uniforms: source._options.uniforms.slice(), defines: source._options.defines.slice() });
        material.onBind = mesh => source.onBindObservable.notifyObservers(mesh); material.onError = source.onError;
        var root = new BABYLON.AbstractMesh('check-root', test), mesh = BABYLON.MeshBuilder.CreateBox('check-block', {}, test);
        mesh.parent = root; mesh.position.set(1, 1, 1); mesh.material = material;
        mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind, Array.from({ length: mesh.getTotalVertices() * 4 }, (_, i) => [ .3, .4, .5, 1 ][i % 4]));
        async function read() {
            for (var i = 0; i < 4; i++) { await frame(); test.render(); };
            if (shaderError) throw new Error(shaderError);
            engine._gl.finish();
            var pixel = new Uint8Array(4);
            engine._gl.readPixels(Math.floor(engine.getRenderWidth() / 2), Math.floor(engine.getRenderHeight() / 2), 1, 1, engine._gl.RGBA, engine._gl.UNSIGNED_BYTE, pixel);
            return Array.from(pixel).slice(0, 3);
        };
        var handle;
        try {
            var original = await read(); PlatformLighting.setEnabled(false); handle = PlatformLighting.create(test, [root]);
            var surface = await read();
            var dark = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => Array(5).fill(.2)));
            PlatformLighting.capture(test, dark, 5, 5, 5); PlatformLighting.setEnabled(true);
            var covered = await read(); PlatformLighting.setEnabled(false); var restored = await read();
            mesh.position.x += .8; camera.position.x += .8; camera.setTarget(new BABYLON.Vector3(1.8, 1, 1));
            var moved = await read();
            if (!original.every((value, i) => value > surface[i]) || !covered.every((value, i) => Math.abs(value / surface[i] - .5) < .06) ||
                !restored.every((value, i) => Math.abs(value - surface[i]) <= 1) || !moved.every((value, i) => Math.abs(value - surface[i]) <= 1))
                throw new Error('Lighting pixel check failed: ' + JSON.stringify({ original, surface, covered, restored, moved }));
            return { original, surface, covered, restored, moved, passed: true };
        } finally { if (handle) handle.dispose(); test.dispose(); };
    };
    async function measure(name) {
        mode = name; $('mode').value = name;
        var setupMs = build(), renderTimes = [], frames = [], previous = await frame();
        for (var i = 0; i < 210; i++) {
            var now = await frame(); time = i / 60;
            var start = performance.now(); scene.render(); engine._gl.finish();
            if (shaderError) throw new Error(shaderError);
            if (i >= 30) { renderTimes.push(performance.now() - start); frames.push(now - previous); };
            previous = now;
        };
        var state = PlatformLighting.states.get(scene), field = state?.field;
        return { mode: name, count: Number($('count').value), samples: renderTimes.length, setupMs,
            meanRenderMs: mean(renderTimes), p95RenderMs: percentile(renderTimes, .95), p95FrameMs: percentile(frames, .95),
            textureBytes: state?.texture ? field.data.byteLength : 0, cachedFieldBytes: field?.data.byteLength || 0 };
    };
    $('mode').onchange = () => { mode = $('mode').value; build(); scene.render(); };
    $('count').onchange = () => { build(); scene.render(); };
    $('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? 'Resume preview' : 'Pause preview'; };
    $('run').onclick = async () => {
        running = true; $('run').disabled = $('mode').disabled = $('count').disabled = $('pause').disabled = true; results = []; $('results').replaceChildren();
        try {
            $('status').textContent = 'Checking lighting pixels...';
            var lightingChecks = await checkLighting();
            for (var name of ['original', 'surface', 'environment', 'surface']) {
                $('status').textContent = 'Measuring ' + name + '...';
                var result = await measure(name); results.push(result);
                var row = document.createElement('tr');
                for (var value of [name, result.count, result.meanRenderMs.toFixed(3) + ' ms', result.p95RenderMs.toFixed(3) + ' ms', result.p95FrameMs.toFixed(2) + ' ms']) {
                    var cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell);
                };
                $('results').appendChild(row);
            };
            $('status').textContent = 'Comparison complete.'; $('save').disabled = false;
            var caps = engine.getCaps();
            var debug = engine._gl.getExtension('WEBGL_debug_renderer_info');
            $('details').textContent = JSON.stringify({ version: '2.6.0', userAgent: navigator.userAgent,
                viewport: [engine.getRenderWidth(), engine.getRenderHeight()], webGL: engine.webGLVersion,
                gpu: engine._gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : engine._gl.RENDERER),
                vertexTextureUnits: caps.maxVertexTextureImageUnits, lightingChecks, results }, null, 2);
        } catch (error) { $('status').textContent = error.message; console.error(error); }
        finally {
            running = false; paused = true; $('pause').textContent = 'Resume preview';
            $('run').disabled = $('mode').disabled = $('count').disabled = $('pause').disabled = false;
            mode = 'environment'; $('mode').value = mode; build(); scene.render();
        };
    };
    $('save').onclick = () => {
        var link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([$('details').textContent], { type: 'application/json' }));
        link.download = 'moving-block-lighting-profile.json'; link.click(); URL.revokeObjectURL(link.href);
    };
    BABYLON.SceneLoader.ImportMesh(['shipyard.crate-wood.full', 'castle.bench.aabb', 'dynamic.spinner.mesh'], '/models/', 'map.babylon', scene, loaded => {
        templates = loaded.filter(mesh => !mesh.parent);
        for (var mesh of loaded) { mesh.material = source; mesh.setEnabled(false); mesh.isPickable = false; };
        for (var mesh of templates) { mesh.colliderType = mesh.name.split('.')[2]; mesh.colliderMesh = mesh.getChildMeshes()[0]; };
        build(); $('run').disabled = false; $('status').textContent = 'Ready. Lighting is ' + (engine.getCaps().maxVertexTextureImageUnits ? 'sampled per vertex on the GPU.' : 'sampled per block on the CPU.');
        engine.runRenderLoop(() => { if (!running && !paused) { time = performance.now() / 1000; scene.render(); } });
        if (new URLSearchParams(location.search).has('verify')) {
            running = true; $('run').disabled = true;
            checkLighting().then(checks => {
                $('status').textContent = 'Lighting pixel checks passed (WebGL ' + engine.webGLVersion + ').';
                $('details').textContent = JSON.stringify(checks, null, 2);
            }).catch(error => { $('status').textContent = error.message; console.error(error); }).finally(() => {
                running = false; paused = true; $('pause').textContent = 'Resume preview'; $('run').disabled = false; scene.render();
            });
        };
    }, null, (_, message) => { $('status').textContent = message; });
    window.addEventListener('resize', () => engine.resize());
})();
