// Config file editor - the original scope of this plugin, now one tab among several. Routed to
// whichever instance is selected in the target picker; with no target selected, manages services'
// own store/config/ instead. Restart lives in the top navbar now, not in this tab.
import { AdminApp, registerTab, $, setStatus } from './app.js';

let currentFile = null;

const fileBtnClass = (active) => 'text-xs px-2 py-1 rounded border ' +
    (active ? 'bg-indigo-50 dark:bg-indigo-950 border-indigo-300 dark:border-indigo-700 text-indigo-700' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700');

function render(container) {
    container.innerHTML = `
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

    container.querySelector('#fa-save').onclick = () => {
        if (!currentFile) return;
        AdminApp.send('adminWriteFile', { file: currentFile, raw: container.querySelector('#fa-area').value });
    };

    AdminApp.send('adminListFiles');
};

function buildList(container, id, files) {
    const el = container.querySelector('#' + id);
    if (!el) return;
    el.innerHTML = '';
    for (const file of files) {
        const btn = document.createElement('button');
        btn.textContent = file;
        btn.className = fileBtnClass(file === currentFile);
        btn.onclick = () => {
            currentFile = file;
            AdminApp.send('adminReadFile', { file });
        };
        el.appendChild(btn);
    };
};

AdminApp.on('adminListFiles', (result) => {
    const container = $('tabContent');
    if (!container.querySelector('#fa-core')) return;
    setStatus(`Loaded ${result.core.length} core file(s), ${result.plugins.length} plugin file(s), ${result.other.length} other file(s).`);
    buildList(container, 'fa-core', result.core);
    buildList(container, 'fa-plugins', result.plugins);
    buildList(container, 'fa-other', result.other);
});

AdminApp.on('adminReadFile', (result) => {
    const container = $('tabContent');
    const editor = container.querySelector('#fa-editor');
    if (!editor) return;
    currentFile = result.file;
    editor.classList.remove('hidden');
    container.querySelector('#fa-filename').textContent = result.file;
    container.querySelector('#fa-area').value = result.raw;
});

AdminApp.on('adminWriteFile', (result) => setStatus('Saved ' + result.file));
AdminApp.on('adminRestartThis', () => setStatus('Restart requested - the managed instance will bounce shortly.'));

registerTab({ id: 'files', label: 'Files', render });
