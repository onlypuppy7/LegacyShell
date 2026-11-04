//plugin: mapeditorsaving, editor only
(() => {
    if (typeof isMapEditor === 'undefined' || !isMapEditor) return;

    var maxLocal = 50, autosaveMs = 60000;
    var tab = 'public', account = null, publicMaps = null, lastAutosave = null, busy = false;
    var $ = id => document.getElementById('mes-' + id);
    var servicesUrl = location.hostname.startsWith('localhost') ? 'ws://localhost:' + mapeditorsavingConfig.port : mapeditorsavingConfig.url;
    var bytes = n => n < 1024 ? n + 'B' : n < 1048576 ? (n / 1024).toFixed(1) + 'KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + 'MB' : (n / 1073741824).toFixed(2) + 'GB';
    var when = s => new Date(s * (s < 1e11 ? 1000 : 1)).toLocaleString();
    var getName = () => document.getElementById('mapName').value || document.getElementById('filename').value.replace('.json', '') || 'Untitled';
    var autosaveOn = () => { try { return localStorage.getItem('mesAutosave') !== '0'; } catch { return true; }; };

    function status(text, error) {
        $('status').textContent = text || '';
        $('status').setAttribute('role', error ? 'alert' : 'status');
    };

    function request(payload) {
        return new Promise((resolve, reject) => {
            var socket = new WebSocket(servicesUrl), done = false;
            var finish = (error, value) => { if (done) return; done = true; clearTimeout(timer); socket.close(); error ? reject(error) : resolve(value); };
            var timer = setTimeout(() => finish(new Error('The egg took too long. Try again.')), 20000);
            socket.onopen = () => socket.send(JSON.stringify(payload));
            socket.onmessage = event => {
                try { var data = JSON.parse(event.data); } catch { return finish(new Error('Could not read the reply.')); };
                if (data.error || data.mapeditorsaving?.error) return finish(new Error(data.error || data.mapeditorsaving.error));
                finish(null, data);
            };
            socket.onerror = () => finish(new Error('Could not reach the services server.'));
            socket.onclose = () => finish(new Error('The connection closed. Try again.'));
        });
    };

    //sends the stored login along with each request. no session is made, so the game tab stays signed in
    async function accountRequest(payload) {
        var username = localStorage.getItem('LegacyShellPreviousUsername'), authToken = localStorage.getItem('LegacyShellAuthToken');
        if (!username || !authToken) throw new Error('Sign in on the main page first.');
        account = { username };
        return (await request({ username, authToken, ...payload })).mapeditorsaving;
    };

    //local saves, indexeddb
    var dbPromise;
    function db() {
        return dbPromise ||= new Promise((resolve, reject) => {
            var open = indexedDB.open('mapeditorsaving', 1);
            open.onupgradeneeded = () => open.result.createObjectStore('saves', { keyPath: 'id', autoIncrement: true });
            open.onsuccess = () => resolve(open.result);
            open.onerror = () => reject(open.error);
        });
    };
    async function store(mode, fn) {
        var database = await db();
        return new Promise((resolve, reject) => {
            var transaction = database.transaction('saves', mode), result = fn(transaction.objectStore('saves'));
            transaction.oncomplete = () => resolve(result.result);
            transaction.onerror = () => reject(transaction.error);
        });
    };
    var localList = async () => (await store('readonly', s => s.getAll())).sort((a, b) => b.date - a.date);
    //eviction prefers autosaves so manual ones survive
    async function trimLocal() {
        var all = (await localList()).reverse(); //oldest first
        var excess = all.length - maxLocal;
        if (excess <= 0) return;
        var order = all.filter(save => save.auto).concat(all.filter(save => !save.auto));
        for (var old of order.slice(0, excess)) await store('readwrite', s => s.delete(old.id));
    };
    async function addLocal(name, data, auto) {
        await store('readwrite', s => s.add({ name, data, auto, date: Date.now() }));
        await trimLocal();
    };

    function load(json, name, asked) {
        if (!asked && typeof mapEdited !== 'undefined' && mapEdited && !confirm('Unsaved changes will be scrambled. Open anyway?')) return false;
        initMap();
        maximizeMap(json);
        document.getElementById('filename').value = name + '.json';
        mapEdited = false;
        saveToLocal();
        $('dialog').close();
        return true;
    };

    function row(list, title, sub, buttons) {
        var item = document.createElement('div');
        item.className = 'mes-row';
        var text = document.createElement('div');
        text.className = 'mes-text';
        var strong = document.createElement('strong'), small = document.createElement('small');
        strong.textContent = title; small.textContent = sub;
        text.append(strong, small);
        item.append(text);
        for (const [label, fn, danger] of buttons) {
            const button = document.createElement('button');
            button.textContent = label;
            if (danger) button.style.background = '#8c2a1b';
            button.onclick = () => run(fn);
            item.append(button);
        };
        list.append(item);
    };

    async function run(fn) {
        if (busy) return;
        busy = true;
        try { await fn(); } catch (error) { status(error.message || 'Something cracked. Try again.', true); };
        busy = false;
    };

    function empty(list, text) {
        var p = document.createElement('p');
        p.className = 'mes-empty'; p.textContent = text;
        list.replaceChildren(p);
    };

    async function render() {
        var list = $('list'), bar = $('bar');
        status('');
        document.querySelectorAll('#mes-dialog [data-tab]').forEach(button => button.setAttribute('aria-pressed', button.dataset.tab === tab));
        bar.replaceChildren();
        list.replaceChildren();
        var input = (type, placeholder) => { var el = document.createElement('input'); el.type = type; el.placeholder = placeholder; bar.append(el); return el; };
        var action = (label, fn) => { var b = document.createElement('button'); b.textContent = label; b.onclick = () => run(fn); bar.append(b); return b; };

        if (tab === 'public') {
            var search = input('search', 'Search public maps');
            var draw = () => {
                list.replaceChildren();
                var term = search.value.toLowerCase(), shown = publicMaps.filter(map => map.name.toLowerCase().includes(term));
                if (!shown.length) return empty(list, 'No maps found.');
                for (const map of shown) row(list, map.name, `${map.width}x${map.height}x${map.depth} - ${map.numPlayers} players`, [['Open', async () => {
                    status('Fetching ' + map.name + '...');
                    var reply = (await request({ cmd: 'mapeditorsavingPublicGet', name: map.name })).mapeditorsaving;
                    load(JSON.stringify(reply.map), map.name);
                }]]);
            };
            search.oninput = draw;
            if (!publicMaps) {
                empty(list, 'Fetching maps...');
                publicMaps = (await request({ cmd: 'mapeditorsavingPublicList' })).mapeditorsaving.maps;
            };
            draw();
        } else if (tab === 'local') {
            var name = input('text', 'Save name'); name.value = getName();
            action('Save here', async () => { await addLocal(name.value.trim() || 'Untitled', JSON.stringify(minimizeMap()), false); await render(); status('Saved.'); });
            var label = document.createElement('label'), check = document.createElement('input');
            check.type = 'checkbox'; check.checked = autosaveOn();
            check.onchange = () => { try { localStorage.setItem('mesAutosave', check.checked ? '1' : '0'); } catch {}; };
            label.append(check, 'Autosave');
            bar.append(label);
            var saves = await localList();
            if (!saves.length) return empty(list, 'Nothing saved in this browser yet.');
            status(`${saves.length}/${maxLocal} slots used. Oldest autosaves are cracked first.`);
            for (const save of saves) row(list, `${save.auto ? '[auto] ' : ''}${save.name}`, `${when(save.date)} - ${bytes(save.data.length)}`, [
                ['Open', async () => { load(save.data, save.name); }],
                ['Delete', async () => { await store('readwrite', s => s.delete(save.id)); await render(); }, true],
            ]);
        } else {
            var accName = input('text', 'Save name'); accName.value = getName();
            var info = await accountRequest({ cmd: 'mapeditorsavingList' });
            var drawAccount = async (info) => {
                bar.replaceChildren(accName);
                action('Save to account', async () => { drawAccount(await accountRequest({ cmd: 'mapeditorsavingSave', name: accName.value, data: JSON.stringify(minimizeMap()) })); status('Saved to your account.'); });
                var meter = document.createElement('div');
                meter.className = 'mes-meter'; meter.title = `${bytes(info.used)} of ${bytes(info.quota)}`;
                meter.innerHTML = `<i style="width:${Math.min(100, info.used / info.quota * 100)}%"></i>`;
                bar.append(meter);
                list.replaceChildren();
                if (!info.saves.length) return empty(list, `Nothing saved to ${account.username} yet. ${bytes(info.quota)} available.`);
                for (const save of info.saves) row(list, save.name, `${when(save.dateModified)} - ${bytes(save.size)}`, [
                    ['Open', async () => { var got = await accountRequest({ cmd: 'mapeditorsavingGet', name: save.name }); load(got.data, got.name); }],
                    ['Delete', async () => { if (confirm('Delete ' + save.name + ' for good?')) drawAccount(await accountRequest({ cmd: 'mapeditorsavingDelete', name: save.name })); }, true],
                ]);
                status(`${bytes(info.used)} of ${bytes(info.quota)} used.`);
            };
            await drawAccount(info);
        };
    };

    function show(next) {
        tab = next;
        run(render);
    };

    function init() {
        var button = document.createElement('span');
        button.className = 'button'; button.id = 'mes-open'; button.textContent = 'Saves';
        button.title = 'Open public maps, browser saves and account saves';
        var anchor = document.getElementById('save');
        //the editor's own buttons are spaced by whitespace between the spans, so add the same
        anchor.after(document.createTextNode(' '), button);

        var dialog = document.createElement('dialog');
        dialog.id = 'mes-dialog';
        dialog.setAttribute('aria-labelledby', 'mes-heading');
        dialog.innerHTML = `<div class="mes-shell">
            <header><h1 id="mes-heading">Map Saves</h1><button id="mes-close" aria-label="Close" title="Close (Esc)">×</button></header>
            <div class="mes-tabs">
                <button data-tab="public">Public Maps</button>
                <button data-tab="local">This Browser</button>
                <button data-tab="account">Your Account</button>
            </div>
            <div class="mes-bar" id="mes-bar"></div>
            <div class="mes-list" id="mes-list"></div>
            <footer id="mes-status" role="status"></footer>
        </div>`;
        document.body.append(dialog);
        dialog.addEventListener('keydown', event => event.stopPropagation());
        dialog.querySelector('#mes-close').onclick = () => dialog.close();
        dialog.querySelectorAll('[data-tab]').forEach(el => el.onclick = () => show(el.dataset.tab));
        button.onclick = () => { dialog.showModal(); show(tab); };
    };

    //drop a map json anywhere on the page
    var dragDepth = 0, hasFiles = event => [...(event.dataTransfer?.types || [])].includes('Files');
    function dropZone(show) {
        var zone = document.getElementById('mes-drop');
        if (!zone) { zone = document.createElement('div'); zone.id = 'mes-drop'; zone.textContent = 'Drop your map here'; document.body.append(zone); };
        zone.hidden = !show;
    };
    window.addEventListener('dragenter', event => { if (!hasFiles(event)) return; event.preventDefault(); dragDepth++; dropZone(true); });
    window.addEventListener('dragover', event => { if (hasFiles(event)) event.preventDefault(); });
    window.addEventListener('dragleave', event => { if (hasFiles(event) && --dragDepth <= 0) { dragDepth = 0; dropZone(false); }; });
    window.addEventListener('drop', event => {
        if (!hasFiles(event)) return;
        event.preventDefault(); dragDepth = 0; dropZone(false);
        var file = [...event.dataTransfer.files].find(file => /\.json$/i.test(file.name));
        if (!file) return alert('That is not a map .json.');
        var reader = new FileReader();
        reader.onload = () => {
            try { var parsed = JSON.parse(reader.result); if (!parsed || typeof parsed.data !== 'object') throw 0; } catch { return alert(file.name + ' is not a valid map.'); };
            var name = file.name.replace(/\.json$/i, '');
            if (confirm('Replace the current map with ' + name + '?')) load(reader.result, name, true);
        };
        reader.readAsText(file);
    });

    setInterval(async () => {
        if (!autosaveOn() || typeof mapEdited === 'undefined' || !mapEdited) return;
        try {
            var data = JSON.stringify(minimizeMap());
            if (data === lastAutosave || !Object.keys(JSON.parse(data).data).length) return;
            lastAutosave = data;
            await addLocal(getName(), data, true);
        } catch (error) { console.log('mapeditorsaving autosave failed', error); };
    }, autosaveMs);

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
