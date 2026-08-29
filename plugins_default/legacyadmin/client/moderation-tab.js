// Global ban/mute list management (services/moderation.js). Per-room kick lives in the Rooms tab
// instead, since it needs a live room/player to target - this tab is for the persistent,
// cross-room list. Moderator+ session or SQL password both work here.
import { AdminApp, registerTab, $ } from './app.js';

const inputClass = 'border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-md px-3 py-1.5 text-sm';

// target_value / reason are operator-supplied free text - escape before they hit innerHTML.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function render(container) {
    container.innerHTML = `
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 mb-4">
            <div class="flex flex-wrap gap-2 items-center">
                <select id="mod-type" class="${inputClass}"><option value="ban">Ban</option><option value="mute">Mute</option></select>
                <select id="mod-target-type" class="${inputClass}"><option value="ip">IP</option><option value="uuid">UUID</option><option value="account_id">Account ID</option></select>
                <input type="text" id="mod-value" placeholder="target value" class="${inputClass}">
                <input type="text" id="mod-reason" placeholder="reason (optional)" class="${inputClass} flex-1 min-w-[10rem]">
                <button id="mod-add" class="text-xs px-3 py-1.5 rounded-md font-medium bg-indigo-600 hover:bg-indigo-500 text-white">Add</button>
            </div>
        </div>
        <div id="mod-list" class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-auto">Loading...</div>
    `;

    container.querySelector('#mod-add').onclick = () => {
        const value = container.querySelector('#mod-value').value.trim();
        if (!value) return;
        AdminApp.send('adminAddModeration', {
            type: container.querySelector('#mod-type').value,
            targetType: container.querySelector('#mod-target-type').value,
            targetValue: value,
            reason: container.querySelector('#mod-reason').value,
        });
        container.querySelector('#mod-value').value = '';
        container.querySelector('#mod-reason').value = '';
    };

    AdminApp.send('adminListModeration');
};

AdminApp.on('adminAddModeration', () => AdminApp.send('adminListModeration'));
AdminApp.on('adminRemoveModeration', () => AdminApp.send('adminListModeration'));

AdminApp.on('adminListModeration', (result) => {
    const list = $('mod-list');
    if (!list) return;
    const rows = result.rows || [];
    if (rows.length === 0) { list.innerHTML = '<div class="p-4 text-sm text-slate-400 dark:text-slate-500">No active bans/mutes.</div>'; return; };

    const table = document.createElement('table');
    table.className = 'w-full text-sm';
    table.innerHTML = `<thead class="bg-slate-50 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 text-xs"><tr>
        <th class="text-left p-2">Type</th><th class="text-left p-2">Target type</th><th class="text-left p-2">Target</th>
        <th class="text-left p-2">Reason</th><th class="text-left p-2">Added</th><th class="p-2"></th></tr></thead>`;
    const tbody = document.createElement('tbody');
    rows.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = 'border-t border-slate-100 dark:border-slate-700';
        tr.innerHTML = `<td class="p-2">${esc(row.type)}</td><td class="p-2">${esc(row.target_type)}</td><td class="p-2 font-mono">${esc(row.target_value)}</td><td class="p-2">${esc(row.reason || '')}</td><td class="p-2 text-xs text-slate-400 dark:text-slate-500">${esc(new Date(row.dateCreated * 1000).toLocaleString())}</td><td class="p-2"><button class="text-rose-600 text-xs">Remove</button></td>`;
        tr.querySelector('button').onclick = () => AdminApp.send('adminRemoveModeration', { id: row.id });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    list.innerHTML = '';
    list.appendChild(table);
});

registerTab({ id: 'moderation', label: 'Moderation', render, moderatorOnly: true });
