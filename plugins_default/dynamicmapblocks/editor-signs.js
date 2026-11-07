//plugin: dynamicmapblocks, editor only
(() => {
    var state = new SignEditorState(), selected, copied, view, viewKey, editing = false, pending = false;
    var $ = id => document.getElementById('dmb-sign-' + id);
    var defaults = block => ({ text: '', color: PlatformMap.source(mapMeshes, block.mesh)?.metadata?.signInk || '#302315', align: 'center', range: 5 });
    var blockAt = pos => {
        if (!pos) return null;
        var cell = map.data?.[pos.x]?.[pos.y]?.[pos.z], mesh = mapMeshes[cell?.idx]?.name;
        return MapSigns.kind(mesh) ? { x: pos.x, y: pos.y, z: pos.z, rx: cell.rx || 0, ry: cell.ry || 0, rz: cell.rz || 0, mesh } : null;
    };
    function refresh() {
        if (!scene || !map.data) return;
        state.sync(map, mapMeshes);
        var definitions = state.signs.map(def => ({ ...def, block: blockAt(def.block) }));
        var key = JSON.stringify(definitions);
        if (key === viewKey) return;
        view?.dispose(); viewKey = key; view = SignRender.create(scene, definitions, mapMeshes, { editor: true });
    };
    function close() {
        if (pending && selected) { deleteTile(selected.x, selected.y, selected.z); pending = false; refresh(); evaluate(); };
        selected = null; $('panel').hidden = true;
        lastPointPicked = new BABYLON.Vector3(-1000, -1000, -1000);
    };
    function open(block) {
        if (!block) return;
        for (var id of ['dmb', 'dmb-tp']) if (!document.getElementById(id + '-panel')?.hidden) document.getElementById(id + '-close')?.click();
        selected = block;
        $('form').hidden = false;
        var def = state.forBlock(block) || defaults(block);
        $('text').value = def.text; $('color').value = def.color; $('align').value = def.align; $('range').value = def.range;
        var bubble = MapSigns.kind(block.mesh) === 'SIGNBUBBLE';
        $('board').hidden = bubble; $('distance').hidden = !bubble;
        $('selection').textContent = block.mesh + ' · ' + [block.x, block.y, block.z].join(' / ');
        $('status').textContent = bubble ? 'Look at it up close to read its message.' : 'Letters fit the model’s text surface automatically.';
        $('panel').hidden = false; document.exitPointerLock?.(); $('text').focus();
    };
    plugins.on('game:editorPointerDown', data => {
        if (plugins.cancel) return;
        if (selected && !$('panel').hidden) { plugins.cancel = true; return; };
        var pick = document.pointerLockElement ? scene.pickWithRay(camera.getForwardRay()) : data.pick;
        var block = pick?.hit ? blockAt(pick.pickedMesh.position) : null;
        if (tool === 'toolDropper' && data.event.button === 0) {
            copied = block ? { mesh: block.mesh, ...(state.forBlock(block) || defaults(block)) } : null;
            return;
        };
        if (data.event.button === 0 && (editing || block && !data.event.shiftKey)) {
            plugins.cancel = true; if (block) open(block); return;
        };
        var idx = palette[paletteIdx]?.meshIdx, mesh = mapMeshes[idx]?.name;
        if (data.event.button === 0 && MapSigns.kind(mesh) && pick?.hit) {
            plugins.cancel = true;
            var cell = pickCell(pick);
            if (!inBounds(cell) || map.data[cell.x][cell.y][cell.z].idx) return;
            if (state.signs.length >= MapSigns.limit) { alert('This map already has 128 signs.'); return; };
            undoPoint();
            if (!placeTile(idx, cell, getRotation())) return;
            var placed = blockAt(cell);
            state.apply({ ...(copied?.mesh === mesh ? copied : defaults(placed)), block: placed }, map);
            evaluate(); refresh(); open(placed); pending = true; return;
        };
        queueMicrotask(refresh);
    });
    for (var name of ['editorPointerMove', 'editorPointerUp']) plugins.on('game:' + name, data => {
        if (editing || !$('panel').hidden) { plugins.cancel = true; return; };
        if (data.event.buttons || name === 'editorPointerUp') queueMicrotask(refresh);
    });
    plugins.on('game:editorInitMapBefore', () => { pending = false; state.signs = []; view?.dispose(); view = null; viewKey = null; close(); });
    plugins.on('game:editorLoadMapBefore', () => { pending = false; close(); });
    plugins.on('game:editorLoadMapAfter', data => { state.load(data.json ? JSON.parse(data.json) : null); refresh(); });
    plugins.on('game:editorExtentsBefore', refresh);
    plugins.on('game:editorSaveMap', data => {
        if (state.signs.length) data.minMap.extents.signs = state.save(Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, extents[axis].min])));
        else delete data.minMap.extents.signs;
    });
    plugins.on('game:editorMoveMapBefore', close);
    plugins.on('game:editorMoveMapAfter', data => { state.translate({ x: data.dx, y: data.dy, z: data.dz }); refresh(); });
    function init() {
        var button = document.createElement('button'); button.id = 'dmb-sign-open'; button.className = 'button'; button.textContent = 'Signs'; button.setAttribute('aria-pressed', 'false');
        (document.getElementById('pluginButtons') || document.getElementById('editorUi')).appendChild(button);
        var panel = document.createElement('section'); panel.id = 'dmb-sign-panel'; panel.className = 'box'; panel.hidden = true; panel.setAttribute('aria-labelledby', 'dmb-sign-heading');
        panel.innerHTML = `<header><h1 id="dmb-sign-heading">Signs</h1><button id="dmb-sign-close" type="button" aria-label="Close signs">×</button></header>
            <p id="dmb-sign-selection"></p><form id="dmb-sign-form"><div class="dmb-controls">
            <label>Message<textarea id="dmb-sign-text" maxlength="512" placeholder="Something egg-citing..."></textarea></label>
            <div id="dmb-sign-board" class="dmb-grid"><label>Ink<input id="dmb-sign-color" type="color" value="#302315"></label>
            <label>Align<select id="dmb-sign-align"><option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option></select></label></div>
            <label id="dmb-sign-distance">Read within (blocks)<input id="dmb-sign-range" type="number" min="1" max="12" step=".5" value="5"></label>
            <p id="dmb-sign-status" role="status"></p></div><footer><button type="submit" id="dmb-sign-apply">Apply</button><button type="button" id="dmb-sign-cancel">Cancel</button></footer></form>`;
        document.getElementById('editorUi').appendChild(panel);
        button.onclick = () => {
            editing = !editing; button.setAttribute('aria-pressed', String(editing)); close();
            if (editing) {
                for (var id of ['dmb', 'dmb-tp']) if (!document.getElementById(id + '-panel')?.hidden) document.getElementById(id + '-close')?.click();
                document.exitPointerLock?.();
                $('selection').textContent = 'Click a sign to change its message.'; $('panel').hidden = false; $('form').hidden = true;
            };
        };
        $('close').onclick = $('cancel').onclick = () => { editing = false; button.setAttribute('aria-pressed', 'false'); close(); };
        document.getElementById('editorUi').addEventListener('click', event => { if (event.target.closest('#dmb-open, #dmb-tp-open, #bv-open') && !$('panel').hidden) $('close').click(); });
        $('form').onsubmit = event => {
            event.preventDefault();
            if (!selected || !blockAt(selected)) return;
            var def = { block: selected, text: $('text').value, color: $('color').value, align: $('align').value, range: Number($('range').value) };
            try {
                if (!MapSigns.read({ ...map, extents: { signs: [def] } }).length) throw new Error('Up to 512 letters and 12 lines. Distance: 1 to 12 blocks.');
                if (!pending) undoPoint();
                state.apply(def, map); pending = false; refresh();
                localStorage.setItem('mapBackup', JSON.stringify(minimizeMap())); $('close').click();
            } catch (error) { $('status').textContent = error.message; };
        };
        panel.addEventListener('pointerdown', event => event.stopPropagation());
        panel.addEventListener('keydown', event => { event.stopPropagation(); if (event.code === 'Escape') $('close').click(); });
        document.addEventListener('keydown', event => { if (event.code === 'Escape' && !$('panel').hidden) $('close').click(); });
    };
    window.addEventListener('DOMContentLoaded', init);
})();
