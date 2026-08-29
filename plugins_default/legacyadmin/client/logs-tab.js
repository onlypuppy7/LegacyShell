// Read-only view of the security audit trail (services/auditLog.js -> its own
// LegacyShellAdminLog.db). Admin (rank 20) or SQL password only - NOT visible to plain
// Moderators, since the log records moderator actions. Newest first, with a cursor to page back.
import { AdminApp, registerTab, $ } from './app.js';

let oldestShownAt = null;
let rows = [];

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
};

const resultClass = (r) => r === 'ok'
    ? 'text-emerald-600 dark:text-emerald-400'
    : (r === 'denied' ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400');

function render(container) {
    rows = [];
    oldestShownAt = null;
    container.innerHTML = `
        <div class="flex flex-wrap gap-2 items-center mb-3">
            <button id="logs-refresh" class="text-xs px-3 py-1.5 rounded-md font-medium border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700">Refresh</button>
            <button id="logs-older" class="text-xs px-3 py-1.5 rounded-md font-medium border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700">Load older</button>
            <span class="text-xs text-slate-400 dark:text-slate-500">Privileged actions: SQL, file edits, restarts, moderation, logins.</span>
        </div>
        <div id="logs-table" class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-auto text-sm">Loading...</div>
    `;
    container.querySelector('#logs-refresh').onclick = () => { rows = []; oldestShownAt = null; AdminApp.send('adminGetAuditLog', { limit: 200 }); };
    container.querySelector('#logs-older').onclick = () => { if (oldestShownAt) AdminApp.send('adminGetAuditLog', { limit: 200, before: oldestShownAt }); };
    AdminApp.send('adminGetAuditLog', { limit: 200 });
};

AdminApp.on('adminGetAuditLog', (result) => {
    const el = $('logs-table');
    if (!el) return;
    const incoming = result.rows || [];
    // De-dupe by id when paging (a row on the exact cursor boundary can repeat).
    const seen = new Set(rows.map(r => r.id));
    for (const r of incoming) if (!seen.has(r.id)) rows.push(r);
    rows.sort((a, b) => b.at - a.at || b.id - a.id);
    if (rows.length) oldestShownAt = rows[rows.length - 1].at;

    if (result.note) { el.innerHTML = `<div class="p-4 text-sm text-slate-400 dark:text-slate-500">${esc(result.note)}</div>`; return; };
    if (!rows.length) { el.innerHTML = '<div class="p-4 text-sm text-slate-400 dark:text-slate-500">No audit entries yet.</div>'; return; };

    el.innerHTML = `<table class="w-full">
        <thead class="bg-slate-50 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 text-xs">
            <tr><th class="text-left p-2">Time</th><th class="text-left p-2">Action</th><th class="text-left p-2">Actor</th>
            <th class="text-left p-2">Tier</th><th class="text-left p-2">IP</th><th class="text-left p-2">Target</th>
            <th class="text-left p-2">Result</th><th class="text-left p-2">Detail</th></tr>
        </thead>
        <tbody>${rows.map(r => `<tr class="border-t border-slate-100 dark:border-slate-700 align-top">
            <td class="p-2 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">${esc(new Date(r.at * 1000).toLocaleString())}</td>
            <td class="p-2 font-mono text-xs">${esc(r.action)}</td>
            <td class="p-2">${esc(r.actor)}</td>
            <td class="p-2 text-xs">${esc(r.tier)}</td>
            <td class="p-2 font-mono text-xs text-slate-400 dark:text-slate-500">${esc(r.ip)}</td>
            <td class="p-2 font-mono text-xs break-all max-w-xs">${esc(r.target)}</td>
            <td class="p-2 text-xs font-medium ${resultClass(r.result)}">${esc(r.result)}</td>
            <td class="p-2 font-mono text-xs text-slate-400 dark:text-slate-500 break-all max-w-xs">${esc(r.detail)}</td>
        </tr>`).join('')}</tbody>
    </table>`;
});

registerTab({ id: 'logs', label: 'Logs', render, adminOnly: true });
