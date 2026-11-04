//plugin: dynamicmapblocks, editor only
(() => {
    var state = new PlatformEditorState(), selected, enabled = false, preview, legacyView;
    var hidden = [], attachedScene, selectionBox, pivotDot, boundsKey, swept = [], guides, guideKey;
    var $ = id => document.getElementById('dmb-' + id);
    var teamOptions = chosen => [['all', 'All'], ['none', 'Off'], ['blue', 'Blue'], ['red', 'Red']].map(([value, name]) => `<option value="${value}"${value === chosen ? ' selected' : ''}>${name}</option>`).join(''); //who an option is for: everyone, nobody or one team
    var teamRead = id => ({ all: true, none: false, blue: 'blue', red: 'red' })[$(id).value];
    var teamWrite = (id, value, fallback) => { value ??= fallback; $(id).value = value === true ? 'all' : value === false ? 'none' : value; };
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
            var previewWorld = new PlatformWorld(moving, mapMeshes);
            for (var triggered of previewWorld.triggered) triggered.progress.fn = time => { //shows the whole track out and back, as if something kept setting it off and letting go
                var along = time / PlatformMotion.triggerLength(triggered.definition.motion) % 2;
                return along < 1 ? along : 2 - along;
            };
            var next = moving.length ? PlatformRender.create(scene, previewWorld, mapMeshes,
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
    function pointRows() { return Array.from($('points').tBodies || []); };
    function pointRow(point = {}) { //a waypoint is two lines: where it is, and optionally how the block is turned there
        var row = document.createElement('tbody'), main = document.createElement('tr'), turn = document.createElement('tr');
        row.className = 'dmb-point'; turn.className = 'dmb-rotation';
        var field = (line, attribute, axis, value, label) => {
            var cell = document.createElement('td'), input = document.createElement('input');
            input.type = 'number'; input.step = 'any'; input.required = true; input.value = value || 0;
            input.dataset[attribute] = axis; input.title = label; cell.appendChild(input); line.appendChild(cell);
        };
        for (var axis of axes) {
            field(main, 'axis', axis, point[axis], axis.toUpperCase());
            field(turn, 'rotation', axis, point.rotation?.[axis], 'Rotation about ' + axis.toUpperCase() + ' here (degrees)');
        };
        var cell = document.createElement('td'), remove = document.createElement('button');
        remove.type = 'button'; remove.className = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Remove waypoint');
        remove.onclick = () => { row.remove(); fieldsChanged(); };
        cell.appendChild(remove); main.appendChild(cell);
        var use = document.createElement('input'), box = document.createElement('td');
        use.type = 'checkbox'; use.dataset.rotationOn = '1'; use.checked = !!point.rotation; use.title = 'Turn the block here. Unticked, it keeps the rotation from the waypoint before (the first starts as placed).';
        use.onchange = fieldsChanged; box.appendChild(use); turn.appendChild(box);
        row.appendChild(main); row.appendChild(turn); $('points').appendChild(row); numberPoints();
    };
    function pointValue(row) {
        var value = Object.fromEntries(axes.map(axis => [axis, Number(row.querySelector('[data-axis="' + axis + '"]').value)]));
        if ($('keyframes').checked && row.querySelector('[data-rotation-on]').checked) value.rotation = Object.fromEntries(axes.map(axis => [axis, Number(row.querySelector('[data-rotation="' + axis + '"]').value)]));
        return value;
    };
    function numberPoints() {
        var rows = pointRows();
        rows.forEach((row, i) => {
            var on = row.querySelector('[data-rotation-on]').checked;
            for (var axis of axes) {
                row.querySelector('[data-axis="' + axis + '"]').setAttribute('aria-label', 'Waypoint ' + (i + 1) + ' ' + axis.toUpperCase());
                var turn = row.querySelector('[data-rotation="' + axis + '"]');
                turn.setAttribute('aria-label', 'Waypoint ' + (i + 1) + ' rotation ' + axis.toUpperCase()); turn.disabled = !on;
            };
            row.querySelector('[data-rotation-on]').setAttribute('aria-label', 'Rotate at waypoint ' + (i + 1));
            row.querySelector('.dmb-rotation').hidden = !$('keyframes').checked;
            row.querySelector('button').disabled = rows.length <= 2;
        });
        $('add-point').disabled = rows.length >= 64;
    };
    function pivotValue(body) { //where it turns about: the centre, the middle of a side, a corner, or a point of your own
        var mode = $('pivot').value;
        return mode === 'custom' ? vectorValue('pivot') : state.pivot(body, mapMeshes, mode === 'corner' ? $('corner').value : mode === 'side' ? $('side').value : null, $('centre').value);
    };
    function turns() { //whether the block turns at all as set up
        var type = $('movement').value;
        return type === 'spin' || (['path', 'circle'].includes(type) && ($('orient').checked || (type === 'path' && $('keyframes').checked && pointRows().some(row => row.querySelector('[data-rotation-on]').checked))));
    };
    function readBody() {
        var body = currentBody(), type = $('movement').value;
        if (!body) throw new Error('Pick a block first.');
        if (type === 'spin') {
            var axis = $('axis').value === 'custom' ? vectorValue('axis') : { [$('axis').value]: 1 };
            var pivot = pivotValue(body);
            body.motion = { type, axis, pivot, speed: Number($('speed').value) * Number($('direction').value), phase: Number($('phase').value) };
        } else if (type === 'path') {
            var points = pointRows().map(pointValue);
            body.motion = { type, points, duration: Number($('duration').value), loop: $('loop').value, phase: Number($('phase').value) };
        } else if (type === 'circle') {
            body.motion = { type, radius: Number($('radius').value), plane: $('plane').value, reverse: $('circle-direction').value === '-1',
                duration: Number($('duration').value), phase: Number($('phase').value) };
        } else body.motion = { type: 'none' };
        if (type !== 'none' && $('centre').value === 'mesh') body.motion.centre = 'mesh'; //cell is the default, so only the other is written down
        if (type === 'circle') for (var [key, prefix] of [['circleOffset', 'circle-offset'], ['circleRotation', 'circle-rotation']]) {
            var value = vectorValue(prefix);
            if (axes.some(axis => value[axis])) body.motion[key] = value; //zero is the default, so only a real one is written down
        };
        if (type === 'path' || type === 'circle') {
            body.motion.orient = $('orient').checked;
            if (turns()) body.motion.pivot = pivotValue(body);
            body.motion.turnDuration = Number($('turn').value);
            body.motion.headingOffset = Number($('heading-offset').value);
            if ($('turn-when').value !== 'after') body.motion.turnWhen = $('turn-when').value; //after is the default, so only the others are written down
        };
        if (type !== 'none') {
            body.motion.collidePlayers = teamRead('collide-players'); body.motion.collideItems = teamRead('collide-items'); body.motion.collideBullets = teamRead('collide-bullets');
            body.motion.pushThroughMap = $('priority').value === 'block';
            if ($('priority').value === 'crush') body.motion.crush = Number($('crush').value);
            if ($('trig-on').checked) body.motion.trigger = {
                source: $('trig-source').value, surface: $('trig-surface').value, players: teamRead('trig-players'), items: teamRead('trig-items'), bullets: teamRead('trig-bullets'),
                zone: { shape: $('zone-shape').value, follow: $('zone-follow').checked, radius: Number($('zone-radius').value), height: Number($('zone-height').value),
                    size: Object.fromEntries(axes.map(axis => [axis, Number($('zone-size-' + axis).value)])), offset: Object.fromEntries(axes.map(axis => [axis, Number($('zone-offset-' + axis).value)])) },
                mode: $('trig-mode').value, release: $('trig-release').value, returnSeconds: Number($('trig-return').value), angle: Number($('trig-angle').value),
                delayStart: Number($('trig-start').value), delayReset: Number($('trig-reset').value), cooldown: Number($('trig-cooldown').value) };
            if (type === 'spin' || (['path', 'circle'].includes(type) && body.motion.orient)) {
                body.motion.rotatePlayers = teamRead('rotate-players'); body.motion.rotateItems = teamRead('rotate-items');
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
            var sat = PlatformMotion.vector(body.motion.pivot); //in the mesh case the block sits moved onto the cell centre, and so does its pivot
            if (body.motion.centre === 'mesh' && body.blocks.length) { var meshMiddle = state.pivot(body, mapMeshes, null, 'mesh'); sat = sat.subtract(new BABYLON.Vector3(meshMiddle.x, 0, meshMiddle.z)); };
            pivotDot.position.copyFrom(BABYLON.Vector3.TransformCoordinates(sat, local));
            pivotDot.setEnabled(turns());
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
        $('rider-row').hidden = $('priority-row').hidden = $('trigger-box').hidden = $('centre-row').hidden = $('movement').value === 'none';
        $('crush-row').hidden = $('movement').value === 'none' || $('priority').value !== 'crush';
        var triggered = $('trig-on').checked && $('movement').value !== 'none';
        $('trig').hidden = !triggered;
        $('trig-surface-row').hidden = $('trig-source').value !== 'contact'; $('zone').hidden = $('trig-source').value !== 'zone';
        $('zone-radius-row').hidden = $('zone-shape').value === 'box'; $('zone-height-row').hidden = $('zone-shape').value !== 'cylinder'; $('zone-size-row').hidden = $('zone-shape').value !== 'box';
        $('trig-return-row').hidden = $('trig-release').value !== 'return'; $('trig-angle-row').hidden = $('movement').value !== 'spin';
        $('rotate-row').hidden = !turns();
        $('phase-row').hidden = $('movement').value === 'none';
        if (triggered) $('repeat-row').hidden = $('phase-row').hidden = true; //progress along the track replaces looping and the time offset
        $('axis-vector').hidden = $('axis').value !== 'custom';
        $('pivot-vector').hidden = $('pivot').value !== 'custom';
        $('corner-row').hidden = $('pivot').value !== 'corner'; $('side-row').hidden = $('pivot').value !== 'side';
        $('pivot-group').hidden = !turns();
        for (var group of ['spin', 'path', 'circle', 'travel', 'facing', 'repeat-row', 'turn-row', 'offset-row', 'rider-row', 'phase-row', 'axis-vector', 'pivot-group', 'pivot-vector', 'corner-row', 'side-row']) {
            for (var field of $(group).querySelectorAll('input, select, button')) field.disabled = false;
        };
        for (var group of ['spin', 'path', 'circle', 'travel', 'facing', 'repeat-row', 'turn-row', 'offset-row', 'phase-row', 'axis-vector', 'pivot-group', 'pivot-vector', 'corner-row', 'side-row']) {
            if ($(group).hidden) for (var field of $(group).querySelectorAll('input, select, button')) field.disabled = true;
        };
        $('rotate-players').disabled = $('collide-players').value === 'none'; $('rotate-items').disabled = $('collide-items').value === 'none'; //nothing to turn with if it does not collide
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
            $('centre').value = motion.centre === 'mesh' ? 'mesh' : 'cell';
            var pivot = motion.pivot || state.pivot(body, mapMeshes, null, motion.centre), centre = state.pivot(body, mapMeshes, null, motion.centre);
            $('pivot').value = axes.every(key => Math.abs((pivot[key] || 0) - centre[key]) < 1e-6) ? 'centre' : 'custom';
            for (var [mode, list] of [['side', $('side')], ['corner', $('corner')]]) for (var option of list.options) {
                var spot = state.pivot(body, mapMeshes, option.value, motion.centre);
                if (axes.every(key => Math.abs((pivot[key] || 0) - spot[key]) < 1e-6)) { $('pivot').value = mode; list.value = option.value; };
            };
            vectorFields('pivot', pivot);
            $('speed').value = Math.abs(motion.speed ?? 30); $('direction').value = (motion.speed ?? 30) < 0 ? '-1' : '1';
            $('phase').value = motion.phase || 0; $('duration').value = motion.duration || 8; $('loop').value = motion.loop || 'pingpong';
            $('radius').value = motion.radius || 3; $('plane').value = motion.plane || 'xz'; $('circle-direction').value = motion.reverse ? '-1' : '1';
            vectorFields('circle-offset', motion.circleOffset); vectorFields('circle-rotation', motion.circleRotation);
            teamWrite('rotate-players', motion.rotatePlayers, false); teamWrite('rotate-items', motion.rotateItems, true);
            $('priority').value = motion.pushThroughMap ? 'block' : motion.crush > 0 ? 'crush' : 'map'; $('crush').value = motion.crush > 0 ? motion.crush : 999;
            var trig = PlatformTriggers.config(motion);
            $('trig-on').checked = !!motion.trigger; $('trig-source').value = trig.source; $('trig-surface').value = trig.surface; teamWrite('trig-players', trig.players); teamWrite('trig-items', trig.items); teamWrite('trig-bullets', trig.bullets);
            $('zone-shape').value = trig.zone.shape; $('zone-follow').checked = !!trig.zone.follow; $('zone-radius').value = trig.zone.radius; $('zone-height').value = trig.zone.height;
            for (var key of axes) { $('zone-size-' + key).value = trig.zone.size[key]; $('zone-offset-' + key).value = trig.zone.offset[key]; };
            $('trig-mode').value = trig.mode; $('trig-release').value = trig.release; $('trig-return').value = trig.returnSeconds; $('trig-angle').value = trig.angle;
            $('trig-start').value = trig.delayStart; $('trig-reset').value = trig.delayReset; $('trig-cooldown').value = trig.cooldown;
            teamWrite('collide-players', motion.collidePlayers, true); teamWrite('collide-items', motion.collideItems, true); teamWrite('collide-bullets', motion.collideBullets, motion.collidePlayers !== false || motion.collideItems !== false);
            $('orient').checked = !!motion.orient; $('turn').value = motion.turnDuration ?? .25; $('turn-when').value = motion.turnWhen || 'after'; $('heading-offset').value = motion.headingOffset || 0;
            $('keyframes').checked = !!motion.points?.some(point => point.rotation);
            pointRows().forEach(row => row.remove()); (motion.points || [{}, { x: 4 }]).forEach(pointRow);
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
                <label id="dmb-centre-row" hidden>Centre on<select id="dmb-centre"><option value="cell">Cell centre (stays flush)</option><option value="mesh">Mesh centre (moved onto the cell centre)</option></select></label>
                <div id="dmb-spin" hidden>
                    <label>Axis<select id="dmb-axis"><option value="y">Y · vertical</option><option value="x">X</option><option value="z">Z</option><option value="custom">Custom</option></select></label>
                    <div id="dmb-axis-vector" class="dmb-vector" hidden>${axes.map(axis => `<label>Axis ${axis.toUpperCase()}<input id="dmb-axis-${axis}" type="number" step="any" required></label>`).join('')}</div>
                    <div class="dmb-grid"><label>Speed (°/second)<input id="dmb-speed" type="number" step="any" min="0" max="90" value="30" required></label>
                    <label>Direction<select id="dmb-direction"><option value="1">Clockwise</option><option value="-1">Anticlockwise</option></select></label></div>
                </div>
                <div id="dmb-path" hidden>
                    <p>Waypoints are offsets from the block's starting position.</p>
                    <label class="dmb-check"><input id="dmb-keyframes" type="checkbox">Rotate at waypoints (°)</label>
                    <table id="dmb-points" class="dmb-waypoints"><thead><tr><th>X</th><th>Y</th><th>Z</th><th></th></tr></thead></table>
                    <div class="dmb-actions"><button type="button" id="dmb-add-point">Add waypoint</button>
                    <button type="button" id="dmb-reverse-points">Reverse waypoints</button></div>
                </div>
                <div id="dmb-circle" hidden><div class="dmb-grid"><label>Radius<input id="dmb-radius" type="number" step="any" min=".25" max="16" value="3" required></label><label>Plane<select id="dmb-plane"><option value="xz">XZ · horizontal</option><option value="xy">XY · vertical</option><option value="yz">YZ · vertical</option></select></label></div>
                    <label>Direction<select id="dmb-circle-direction"><option value="1">Clockwise</option><option value="-1">Anticlockwise</option></select></label>
                    <p>Offset moves the circle's centre. Rotate turns the whole circle about its centre.</p>
                    <div class="dmb-vector">${axes.map(axis => `<label>Offset ${axis.toUpperCase()}<input id="dmb-circle-offset-${axis}" type="number" step="any" min="-64" max="64" value="0"></label>`).join('')}</div>
                    <div class="dmb-vector">${axes.map(axis => `<label>Rotate ${axis.toUpperCase()} (°)<input id="dmb-circle-rotation-${axis}" type="number" step="any" min="-3600" max="3600" value="0"></label>`).join('')}</div></div>
                <div id="dmb-travel" class="dmb-grid" hidden><label>Cycle (seconds)<input id="dmb-duration" type="number" step="any" min=".01" value="8" required></label><label id="dmb-repeat-row">Repeat<select id="dmb-loop"><option value="pingpong">Back and forth</option><option value="loop">Loop</option><option value="snap">Snap back to start</option></select></label></div>
                <div id="dmb-facing" hidden><label class="dmb-check"><input id="dmb-orient" type="checkbox">Face travel direction</label>
                    <div class="dmb-grid"><label id="dmb-turn-row">Turn time (seconds)<input id="dmb-turn" type="number" step=".05" min="0" max="10" value=".25" required><select id="dmb-turn-when" aria-label="When the turn happens"><option value="after">After the corner</option><option value="before">Before the corner</option><option value="both">Half before, half after</option></select><small>0 = snap at corners</small></label><label id="dmb-offset-row">Facing offset (°)<input id="dmb-heading-offset" type="number" step="any" min="-3600" max="3600" value="0" required></label></div></div>
                <div id="dmb-pivot-group" hidden>
                    <label>Pivot<select id="dmb-pivot"><option value="centre">Centre</option><option value="side">Side</option><option value="corner">Corner</option><option value="custom">Custom</option></select></label>
                    <label id="dmb-side-row" hidden>Side<select id="dmb-side">${[['+00', 'X+ side'], ['-00', 'X− side'], ['0+0', 'Top · Y+'], ['0-0', 'Bottom · Y−'], ['00+', 'Z+ side'], ['00-', 'Z− side']].map(([side, name]) => `<option value="${side}">${name}</option>`).join('')}</select></label>
                    <label id="dmb-corner-row" hidden>Corner<select id="dmb-corner">${['---', '--+', '+--', '+-+', '-+-', '-++', '++-', '+++'].map(corner => `<option value="${corner}">${corner[1] === '-' ? 'Bottom' : 'Top'} · X${corner[0]} Z${corner[2]}</option>`).join('')}</select></label>
                    <div id="dmb-pivot-vector" hidden><p>Pivot offsets from the block's starting centre.</p><div class="dmb-vector">${axes.map(axis => `<label>Pivot ${axis.toUpperCase()}<input id="dmb-pivot-${axis}" type="number" step="any" min="-4096" max="4096" required></label>`).join('')}</div></div>
                </div>
                <table id="dmb-rider-row" class="dmb-rules" hidden><thead><tr><th></th><th>Players</th><th>Items</th><th>Shots</th></tr></thead><tbody>
                    <tr><th scope="row">Collide</th><td><select id="dmb-collide-players" aria-label="Players collide" title="Who stands on and bumps into the block: everyone, nobody, or just one team">${teamOptions("all")}</select></td><td><select id="dmb-collide-items" aria-label="Items collide" title="Whose grenades bounce off and ride the block">${teamOptions("all")}</select></td><td><select id="dmb-collide-bullets" aria-label="Shots collide" title="Whose bullets and rockets are stopped by the block">${teamOptions("all")}</select></td></tr>
                    <tr id="dmb-rotate-row"><th scope="row">Rotate with block</th><td><select id="dmb-rotate-players" aria-label="Players rotate with block" title="Whose view turns horizontally while riding">${teamOptions("none")}</select></td><td><select id="dmb-rotate-items" aria-label="Items rotate with block" title="Whose grenades are carried round by the turn instead of staying put">${teamOptions("all")}</select></td><td class="dmb-na" title="Shots do not ride blocks">–</td></tr>
                </tbody></table>
                <label id="dmb-priority-row" hidden>Pushing into the map<select id="dmb-priority"><option value="map">Map wins</option><option value="block">Block pushes through</option><option value="crush">Crush</option></select></label>
                <label id="dmb-crush-row" hidden>Crush damage (hp)<input id="dmb-crush" type="number" step="1" min="1" max="9999" value="999" required><small>Hurts a player squeezed against the map, every half second. 999 is an instant kill</small></label>
                <div id="dmb-trigger-box" hidden><label class="dmb-check"><input id="dmb-trig-on" type="checkbox">Only move when triggered</label>
                    <div id="dmb-trig" hidden>
                        <div class="dmb-grid"><label>Triggered by<select id="dmb-trig-source"><option value="contact">Contact</option><option value="zone">Zone</option></select></label>
                            <label id="dmb-trig-surface-row">Contact on<select id="dmb-trig-surface"><option value="top">Roof</option><option value="sides">Walls</option><option value="any">Roof or walls</option></select></label></div>
                        <div class="dmb-teams" title="Who sets it off: everyone, nobody, or just one team. A bullet counts the moment it lands on the block, or inside the zone"><label>Players<select id="dmb-trig-players" aria-label="Players set it off" title="Players that set it off">${teamOptions("all")}</select></label><label>Items<select id="dmb-trig-items" aria-label="Items set it off" title="Grenades that set it off">${teamOptions("all")}</select></label><label>Shots<select id="dmb-trig-bullets" aria-label="Shots set it off" title="Bullets and rockets that set it off when they land">${teamOptions("none")}</select></label></div>
                        <div id="dmb-zone" hidden>
                            <div class="dmb-grid"><label>Zone shape<select id="dmb-zone-shape"><option value="sphere">Sphere</option><option value="box">Cube</option><option value="cylinder">Cylinder</option></select></label>
                                <label class="dmb-check"><input id="dmb-zone-follow" type="checkbox">Follows the block</label></div>
                            <div class="dmb-grid"><label id="dmb-zone-radius-row">Radius<input id="dmb-zone-radius" type="number" step="any" min=".25" max="64" value="3" required></label>
                                <label id="dmb-zone-height-row">Half height<input id="dmb-zone-height" type="number" step="any" min=".25" max="64" value="2" required></label></div>
                            <div id="dmb-zone-size-row" class="dmb-vector">${axes.map(axis => `<label>Half ${axis.toUpperCase()}<input id="dmb-zone-size-${axis}" type="number" step="any" min=".25" max="64" value="2" required></label>`).join('')}</div>
                            <div class="dmb-vector">${axes.map(axis => `<label>Offset ${axis.toUpperCase()}<input id="dmb-zone-offset-${axis}" type="number" step="any" min="-64" max="64" value="0" required></label>`).join('')}</div>
                        </div>
                        <div class="dmb-grid"><label>While triggered<select id="dmb-trig-mode"><option value="run">Run while triggered</option><option value="latch">Run once, then stay</option><option value="cycle">Cycle once</option></select></label>
                            <label>On release<select id="dmb-trig-release"><option value="pause">Pause</option><option value="reverse">Reverse</option><option value="return">Return at own speed</option><option value="snap">Snap to start</option></select></label></div>
                        <div class="dmb-grid"><label id="dmb-trig-return-row">Return (seconds)<input id="dmb-trig-return" type="number" step="any" min=".5" max="600" value="2" required></label>
                            <label id="dmb-trig-angle-row">Turn angle (°)<input id="dmb-trig-angle" type="number" step="any" min="1" max="3600" value="90" required></label></div>
                        <div class="dmb-vector"><label>Start delay<input id="dmb-trig-start" type="number" step=".05" min="0" max="60" value="0" required></label><label>Reset delay<input id="dmb-trig-reset" type="number" step=".05" min="0" max="60" value="0" required></label><label>Cooldown<input id="dmb-trig-cooldown" type="number" step=".05" min="0" max="600" value="0" required></label></div>
                    </div></div>
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
                movementClipboard = state.copyMovement(body, $('pivot').value, $('pivot').value === 'side' ? $('side').value : $('corner').value);
                try { localStorage.setItem('dmbMovementClipboard', JSON.stringify(movementClipboard)); } catch {};
                $('paste-movement').disabled = false; message('Movement copied. Select another block and press Paste movement.');
            } catch (error) { message(error.message); };
        };
        $('paste-movement').onclick = () => {
            if (!selected || !movementClipboard) return;
            if (showSelection(selected, movementClipboard)) message('Movement pasted. Preview it or press Apply to save.');
        };
        $('add-point').onclick = () => { pointRow(pointValue(pointRows().at(-1))); fieldsChanged(); };
        $('reverse-points').onclick = () => { pointRows().reverse().forEach(row => $('points').appendChild(row)); fieldsChanged(); };
        $('reset').onclick = () => { if (selected) showSelection(selected); };
        $('form').onsubmit = event => {
            event.preventDefault();
            try {
                var body = readBody();
                if (!PlatformMap.read({ ...map, extents: { platforms: [body] } }).length) throw new Error('Check the settings. Spin: up to 90°/s. Path: up to 16 blocks/s.');
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
