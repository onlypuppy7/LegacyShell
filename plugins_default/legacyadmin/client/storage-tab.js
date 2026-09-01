// Storage tab: DB size, per-table row/byte breakdown, backups summary, services store/ tree size.
// Read-only (adminGetStorage is Moderator+).
import { AdminApp, registerTab, $ } from './app.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function fmtBytes(n) {
    if (n == null) return '-';
    if (n < 1024) return n + ' B';
    const u = ['KB', 'MB', 'GB', 'TB'];
    let i = -1; do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return n.toFixed(1) + ' ' + u[i];
};

const card = 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4';

function render(container) {
    container.innerHTML = `
        <div class="flex items-center gap-3 mb-4">
            <button id="st-refresh" class="text-xs px-3 py-1.5 rounded-md font-medium border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700">Refresh</button>
            <span id="st-time" class="text-xs text-slate-400 dark:text-slate-500"></span>
        </div>
        <div id="st-body" class="grid grid-cols-1 lg:grid-cols-2 gap-4">Loading...</div>
    `;
    container.querySelector('#st-refresh').onclick = () => AdminApp.send('adminGetStorage');
    AdminApp.send('adminGetStorage');
};

AdminApp.on('adminGetStorage', (s) => {
    const body = $('st-body');
    if (!body) return;
    $('st-time').textContent = 'as of ' + new Date((s.generatedAt || 0) * 1000).toLocaleString();

    const dbTotal = (s.db.bytes || 0) + (s.db.walBytes || 0) + (s.db.shmBytes || 0);
    const tableRows = (s.tables || []).slice().sort((a, b) => (b.bytes ?? b.rows ?? 0) - (a.bytes ?? a.rows ?? 0)).map(t => `
        <tr class="border-t border-slate-100 dark:border-slate-700">
            <td class="p-1.5 font-mono text-xs">${esc(t.name)}</td>
            <td class="p-1.5 text-right">${t.rows == null ? '-' : t.rows.toLocaleString()}</td>
            <td class="p-1.5 text-right text-slate-400 dark:text-slate-500">${fmtBytes(t.bytes)}</td>
        </tr>`).join('');

    body.innerHTML = `
        <div class="${card}">
            <h3 class="text-sm font-semibold mb-2">Database</h3>
            <div class="text-xs font-mono text-slate-400 dark:text-slate-500 mb-2 break-all">${esc(s.db.path)}</div>
            <dl class="text-sm space-y-1">
                <div class="flex justify-between"><dt>Main file</dt><dd class="font-medium">${fmtBytes(s.db.bytes)}</dd></div>
                <div class="flex justify-between"><dt>WAL</dt><dd>${fmtBytes(s.db.walBytes)}</dd></div>
                <div class="flex justify-between"><dt>SHM</dt><dd>${fmtBytes(s.db.shmBytes)}</dd></div>
                <div class="flex justify-between border-t border-slate-100 dark:border-slate-700 pt-1"><dt class="font-semibold">Total</dt><dd class="font-semibold">${fmtBytes(dbTotal)}</dd></div>
            </dl>
        </div>

        <div class="${card}">
            <h3 class="text-sm font-semibold mb-2">Backups</h3>
            <div class="text-xs font-mono text-slate-400 dark:text-slate-500 mb-2 break-all">${esc(s.backups.dir)}</div>
            <dl class="text-sm space-y-1">
                <div class="flex justify-between"><dt>Count</dt><dd class="font-medium">${s.backups.count}${s.backups.keep != null ? ` / keep ${s.backups.keep}` : ''}</dd></div>
                <div class="flex justify-between"><dt>Total size</dt><dd class="font-medium">${fmtBytes(s.backups.bytes)}</dd></div>
            </dl>
        </div>

        <div class="${card}">
            <h3 class="text-sm font-semibold mb-2">services store/</h3>
            <div class="text-xs font-mono text-slate-400 dark:text-slate-500 mb-2 break-all">${esc(s.store.path)}</div>
            <dl class="text-sm space-y-1">
                <div class="flex justify-between"><dt>Files</dt><dd class="font-medium">${(s.store.files || 0).toLocaleString()}</dd></div>
                <div class="flex justify-between"><dt>Total size</dt><dd class="font-medium">${fmtBytes(s.store.total)}</dd></div>
            </dl>
        </div>

        <div class="${card} lg:col-span-2">
            <h3 class="text-sm font-semibold mb-2">Tables (${(s.tables || []).length})</h3>
            <div class="overflow-auto"><table class="w-full text-sm">
                <thead class="text-xs text-slate-500 dark:text-slate-400"><tr><th class="text-left p-1.5">Table</th><th class="text-right p-1.5">Rows</th><th class="text-right p-1.5">Size</th></tr></thead>
                <tbody>${tableRows}</tbody>
            </table></div>
            ${(s.tables || []).some(t => t.bytes != null) ? '' : '<p class="text-xs text-slate-400 dark:text-slate-500 mt-2">Byte sizes need the SQLite <code>dbstat</code> vtable, which isn\'t compiled into this build.</p>'}
        </div>
    `;
});

registerTab({ id: 'storage', label: 'Storage', render });
