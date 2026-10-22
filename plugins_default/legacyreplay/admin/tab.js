// Replays tab (legacyreplay): everyone's replays kept on the server. Moderator+ can look and take a copy, Admin can delete.
import { AdminApp, registerTab, $ } from '/admin/app.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inputClass = 'border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-md px-3 py-1.5 text-sm';
const card = 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg';
const button = 'text-xs px-2 py-1 rounded-md font-medium border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700';

function size(n) {
    n = n || 0;
    if (n < 1024) return n + ' B';
    const u = ['KB', 'MB', 'GB', 'TB'];
    let i = -1; do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return n.toFixed(1) + ' ' + u[i];
};
const time = (ms) => { const s = Math.round((ms || 0) / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const canDelete = () => AdminApp.adminRoles >= 20 || !!$('sqlPassword').value;

let search = '', offset = 0, limit = 50;

function render(container) {
    container.innerHTML = `
        <div class="${card} p-4 mb-4 flex flex-wrap gap-2 items-center">
            <input type="text" id="rp-search" placeholder="owner username" class="${inputClass}" value="${esc(search)}">
            <button id="rp-go" class="text-xs px-3 py-1.5 rounded-md font-medium bg-indigo-600 hover:bg-indigo-500 text-white">Search</button>
            <span id="rp-totals" class="text-xs text-slate-400 dark:text-slate-500 ml-2"></span>
        </div>
        <div id="rp-heavy" class="text-xs text-slate-500 dark:text-slate-400 mb-3"></div>
        <div id="rp-list" class="${card} overflow-auto">Loading...</div>
        <div class="flex gap-2 mt-3"><button id="rp-prev" class="${button}">Newer</button><button id="rp-next" class="${button}">Older</button></div>
    `;
    const go = () => { search = $('rp-search').value.trim(); offset = 0; AdminApp.send('replayAdminList', { search, offset, limit }); };
    $('rp-go').onclick = go;
    $('rp-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    $('rp-prev').onclick = () => { offset = Math.max(0, offset - limit); AdminApp.send('replayAdminList', { search, offset, limit }); };
    $('rp-next').onclick = () => { offset += limit; AdminApp.send('replayAdminList', { search, offset, limit }); };
    AdminApp.send('replayAdminList', { search, offset, limit });
};

AdminApp.on('replayAdminList', (r) => {
    const list = $('rp-list');
    if (!list) return;
    offset = r.offset;
    $('rp-totals').textContent = `${r.total.replays} replays, ${size(r.total.bytes)}, ${r.total.owners} accounts`;
    $('rp-heavy').textContent = r.heaviest.length ? 'Most space: ' + r.heaviest.map(h => `${h.username ?? '?'} ${size(h.bytes)} (${h.replays})`).join(', ') : '';
    $('rp-prev').disabled = offset === 0;
    $('rp-next').disabled = offset + r.rows.length >= r.total.replays;

    const trust = { verified: 'verified', unverified: 'NOT VERIFIED', unknown: 'other server', unsigned: 'unsigned', '': '-' };
    list.innerHTML = `
        <table class="w-full text-sm">
            <thead class="text-left text-xs text-slate-400 dark:text-slate-500"><tr>
                <th class="p-2">Owner</th><th class="p-2">Map</th><th class="p-2">Saved</th><th class="p-2">Length</th><th class="p-2 text-right">Size</th>
                <th class="p-2">Signature</th><th class="p-2">Reels</th><th class="p-2">Expires</th><th class="p-2"></th>
            </tr></thead>
            <tbody>${r.rows.map(row => `
                <tr class="border-t border-slate-100 dark:border-slate-700" data-id="${row.id}">
                    <td class="p-2">${esc(row.username ?? '#' + row.ownerId)}</td>
                    <td class="p-2">${esc(row.map)}</td>
                    <td class="p-2">${new Date(row.created).toLocaleString()}</td>
                    <td class="p-2">${time(row.duration)}</td>
                    <td class="p-2 text-right">${size(row.bytes)}</td>
                    <td class="p-2">${esc(trust[row.trust] ?? row.trust)}</td>
                    <td class="p-2">${row.reels}</td>
                    <td class="p-2">${row.pinned ? 'pinned' : row.expires ? new Date(row.expires).toLocaleDateString() : '-'}</td>
                    <td class="p-2 whitespace-nowrap"><button class="${button}" data-act="get">Download</button> ${canDelete() ? `<button class="${button} text-rose-600" data-act="delete">Delete</button>` : ''}</td>
                </tr>`).join('') || '<tr><td class="p-3 text-slate-400" colspan="9">Nothing here.</td></tr>'}</tbody>
        </table>`;
    list.querySelectorAll('button[data-act]').forEach(b => {
        b.onclick = () => {
            const id = Number(b.closest('tr').dataset.id);
            if (b.dataset.act === 'get') AdminApp.send('replayAdminGet', { id });
            else if (confirm('Delete this replay and its reels?')) AdminApp.send('replayAdminDelete', { id });
        };
    });
});

AdminApp.on('replayAdminGet', (r) => {
    const bytes = Uint8Array.from(atob(r.data), c => c.charCodeAt(0));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    a.download = `${(r.username || 'replay').replace(/[^\w-]+/g, '')}-${r.map || 'replay'}-${new Date(r.created).toISOString().slice(0, 10)}.lsreplay`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
});

AdminApp.on('replayAdminDelete', () => AdminApp.send('replayAdminList', { search, offset, limit }));

registerTab({ id: 'replays', label: 'Replays', render, moderatorOnly: true });
