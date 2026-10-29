//plugin: dynamicmapblocks, editor only
(() => {
    var state = new PlatformEditorState(), selected, enabled = false, preview, legacyView;
    var hidden = [], attachedScene, selectionBox, pivotDot, boundsKey, swept = [], guides, guideKey;
    var $ = id => document.getElementById('dmb-' + id);
    var axes = ['x', 'y', 'z'], offset = { x: .5, y: .5, z: .5 };
    var movementClipboard, previewMode = null, previewStart = 0, previewBodies = [], previewKey;
    try { movementClipboard = JSON.parse(localStorage.getItem('dmbMovementClipboard')); } catch {};

    function disposePreview() {
        if (preview) preview.dispose();
        preview = null;
        for (var [mesh, visible] of hidden) if (!mesh.isDisposed()) mesh.isVisible = visible;
        hidden = [];
    };
    function stopPreview() {
        var wasActive = previewMode;
        disposePreview(); previewMode = null; previewBodies = []; previewKey = null;
        if ($('preview')) { $('preview').textContent = 'Preview'; $('preview').disabled = !selected; }
        if ($('preview-all')) $('preview-all').checked = false;
        if (wasActive) message('Preview stopped.');
    };
    function clearSelection() {
        selected = null;
        if (selectionBox) selectionBox.setEnabled(false);
        if (pivotDot) pivotDot.setEnabled(false);
        if ($('fields')) { $('fields').disabled = true; $('selection').textContent = 'Click a block to edit its physics.'; }
        for (var id of ['apply', 'preview', 'reset']) if ($(id)) $(id).disabled = true;
        if ($('preview') && previewMode) $('preview').disabled = false;
        if ($('warning')) $('warning').hidden = true;
        if (guides) guides.dispose(); guides = null; guideKey = null;
    };
    function restShapes() {
        previewKey = null;
        if (legacyView) legacyView.dispose();
        legacyView = null;
        if (!scene) return;
        var bodies = state.bodies.filter(body => body.shapes?.length).map(body => ({ ...body, blocks: [], motion: { type: 'none' } }));
        if (!bodies.length) { refreshGuides(); refreshPreview(); return; }
        legacyView = PlatformRender.create(scene, new PlatformWorld(bodies, mapMeshes), mapMeshes, () => 0, offset);
        legacyView.nodes.forEach((node, index) => {
            for (var mesh of node.getChildMeshes()) { mesh.isPickable = true; mesh.metadata = { platformEditorBody: bodies[index].id }; }
        });
        refreshGuides(); refreshPreview();
    };
    function refreshGuides() {
        if (!scene || !$('show-guides')) return;
        var bodies = $('show-guides').checked ? state.bodies.slice() : [];
        if (enabled && selected) {
            try {
                var draft = readBody();
                if (PlatformMap.read({ ...map, extents: { platforms: [draft] } }).length) {
                    bodies = bodies.filter(body => body.id !== draft.id); bodies.push(draft);
                };
            } catch {};
        };
        var key = JSON.stringify(bodies);
        if (key === guideKey) return;
        if (guides) guides.dispose();
        guides = PlatformGuides.create(scene, bodies, offset, mapMeshes); guideKey = key;
    };
    function refreshPreview() {
        if (!previewMode || !scene) return;
        try {
            if (selected && !$('form').checkValidity()) return;
            var bodies = previewBodies.slice();
            if (previewMode === 'all') for (var saved of state.bodies) if (!bodies.some(body => body.id === saved.id)) bodies.push(saved);
            var body = selected ? readBody() : null;
            if (body && (previewMode === 'all' || bodies.some(item => item.id === body.id))) {
                if (!PlatformMap.read({ ...map, extents: { platforms: [body] } }).length) return;
                bodies = bodies.filter(item => item.id !== body.id); bodies.push(body);
            };
            var key = JSON.stringify(bodies);
            if (key === previewKey) return;
            var moving = bodies.filter(body => body.motion.type !== 'none');
            var next = moving.length ? PlatformRender.create(scene, new PlatformWorld(moving, mapMeshes), mapMeshes,
                () => performance.now() / 1000 - previewStart, offset) : null;
            disposePreview(); preview = next; previewBodies = JSON.parse(JSON.stringify(bodies)); previewKey = key;
            for (var mesh of mapContainer.getChildMeshes()) if (moving.some(body => body.blocks.some(block => axes.every(axis => block[axis] === mesh.position[axis])))) {
                hidden.push([mesh, mesh.isVisible]); mesh.isVisible = false;
            };
            if (legacyView) for (var node of legacyView.nodes) for (var mesh of node.getChildMeshes()) if (moving.some(body => mesh.metadata?.platformEditorBody === body.id)) {
                hidden.push([mesh, mesh.isVisible]); mesh.isVisible = false;
            };
            preview?.nodes.forEach((node, index) => {
                var body = moving[index], selection = body.blocks.length === 1 ? { block: { ...body.blocks[0] } } : { id: body.id };
                for (var mesh of node.getChildMeshes()) {
                    mesh.isPickable = mesh.isVisible && mesh.isEnabled();
                    mesh.metadata = { ...mesh.metadata, platformPreviewSelection: selection, platformPreviewMotion: body.motion };
                };
            });
            selectionBox?.setEnabled(false); pivotDot?.setEnabled(false);
            $('preview').textContent = 'Stop preview'; $('preview').disabled = false; $('preview-all').checked = previewMode === 'all';
        } catch (error) { message(error.message); };
    };
    function startPreview(all) {
        if (!$('form').reportValidity()) { $('preview-all').checked = previewMode === 'all'; return; }
        try {
            var bodies = all ? state.bodies.slice() : [], body = selected ? readBody() : null;
            if (all && previewMode) for (var draft of previewBodies) {
                bodies = bodies.filter(body => body.id !== draft.id); bodies.push(draft);
            };
            if (body) {
                if (!PlatformMap.read({ ...map, extents: { platforms: [body] } }).length) throw new Error('Check the movement settings before previewing.');
                bodies = bodies.filter(item => item.id !== body.id); bodies.push(body);
            };
            if (!bodies.some(body => body.motion.type !== 'none')) throw new Error('Choose a movement to preview.');
            if (!previewMode) previewStart = performance.now() / 1000;
            previewMode = all ? 'all' : 'selected'; previewBodies = bodies; previewKey = null;
            refreshPreview();
            message(all ? 'Previewing all moving blocks.' : 'Previewing. Stop to return to the starting position.');
        } catch (error) { $('preview-all').checked = previewMode === 'all'; message(error.message); };
    };
    function currentBody() {
        if (!selected) return null;
        if (selected.block) return state.draft(selected.block);
        return JSON.parse(JSON.stringify(state.bodies.find(body => body.id === selected.id)));
    };
    function message(text) { if ($('status')) $('status').textContent = text; };
    function vectorFields(prefix, value) { for (var axis of axes) $(prefix + '-' + axis).value = value?.[axis] || 0; };
    function vectorValue(prefix) { return Object.fromEntries(axes.map(axis => [axis, Number($(prefix + '-' + axis).value)])); };
    function pointRow(point = {}) {
        var row = document.createElement('tr');
        for (var axis of axes) {
            var cell = document.createElement('td'), input = document.createElement('input');
            input.type = 'number'; input.step = 'any'; input.required = true; input.value = point[axis] || 0;
            input.dataset.axis = axis; cell.appendChild(input); row.appendChild(cell);
        };
        var cell = document.createElement('td'), remove = document.createElement('button');
        remove.type = 'button'; remove.className = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Remove waypoint');
        remove.onclick = () => { row.remove(); fieldsChanged(); };
        cell.appendChild(remove); row.appendChild(cell); $('points').appendChild(row); numberPoints();
    };
    function pointValue(row) {
        return Object.fromEntries(axes.map(axis => [axis, Number(row.querySelector('[data-axis="' + axis + '"]').value)]));
    };
    function numberPoints() {
        Array.from($('points').children).forEach((row, i) => {
            for (var axis of axes) row.querySelector('[data-axis="' + axis + '"]').setAttribute('aria-label', 'Waypoint ' + (i + 1) + ' ' + axis.toUpperCase());
            row.querySelector('button').disabled = $('points').children.length <= 2;
        });
        $('add-point').disabled = $('points').children.length >= 64;
    };
    function readBody() {
        var body = currentBody(), type = $('movement').value;
        if (!body) throw new Error('Pick a block first.');
        if (type === 'spin') {
            var axis = $('axis').value === 'custom' ? vectorValue('axis') : { [$('axis').value]: 1 };
            var pivot = $('pivot').value === 'custom' ? vectorValue('pivot') : state.pivot(body, mapMeshes,
                $('pivot').value === 'corner' ? $('corner').value : null);
            body.motion = { type, axis, pivot, speed: Number($('speed').value) * Number($('direction').value), phase: Number($('phase').value) };
        } else if (type === 'path') {
            var points = Array.from($('points').children).map(pointValue);
            body.motion = { type, points, duration: Number($('duration').value), loop: $('loop').value, phase: Number($('phase').value) };
        } else if (type === 'circle') {
            body.motion = { type, radius: Number($('radius').value), plane: $('plane').value, reverse: $('circle-direction').value === '-1',
                duration: Number($('duration').value), phase: Number($('phase').value) };
        } else body.motion = { type: 'none' };
        if (type === 'path' || type === 'circle') {
            body.motion.orient = $('orient').checked;
            body.motion.turnDuration = Number($('turn').value);
            body.motion.headingOffset = Number($('heading-offset').value);
        };
        if (type !== 'none') {
            body.motion.collidePlayers = $('collide-players').checked; body.motion.collideItems = $('collide-items').checked;
            body.motion.pushThroughMap = $('priority').value === 'block';
            if (type === 'spin' || (['path', 'circle'].includes(type) && body.motion.orient)) {
                body.motion.rotatePlayers = $('rotate-players').checked; body.motion.rotateItems = $('rotate-items').checked;
            };
        };
        return body;
    };
    function updateMarker() {
        if (!enabled || !selected || !selectionBox || previewMode) return;
        try {
            var body = readBody(), bounds = state.bounds(body, mapMeshes);
            var local = BABYLON.Matrix.RotationYawPitchRoll(body.rotation?.y || 0, body.rotation?.x || 0, body.rotation?.z || 0)
                .multiply(BABYLON.Matrix.Translation(body.position.x - .5, body.position.y - .5, body.position.z - .5));
            selectionBox.position.copyFrom(BABYLON.Vector3.TransformCoordinates(bounds.min.add(bounds.max).scale(.5), local));
            selectionBox.scaling.copyFrom(bounds.max.subtract(bounds.min).add(new BABYLON.Vector3(.04, .04, .04)));
            selectionBox.rotation.set(body.rotation?.x || 0, body.rotation?.y || 0, body.rotation?.z || 0);
            selectionBox.setEnabled(true);
            pivotDot.position.copyFrom(BABYLON.Vector3.TransformCoordinates(PlatformMotion.vector(body.motion.pivot), local));
            pivotDot.setEnabled(body.motion.type === 'spin');
        } catch { pivotDot.setEnabled(false); };
    };
    function markMore() { $('more').classList.toggle('dmb-active', $('show-guides').checked || $('preview-all').checked); };
    function fieldsChanged() {
        $('spin').hidden = $('movement').value !== 'spin';
        $('path').hidden = $('movement').value !== 'path';
        $('circle').hidden = $('movement').value !== 'circle';
        $('travel').hidden = $('facing').hidden = !['path', 'circle'].includes($('movement').value);
        $('repeat-row').hidden = $('movement').value !== 'path';
        $('turn-row').hidden = !$('orient').checked || $('movement').value !== 'path';
        $('offset-row').hidden = !$('orient').checked;
        $('rider-row').hidden = $('priority-row').hidden = $('movement').value === 'none';
        $('rotate-row').hidden = !($('movement').value === 'spin' || (['path', 'circle'].includes($('movement').value) && $('orient').checked));
        $('phase-row').hidden = $('movement').value === 'none';
        $('axis-vector').hidden = $('axis').value !== 'custom';
        $('pivot-vector').hidden = $('pivot').value !== 'custom';
        $('corner-row').hidden = $('pivot').value !== 'corner';
        for (var group of ['spin', 'path', 'circle', 'travel', 'facing', 'repeat-row', 'turn-row', 'offset-row', 'rider-row', 'phase-row', 'axis-vector', 'pivot-vector', 'corner-row']) {
            for (var field of $(group).querySelectorAll('input, select, button')) field.disabled = false;
        };
        for (var group of ['spin', 'path', 'circle', 'travel', 'facing', 'repeat-row', 'turn-row', 'offset-row', 'phase-row', 'axis-vector', 'pivot-vector', 'corner-row']) {
            if ($(group).hidden) for (var field of $(group).querySelectorAll('input, select, button')) field.disabled = true;
        };
        $('rotate-players').disabled = !$('collide-players').checked; $('rotate-items').disabled = !$('collide-items').checked; //nothing to turn with if it does not collide
        $('paste-movement').disabled = !movementClipboard;
        markMore();
        numberPoints(); refreshPreview(); updateMarker(); refreshGuides();
    };
    function showSelection(selection, movement) {
        state.sync(map, mapMeshes); selected = selection;
        try {
            if (selected.block) {
                var block = selected.block, cell = map.data[block.x]?.[block.y]?.[block.z];
                if (!cell?.idx || mapMeshes[cell.idx]?.name !== block.mesh) throw new Error('That block is gone. Pick another block.');
                for (var key of axes) block['r' + key] = cell['r' + key] || 0;
            };
            var body = currentBody();
            if (movement) body = state.pasteMovement(body, movement, mapMeshes);
            var motion = body.motion;
            var missing = body.blocks.filter(block => PlatformMap.blockShapes(block, body, mapMeshes).every(part => part.visualOnly));
            $('warning').hidden = !missing.length;
            $('warning').textContent = missing.length ? 'No collider: ' + [...new Set(missing.map(block => block.mesh))].join(', ') + '. Moves visually; players and grenades pass through it.' : '';
            $('selection').textContent = selected.block ? selected.block.mesh + ' · ' + axes.map(axis => selected.block[axis]).join(', ') +
                (body.blocks.length > 1 ? ' · ' + body.blocks.length + ' blocks' : '') : body.id;
            $('fields').disabled = false;
            for (var id of ['apply', 'preview', 'reset']) $(id).disabled = false;
            $('movement').value = motion.type;
            var axis = PlatformMotion.vector(motion.axis || { y: 1 });
            $('axis').value = axes.find(key => axis[key] === 1 && axes.filter(other => other !== key).every(other => axis[other] === 0)) || 'custom';
            vectorFields('axis', axis);
            var pivot = motion.pivot || state.pivot(body, mapMeshes), centre = state.pivot(body, mapMeshes);
            $('pivot').value = axes.every(key => Math.abs((pivot[key] || 0) - centre[key]) < 1e-6) ? 'centre' : 'custom';
            for (var option of $('corner').options) {
                var corner = state.pivot(body, mapMeshes, option.value);
                if (axes.every(key => Math.abs((pivot[key] || 0) - corner[key]) < 1e-6)) { $('pivot').value = 'corner'; $('corner').value = option.value; break; }
            };
            vectorFields('pivot', pivot);
            $('speed').value = Math.abs(motion.speed ?? 30); $('direction').value = (motion.speed ?? 30) < 0 ? '-1' : '1';
            $('phase').value = motion.phase || 0; $('duration').value = motion.duration || 8; $('loop').value = motion.loop || 'pingpong';
            $('radius').value = motion.radius || 3; $('plane').value = motion.plane || 'xz'; $('circle-direction').value = motion.reverse ? '-1' : '1';
            $('rotate-players').checked = !!motion.rotatePlayers; $('rotate-items').checked = motion.rotateItems !== false;
            $('priority').value = motion.pushThroughMap ? 'block' : 'map';
            $('collide-players').checked = motion.collidePlayers !== false; $('collide-items').checked = motion.collideItems !== false;
            $('orient').checked = !!motion.orient; $('turn').value = motion.turnDuration ?? .25; $('heading-offset').value = motion.headingOffset || 0;
            $('points').replaceChildren(); (motion.points || [{}, { x: 4 }]).forEach(pointRow);
            fieldsChanged(); message('Choose a movement and press Apply.'); return true;
        } catch (error) { clearSelection(); message(error.message); return false; };
    };
    function choose(selection, movement) { //a preview that was playing moves with you to the next block
        var key = value => JSON.stringify([value?.id, value?.block?.x, value?.block?.y, value?.block?.z]);
        var following = previewMode === 'selected' && key(selected) !== key(selection);
        if (following) stopPreview();
        var shown = showSelection(selection, movement);
        if (following && shown && $('movement').value !== 'none') startPreview(false);
        return shown;
    };
    function pickBlock(pick) {
        var mesh = pick?.pickedMesh;
        if (!pick?.hit || !mesh || mesh.name === 'ground') return;
        if (mesh.metadata?.platformPreviewSelection) return choose(mesh.metadata.platformPreviewSelection, { motion: mesh.metadata.platformPreviewMotion });
        if (mesh.metadata?.platformEditorBody) return choose({ id: mesh.metadata.platformEditorBody });
        while (mesh.parent && mesh.parent !== mapContainer) mesh = mesh.parent;
        if (mesh.parent !== mapContainer) return;
        var pos = mesh.position, cell = map.data[pos.x]?.[pos.y]?.[pos.z];
        if (!cell?.idx) return;
        choose({ block: { mesh: mapMeshes[cell.idx].name, x: pos.x, y: pos.y, z: pos.z,
            rx: cell.rx || 0, ry: cell.ry || 0, rz: cell.rz || 0 } });
    };
    function attach() {
        if (!scene || scene === attachedScene) return;
        attachedScene = scene;
        selectionBox = BABYLON.MeshBuilder.CreateBox('physics-selection', { size: 1 }, scene);
        var material = new BABYLON.StandardMaterial('physics-selection', scene);
        material.emissiveColor = new BABYLON.Color3(1, .65, .12); material.disableLighting = true; material.wireframe = true;
        selectionBox.material = material; selectionBox.isPickable = false; selectionBox.setEnabled(false);
        pivotDot = BABYLON.MeshBuilder.CreateSphere('physics-pivot', { diameter: .18, segments: 12 }, scene);
        pivotDot.material = material; pivotDot.isPickable = false; pivotDot.setEnabled(false);

    };
    function setEnabled(value) {
        enabled = value; if (!enabled) stopPreview(); attach();
        document.body.classList.toggle('dmb-editing', enabled);
        $('panel').hidden = !enabled; $('open').setAttribute('aria-pressed', String(enabled));
        if (enabled) {
            document.exitPointerLock?.();
            if (selected) showSelection(selected); else clearSelection();
            message('Click a block to select it. Close Physics to build again.');
        } else { selectionBox?.setEnabled(false); pivotDot?.setEnabled(false); };
        refreshGuides();
    };

    plugins.on('game:editorPointerDown', data => {
        if (!enabled) return;
        plugins.cancel = true;
        if (data.event.button !== 0) return;
        pickBlock(document.pointerLockElement ? scene.pickWithRay(camera.getForwardRay()) : scene.pick(scene.pointerX, scene.pointerY, null, false, camera));
        document.exitPointerLock?.();
    });
    for (var event of ['editorPointerMove', 'editorPointerUp']) plugins.on('game:' + event, () => {
        if (enabled) plugins.cancel = true;
    });
    plugins.on('game:editorInitMapBefore', () => {
        clearSelection(); state.bodies = [];
        disposePreview(); previewBodies = []; previewKey = null;
        if (legacyView) legacyView.dispose(); legacyView = null;
    });
    plugins.on('game:editorInitMapAfter', () => { attach(); refreshGuides(); });
    plugins.on('game:editorLoadMapBefore', () => clearSelection());
    plugins.on('game:editorLoadMapAfter', data => {
        state.load(data.json ? JSON.parse(data.json) : null); restShapes(); attach();
    });
    plugins.on('game:editorExtentsBefore', () => state.sync(map, mapMeshes));
    plugins.on('game:editorExtentsAfter', () => {
        var key = JSON.stringify(state.bodies);
        if (key !== boundsKey) {
            var world = new PlatformWorld(state.bodies, mapMeshes);
            swept = world.bodies.map(body => world.sweptBounds(body)); boundsKey = key;
        };
        for (var bounds of swept) for (var axis of axes) {
            extents[axis].min = Math.min(extents[axis].min, Math.floor(bounds.min[axis]));
            extents[axis].max = Math.max(extents[axis].max, Math.ceil(bounds.max[axis] + (axis === 'y' ? 1 : 0)) - 1);
        };
        for (var axis of axes) extents[{ x: 'width', y: 'height', z: 'depth' }[axis]] = extents[axis].max - extents[axis].min + 1;
        refreshGuides();
    });
    plugins.on('game:editorSaveMap', data => {
        delete data.minMap.extents.spinningDisks;
        data.minMap.extents.platforms = state.save(Object.fromEntries(axes.map(axis => [axis, extents[axis].min])));
    });
    plugins.on('game:editorMoveMapBefore', () => disposePreview());
    plugins.on('game:editorMoveMapAfter', data => {
        for (var body of previewBodies) {
            for (var axis of axes) body.position[axis] += data['d' + axis];
            for (var block of body.blocks) for (var axis of axes) block[axis] += data['d' + axis];
        };
        previewKey = null;
        state.translate({ x: data.dx, y: data.dy, z: data.dz }); state.sync(map, mapMeshes); clearSelection(); restShapes();
    });

    function initUi() {
        var button = document.createElement('button');
        button.className = 'button'; button.id = 'dmb-open'; button.textContent = 'Physics'; button.setAttribute('aria-pressed', 'false');
        document.getElementById('editorUi').appendChild(button);
        var panel = document.createElement('section');
        panel.id = 'dmb-panel'; panel.className = 'box'; panel.hidden = true; panel.setAttribute('aria-labelledby', 'dmb-heading');
        panel.innerHTML = `
            <header><h1 id="dmb-heading">Block physics</h1><div class="dmb-corner">
                <details id="dmb-more" class="dmb-more"><summary title="Guides, preview all and copying" aria-label="More options">⋯</summary><div class="dmb-menu">
                    <label class="dmb-check"><input id="dmb-show-guides" type="checkbox">Show all guides</label><label class="dmb-check"><input id="dmb-preview-all" type="checkbox">Preview all</label>
                    <div class="dmb-actions"><button type="button" id="dmb-copy-movement">Copy movement</button><button type="button" id="dmb-paste-movement" disabled>Paste movement</button></div>
                    <p class="dmb-help">Green marks the start. Dots mark waypoints. Arrows show travel.</p>
                </div></details>
                <button type="button" id="dmb-close" aria-label="Close physics">×</button></div></header>
            <p id="dmb-selection">Click a block to edit its physics.</p>
            <p id="dmb-warning" role="status" hidden></p>
            <form id="dmb-form"><div class="dmb-controls"><fieldset id="dmb-fields" disabled>
                <label>Movement<select id="dmb-movement"><option value="none">Static</option><option value="spin">Spin</option><option value="path">Linear path</option><option value="circle">Circular path</option></select></label>
                <div id="dmb-spin" hidden>
                    <div class="dmb-grid"><label>Axis<select id="dmb-axis"><option value="y">Y · vertical</option><option value="x">X</option><option value="z">Z</option><option value="custom">Custom</option></select></label>
                    <label>Pivot<select id="dmb-pivot"><option value="centre">Centre</option><option value="corner">Corner</option><option value="custom">Custom</option></select></label></div>
                    <div id="dmb-axis-vector" class="dmb-vector" hidden>${axes.map(axis => `<label>Axis ${axis.toUpperCase()}<input id="dmb-axis-${axis}" type="number" step="any" required></label>`).join('')}</div>
                    <label id="dmb-corner-row" hidden>Corner<select id="dmb-corner">${['---', '--+', '+--', '+-+', '-+-', '-++', '++-', '+++'].map(corner => `<option value="${corner}">${corner[1] === '-' ? 'Bottom' : 'Top'} · X${corner[0]} Z${corner[2]}</option>`).join('')}</select></label>
                    <div id="dmb-pivot-vector" hidden><p>Pivot offsets from the block's starting centre.</p><div class="dmb-vector">${axes.map(axis => `<label>Pivot ${axis.toUpperCase()}<input id="dmb-pivot-${axis}" type="number" step="any" min="-4096" max="4096" required></label>`).join('')}</div></div>
                    <div class="dmb-grid"><label>Speed (°/second)<input id="dmb-speed" type="number" step="any" min="0" max="90" value="30" required></label>
                    <label>Direction<select id="dmb-direction"><option value="1">Clockwise</option><option value="-1">Anticlockwise</option></select></label></div>
                </div>
                <div id="dmb-path" hidden>
                    <p>Waypoints are offsets from the block's starting position.</p>
                    <table><thead><tr><th>X</th><th>Y</th><th>Z</th><th></th></tr></thead><tbody id="dmb-points"></tbody></table>
                    <div class="dmb-actions"><button type="button" id="dmb-add-point">Add waypoint</button>
                    <button type="button" id="dmb-reverse-points">Reverse waypoints</button></div>
                </div>
                <div id="dmb-circle" hidden><div class="dmb-grid"><label>Radius<input id="dmb-radius" type="number" step="any" min=".25" max="16" value="3" required></label><label>Plane<select id="dmb-plane"><option value="xz">XZ · horizontal</option><option value="xy">XY · vertical</option><option value="yz">YZ · vertical</option></select></label></div>
                    <label>Direction<select id="dmb-circle-direction"><option value="1">Clockwise</option><option value="-1">Anticlockwise</option></select></label></div>
                <div id="dmb-travel" class="dmb-grid" hidden><label>Cycle (seconds)<input id="dmb-duration" type="number" step="any" min="1" value="8" required></label><label id="dmb-repeat-row">Repeat<select id="dmb-loop"><option value="pingpong">Back and forth</option><option value="loop">Loop</option><option value="snap">Snap back to start</option></select></label></div>
                <div id="dmb-facing" hidden><label class="dmb-check"><input id="dmb-orient" type="checkbox">Face travel direction</label>
                    <div class="dmb-grid"><label id="dmb-turn-row">Turn time (seconds)<input id="dmb-turn" type="number" step=".05" min="0" max="10" value=".25" required><small>0 = snap at corners</small></label><label id="dmb-offset-row">Facing offset (°)<input id="dmb-heading-offset" type="number" step="any" min="-3600" max="3600" value="0" required></label></div></div>
                <table id="dmb-rider-row" class="dmb-rules" hidden><thead><tr><th></th><th>Players</th><th>Items</th></tr></thead><tbody>
                    <tr><th scope="row">Collide</th><td><input id="dmb-collide-players" type="checkbox" checked aria-label="Players collide" title="Players stand on and bump into the block"></td><td><input id="dmb-collide-items" type="checkbox" checked aria-label="Items collide" title="Grenades bounce off and ride the block"></td></tr>
                    <tr id="dmb-rotate-row"><th scope="row">Rotate with block</th><td><input id="dmb-rotate-players" type="checkbox" aria-label="Players rotate with block" title="Turns the view horizontally while riding"></td><td><input id="dmb-rotate-items" type="checkbox" checked aria-label="Items rotate with block" title="Grenades are carried round by the turn instead of staying put"></td></tr>
                </tbody></table>
                <label id="dmb-priority-row" hidden>Pushing into the map<select id="dmb-priority"><option value="map">Map wins</option><option value="block">Block pushes through</option></select></label>
                <label id="dmb-phase-row" hidden>Time offset (seconds)<input id="dmb-phase" type="number" step="any" value="0" required></label>
                </fieldset></div>
                <footer><button type="submit" id="dmb-apply" disabled>Apply</button><button type="button" id="dmb-preview" disabled>Preview</button><button type="button" id="dmb-reset" disabled>Reset</button></footer>
            </form>
            <p id="dmb-status" role="status">Click a block to select it. Close Physics to build again.</p>`;
        document.getElementById('editorUi').appendChild(panel);
        for (var control of panel.querySelectorAll('button')) control.classList.add('button');
        button.onclick = () => setEnabled(!enabled); $('close').onclick = () => setEnabled(false);
        $('show-guides').checked = localStorage.getItem('dmbShowGuides') === 'true';
        $('show-guides').onchange = () => { localStorage.setItem('dmbShowGuides', String($('show-guides').checked)); refreshGuides(); markMore(); };
        markMore();
        $('preview-all').onchange = () => { if ($('preview-all').checked) startPreview(true); else { stopPreview(); updateMarker(); } markMore(); };
        document.addEventListener('pointerdown', event => { if ($('more').open && !$('more').contains(event.target)) $('more').open = false; });
        panel.addEventListener('keydown', event => { if (event.code === 'Escape' && $('more').open) { $('more').open = false; $('more').firstElementChild.focus(); } });
        for (var event of ['keydown', 'keyup']) panel.addEventListener(event, e => e.stopPropagation());
        document.addEventListener('keydown', event => {
            if (!enabled || panel.contains(event.target)) return;
            if (event.code === 'Escape') { setEnabled(false); event.stopImmediatePropagation(); return; }
            if (event.target !== canvas) return;
            if (event.code === 'KeyZ' && (event.ctrlKey || event.metaKey)) return;
            if (['KeyR', 'KeyF', 'KeyX', 'KeyZ', 'Space', 'Delete', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.stopImmediatePropagation();
        }, true);
        $('form').addEventListener('input', fieldsChanged); $('form').addEventListener('change', fieldsChanged);
        $('copy-movement').onclick = () => {
            if (!$('form').reportValidity()) return;
            try {
                var body = readBody();
                if (!PlatformMap.read({ ...map, extents: { platforms: [body] } }).length) throw new Error('Check the movement settings before copying.');
                movementClipboard = state.copyMovement(body, $('pivot').value, $('corner').value);
                try { localStorage.setItem('dmbMovementClipboard', JSON.stringify(movementClipboard)); } catch {};
                $('paste-movement').disabled = false; message('Movement copied. Select another block and press Paste movement.');
            } catch (error) { message(error.message); };
        };
        $('paste-movement').onclick = () => {
            if (!selected || !movementClipboard) return;
            if (showSelection(selected, movementClipboard)) message('Movement pasted. Preview it or press Apply to save.');
        };
        $('add-point').onclick = () => { pointRow(pointValue($('points').lastElementChild)); fieldsChanged(); };
        $('reverse-points').onclick = () => { $('points').replaceChildren(...Array.from($('points').children).reverse()); fieldsChanged(); };
        $('reset').onclick = () => { if (selected) showSelection(selected); };
        $('form').onsubmit = event => {
            event.preventDefault();
            try {
                var body = readBody();
                if (!PlatformMap.read({ ...map, extents: { platforms: [body] } }).length) throw new Error('Check the settings. Spin: up to 90°/s. Path: at least 1 second, up to 16 blocks/s.');
                undoPoint(); state.apply(body, map); restShapes();
                var backups = localStorage.getItem('mapBackups');
                saveToLocal();
                if (backups !== null) localStorage.setItem('mapBackups', backups);
                showSelection(selected); message('Physics saved.');
            } catch (error) { message(error.message); };
        };
        $('preview').onclick = () => {
            if (previewMode) { stopPreview(); updateMarker(); return; }
            startPreview(false);
        };
        attach();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUi);
    else initUi();
})();
