// Code creation - a form wrapper around the same INSERT the SQL tab's own template already does
// (codes.key auto-generates via the table's own DEFAULT expression, so there's no separate
// generator to write), with the shared item-tile picker instead of typing raw IDs. Still
// services-local, still goes through sqlRequest, so it needs the SQL password same as the SQL tab.
import { AdminApp, registerTab, $, setStatus } from './app.js';
import { createItemPicker } from './tilePicker.js';

let allItems = [];
let picker = null;
let recentCodes = [];

const primaryBtn = 'text-xs px-3 py-1.5 rounded-md font-medium bg-indigo-600 hover:bg-indigo-500 text-white';
const plainBtn = 'text-xs px-3 py-1.5 rounded-md font-medium border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700';
const inputClass = 'border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-md px-3 py-1.5 text-sm';
const labelClass = 'text-xs font-medium text-slate-500 dark:text-slate-400 block mb-0.5';

function render(container) {
    container.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h3 class="text-sm font-semibold mb-3">Create a code</h3>
                <div class="space-y-2 mb-3">
                    <div>
                        <label class="${labelClass}">Custom key (optional, auto-generated if blank)</label>
                        <input type="text" id="code-key" class="w-full ${inputClass}">
                    </div>
                    <div class="flex gap-2">
                        <div class="w-1/2">
                            <label class="${labelClass}">Eggs given</label>
                            <input type="text" id="code-eggs" value="0" class="w-full ${inputClass}">
                        </div>
                        <div class="w-1/2">
                            <label class="${labelClass}">Uses</label>
                            <input type="text" id="code-uses" value="1" class="w-full ${inputClass}">
                        </div>
                    </div>
                </div>
                <label class="${labelClass}">Items</label>
                <div id="code-item-picker">Loading...</div>
                <button id="code-create" class="${primaryBtn} mt-3 w-full">Create code</button>
            </section>

            <section class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h3 class="text-sm font-semibold mb-2">Recent codes</h3>
                <div id="code-list" class="space-y-1 text-sm"></div>
            </section>
        </div>
    `;

    container.querySelector('#code-create').onclick = () => {
        const key = container.querySelector('#code-key').value.trim();
        const eggs = Number(container.querySelector('#code-eggs').value) || 0;
        const uses = Number(container.querySelector('#code-uses').value) || 1;
        const itemIdsJson = JSON.stringify(picker.getSelected()).replaceAll("'", "''");

        const sql = key
            ? `INSERT INTO codes (key, item_ids, eggs_given, uses) VALUES ('${key.replaceAll("'", "''")}', '${itemIdsJson}', ${eggs}, ${uses}) RETURNING *`
            : `INSERT INTO codes (item_ids, eggs_given, uses) VALUES ('${itemIdsJson}', ${eggs}, ${uses}) RETURNING *`;
        AdminApp.send('sqlRequest', { sql, sqlType: 'getAll' });
    };

    picker = createItemPicker(container.querySelector('#code-item-picker'), allItems, [], () => {});
    AdminApp.send('sqlRequest', { sql: 'SELECT * FROM codes ORDER BY dateCreated DESC LIMIT 50', sqlType: 'getAll' });
    AdminApp.send('adminGetCatalog');
};

AdminApp.on('adminGetCatalog', (result) => {
    allItems = result.items || [];
    const container = $('tabContent');
    if (container?.querySelector('#code-item-picker')) {
        picker = createItemPicker(container.querySelector('#code-item-picker'), allItems, picker?.getSelected() || [], () => {});
    };
});

AdminApp.on('result', (result) => {
    const list = $('code-list');
    if (list && Array.isArray(result) && result.length && result[0].key !== undefined) {
        recentCodes = result;
        renderCodeList(list);
    };
});

function renderCodeList(list) {
    list.innerHTML = '';
    recentCodes.forEach(row => {
        const item = document.createElement('div');
        item.className = 'flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700 py-1';
        item.innerHTML = `
            <div class="min-w-0">
                <div class="font-mono text-xs truncate">${row.key}</div>
                <div class="text-[11px] text-slate-400 dark:text-slate-500">${row.eggs_given} eggs · ${row.uses} use(s) left</div>
            </div>
            <div class="flex gap-1 shrink-0">
                <button data-action="copy" class="${plainBtn}">Copy code</button>
                <button data-action="use" class="${plainBtn}">Use as template</button>
            </div>
        `;
        item.querySelector('[data-action="copy"]').onclick = (e) => {
            navigator.clipboard?.writeText(row.key);
            e.target.textContent = 'Copied!';
            setTimeout(() => { e.target.textContent = 'Copy code'; }, 1200);
        };
        item.querySelector('[data-action="use"]').onclick = () => {
            const container = $('tabContent');
            container.querySelector('#code-key').value = '';
            container.querySelector('#code-eggs').value = row.eggs_given;
            container.querySelector('#code-uses').value = row.uses;
            let ids = [];
            try { ids = JSON.parse(row.item_ids); } catch { ids = []; };
            picker?.setSelected(ids);
            setStatus(`Loaded ${row.key} as a template - change the key/values and Create to make a new one.`);
        };
        list.appendChild(item);
    });
};

registerTab({ id: 'codes', label: 'Codes', render, moderatorOnly: false });
