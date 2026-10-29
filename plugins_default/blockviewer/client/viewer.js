//plugin: blockviewer, editor only
(() => {
    if (typeof isMapEditor === 'undefined' || !isMapEditor) return;

    var viewer = {
        entries: [],
        imported: [],
        meshes: [],
        nodes: [],
        colliders: [],
        mode: 'blocks',
        collision: false,
        wireframe: false,
        collisionWireframe: false,
        turning: false,
        modelVisible: true,
        ticket: 0,
        thumbCache: new Map(),
        thumbQueue: new Set(),
    };
    var $ = id => document.getElementById('bv-' + id);
    var number = value => value.toLocaleString();
    var pretty = name => name.replace(/[_-]/g, ' ');
    var activeRoot = () => viewer.mode === 'imported' && viewer.importRoot ? viewer.importRoot : viewer.root;
    var collisionTypes = ['full', 'wedge', 'iwedge', 'aabb', 'obb', 'mesh', 'ladder', 'none'];
    var hasGeometry = node => typeof node.getTotalVertices === 'function' && node.getTotalVertices() > 0;
    var subtree = node => [node, ...node.getDescendants()];

    function importEntries(nodes) {
        var entries = [], known = node => collisionTypes.includes(node.name.split('.')[2]);
        function visit(node) {
            var descendants = node.getDescendants(), geometry = hasGeometry(node) || descendants.some(hasGeometry);
            if (!geometry) return;
            if (node.name === '__root__' || (!known(node) && descendants.some(known))) {
                node.getChildren().forEach(visit);
                return;
            };
            var type = known(node) ? node.name.split('.')[2] : null;
            var children = node.getChildMeshes();
            var collider = ['aabb', 'obb', 'mesh', 'ladder'].includes(type) ? children.find(child => /[. _-](collider|collision|trunk|branch)([. _-]|$)/i.test(child.name)) || (hasGeometry(node) ? children[0] : null) : null;
            var helpers = type && hasGeometry(node) ? descendants : collider ? subtree(collider) : [];
            entries.push({ mesh: node, name: node.name, theme: type ? node.name.split('.')[0] : 'Mesh', collisionType: type, collider, helpers });
        };
        var set = new Set(nodes);
        nodes.filter(node => !set.has(node.parent)).forEach(visit);
        return entries.sort((a, b) => a.name.localeCompare(b.name));
    };

    function collisionAvailable(entry) {
        return viewer.mode === 'blocks' || !!(entry && (entry.collisionType || entry.whole && viewer.imported.some(item => item.collisionType)));
    };

    function status(text, error) {
        $('status').textContent = text;
        $('status').setAttribute('role', error ? 'alert' : 'status');
        $('status').hidden = !text;
        $('footer').hidden = !text && $('clear').hidden;
    };

    function init() {
        var button = document.createElement('button');
        button.id = 'bv-open';
        button.className = 'button';
        button.textContent = 'Block viewer';
        button.title = 'Inspect blocks, collision and local models';
        document.getElementById('editorUi').appendChild(button);
        button.onclick = open;

        var dialog = document.createElement('dialog');
        dialog.id = 'bv-dialog';
        dialog.setAttribute('aria-labelledby', 'bv-heading');
        dialog.innerHTML = `
            <div class="bv-shell">
                <header>
                    <h1 id="bv-heading">Block viewer</h1><span class="bv-spacer"></span>
                    <button id="bv-import" class="bv-primary" title="Open a local .babylon or .glb file">Import model</button>
                    <button id="bv-close" class="bv-close" aria-label="Close block viewer" title="Close (Esc)">×</button>
                </header>
                <div class="bv-layout">
                    <aside class="bv-library" aria-label="Block library">
                        <div class="bv-filters">
                            <label for="bv-source" class="bv-label">Browse</label>
                            <select id="bv-source" aria-label="Model source"><option value="blocks">Editor blocks</option><option value="imported">Imported file</option></select>
                            <input id="bv-search" type="search" placeholder="Find a block..." aria-label="Find a block" autocomplete="off">
                            <select id="bv-theme" aria-label="Block theme"><option value="">All themes</option></select>
                            <div id="bv-count" class="bv-count" aria-live="polite"></div>
                        </div>
                        <div id="bv-list" class="bv-list" aria-label="Models"></div>
                    </aside>
                    <main class="bv-stage">
                        <div class="bv-stage-title"><strong id="bv-name">Pick a block</strong><small id="bv-path">Choose any block on the left.</small></div>
                        <div class="bv-viewport" id="bv-viewport">
                            <canvas id="bv-canvas" tabindex="0" aria-label="3D model preview. Drag to orbit, scroll to zoom, right drag to pan."></canvas>
                            <div class="bv-legend"><span class="bv-collision-key" id="bv-key" hidden>Collision</span></div>
                        </div>
                        <div class="bv-viewbar" aria-label="Preview controls">
                            <div class="bv-layer-controls" role="group" aria-label="Model display">
                                <button id="bv-model" aria-pressed="true" title="Show or hide the model">Model</button>
                                <label><input id="bv-wireframe" type="checkbox"> Wireframe</label>
                            </div>
                            <div class="bv-layer-controls" role="group" aria-label="Collision display">
                                <button id="bv-collision" aria-pressed="false" title="Show gameplay collision bounds">Collision</button>
                                <label><input id="bv-collision-wireframe" type="checkbox"> Wireframe</label>
                            </div>
                            <button id="bv-turn" aria-pressed="false">Auto turn</button>
                            <span class="bv-spacer"></span>
                            <button id="bv-fit" title="Frame the model">Fit</button>
                            <button id="bv-reset" title="Reset view and block rotation">Reset</button>
                            <button id="bv-rotate" title="Rotate block 90° on the Y axis">Y +90°</button>
                        </div>
                        <div class="bv-hint">Drag to orbit · Scroll to zoom · Right drag to pan</div>
                    </main>
                    <aside class="bv-stats" aria-label="Model statistics">
                        <section><h2>Block stats</h2><dl id="bv-stats"></dl></section>
                        <section><h2>Collision</h2><dl id="bv-cstats"></dl>
                            <details class="bv-definition"><summary>Type definition</summary><p id="bv-cnote" class="bv-note"></p></details>
                            <details id="bv-softness-help" class="bv-definition"><summary>Softness definition</summary><p id="bv-snote" class="bv-note"></p></details>
                        </section>
                    </aside>
                </div>
                <footer id="bv-footer" hidden><span id="bv-status" class="bv-status" role="status"></span>
                    <select id="bv-export-scope" aria-label="Export scope" hidden><option value="all">Whole file</option><option value="selected">Selected block</option></select>
                    <button id="bv-export" hidden>Export .babylon</button><button id="bv-clear" hidden>Clear import</button>
                </footer>
                <input id="bv-file" type="file" accept=".babylon,.glb" hidden>
            </div>`;
        document.body.appendChild(dialog);
        dialog.querySelectorAll('button').forEach(button => button.classList.add('button'));
        $('close').onclick = () => dialog.close();
        dialog.addEventListener('close', close);
        dialog.addEventListener('click', event => {
            if (event.target === dialog) {
                var rect = dialog.getBoundingClientRect();
                if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
            };
        });
        //keep editor shortcuts from eating the viewer's typing/camera controls
        for (var type of ['keydown', 'keyup', 'keypress']) window.addEventListener(type, event => {
            if (!dialog.open) return;
            event.stopImmediatePropagation();
            if (type === 'keydown' && event.key === 'Escape') {
                event.preventDefault();
                dialog.close();
            };
            if (type === 'keydown' && event.key === 'Tab') {
                var focusable = [...dialog.querySelectorAll('button, input, select, canvas')].filter(el => !el.disabled && el.getClientRects().length);
                var first = focusable[0], last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            };
        }, true);
        $('search').oninput = filter;
        $('theme').onchange = filter;
        $('source').onchange = () => {
            viewer.mode = $('source').value;
            $('search').value = '';
            $('theme').hidden = viewer.mode === 'imported';
            filter();
            var previous = viewer.mode === 'blocks' ? viewer.lastBlock : viewer.lastImport;
            select(viewer.filtered.includes(previous) ? previous : viewer.filtered[0]);
        };
        $('collision').onclick = () => {
            viewer.collision = !viewer.collision;
            $('collision').setAttribute('aria-pressed', viewer.collision);
            $('key').hidden = !viewer.collision;
            viewer.colliders.forEach(mesh => mesh.setEnabled(viewer.collision));
            fit();
        };
        $('model').onclick = () => {
            viewer.modelVisible = !viewer.modelVisible;
            $('model').setAttribute('aria-pressed', viewer.modelVisible);
            updateVisibility();
        };
        $('wireframe').onclick = () => {
            viewer.wireframe = $('wireframe').checked;
            viewer.meshes.forEach(mesh => { if (mesh.material) mesh.material.wireframe = viewer.wireframe || !!mesh.bvWireframe; });
        };
        $('collision-wireframe').onchange = () => {
            viewer.collisionWireframe = $('collision-wireframe').checked;
            [viewer.cmat, viewer.importCmat].filter(Boolean).forEach(material => { material.wireframe = viewer.collisionWireframe; });
        };
        $('turn').onclick = () => {
            viewer.turning = !viewer.turning;
            $('turn').setAttribute('aria-pressed', viewer.turning);
        };
        $('fit').onclick = fit;
        $('reset').onclick = () => { activeRoot().rotation.set(0, 0, 0); fit(true); rotationStats(); };
        $('rotate').onclick = () => { activeRoot().rotation.y += Math.PI / 2; rotationStats(); };
        $('import').onclick = () => $('file').click();
        $('file').onchange = () => { var file = $('file').files[0]; $('file').value = ''; if (file) importFile(file); };
        $('clear').onclick = clearImport;
        $('export').onclick = exportBabylon;
        dialog.addEventListener('dragover', event => { event.preventDefault(); });
        dialog.addEventListener('drop', event => { event.preventDefault(); if (event.dataTransfer.files[0]) importFile(event.dataTransfer.files[0]); });
        document.addEventListener('visibilitychange', () => {
            if (!viewer.engine) return;
            if (document.hidden) viewer.engine.stopRenderLoop();
            else if (dialog.open) viewer.engine.runRenderLoop(viewer.render);
        });
    };

    function setup() {
        if (viewer.engine) return;
        var B = BABYLON;
        viewer.engine = new B.Engine($('canvas'), true, { preserveDrawingBuffer: true, stencil: true });
        viewer.engine.setHardwareScalingLevel(Math.max(1, (window.devicePixelRatio || 1) / 1.5));
        viewer.scene = new B.Scene(viewer.engine);
        viewer.scene.attachControl();
        viewer.scene.clearColor = new B.Color4(.87, .9, .93, 1);
        viewer.scene.ambientColor = new B.Color3(.45, .45, .45);
        viewer.camera = new B.ArcRotateCamera('bv-camera', -Math.PI / 3, Math.PI / 2.8, 3, B.Vector3.Zero(), viewer.scene);
        viewer.camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
        viewer.camera.inputs.removeByType('ArcRotateCameraMouseWheelInput');
        viewer.camera.attachControl($('canvas'), false, false, 2);
        $('canvas').addEventListener('wheel', event => {
            event.preventDefault();
            event.stopPropagation();
            zoom(event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? $('canvas').clientHeight : 1));
        }, { passive: false });
        viewer.camera.lowerBetaLimit = .03;
        viewer.camera.upperBetaLimit = Math.PI - .03;
        viewer.camera.minZ = .001;
        viewer.camera.wheelPrecision = 80;
        viewer.camera.panningSensibility = 800;
        var light = new B.HemisphericLight('bv-light', new B.Vector3(.3, 1, -.4), viewer.scene);
        light.intensity = .95;
        viewer.root = new B.TransformNode('bv-preview', viewer.scene);
        viewer.cmat = new B.StandardMaterial('bv-collision', viewer.scene);
        viewer.cmat.diffuseColor = new B.Color3(1, .34, .04);
        viewer.cmat.emissiveColor = new B.Color3(1, .25, .02);
        viewer.cmat.alpha = .24;
        viewer.cmat.backFaceCulling = false;
        viewer.grid = makeGrid(viewer.scene);
        viewer.render = () => {
            if (viewer.turning) viewer.camera.alpha += Math.min(viewer.engine.getDeltaTime(), 50) * .0003;
            (viewer.mode === 'imported' && viewer.importScene ? viewer.importScene : viewer.scene).render();
        };
        viewer.resize = new ResizeObserver(() => { viewer.engine.resize(); if (viewer.selected) fit(false, viewer.mode === 'blocks'); });
        viewer.resize.observe($('viewport'));
    };

    function makeGrid(scene2) {
        var B = BABYLON, lines = [], major = [], grid = new B.TransformNode('bv-grid', scene2);
        for (var i = -5; i <= 5; i++) {
            var target = i === 0 ? major : lines;
            target.push([new B.Vector3(i + .5, -.505, -4.5), new B.Vector3(i + .5, -.505, 5.5)]);
            target.push([new B.Vector3(-4.5, -.505, i + .5), new B.Vector3(5.5, -.505, i + .5)]);
        };
        for (var [name, data, color] of [['minor', lines, new B.Color3(.65, .7, .75)], ['major', major, new B.Color3(.42, .5, .58)]]) {
            var mesh = B.MeshBuilder.CreateLineSystem('bv-grid-' + name, { lines: data }, scene2);
            mesh.color = color;
            mesh.parent = grid;
            mesh.isPickable = false;
            mesh.alwaysSelectAsActiveMesh = true;
        };
        return grid;
    };

    function open() {
        if (!scene || !mapMeshes || !mapMeshes.length || document.getElementById('loadScreen').style.display !== 'none') return;
        viewer.returnFocus = document.activeElement;
        $('dialog').showModal();
        try {
            setup();
            camera.detachControl(document.getElementById('gameCanvas'));
            viewer.entries = mapMeshes.filter(Boolean).map(mesh => ({ mesh, name: mesh.name, theme: mesh.name.split('.')[0] })).sort((a, b) => a.name.localeCompare(b.name));
            if (viewer.lastBlock) viewer.lastBlock = viewer.entries.find(entry => entry.mesh === viewer.lastBlock.mesh);
            if (viewer.mode === 'blocks' && viewer.selected) viewer.selected = viewer.entries.find(entry => entry.mesh === viewer.selected.mesh);
            var oldTheme = $('theme').value;
            $('theme').replaceChildren(new Option('All themes', ''));
            [...new Set(viewer.entries.map(entry => entry.theme))].sort().forEach(theme => $('theme').add(new Option(theme, theme)));
            $('theme').value = oldTheme;
            filter();
            if (!viewer.selected) {
                var selected = palette[paletteIdx] && mapMeshes[palette[paletteIdx].meshIdx];
                select(viewer.entries.find(entry => entry.mesh === selected) || viewer.entries.find(entry => entry.name === 'castle.brick.full') || viewer.entries[0]);
            };
            if (viewer.selected && viewer.selected.button) viewer.selected.button.scrollIntoView({ block: 'nearest' });
            viewer.engine.resize();
            viewer.engine.runRenderLoop(viewer.render);
            $('search').focus();
        } catch (error) {
            console.error('[BlockViewer]', error);
            status('Could not start the 3D preview. ' + error.message, true);
        };
    };

    function close() {
        if (viewer.engine) viewer.engine.stopRenderLoop();
        if (camera) camera.attachControl(document.getElementById('gameCanvas'), true);
        if (viewer.returnFocus && viewer.returnFocus.isConnected) viewer.returnFocus.focus();
    };

    function filter() {
        var query = $('search').value.toLowerCase().trim(), theme = $('theme').value;
        var entries = viewer.mode === 'blocks' ? viewer.entries : viewer.imported;
        viewer.filtered = entries.filter(entry => entry.name.toLowerCase().includes(query) && (viewer.mode !== 'blocks' || !theme || entry.theme === theme));
        $('count').textContent = number(viewer.filtered.length) + ' / ' + number(entries.length) + (viewer.mode === 'blocks' ? ' blocks' : ' models');
        var fragment = document.createDocumentFragment();
        watchThumbs();
        viewer.filtered.forEach(entry => {
            var button = document.createElement('button');
            button.className = 'bv-item';
            button.setAttribute('aria-pressed', entry === viewer.selected);
            var title = document.createElement('strong'), subtitle = document.createElement('small');
            title.textContent = entry.whole ? 'Whole model' : viewer.mode === 'blocks' ? pretty(entry.name.split('.')[1] || entry.name) : entry.name;
            subtitle.textContent = entry.whole ? viewer.filename : entry.theme + ' · ' + (entry.name.split('.')[2] || 'mesh');
            button.title = entry.name;
            var text = document.createElement('div');
            text.className = 'bv-text';
            text.append(title, subtitle);
            if (viewer.mode === 'blocks') {
                var thumb = document.createElement('div');
                thumb.className = 'bv-thumb';
                entry.thumbEl = thumb;
                button.bvEntry = entry;
                if (viewer.thumbCache.has(entry.mesh)) showThumb(entry, viewer.thumbCache.get(entry.mesh));
                else if (viewer.observer) viewer.observer.observe(button);
                button.append(thumb, text);
            } else button.append(text);
            button.onclick = () => select(entry);
            fragment.appendChild(button);
            entry.button = button;
        });
        if (!viewer.filtered.length) {
            var empty = document.createElement('div');
            empty.className = 'bv-empty';
            empty.textContent = viewer.mode === 'imported' && !viewer.imported.length ? 'Drop a .babylon or .glb file here, or click Import model.' : 'No blocks found. Try another search.';
            fragment.appendChild(empty);
        };
        $('list').replaceChildren(fragment);
    };

    function showThumb(entry, url) {
        if (entry.thumbEl && entry.thumbEl.style) entry.thumbEl.style.backgroundImage = 'url(' + url + ')';
    };

    function watchThumbs() {
        if (viewer.observer) viewer.observer.disconnect();
        viewer.thumbQueue.clear();
        if (!viewer.observer && typeof IntersectionObserver === 'function' && !viewer.thumbsBroken) {
            viewer.observer = new IntersectionObserver(changes => {
                changes.forEach(change => {
                    var entry = change.target.bvEntry;
                    if (!entry || viewer.thumbCache.has(entry.mesh)) return;
                    if (change.isIntersecting) viewer.thumbQueue.add(entry);
                    else viewer.thumbQueue.delete(entry);
                });
                pumpThumbs();
            }, { root: $('list'), rootMargin: '120px' });
        };
    };

    function thumbScene() {
        if (viewer.thumbs) return viewer.thumbs;
        var B = BABYLON, canvas = document.createElement('canvas');
        canvas.width = canvas.height = 96;
        var engine = new B.Engine(canvas, true, { preserveDrawingBuffer: true, alpha: true });
        engine.setSize(96, 96);
        var scene2 = new B.Scene(engine);
        scene2.clearColor = new B.Color4(0, 0, 0, 0);
        scene2.ambientColor = new B.Color3(.45, .45, .45);
        var camera2 = new B.ArcRotateCamera('bv-thumb-camera', -Math.PI / 3, Math.PI / 2.8, 3, B.Vector3.Zero(), scene2);
        camera2.minZ = .001;
        new B.HemisphericLight('bv-thumb-light', new B.Vector3(.3, 1, -.4), scene2).intensity = .95;
        return viewer.thumbs = { canvas, engine, scene: scene2, camera: camera2 };
    };

    function renderThumb(entry) {
        var B = BABYLON, kit = thumbScene(), mesh = copyMesh(entry.mesh, null, kit.scene);
        mesh.material.wireframe = !!mesh.bvWireframe;
        try {
            var box = bounds([mesh]), size = box.max.subtract(box.min);
            kit.camera.setTarget(box.min.add(box.max).scale(.5));
            kit.camera.radius = Math.max(size.length() * .5, .1) / Math.sin(kit.camera.fov / 2) * 1.05;
            kit.camera.maxZ = kit.camera.radius * 4;
            kit.scene.render();
            return kit.canvas.toDataURL('image/png');
        } finally {
            var material = mesh.material;
            mesh.dispose(true, false);
            if (material) material.dispose(false, false);
        };
    };

    function pumpThumbs() {
        if (viewer.pumping || viewer.thumbsBroken) return;
        viewer.pumping = true;
        var step = () => {
            var entry = viewer.thumbQueue.values().next().value;
            if (!entry) { viewer.pumping = false; return; };
            viewer.thumbQueue.delete(entry);
            try {
                var url = renderThumb(entry);
                viewer.thumbCache.set(entry.mesh, url);
                showThumb(entry, url);
            } catch (error) {
                console.error('[BlockViewer] thumbnail failed', entry.name, error);
                viewer.thumbsBroken = true;
                viewer.thumbQueue.clear();
                viewer.pumping = false;
                return;
            };
            setTimeout(step, 16);
        };
        setTimeout(step, 16);
    };

    function disposePreview() {
        var nodes = viewer.nodes.length ? viewer.nodes : viewer.meshes;
        var materials = new Set(nodes.map(mesh => mesh.material).filter(Boolean));
        nodes.concat(viewer.colliders).forEach(mesh => mesh.dispose(true, false));
        materials.forEach(material => material.dispose(false, false));
        viewer.meshes = [];
        viewer.nodes = [];
        viewer.colliders = [];
        viewer.root.rotation.set(0, 0, 0);
        if (viewer.importRoot) viewer.importRoot.rotation.set(0, 0, 0);
    };

    function copyMesh(source, parent, target = viewer.scene) {
        var B = BABYLON;
        var mesh = new B.Mesh('bv-' + source.name, target);
        B.VertexData.ExtractFromMesh(source).applyToMesh(mesh);
        mesh.parent = parent;
        mesh.position.copyFrom(source.position);
        mesh.scaling.copyFrom(source.scaling);
        mesh.rotation.copyFrom(source.rotation);
        mesh.hasVertexAlpha = source.hasVertexAlpha;
        mesh.useVertexColors = source.useVertexColors;
        if (source.rotationQuaternion) mesh.rotationQuaternion = source.rotationQuaternion.clone();
        var material = new B.StandardMaterial('bv-surface', target);
        var original = source.material;
        material.diffuseColor = original && original.diffuseColor ? original.diffuseColor.clone() : new B.Color3(.8, .8, .8);
        material.specularColor = original && original.specularColor ? original.specularColor.clone() : B.Color3.Black();
        if (original) { material.alpha = original.alpha; material.specularPower = original.specularPower; };
        material.ambientColor = B.Color3.White();
        if (original && original.emissiveColor) material.emissiveColor = original.emissiveColor.clone();
        material.backFaceCulling = original ? original.backFaceCulling : false;
        mesh.bvWireframe = original && original.wireframe;
        material.wireframe = viewer.wireframe || !!mesh.bvWireframe;
        mesh.material = material;
        mesh.isPickable = false;
        return mesh;
    };

    function updateVisibility() {
        viewer.meshes.forEach(mesh => { mesh.isVisible = viewer.modelVisible && mesh.bvVisible !== false; });
    };

    function select(entry) {
        if (!viewer.root) return;
        $('search').placeholder = viewer.mode === 'blocks' ? 'Find a block...' : 'Find a mesh...';
        $('collision').disabled = !collisionAvailable(entry);
        $('collision').setAttribute('aria-pressed', collisionAvailable(entry) && viewer.collision);
        $('key').hidden = !collisionAvailable(entry) || !viewer.collision;
        if (viewer.selected && viewer.selected.button) viewer.selected.button.setAttribute('aria-pressed', false);
        var preserveCamera = viewer.mode === 'blocks' && viewer.selectionMode === 'blocks' && !!viewer.selected;
        viewer.selected = entry; viewer.selectionMode = viewer.mode;
        if (entry) {
            if (viewer.mode === 'blocks') viewer.lastBlock = entry;
            else viewer.lastImport = entry;
        };
        if (entry && entry.button) {
            entry.button.setAttribute('aria-pressed', true);
            entry.button.scrollIntoView({ block: 'nearest' });
        };
        disposePreview();
        if (!entry) {
            $('name').textContent = 'Pick a model';
            $('path').textContent = 'Import a .babylon or .glb to take a look.';
            $('stats').replaceChildren();
            $('cstats').replaceChildren();
            $('cnote').textContent = '';
            $('snote').textContent = '';
            status('');
            return;
        };
        var B = BABYLON;
        if (viewer.mode === 'blocks') {
            viewer.meshes.push(copyMesh(entry.mesh, viewer.root));
        } else {
            //copies stay in the import scene; its materials, textures and hierarchy stay intact
            var helpers = new Set(entry.whole ? viewer.imported.flatMap(item => item.helpers || []) : entry.helpers || []);
            var originals = (entry.whole ? viewer.importNodes : subtree(entry.mesh)).filter(node => !helpers.has(node));
            var clones = new Map(), materials = new Map();
            originals.forEach(source => {
                var clone = source.clone('bv-preview-' + source.name, null, true);
                clone.setEnabled(true);
                clone.isVisible = source.isVisible;
                clone.isPickable = false;
                clones.set(source, clone);
            });
            clones.forEach((clone, source) => {
                clone.parent = clones.get(source.parent) || viewer.importRoot;
                if (source.parent && !clones.has(source.parent)) {
                    source.computeWorldMatrix(true);
                    clone.rotationQuaternion = new B.Quaternion();
                    source.getWorldMatrix().decompose(clone.scaling, clone.rotationQuaternion, clone.position);
                };
                if (source.material) {
                    if (!materials.has(source.material)) materials.set(source.material, source.material.clone('bv-import-material'));
                    clone.material = materials.get(source.material);
                    clone.material.wireframe = viewer.wireframe;
                };
                viewer.nodes.push(clone);
                if (hasGeometry(clone)) viewer.meshes.push(clone);
            });
        };
        var name = entry.name.split('.');
        viewer.meshes.forEach(mesh => { mesh.bvVisible = mesh.isVisible; });
        updateVisibility();
        $('name').textContent = entry.whole ? 'Whole model' : viewer.mode === 'blocks' ? pretty(name[1] || entry.name) : entry.name;
        $('path').textContent = entry.whole ? viewer.filename : entry.name;
        if (entry.whole && viewer.mode === 'imported') viewer.imported.filter(item => item.collisionType).forEach(buildCollision);
        else buildCollision(entry);
        fit(!preserveCamera, preserveCamera);
        stats(entry);
        status('');
    };

    function bounds(meshes) {
        var B = BABYLON, min = new B.Vector3(Infinity, Infinity, Infinity), max = new B.Vector3(-Infinity, -Infinity, -Infinity);
        meshes.filter(mesh => mesh.getTotalVertices() > 0).forEach(mesh => {
            mesh.computeWorldMatrix(true);
            var box = mesh.getBoundingInfo().boundingBox;
            min = B.Vector3.Minimize(min, box.minimumWorld);
            max = B.Vector3.Maximize(max, box.maximumWorld);
        });
        if (!isFinite(min.x)) return { min: new B.Vector3(-.5, -.5, -.5), max: new B.Vector3(.5, .5, .5) };
        return { min, max };
    };

    function fit(reset, preserveCamera = false) {
        if (!viewer.camera) return;
        var box = bounds(viewer.meshes.concat(viewer.collision ? viewer.colliders : [])), size = box.max.subtract(box.min), center = box.min.add(box.max).scale(.5);
        var radius = Math.max(size.length() * .5, .1);
        var aspect = viewer.engine.getAspectRatio(viewer.camera);
        var halfFov = Math.min(viewer.camera.fov / 2, Math.atan(Math.tan(viewer.camera.fov / 2) * aspect));
        if (!preserveCamera) {
            viewer.camera.setTarget(center);
            viewer.camera.radius = radius / Math.sin(halfFov) * 1.2;
        };
        viewer.camera.lowerRadiusLimit = Math.min(radius * .15, viewer.camera.radius * .15);
        viewer.camera.upperRadiusLimit = Math.max(radius * 30, viewer.camera.radius * 2);
        viewer.camera.maxZ = Math.max(100, radius * 100, viewer.camera.radius * 2);
        viewer.camera.wheelPrecision = 80 / radius;
        viewer.camera.panningSensibility = 800 / radius;
        if (reset === true) { viewer.camera.alpha = -Math.PI / 3; viewer.camera.beta = Math.PI / 2.8; };
        var grid = viewer.mode === 'imported' && viewer.importGrid ? viewer.importGrid : viewer.grid;
        var gridScale = viewer.mode === 'blocks' ? 1 : Math.max(1, radius);
        grid.scaling.set(gridScale, gridScale, gridScale);
        grid.position.set(center.x, box.min.y + .5 * gridScale, center.z);
    };

    function zoom(delta) {
        var camera2 = viewer.camera;
        camera2.inertialRadiusOffset = 0;
        camera2.radius = Math.max(camera2.lowerRadiusLimit, Math.min(camera2.upperRadiusLimit, camera2.radius * Math.exp(Math.max(-2, Math.min(2, delta * .001)))));
    };

    function collisionBox(min, max, matrix) {
        var B = BABYLON, size = max.subtract(min), mesh = B.MeshBuilder.CreateBox('bv-collider', { width: Math.max(size.x, .001), height: Math.max(size.y, .001), depth: Math.max(size.z, .001) }, activeRoot().getScene());
        mesh.position = min.add(max).scale(.5);
        if (matrix) mesh.bakeTransformIntoVertices(B.Matrix.Translation(mesh.position.x, mesh.position.y, mesh.position.z).multiply(matrix));
        if (matrix) mesh.position.set(0, 0, 0);
        addCollision(mesh);
    };

    function addCollision(mesh) {
        var B = BABYLON;
        mesh.parent = activeRoot();
        mesh.material = viewer.mode === 'imported' ? viewer.importCmat || viewer.cmat : viewer.cmat;
        mesh.material.wireframe = viewer.collisionWireframe;
        mesh.enableEdgesRendering();
        mesh.edgesWidth = 2;
        mesh.edgesColor = new B.Color4(1, .32, .02, 1);
        mesh.isPickable = false;
        mesh.setEnabled(viewer.collision);
        viewer.colliders.push(mesh);
    };

    function buildCollision(entry) {
        if (viewer.mode !== 'blocks' && !entry.collisionType) return;
        var B = BABYLON, fields = entry.name.split('.'), type = entry.collisionType || fields[2], matrix;
        if (viewer.mode === 'imported') { entry.mesh.computeWorldMatrix(true); matrix = entry.mesh.getWorldMatrix(); };
        if (type === 'full') collisionBox(new B.Vector3(-.5, -.5, -.5), new B.Vector3(.5, .5, .5), matrix);
        if (type === 'wedge' || type === 'iwedge') {
            //same translated, tilted box as ColliderConstructor; gameplay clips it to the cell
            var shape = B.MeshBuilder.CreateBox('bv-wedge-source', { size: 1.5 }, activeRoot().getScene());
            shape.bakeTransformIntoVertices(B.Matrix.Translation(0, type === 'wedge' ? -.75 : .75, 0));
            shape.bakeTransformIntoVertices(B.Matrix.RotationX(-Math.PI / 4));
            if (matrix) shape.bakeTransformIntoVertices(matrix);
            addCollision(shape);
        };
        if (['aabb', 'obb', 'mesh', 'ladder'].includes(type)) {
            var collider = entry.collider || entry.mesh.colliderMesh || entry.mesh.getChildMeshes()[0];
            if (!collider) return;
            var targets = type === 'ladder' ? [collider] : [collider, ...collider.getChildMeshes()];
            targets.forEach(mesh => {
                if (type === 'mesh' && !hasGeometry(mesh)) return;
                mesh.computeWorldMatrix(true);
                if (type === 'mesh') {
                    var shape = new B.Mesh('bv-mesh-collider', activeRoot().getScene());
                    B.VertexData.ExtractFromMesh(mesh).applyToMesh(shape);
                    shape.isUnIndexed = mesh.isUnIndexed;
                    shape.bakeTransformIntoVertices(mesh.getWorldMatrix());
                    addCollision(shape);
                    return;
                };
                var box = mesh.getBoundingInfo().boundingBox;
                if (type === 'obb') collisionBox(box.minimum, box.maximum, mesh.getWorldMatrix());
                else collisionBox(box.minimumWorld, box.maximumWorld);
            });
        };
    };

    function row(label, value, definition) {
        var div = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.textContent = label;
        dd.textContent = value;
        if (definition) { dt.title = definition; dd.title = definition; };
        div.append(dt, dd);
        return div;
    };

    function stats(entry) {
        var meshes = viewer.meshes.filter(mesh => mesh.getTotalVertices() > 0), vertices = 0, triangles = 0;
        meshes.forEach(mesh => { vertices += mesh.getTotalVertices(); triangles += (mesh.isUnIndexed ? mesh.getTotalVertices() : mesh.getTotalIndices()) / 3; });
        var box = bounds(meshes), size = box.max.subtract(box.min), fields = entry.name.split('.');
        $('stats').replaceChildren(
            row('Theme', viewer.mode === 'blocks' || entry.collisionType ? entry.theme : 'Imported'), row('Meshes', number(meshes.length)),
            row('Vertices', number(vertices)), row('Triangles', number(Math.floor(triangles))),
            row('Materials', number(new Set(meshes.map(mesh => mesh.material).filter(Boolean)).size)),
            row('Size X / Y / Z', [size.x, size.y, size.z].map(value => value.toFixed(2)).join(' / ')), row('Y rotation', '0°')
        );
        var type = entry.whole ? 'unknown' : fields[2] || 'unknown';
        var notes = {
            full: 'A full 1 × 1 × 1 cell.',
            wedge: 'Tilted collision box. Gameplay tests only the part inside this cell.',
            iwedge: 'Inverted tilted box. Gameplay tests only the part inside this cell.',
            aabb: 'Axis-aligned bounds of the collision child and its descendants.',
            obb: 'Oriented bounds of the collision child and its descendants.',
            mesh: 'Uses the actual triangles of the collision child and its descendants, rather than bounding boxes. Holes and concave gaps stay open; open surfaces collide from both sides.',
            ladder: 'Player-only bounds. Bullets pass through.',
            none: 'No gameplay collision.',
        };
        var recognized = viewer.mode === 'blocks' || entry.collisionType;
        $('cnote').textContent = recognized ? notes[type] || 'No known gameplay collision rule for this block.' : entry.whole && collisionAvailable(entry) ? 'Collision rules from each block name and its child meshes.' : 'No block collision type in this model name.';
        var softness = fields[3] || 'Solid';
        var softnessNotes = {
            Solid: 'No softness flag. Collision follows Type; projectile impacts use the visible mesh when possible.',
            soft: 'Player collision follows Type. Checks that ignore soft blocks skip it; projectile impacts use the collision shape.',
            verysoft: 'Player collision follows Type, but map ray checks continue through it. Also skipped by checks that ignore soft blocks.',
        };
        $('snote').textContent = softnessNotes[softness] || 'Custom softness flag: ' + softness + '. Checks that ignore soft blocks skip any non-empty flag.';
        $('softness-help').hidden = !recognized;
        $('cstats').replaceChildren(row('Type', type, $('cnote').textContent), row('Shapes', number(viewer.colliders.length)), row('Softness', softness, $('snote').textContent));
        if (!recognized) $('cstats').replaceChildren(row('Type', collisionAvailable(entry) ? 'Mixed' : 'Not assigned', $('cnote').textContent), row('Shapes', number(viewer.colliders.length)));
    };

    function rotationStats() {
        var rows = $('stats').querySelectorAll('dd');
        if (rows.length) rows[rows.length - 1].textContent = Math.round(activeRoot().rotation.y * 180 / Math.PI) % 360 + '°';
    };

    async function loader() {
        if (BABYLON.SceneLoader.IsPluginForExtensionAvailable('.glb')) return;
        if (!viewer.loaderPromise) viewer.loaderPromise = new Promise((resolve, reject) => {
            var script = document.createElement('script');
            script.src = '/blockviewer/vendor/babylonjs.loaders.min.js';
            script.onload = resolve;
            script.onerror = () => { viewer.loaderPromise = null; script.remove(); reject(new Error('Could not load the GLB reader. Try again.')); };
            document.head.appendChild(script);
        });
        await viewer.loaderPromise;
    };

    async function importFile(file) {
        var ext = file.name.toLowerCase().match(/\.(babylon|glb)$/);
        if (!ext) return status('Pick a .babylon or .glb file.', true);
        if (file.size > 64 * 1024 * 1024) return status('That model is too large. Please use a file under 64 MB.', true);
        var ticket = ++viewer.ticket, importedScene, url;
        status('Opening ' + file.name + '...');
        $('import').disabled = true;
        try {
            if (ext[1] === 'glb') await loader();
            if (ticket !== viewer.ticket) return;
            importedScene = new BABYLON.Scene(viewer.engine);
            importedScene.clearColor = viewer.scene.clearColor;
            importedScene.ambientColor = new BABYLON.Color3(.5, .5, .5);
            importedScene.activeCamera = viewer.camera;
            new BABYLON.HemisphericLight('bv-import-light', new BABYLON.Vector3(.3, 1, -.4), importedScene);
            var data;
            if (ext[1] === 'babylon') {
                var parsed = JSON.parse(await file.text());
                if (!Array.isArray(parsed.meshes)) throw new Error('This Babylon file has no mesh list.');
                //single-file preview: don't fetch sidecar textures or run serialized actions
                var clean = value => {
                    if (!value || typeof value !== 'object') return;
                    delete value.actions;
                    Object.keys(value).forEach(key => {
                        if (/texture$/i.test(key) && value[key] && !String(value[key].name || '').startsWith('data:') && !value[key].base64String) value[key] = null;
                        else clean(value[key]);
                    });
                };
                clean(parsed);
                data = 'data:' + JSON.stringify(parsed);
            } else {
                url = URL.createObjectURL(file);
                data = url;
            };
            var loaded = await new Promise((resolve, reject) => BABYLON.SceneLoader.ImportMesh('', '', data, importedScene,
                meshes => resolve(meshes), null, (scene2, message, error) => reject(error || new Error(message)), '.' + ext[1]));
            if (ticket !== viewer.ticket) { importedScene.dispose(); return; };
            if (!loaded.some(mesh => mesh.getTotalVertices() > 0)) throw new Error('No visible meshes in this file.');
            disposePreview();
            if (viewer.importScene) viewer.importScene.dispose();
            viewer.importScene = importedScene;
            viewer.importMeshes = loaded;
            viewer.importNodes = [...new Set([...importedScene.transformNodes, ...loaded])];
            viewer.importEnabled = new Map(viewer.importNodes.map(node => [node.id, node.isEnabled(false)]));
            var entries = importEntries(viewer.importNodes);
            viewer.importRoot = new BABYLON.TransformNode('bv-import-preview', importedScene);
            viewer.importGrid = makeGrid(importedScene);
            viewer.importCmat = new BABYLON.StandardMaterial('bv-import-collision', importedScene);
            viewer.importCmat.diffuseColor = viewer.cmat.diffuseColor.clone();
            viewer.importCmat.emissiveColor = viewer.cmat.emissiveColor.clone();
            viewer.importCmat.alpha = viewer.cmat.alpha;
            viewer.importCmat.backFaceCulling = false;
            viewer.importNodes.forEach(mesh => { mesh.setEnabled(false); });
            viewer.filename = file.name;
            viewer.imported = [{ name: file.name, whole: true, theme: 'File' }, ...entries];
            viewer.mode = 'imported';
            $('source').value = 'imported';
            $('search').value = '';
            $('theme').hidden = true;
            $('clear').hidden = false;
            $('export').hidden = false;
            $('export-scope').hidden = false;
            filter();
            select(entries.find(entry => viewer.lastBlock && entry.name === viewer.lastBlock.name) || entries.find(entry => entry.collisionType) || viewer.imported[0]);
        } catch (error) {
            if (importedScene && importedScene !== viewer.importScene) importedScene.dispose();
            if (ticket === viewer.ticket) status('Could not open ' + file.name + '. ' + (error.message || 'Check that the model is valid and self-contained.'), true);
            console.warn('[BlockViewer] Import failed:', error);
        } finally {
            if (url) URL.revokeObjectURL(url);
            if (ticket === viewer.ticket) $('import').disabled = false;
        };
    };

    function clearImport() {
        var search = viewer.mode === 'blocks' ? $('search').value : '';
        viewer.ticket++;
        disposePreview();
        if (viewer.importScene) viewer.importScene.dispose();
        viewer.importScene = null;
        viewer.importRoot = null;
        viewer.importGrid = null;
        viewer.imported = [];
        viewer.lastImport = null;
        viewer.importMeshes = [];
        viewer.importNodes = [];
        viewer.mode = 'blocks';
        $('source').value = 'blocks';
        $('theme').hidden = false;
        $('search').value = search;
        $('clear').hidden = true;
        $('export').hidden = true;
        $('export-scope').hidden = true;
        $('import').disabled = false;
        filter();
        select(viewer.filtered.includes(viewer.lastBlock) ? viewer.lastBlock : viewer.filtered[0]);
    };

    async function serializeImport(scope) {
        if (!viewer.importScene || !viewer.importNodes.length) throw new Error('Import a model first.');
        var nodes = viewer.importNodes;
        if (scope === 'selected') {
            if (viewer.mode !== 'imported' || !viewer.selected) throw new Error('Select an imported block first.');
            if (!viewer.selected.whole) {
                var selected = new Set(subtree(viewer.selected.mesh));
                for (var parent = viewer.selected.mesh.parent; parent && nodes.includes(parent); parent = parent.parent) selected.add(parent);
                nodes = nodes.filter(node => selected.has(node));
            };
        };
        //export the originals, including collider children, never the preview copies
        var result = BABYLON.SceneSerializer.SerializeMesh(nodes.filter(node => node instanceof BABYLON.Mesh), false, false);
        //3.3's ImportMesh ignores transformNodes, so retain those parents as empty meshes
        result.meshes.push(...nodes.filter(node => !(node instanceof BABYLON.Mesh)).map(node => node.serialize()));
        for (var node of result.meshes) node.isEnabled = viewer.importEnabled && viewer.importEnabled.has(node.id) ? viewer.importEnabled.get(node.id) : true;
        result.useRightHandedSystem = viewer.importScene.useRightHandedSystem;
        var textures = new Map();
        nodes.forEach(node => {
            if (node.material && node.material.getActiveTextures) node.material.getActiveTextures().forEach(texture => textures.set(texture.name, texture));
        });
        async function embed(value) {
            if (!value || typeof value !== 'object') return;
            if (value.coordinatesMode !== undefined && textures.has(value.name) && !value.base64String) {
                var texture = textures.get(value.name), url = String(texture.url || texture.name || '');
                if (url.startsWith('data:')) value.base64String = url;
                else if (url.startsWith('blob:')) {
                    var response = await fetch(url);
                    if (!response.ok) throw new Error('Could not export texture ' + value.name);
                    var blob = await response.blob();
                    value.base64String = await new Promise((resolve, reject) => {
                        var reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = () => reject(new Error('Could not read texture ' + value.name));
                        reader.readAsDataURL(blob);
                    });
                };
            };
            for (var key of Object.keys(value)) if (typeof value[key] === 'object') await embed(value[key]);
        };
        await embed(result.materials);
        return result;
    };

    async function exportBabylon() {
        $('export').disabled = true;
        var url;
        try {
            var scope = $('export-scope').value;
            var name = scope === 'selected' && viewer.selected && !viewer.selected.whole ? viewer.selected.name : viewer.filename.replace(/\.(babylon|glb)$/i, '');
            var data = await serializeImport(scope);
            var file = new Blob([JSON.stringify(data)], { type: 'application/json' });
            url = URL.createObjectURL(file);
            var link = document.createElement('a');
            link.href = url;
            link.download = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') + '.babylon';
            document.body.appendChild(link);
            link.click();
            link.remove();
            status('');
        } catch (error) {
            status('Export failed. ' + error.message, true);
        } finally {
            if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
            $('export').disabled = false;
        };
    };

    window.addEventListener('DOMContentLoaded', init);
})();
