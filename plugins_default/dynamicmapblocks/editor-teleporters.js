//plugin: dynamicmapblocks, editor only
(() => {
    var state = new TeleporterEditorState(), selected, enabled = false, picking = false, staged = new Map(), clipboard;
    var attachedScene, selectionBox, guides, guideKey, preview, previewMode = null, previewKey;
    var $ = id => document.getElementById('dmb-tp-' + id);
    var teamOptions = chosen => [['all', 'All'], ['none', 'Off'], ['blue', 'Blue'], ['red', 'Red']].map(([value, name]) => `<option value="${value}"${value === chosen ? ' selected' : ''}>${name}</option>`).join(''); //who an option is for: everyone, nobody or one team
    var teamRead = id => ({ all: true, none: false, blue: 'blue', red: 'red' })[$(id).value];
    var teamWrite = (id, value) => { $(id).value = value === true ? 'all' : value === false ? 'none' : value; };
    var axes = ['x', 'y', 'z'], offset = { x: .5, y: .5, z: .5 };
    try { clipboard = JSON.parse(localStorage.getItem('dmbTeleportClipboard')); } catch {};

    function message(text) { if ($('status')) $('status').textContent = text; };
    function vectorFields(prefix, value) { for (var axis of axes) $(prefix + '-' + axis).value = value?.[axis] || 0; };
    function vectorValue(prefix) { return Object.fromEntries(axes.map(axis => [axis, Number($(prefix + '-' + axis).value)])); };
    function sameBlock(a, b) { return a.x === b.x && a.y === b.y && a.z === b.z; };
    function currentPad() { return selected ? state.draft(selected.block) : null; };
    function everyPad() { return [...state.pads, ...staged.values()]; };
    function triggeredIds() { return PlatformTeleporters.triggered?.() || []; };
    function fillLinks(chosen) { //every other pad, saved or about to be, for this one to send to
        var own = selected && currentPad().id;
        $('link').innerHTML = '<option value="">Nobody yet</option>' + everyPad().filter(def => def.id !== own).map(def => `<option value="${def.id}">${def.id}</option>`).join('');
        $('link').value = chosen && everyPad().some(def => def.id === chosen) ? chosen : '';
    };
    function fillPower(chosen) {
        var ids = triggeredIds();
        if (chosen && !ids.includes(chosen)) ids = [...ids, chosen];
        $('power').innerHTML = '<option value="">Always on</option>' + ids.map(id => `<option value="${id}">${id}</option>`).join('');
        $('power').value = chosen || '';
    };
    function readPad() {
        var pad = currentPad(), dest = $('dest').value;
        if (!pad) throw new Error('Pick a block first.');
        pad.send = $('mode').value === 'send';
        pad.to = dest === 'link' ? { type: 'link', ...($('link').value && { id: $('link').value }) } : { type: dest, ...vectorValue('to'), facing: Number($('to-facing').value) };
        pad.side = $('side').value; if (pad.side === 'top') delete pad.side; //top and unturned is how it always was, so it is not written down
        pad.rotation = Number($('spin').value); if (!pad.rotation) delete pad.rotation;
        pad.exit = vectorValue('exit'); pad.facing = Number($('facing').value); pad.keepOffset = $('keep').checked;
        pad.zone = { shape: $('zone-shape').value, radius: Number($('zone-radius').value), height: Number($('zone-height').value), size: vectorValue('zone-size'), offset: vectorValue('zone-offset') };
        pad.players = teamRead('players'); pad.items = teamRead('items'); pad.bullets = teamRead('bullets');
        pad.velocity = $('velocity').value; pad.speed = Number($('speed').value); pad.view = $('view').value;
        pad.charge = Number($('charge').value); pad.cooldown = Number($('cooldown').value);
        if ($('power').value) pad.power = { id: $('power').value, when: $('power-when').value }; else delete pad.power;
        pad.look = { color: Number($('colour').value), pad: $('portal').checked, puff: $('puff').checked };
        if (pad.power) { //how it looks without power only matters if it can be without
            if ($('off').value !== 'dim') pad.look.off = $('off').value;
            if ($('off-colour').value !== '') pad.look.offColor = Number($('off-colour').value);
        };
        return pad;
    };
    function clearSelection() {
        selected = null; picking = false; staged.clear();
        if (selectionBox) selectionBox.setEnabled(false);
        if ($('fields')) { $('fields').disabled = true; $('selection').textContent = 'Click a block to make it a teleporter.'; }
        for (var id of ['apply', 'preview', 'reset']) if ($(id)) $(id).disabled = true;
        if ($('preview') && previewMode) $('preview').disabled = false;
        if ($('warning')) $('warning').hidden = true;
        if ($('pick')) $('pick').classList.remove('dmb-picking');
        if ($('mode')) { $('mode').value = 'off'; fieldsChanged(); } //nothing but the first choice until a block is picked
        if (guides) guides.dispose(); guides = null; guideKey = null;
    };
    function warnings(pad) {
        var notes = [], c = PlatformTeleporters.config(pad);
        if (c.send && c.to.type === 'link' && !c.to.id) notes.push('Sends to nobody yet. Pick a teleporter to send to.');
        else if (c.send && c.to.type === 'link' && !everyPad().some(def => def.id === c.to.id)) notes.push('Sends to a missing teleporter. Pick another.');
        if (c.send && c.power && !triggeredIds().includes(c.power.id)) notes.push('Powered by a block that is gone.');
        return notes;
    };
    function refreshGuides() {
        if (!scene || !$('show-guides')) return;
        var pads = $('show-guides').checked ? everyPad() : [];
        if (enabled && selected && $('mode').value !== 'off') {
            try {
                var draft = readPad();
                if (PlatformTeleporters.read({ width: map.width, height: map.height, depth: map.depth, extents: { teleporters: [draft] } }).length) { pads = pads.filter(def => def.id !== draft.id); pads.push(draft); };
            } catch {};
            for (var def of staged.values()) if (!pads.some(item => item.id === def.id)) pads.push(def);
        };
        var key = JSON.stringify(pads);
        if (key === guideKey) return;
        if (guides) guides.dispose();
        guides = TeleporterGuides.create(scene, pads, offset, selected && currentPad().id); guideKey = key;
    };
    function disposePreview() { if (preview) preview.dispose(); preview = null; };
    function stopPreview() {
        var was = previewMode;
        disposePreview(); previewMode = null; previewKey = null;
        if ($('preview')) { $('preview').textContent = 'Preview'; $('preview').disabled = !selected; }
        if ($('preview-all')) $('preview-all').checked = false;
        if (was) message('Preview stopped.');
    };
    function previewPads() { //what is shown: every pad, or the one being edited and where it sends
        var pads = previewMode === 'all' ? everyPad() : [];
        if (selected && $('mode').value !== 'off') {
            var draft = readPad(); pads = pads.filter(def => def.id !== draft.id); pads.push(draft);
            var target = draft.to.type === 'link' && everyPad().find(def => def.id === draft.to.id);
            if (target && !pads.includes(target)) pads.push(target);
        };
        return pads;
    };
    function refreshPreview() {
        if (!previewMode || !scene) return;
        try {
            if (selected && !$('form').checkValidity()) return;
            var pads = previewPads(), key = JSON.stringify(pads);
            if (key === previewKey) return;
            disposePreview(); previewKey = key;
            var world = { teleporterIndex: new Map(pads.map(def => [def.id, def])) }, shift = PlatformTeleporters.vector(offset), started = performance.now() / 1000;
            var render = TeleporterRender.create(scene, pads, offset, { always: true, active: def => !($('show-off').checked && def.power) }), eggs = [], material = new BABYLON.StandardMaterial('teleporter-egg', scene);
            material.disableLighting = true; material.emissiveColor = new BABYLON.Color3(1, 1, 1);
            for (var def of pads) {
                var spot = PlatformTeleporters.config(def).send && PlatformTeleporters.resolve(world, def, null);
                if (!spot) continue;
                var zone = PlatformTeleporters.zoneCentre(def), from = new BABYLON.Vector3(zone.x, zone.y, zone.z).subtract(shift), to = new BABYLON.Vector3(spot.x, spot.y + .3, spot.z).subtract(shift);
                var egg = BABYLON.MeshBuilder.CreateSphere('teleporter-egg', { diameter: .3, segments: 8 }, scene);
                egg.material = material; egg.isPickable = false; egg.renderingGroupId = 1;
                eggs.push({ egg, from, to, control: from.add(to).scale(.5).add(BABYLON.Axis.Y.scale(Math.max(1, BABYLON.Vector3.Distance(from, to) * .25))) });
            };
            var observer = scene.onBeforeRenderObservable.add(() => { //an egg goes in, hops, comes out, and a moment later does it again
                var t = (performance.now() / 1000 - started) % 1.4 / .8;
                for (var item of eggs) {
                    item.egg.isVisible = t <= 1.25; var u = Math.min(1, t);
                    item.egg.position = item.from.scale((1 - u) * (1 - u)).add(item.control.scale(2 * u * (1 - u))).add(item.to.scale(u * u));
                };
            });
            preview = { dispose() { scene.onBeforeRenderObservable.remove(observer); render.dispose(); eggs.forEach(item => item.egg.dispose()); material.dispose(); } };
            $('preview').textContent = 'Stop preview'; $('preview').disabled = false; $('preview-all').checked = previewMode === 'all';
        } catch (error) { message(error.message); };
    };
    function startPreview(all) {
        if (selected && !$('form').reportValidity()) { $('preview-all').checked = previewMode === 'all'; return; }
        previewMode = all ? 'all' : 'selected'; previewKey = null;
        refreshPreview();
        message(all ? 'Previewing every teleporter.' : 'Previewing. Stop to see the map as it is.');
    };
    function updateMarker() {
        if (!enabled || !selected || !selectionBox) return;
        selectionBox.position.set(selected.block.x, selected.block.y, selected.block.z); selectionBox.scaling.set(1.04, 1.04, 1.04);
        selectionBox.setEnabled(true);
    };
    function markMore() { $('more').classList.toggle('dmb-active', $('show-guides').checked || $('preview-all').checked || $('show-off').checked); };
    function fieldsChanged() {
        var mode = $('mode').value, dest = $('dest').value, shape = $('zone-shape').value;
        for (var part of $('panel').querySelectorAll('[data-for]')) part.hidden = part.dataset.for === 'send' ? mode !== 'send' : mode === 'off';
        $('link-box').hidden = dest !== 'link'; $('where').hidden = dest === 'link'; $('both').parentElement.hidden = !$('link').value;
        $('zone-radius-row').hidden = shape === 'box'; $('zone-height-row').hidden = shape !== 'cylinder'; $('zone-size-row').hidden = shape !== 'box';
        $('speed-row').hidden = $('velocity').value !== 'set'; $('power-when-row').hidden = !$('power').value; $('off-row').hidden = !$('power').value;
        for (var field of $('fields').querySelectorAll('input, select, button')) field.disabled = !!field.closest('[hidden]'); //what is not shown is not asked for
        $('paste').disabled = !clipboard;
        var notes = selected && mode !== 'off' ? warnings(readPad()) : [];
        $('warning').hidden = !notes.length; $('warning').textContent = notes.join(' ');
        markMore(); refreshPreview(); updateMarker(); refreshGuides();
    };
    function showSelection(selection, settings) {
        state.sync(map, mapMeshes); selected = selection; picking = false; $('pick').classList.remove('dmb-picking');
        try {
            var block = selection.block, cell = map.data[block.x]?.[block.y]?.[block.z];
            if (!cell?.idx || mapMeshes[cell.idx]?.name !== block.mesh) throw new Error('That block is gone. Pick another block.');
            var saved = !!state.forBlock(block), pad = state.draft(block);
            if (settings) pad = state.pasteSettings(pad, settings);
            var c = PlatformTeleporters.config(pad);
            $('selection').textContent = block.mesh + ' · ' + axes.map(axis => block[axis]).join(', ') + (saved ? '' : ' · not a teleporter yet');
            $('fields').disabled = false;
            for (var id of ['apply', 'preview', 'reset']) $(id).disabled = false;
            $('mode').value = !saved && !settings ? 'off' : c.send ? 'send' : 'receive';
            $('dest').value = c.to.type; fillLinks(c.to.id);
            $('both').checked = c.to.type === 'link' && everyPad().some(def => def.id === c.to.id && def.to?.type === 'link' && def.to.id === pad.id);
            vectorFields('to', c.to); $('to-facing').value = c.to.facing ?? c.facing;
            vectorFields('exit', c.exit); $('facing').value = c.facing; $('keep').checked = !!c.keepOffset;
            $('side').value = c.side; $('spin').value = c.rotation;
            $('zone-shape').value = c.zone.shape; $('zone-radius').value = c.zone.radius; $('zone-height').value = c.zone.height;
            vectorFields('zone-size', c.zone.size); vectorFields('zone-offset', c.zone.offset);
            teamWrite('players', c.players); teamWrite('items', c.items); teamWrite('bullets', c.bullets);
            $('velocity').value = c.velocity; $('speed').value = c.speed; $('view').value = c.view; $('charge').value = c.charge; $('cooldown').value = c.cooldown;
            fillPower(c.power?.id); $('power-when').value = c.power?.when || 'moved';
            $('colour').value = c.look.color; $('portal').checked = !!c.look.pad; $('puff').checked = !!c.look.puff;
            $('off').value = c.look.off; $('off-colour').value = c.look.offColor ?? '';
            fieldsChanged(); message(saved ? 'Change what it does and press Apply.' : 'Choose what this block does and press Apply.'); return true;
        } catch (error) { clearSelection(); message(error.message); return false; };
    };
    function choose(selection, settings) { //a preview that was playing moves on with you to the next block
        var following = previewMode === 'selected' && (!selected || !sameBlock(selected.block, selection.block));
        staged.clear();
        if (following) stopPreview();
        var shown = showSelection(selection, settings);
        if (following && shown && $('mode').value !== 'off') startPreview(false);
        return shown;
    };
    function pickTarget(block) { //the block to send to: a teleporter already, or one made now to receive
        picking = false; $('pick').classList.remove('dmb-picking');
        if (sameBlock(block, selected.block)) { message("A teleporter can't send to itself."); return; };
        var other = everyPad().find(def => sameBlock(def.block, block));
        if (!other) { other = { id: state.freeId([...staged.keys(), currentPad().id]), block, send: false, to: { type: 'link' } }; staged.set(other.id, other); };
        $('dest').value = 'link'; fillLinks(other.id); fieldsChanged();
        message('Sends to ' + other.id + '. Press Apply to save.');
    };
    function pickBlock(pick) {
        var mesh = pick?.pickedMesh;
        if (!pick?.hit || !mesh || mesh.name === 'ground' || mesh.metadata?.platformEditorBody || mesh.metadata?.platformPreviewSelection) return;
        while (mesh.parent && mesh.parent !== mapContainer) mesh = mesh.parent;
        if (mesh.parent !== mapContainer) return;
        var pos = mesh.position, cell = map.data[pos.x]?.[pos.y]?.[pos.z];
        if (!cell?.idx) return;
        var block = { mesh: mapMeshes[cell.idx].name, x: pos.x, y: pos.y, z: pos.z };
        if (picking) pickTarget(block); else choose({ block });
    };
    function attach() {
        if (!scene || scene === attachedScene) return;
        attachedScene = scene;
        selectionBox = BABYLON.MeshBuilder.CreateBox('teleporter-selection', { size: 1 }, scene);
        var material = new BABYLON.StandardMaterial('teleporter-selection', scene);
        material.emissiveColor = new BABYLON.Color3(.13, .87, 1); material.disableLighting = true; material.wireframe = true;
        selectionBox.material = material; selectionBox.isPickable = false; selectionBox.setEnabled(false);
    };
    function setEnabled(value) {
        var physics = document.getElementById('dmb-panel');
        if (value && physics && !physics.hidden) document.getElementById('dmb-close').click(); //one panel at a time
        enabled = value; if (!enabled) { stopPreview(); picking = false; staged.clear(); } attach();
        document.body.classList.toggle('dmb-editing', enabled);
        $('panel').hidden = !enabled; $('open').setAttribute('aria-pressed', String(enabled));
        if (enabled) {
            document.exitPointerLock?.();
            if (selected) showSelection(selected); else clearSelection();
            message('Click a block to select it. Close Teleport to build again.');
        } else selectionBox?.setEnabled(false);
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
    plugins.on('game:editorInitMapBefore', () => { clearSelection(); state.pads = []; disposePreview(); previewKey = null; });
    plugins.on('game:editorInitMapAfter', () => { attach(); refreshGuides(); });
    plugins.on('game:editorLoadMapBefore', () => clearSelection());
    plugins.on('game:editorLoadMapAfter', data => { state.load(data.json ? JSON.parse(data.json) : null); attach(); refreshGuides(); });
    plugins.on('game:editorExtentsBefore', () => state.sync(map, mapMeshes));
    plugins.on('game:editorExtentsAfter', () => {
        if (!state.pads.length) return;
        var world = { teleporterIndex: new Map(state.pads.map(def => [def.id, def])) };
        for (var def of state.pads) { //where eggs come out has to be inside the map
            var spot = PlatformTeleporters.resolve(world, def, null);
            if (spot) for (var axis of axes) {
                extents[axis].min = Math.min(extents[axis].min, Math.floor(spot[axis]));
                extents[axis].max = Math.max(extents[axis].max, Math.floor(spot[axis]) + (axis === 'y' ? 1 : 0));
            };
        };
        for (var axis of axes) extents[{ x: 'width', y: 'height', z: 'depth' }[axis]] = extents[axis].max - extents[axis].min + 1;
        refreshGuides();
    });
    plugins.on('game:editorSaveMap', data => {
        if (state.pads.length) data.minMap.extents.teleporters = state.save(Object.fromEntries(axes.map(axis => [axis, extents[axis].min])));
        else delete data.minMap.extents.teleporters;
    });
    plugins.on('game:editorMoveMapAfter', data => {
        state.translate({ x: data.dx, y: data.dy, z: data.dz }); state.sync(map, mapMeshes); clearSelection();
        stopPreview(); refreshGuides();
    });

    function initUi() {
        var button = document.createElement('button');
        button.className = 'button'; button.id = 'dmb-tp-open'; button.textContent = 'Teleport'; button.setAttribute('aria-pressed', 'false');
        (document.getElementById('pluginButtons') || document.getElementById('editorUi')).appendChild(button);
        var panel = document.createElement('section');
        panel.id = 'dmb-tp-panel'; panel.className = 'box'; panel.hidden = true; panel.setAttribute('aria-labelledby', 'dmb-tp-heading');
        panel.innerHTML = `
            <header><h1 id="dmb-tp-heading">Teleporters</h1><div class="dmb-corner">
                <details id="dmb-tp-more" class="dmb-more"><summary title="Links, preview all and copying" aria-label="More options">⋯</summary><div class="dmb-menu">
                    <label class="dmb-check"><input id="dmb-tp-show-guides" type="checkbox">Show all links</label><label class="dmb-check"><input id="dmb-tp-preview-all" type="checkbox">Preview all</label>
                    <label class="dmb-check" title="Show pads that have a power block as they look without power"><input id="dmb-tp-show-off" type="checkbox">Show deactivated look</label>
                    <div class="dmb-actions"><button type="button" id="dmb-tp-copy">Copy settings</button><button type="button" id="dmb-tp-paste" disabled>Paste settings</button></div>
                    <p class="dmb-help">Green marks the way in. Arrows show where eggs come out and which way they face.</p>
                </div></details>
                <button type="button" id="dmb-tp-close" aria-label="Close teleporters">×</button></div></header>
            <p id="dmb-tp-selection">Click a block to make it a teleporter.</p>
            <p id="dmb-tp-warning" role="status" hidden></p>
            <form id="dmb-tp-form"><div class="dmb-controls"><fieldset id="dmb-tp-fields" disabled>
                <label>Teleporter<select id="dmb-tp-mode"><option value="off">Off</option><option value="send">Sends eggs</option><option value="receive">Exit only</option></select></label>
                <div data-for="send">
                    <h2 class="dmb-sub">Sends to</h2>
                    <label>Where<select id="dmb-tp-dest"><option value="link">Another teleporter</option><option value="point">A point</option><option value="offset">An offset</option></select></label>
                    <div id="dmb-tp-link-box">
                        <div class="dmb-link-row"><label>Teleporter<select id="dmb-tp-link"></select></label><button type="button" id="dmb-tp-pick" title="Click the block to send eggs to">Pick</button></div>
                        <label class="dmb-check" title="The other teleporter sends back here too"><input id="dmb-tp-both" type="checkbox">Both ways</label>
                    </div>
                    <div id="dmb-tp-where" hidden>
                        <div class="dmb-vector">${axes.map(axis => `<label>${axis.toUpperCase()}<input id="dmb-tp-to-${axis}" type="number" step="any" min="-4096" max="4096" value="0" required></label>`).join('')}</div>
                        <label>Exit facing (°)<input id="dmb-tp-to-facing" type="number" step="any" min="-3600" max="3600" value="0" required><small>0 is +Z, 90 is +X</small></label>
                    </div>
                </div>
                <div data-for="on">
                    <h2 class="dmb-sub">Exit</h2>
                    <div class="dmb-vector">${axes.map(axis => `<label>Exit ${axis.toUpperCase()}<input id="dmb-tp-exit-${axis}" type="number" step="any" min="-64" max="64" value="0" required></label>`).join('')}</div>
                    <label>Facing (°)<input id="dmb-tp-facing" type="number" step="any" min="-3600" max="3600" value="0" required><small>Where eggs land, from the block's centre. 0 is +Z, 90 is +X</small></label>
                    <h2 class="dmb-sub">Zone</h2>
                    <div class="dmb-grid"><label>Side<select id="dmb-tp-side">${Object.entries(PlatformTeleporters.sides).map(([value, side]) => `<option value="${value}">${side.name}</option>`).join('')}</select></label>
                        <label>Spin (°)<input id="dmb-tp-spin" type="number" step="any" min="-3600" max="3600" value="0" required></label></div>
                    <small>Which face of the block it sits on, and how far it is turned about that face. The zone's height runs out of the face</small>
                    <label>Shape<select id="dmb-tp-zone-shape"><option value="cylinder">Cylinder</option><option value="sphere">Sphere</option><option value="box">Cube</option></select></label>
                    <div class="dmb-grid"><label id="dmb-tp-zone-radius-row">Radius<input id="dmb-tp-zone-radius" type="number" step="any" min=".25" max="64" value=".45" required></label>
                        <label id="dmb-tp-zone-height-row">Half height<input id="dmb-tp-zone-height" type="number" step="any" min=".25" max="64" value=".75" required></label></div>
                    <div id="dmb-tp-zone-size-row" class="dmb-vector">${axes.map(axis => `<label>Half ${axis.toUpperCase()}<input id="dmb-tp-zone-size-${axis}" type="number" step="any" min=".25" max="64" value=".45" required></label>`).join('')}</div>
                    <div class="dmb-vector">${axes.map(axis => `<label>Offset ${axis.toUpperCase()}<input id="dmb-tp-zone-offset-${axis}" type="number" step="any" min="-64" max="64" value="0" required></label>`).join('')}</div>
                </div>
                <div data-for="send">
                    <h2 class="dmb-sub">Who it sends</h2>
                    <div class="dmb-teams" title="Who it sends: everyone, nobody, or just one team. A shot goes through the moment it flies into the zone"><label>Players<select id="dmb-tp-players" aria-label="Players it sends" title="Players it sends">${teamOptions('all')}</select></label><label>Items<select id="dmb-tp-items" aria-label="Items it sends" title="Grenades it sends">${teamOptions('all')}</select></label><label>Shots<select id="dmb-tp-bullets" aria-label="Shots it sends" title="Bullets and rockets it sends">${teamOptions('none')}</select></label></div>
                    <h2 class="dmb-sub">On the way</h2>
                    <div class="dmb-grid"><label>Speed<select id="dmb-tp-velocity"><option value="keep">Keep</option><option value="stop">Stop dead</option><option value="turn">Turn with the exit</option><option value="set">Launch</option></select></label>
                        <label>View<select id="dmb-tp-view"><option value="keep">Keep</option><option value="turn">Turn with the exit</option><option value="face">Face the exit</option></select></label></div>
                    <label id="dmb-tp-speed-row">Launch (blocks/second)<input id="dmb-tp-speed" type="number" step="any" min="0" max="30" value="8" required><small>Friction slows it fast, so a launch carries a few blocks</small></label>
                    <div class="dmb-grid"><label>Charge (seconds)<input id="dmb-tp-charge" type="number" step=".05" min="0" max="10" value="0" required><small>Stand in it this long first</small></label>
                        <label>Cooldown (seconds)<input id="dmb-tp-cooldown" type="number" step=".05" min="0" max="60" value=".5" required><small>Before an egg can hop again</small></label></div>
                    <label class="dmb-check" title="Come out as far off the middle as you went in, turned round with the exit"><input id="dmb-tp-keep" type="checkbox">Keep position in zone</label>
                    <h2 class="dmb-sub">Power</h2>
                    <label>Powered by<select id="dmb-tp-power"></select></label>
                    <label id="dmb-tp-power-when-row">Works while<select id="dmb-tp-power-when"><option value="moved">It has moved</option><option value="end">It is at the end</option><option value="start">It is at the start</option></select></label>
                </div>
                <div data-for="on">
                    <h2 class="dmb-sub">Look</h2>
                    <label>Colour<select id="dmb-tp-colour">${PlatformTeleporters.palette.map(([name], index) => `<option value="${index}">${name}</option>`).join('')}</select></label>
                    <div class="dmb-grid"><label class="dmb-check"><input id="dmb-tp-portal" type="checkbox" checked>Show portal</label><label class="dmb-check"><input id="dmb-tp-puff" type="checkbox" checked>Puff of smoke</label></div>
                    <div id="dmb-tp-off-row" class="dmb-grid" hidden><label>When off<select id="dmb-tp-off"><option value="dim">Dim ring</option><option value="hide">Hidden</option><option value="keep">Full portal</option></select></label>
                        <label>Off colour<select id="dmb-tp-off-colour"><option value="">Same colour</option>${PlatformTeleporters.palette.map(([name], index) => `<option value="${index}">${name}</option>`).join('')}</select></label></div>
                </div>
                </fieldset></div>
                <footer><button type="submit" id="dmb-tp-apply" disabled>Apply</button><button type="button" id="dmb-tp-preview" disabled>Preview</button><button type="button" id="dmb-tp-reset" disabled>Reset</button></footer>
            </form>
            <p id="dmb-tp-status" role="status">Click a block to select it. Close Teleport to build again.</p>`;
        document.getElementById('editorUi').appendChild(panel);
        for (var control of panel.querySelectorAll('button')) control.classList.add('button');
        button.onclick = () => setEnabled(!enabled); $('close').onclick = () => setEnabled(false);
        document.getElementById('dmb-open')?.addEventListener('click', () => { if (enabled) setEnabled(false); }, true); //and Physics closes this one
        $('show-guides').checked = localStorage.getItem('dmbShowLinks') === 'true';
        $('show-guides').onchange = () => { localStorage.setItem('dmbShowLinks', String($('show-guides').checked)); refreshGuides(); markMore(); };
        markMore();
        $('preview-all').onchange = () => { if ($('preview-all').checked) startPreview(true); else stopPreview(); markMore(); };
        $('show-off').onchange = () => { if ($('show-off').checked && !previewMode) { $('preview-all').checked = true; startPreview(true); } markMore(); }; //the portals have to be showing to see how they look off
        document.addEventListener('pointerdown', event => { if ($('more').open && !$('more').contains(event.target)) $('more').open = false; });
        panel.addEventListener('keydown', event => { if (event.code === 'Escape' && $('more').open) { $('more').open = false; $('more').firstElementChild.focus(); } });
        for (var event of ['keydown', 'keyup']) panel.addEventListener(event, e => e.stopPropagation());
        document.addEventListener('keydown', event => {
            if (!enabled || panel.contains(event.target)) return;
            if (event.code === 'Escape') {
                if (picking) { picking = false; $('pick').classList.remove('dmb-picking'); message('Not picking any more.'); } else setEnabled(false);
                event.stopImmediatePropagation(); return;
            };
            if (event.target !== canvas) return;
            if (event.code === 'KeyZ' && (event.ctrlKey || event.metaKey)) return;
            if (['KeyR', 'KeyF', 'KeyX', 'KeyZ', 'Space', 'Delete', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.stopImmediatePropagation();
        }, true);
        $('side').addEventListener('change', () => { //each side has its own zone and exit: put them where that face wants them
            var side = PlatformTeleporters.sides[$('side').value], defaults = PlatformTeleporters.sideDefaults($('side').value);
            vectorFields('zone-offset', defaults.offset); vectorFields('exit', defaults.exit); $('facing').value = defaults.facing;
            message('Zone and exit moved to the ' + side.name + '.');
        });
        $('form').addEventListener('input', fieldsChanged); $('form').addEventListener('change', fieldsChanged);
        $('pick').onclick = () => {
            picking = !picking; $('pick').classList.toggle('dmb-picking', picking);
            message(picking ? 'Click the block to send eggs to. Esc cancels.' : 'Not picking any more.');
        };
        $('copy').onclick = () => {
            if (!$('form').reportValidity()) return;
            try {
                clipboard = state.copySettings(readPad());
                try { localStorage.setItem('dmbTeleportClipboard', JSON.stringify(clipboard)); } catch {};
                $('paste').disabled = false; message('Settings copied. Select another block and press Paste settings.');
            } catch (error) { message(error.message); };
        };
        $('paste').onclick = () => {
            if (!selected || !clipboard) return;
            if (showSelection(selected, clipboard)) message('Settings pasted. Preview them or press Apply to save.');
        };
        $('reset').onclick = () => { if (selected) { staged.clear(); showSelection(selected); } };
        $('form').onsubmit = event => {
            event.preventDefault();
            try {
                var pad = readPad(), mode = $('mode').value, batch = [pad];
                if (mode === 'off') {
                    if (!state.forBlock(pad.block)) { message('Not a teleporter yet. Choose Sends eggs or Exit only.'); return; };
                    undoPoint(); state.remove(pad.id);
                } else {
                    var target = pad.to.type === 'link' && pad.to.id && everyPad().find(def => def.id === pad.to.id);
                    if (target && (staged.has(target.id) || $('both').checked)) {
                        var partner = { ...target };
                        if ($('both').checked) { partner.send = true; partner.to = { type: 'link', id: pad.id }; } //so it sends back
                        batch.push(partner);
                    };
                    batch.forEach(def => state.check(def, map));
                    undoPoint(); state.apply(batch, map);
                };
                staged.clear(); selectionBox?.setEnabled(false);
                var backups = localStorage.getItem('mapBackups');
                saveToLocal();
                if (backups !== null) localStorage.setItem('mapBackups', backups);
                showSelection(selected); message(mode === 'off' ? 'Teleporter removed.' : 'Teleporter saved.');
            } catch (error) { message(error.message); };
        };
        $('preview').onclick = () => { if (previewMode) stopPreview(); else startPreview(false); };
        clearSelection(); attach();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUi);
    else initUi();
})();
