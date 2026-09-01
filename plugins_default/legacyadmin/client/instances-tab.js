// Instances tab (was "Files"): pick which game/client instance the panel is managing, see its
// live perf, restart it - and edit its config files. With no instance selected everything targets
// this services instance. Routed commands (file edit, restart, perf) go to the selection.
import { AdminApp, registerTab, $, setStatus, serverLabel } from './app.js';

let currentFile = null;
let perfTimer = null;
const PERF_TAG = 'instances-tab';

const fileBtnClass = (active) => 'text-xs px-2 py-1 rounded border ' +
    (active ? 'bg-indigo-50 dark:bg-indigo-950 border-indigo-300 dark:border-indigo-700 text-indigo-700' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700');
const btn = 'text-xs px-3 py-1.5 rounded-md font-medium border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700';
const dangerBtn = 'text-xs px-3 py-1.5 rounded-md font-medium border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950';

function render(container) {
    container.innerHTML = `
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 mb-4">
            <div class="flex flex-wrap gap-2 items-center">
                <label class="text-xs font-medium text-slate-500 dark:text-slate-400">Managed instance</label>
                <select id="inst-select" class="text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-md px-2 py-1"></select>
                <button id="inst-refresh" class="${btn}" title="Refresh instance list">&#8635; Refresh</button>
                <button id="inst-restart" class="${dangerBtn}">Restart</button>
                <span id="inst-perf" class="text-xs text-slate-400 dark:text-slate-500 ml-2"></span>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div class="space-y-4">
                <section>
                    <h3 class="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-1">Core config</h3>
                    <div class="flex flex-wrap gap-1" id="fa-core"></div>
                </section>
                <section>
                    <h3 class="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-1">Plugins</h3>
                    <div class="flex flex-wrap gap-1" id="fa-plugins"></div>
                </section>
                <details>
                    <summary class="text-sm font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">Other git-ignored files</summary>
                    <div class="flex flex-wrap gap-1 mt-1" id="fa-other"></div>
                </details>
            </div>
            <div id="fa-editor" class="hidden bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <div class="flex justify-between items-center mb-2">
                    <strong id="fa-filename" class="text-sm"></strong>
                    <button id="fa-save" class="text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded px-3 py-1.5">Save</button>
                </div>
                <textarea id="fa-area" spellcheck="false" class="w-full h-96 font-mono text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded p-2"></textarea>
            </div>
        </div>
    `;

    populateSelect(container);
    container.querySelector('#inst-select').onchange = (e) => AdminApp.setTarget(e.target.value);
    container.querySelector('#inst-refresh').onclick = () => AdminApp.send('adminListServers');
    container.querySelector('#inst-restart').onclick = () => {
        const label = AdminApp.targetId ? 'the SELECTED instance' : 'THIS services instance';
        if (!confirm(`Restart ${label} now? Whatever it's currently doing will drop briefly.`)) return;
        AdminApp.send(AdminApp.targetId ? 'adminRestartThis' : 'adminRestartServices');
    };

    container.querySelector('#fa-save').onclick = () => {
        if (!currentFile) return;
        AdminApp.send('adminWriteFile', { file: currentFile, raw: container.querySelector('#fa-area').value });
    };

    AdminApp.send('adminListServers');
    AdminApp.send('adminListFiles');
    pollPerf();
    if (perfTimer) clearInterval(perfTimer);
    perfTimer = setInterval(() => { if ($('inst-perf')) pollPerf(); else clearInterval(perfTimer); }, 5000);
};

function pollPerf() { AdminApp.send('adminGetPerf', { tag: PERF_TAG }); };

function populateSelect(container) {
    const sel = container.querySelector('#inst-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">This services instance</option>' +
        AdminApp.servers.map(s => `<option value="${s.id}">${serverLabel(s)}</option>`).join('');
    sel.value = AdminApp.targetId || '';
};

AdminApp.on('adminListServers', () => { const c = $('tabContent'); if (c?.querySelector('#inst-select')) populateSelect(c); });

AdminApp.on('adminGetPerf', (p) => {
    if (p.tag !== PERF_TAG) return;
    const el = $('inst-perf');
    if (!el) return;
    const h = Math.floor(p.uptimeSec / 3600), m = Math.floor((p.uptimeSec % 3600) / 60);
    el.textContent = `${p.role} · pid ${p.pid} · CPU ${p.cpuPercent}% · RSS ${p.rssMB}MB · heap ${p.heapMB}MB · up ${h}h${m}m · load ${p.loadavg1} · node ${p.nodeVersion}`;
});

function buildList(container, id, files) {
    const el = container.querySelector('#' + id);
    if (!el) return;
    el.innerHTML = '';
    for (const file of files) {
        const b = document.createElement('button');
        b.textContent = file;
        b.className = fileBtnClass(file === currentFile);
        b.onclick = () => { currentFile = file; AdminApp.send('adminReadFile', { file }); };
        el.appendChild(b);
    };
};

AdminApp.on('adminListFiles', (result) => {
    const container = $('tabContent');
    if (!container?.querySelector('#fa-core')) return;
    setStatus(`Loaded ${result.core.length} core file(s), ${result.plugins.length} plugin file(s), ${result.other.length} other file(s).`);
    buildList(container, 'fa-core', result.core);
    buildList(container, 'fa-plugins', result.plugins);
    buildList(container, 'fa-other', result.other);
});

AdminApp.on('adminReadFile', (result) => {
    const editor = $('tabContent')?.querySelector('#fa-editor');
    if (!editor) return;
    currentFile = result.file;
    editor.classList.remove('hidden');
    $('fa-filename').textContent = result.file;
    $('fa-area').value = result.raw;
});

AdminApp.on('adminWriteFile', (result) => setStatus('Saved ' + result.file));
AdminApp.on('adminRestartThis', () => setStatus('Restart requested - the managed instance will bounce shortly.'));

registerTab({ id: 'instances', label: 'Instances', render });
