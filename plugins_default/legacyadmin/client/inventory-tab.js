// Per-account inventory editor: a scrollable list of every account on the left, edit eggs/VIP/
// owned items on the right. Items reuse the exact same picker component as the Codes tab (CSV
// field + select-all + tiles). Still services-local, still goes through sqlRequest.
import { AdminApp, registerTab, $ } from './app.js';
import { createItemPicker } from './tilePicker.js';

let allItems = [];
let allAccounts = [];
let picker = null;
let currentAccount = null;

const primaryBtn = 'text-xs px-3 py-1.5 rounded-md font-medium bg-indigo-600 hover:bg-indigo-500 text-white';
const inputClass = 'border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-md px-3 py-1.5 text-sm';
const labelClass = 'text-xs font-medium text-slate-500 dark:text-slate-400 block mb-0.5';

function render(container) {
    container.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <h3 class="text-sm font-semibold mb-2">Accounts</h3>
                <input type="text" id="inv-search" placeholder="Filter..." class="w-full ${inputClass} mb-2">
                <div id="inv-account-list" class="h-96 overflow-y-auto border border-slate-100 dark:border-slate-700 rounded-md divide-y divide-slate-100 dark:divide-slate-700">Loading...</div>
            </section>

            <section class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 lg:col-span-2">
                <h3 class="text-sm font-semibold mb-3">Edit</h3>
                <div id="inv-editor" class="text-sm text-slate-400 dark:text-slate-500">Pick an account.</div>
            </section>
        </div>
    `;

    container.querySelector('#inv-search').oninput = (e) => renderAccountList(e.target.value);

    AdminApp.send('adminGetCatalog');
    AdminApp.send('sqlRequest', { sql: 'SELECT account_id, username, adminRoles FROM users ORDER BY username', sqlType: 'getAll' });
};

AdminApp.on('adminGetCatalog', (result) => { allItems = result.items || []; });

AdminApp.on('result', (result) => {
    if (!Array.isArray(result) || !result.length || !('username' in result[0]) || 'currentBalance' in result[0]) return;
    allAccounts = result;
    renderAccountList($('tabContent')?.querySelector('#inv-search')?.value || '');
});

function renderAccountList(filterText) {
    const list = $('inv-account-list');
    if (!list) return;
    const filter = (filterText || '').toLowerCase();
    const filtered = allAccounts.filter(a => !filter || a.username?.toLowerCase().includes(filter) || String(a.account_id).includes(filter));
    list.innerHTML = filtered.map(a => `
        <button data-id="${a.account_id}" class="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 ${currentAccount?.account_id === a.account_id ? 'bg-indigo-50 dark:bg-indigo-950' : ''}">
            <div class="font-medium">${a.username}</div>
            <div class="text-xs text-slate-400 dark:text-slate-500">#${a.account_id} · role ${a.adminRoles || 0}</div>
        </button>
    `).join('') || '<div class="p-3 text-sm text-slate-400 dark:text-slate-500">No accounts match.</div>';
    list.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => AdminApp.send('sqlRequest', { sql: `SELECT * FROM users WHERE account_id = ${Number(btn.dataset.id)}`, sqlType: 'getOne' });
    });
};

AdminApp.on('result', (result) => {
    if (!result || Array.isArray(result) || !('account_id' in result) || !('currentBalance' in result)) return;
    const container = $('tabContent');
    if (!container?.querySelector('#inv-editor')) return;
    currentAccount = result;
    renderAccountList(container.querySelector('#inv-search')?.value || '');
    renderEditor(container);
});

function renderEditor(container) {
    let owned = [];
    try { owned = JSON.parse(currentAccount.ownedItemIds); } catch { owned = []; };

    const editor = container.querySelector('#inv-editor');
    editor.innerHTML = `
        <div class="text-xs text-slate-400 dark:text-slate-500 mb-3">${currentAccount.username} · #${currentAccount.account_id}</div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div>
                <label class="${labelClass}">Eggs</label>
                <input type="text" id="inv-eggs" value="${currentAccount.currentBalance}" class="w-full ${inputClass}">
            </div>
            <div>
                <label class="${labelClass}">VIP ad-free</label>
                <select id="inv-adfree" class="w-full ${inputClass}">
                    <option value="1" ${currentAccount.upgradeAdFree ? 'selected' : ''}>Yes</option>
                    <option value="0" ${!currentAccount.upgradeAdFree ? 'selected' : ''}>No</option>
                </select>
            </div>
            <div>
                <label class="${labelClass}">VIP multiplier</label>
                <input type="text" id="inv-multiplier" value="${currentAccount.upgradeMultiplier ?? ''}" placeholder="e.g. 2" class="w-full ${inputClass}">
            </div>
        </div>
        <label class="${labelClass}">Owned items</label>
        <div id="inv-item-picker">Loading...</div>
        <button id="inv-save" class="${primaryBtn} mt-3">Save</button>
    `;
    picker = createItemPicker(editor.querySelector('#inv-item-picker'), allItems, owned, () => {});

    editor.querySelector('#inv-save').onclick = () => {
        const eggs = Number(editor.querySelector('#inv-eggs').value) || 0;
        const adFree = editor.querySelector('#inv-adfree').value;
        const multiplierRaw = editor.querySelector('#inv-multiplier').value.trim();
        const multiplier = multiplierRaw === '' ? 'NULL' : Number(multiplierRaw);
        const itemIdsJson = JSON.stringify(picker.getSelected()).replaceAll("'", "''");

        AdminApp.send('sqlRequest', {
            sql: `UPDATE users SET currentBalance = ${eggs}, upgradeAdFree = ${adFree}, upgradeMultiplier = ${multiplier}, ownedItemIds = '${itemIdsJson}' WHERE account_id = ${currentAccount.account_id} RETURNING *`,
            sqlType: 'getOne',
        });
    };
};

registerTab({ id: 'inventory', label: 'Inventory', render, moderatorOnly: false });
