// Accounts tab (formerly "Inventory"): a general per-account manager. Left = every account,
// right = editor. Keeps the original eggs / VIP / owned-items editing (still via sqlRequest) and
// adds, gated behind the Admin tier:
//   - rename the account            -> adminSetUsername
//   - set a new password            -> adminSetPassword (SHA-256'd here first, like the game login)
//   - open a throwaway tab logged in as them -> adminImpersonate + client/impersonate-inject.js
// plus a per-account ban / mute panel that reuses the same adminAddModeration/RemoveModeration/
// ListModeration commands the Moderation tab uses (target_type 'account_id').
import { AdminApp, registerTab, $, setQueryParam } from './app.js';
import { createItemPicker } from './tilePicker.js';

let allItems = [];
let allAccounts = [];
let picker = null;
let currentAccount = null;
let modRows = [];

const primaryBtn = 'text-xs px-3 py-1.5 rounded-md font-medium bg-indigo-600 hover:bg-indigo-500 text-white';
const plainBtn = 'text-xs px-3 py-1.5 rounded-md font-medium border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700';
const dangerBtn = 'text-xs px-3 py-1.5 rounded-md font-medium border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950';
const inputClass = 'border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-md px-3 py-1.5 text-sm';
const labelClass = 'text-xs font-medium text-slate-500 dark:text-slate-400 block mb-0.5';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isAdminTier = () => AdminApp.adminRoles >= 20 || !!$('sqlPassword')?.value;

async function sha256Hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
};

// upgradeExpiryDate is unix SECONDS. <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm".
const pad2 = (n) => String(n).padStart(2, '0');
function unixToLocalInput(sec) {
    if (!sec) return '';
    const d = new Date(sec * 1000);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
function localInputToUnix(value) {
    if (!value) return 0;
    const ms = new Date(value).getTime(); // "YYYY-MM-DDTHH:mm" parses as local time
    return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
};
function vipStatus(sec) {
    if (!sec) return '(none)';
    return (sec * 1000 > Date.now()) ? `(active until ${new Date(sec * 1000).toLocaleString()})` : '(expired)';
};

let pendingSelectId = null; // account id from ?account= to auto-open once the list arrives

function render(container, params) {
    pendingSelectId = params?.get('account') || null;
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
    AdminApp.send('adminListModeration');
    AdminApp.send('sqlRequest', { sql: 'SELECT account_id, username, adminRoles FROM users ORDER BY username', sqlType: 'getAll' });
};

AdminApp.on('adminGetCatalog', (result) => { allItems = result.items || []; });

AdminApp.on('adminListModeration', (result) => {
    modRows = result.rows || [];
    if (currentAccount && $('tabContent')?.querySelector('#inv-mod-panel')) renderModPanel();
});

AdminApp.on('result', (result) => {
    if (!Array.isArray(result) || !result.length || !('username' in result[0]) || 'currentBalance' in result[0]) return;
    allAccounts = result;
    renderAccountList($('tabContent')?.querySelector('#inv-search')?.value || '');
    if (pendingSelectId && allAccounts.some(a => String(a.account_id) === String(pendingSelectId))) {
        const id = pendingSelectId;
        pendingSelectId = null;
        AdminApp.send('sqlRequest', { sql: `SELECT * FROM users WHERE account_id = ${Number(id)}`, sqlType: 'getOne' });
    };
});

function renderAccountList(filterText) {
    const list = $('inv-account-list');
    if (!list) return;
    const filter = (filterText || '').toLowerCase();
    const filtered = allAccounts.filter(a => !filter || a.username?.toLowerCase().includes(filter) || String(a.account_id).includes(filter));
    list.innerHTML = filtered.map(a => `
        <button data-id="${a.account_id}" class="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 ${currentAccount?.account_id === a.account_id ? 'bg-indigo-50 dark:bg-indigo-950' : ''}">
            <div class="font-medium">${esc(a.username)}</div>
            <div class="text-xs text-slate-400 dark:text-slate-500">#${a.account_id} · role ${a.adminRoles || 0}</div>
        </button>
    `).join('') || '<div class="p-3 text-sm text-slate-400 dark:text-slate-500">No accounts match.</div>';
    list.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => {
            setQueryParam('account', btn.dataset.id);
            AdminApp.send('sqlRequest', { sql: `SELECT * FROM users WHERE account_id = ${Number(btn.dataset.id)}`, sqlType: 'getOne' });
        };
    });
};

AdminApp.on('result', (result) => {
    if (!result || Array.isArray(result) || !('account_id' in result) || !('currentBalance' in result)) return;
    const container = $('tabContent');
    if (!container?.querySelector('#inv-editor')) return;
    currentAccount = result;
    setQueryParam('account', result.account_id);
    renderAccountList(container.querySelector('#inv-search')?.value || '');
    renderEditor(container);
});

function renderEditor(container) {
    let owned = [];
    try { owned = JSON.parse(currentAccount.ownedItemIds); } catch { owned = []; };

    const admin = isAdminTier();
    const editor = container.querySelector('#inv-editor');
    editor.innerHTML = `
        <div class="text-xs text-slate-400 dark:text-slate-500 mb-3">${esc(currentAccount.username)} · #${currentAccount.account_id} · role ${currentAccount.adminRoles || 0}</div>

        ${admin ? `
        <div class="border border-slate-200 dark:border-slate-700 rounded-md p-3 mb-4">
            <div class="${labelClass} !text-slate-600 dark:!text-slate-300 !font-semibold mb-2">Identity (Admin)</div>
            <div class="flex flex-wrap gap-2 items-end mb-2">
                <div><label class="${labelClass}">Username</label><input type="text" id="inv-username" value="${esc(currentAccount.username)}" class="${inputClass}"></div>
                <button id="inv-rename" class="${plainBtn}">Rename</button>
                <button id="inv-impersonate" class="${plainBtn}">Log in as &rarr; (new tab)</button>
            </div>
            <div class="flex flex-wrap gap-2 items-end">
                <div><label class="${labelClass}">New password</label><input type="password" id="inv-password" autocomplete="new-password" placeholder="min 8, 1 letter + 1 number" class="${inputClass}"></div>
                <button id="inv-setpw" class="${plainBtn}">Set password</button>
            </div>
        </div>` : ''}

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div>
                <label class="${labelClass}">Eggs</label>
                <input type="text" id="inv-eggs" value="${currentAccount.currentBalance}" class="w-full ${inputClass}">
            </div>
            <div>
                <label class="${labelClass}">VIP expires <span class="font-normal">${vipStatus(currentAccount.upgradeExpiryDate)}</span></label>
                <input type="datetime-local" id="inv-vip-expiry" value="${unixToLocalInput(currentAccount.upgradeExpiryDate)}" class="w-full ${inputClass}">
            </div>
            <div>
                <label class="${labelClass}">VIP multiplier</label>
                <input type="text" id="inv-multiplier" value="${currentAccount.upgradeMultiplier ?? ''}" placeholder="e.g. 2" class="w-full ${inputClass}">
            </div>
        </div>
        <label class="${labelClass}">Owned items</label>
        <div id="inv-item-picker">Loading...</div>
        <button id="inv-save" class="${primaryBtn} mt-3">Save eggs / VIP / items</button>

        <div id="inv-mod-panel" class="border border-slate-200 dark:border-slate-700 rounded-md p-3 mt-4"></div>
    `;
    picker = createItemPicker(editor.querySelector('#inv-item-picker'), allItems, owned, () => {});

    editor.querySelector('#inv-save').onclick = () => {
        const eggs = Number(editor.querySelector('#inv-eggs').value) || 0;
        const vipExpiry = localInputToUnix(editor.querySelector('#inv-vip-expiry').value);
        const adFree = (vipExpiry * 1000 > Date.now()) ? 1 : 0; // keep the bool in sync with the date
        const multiplierRaw = editor.querySelector('#inv-multiplier').value.trim();
        const multiplier = multiplierRaw === '' ? 'NULL' : Number(multiplierRaw);
        const itemIdsJson = JSON.stringify(picker.getSelected()).replaceAll("'", "''");

        AdminApp.send('sqlRequest', {
            sql: `UPDATE users SET currentBalance = ${eggs}, upgradeExpiryDate = ${vipExpiry}, upgradeAdFree = ${adFree}, upgradeMultiplier = ${multiplier}, ownedItemIds = '${itemIdsJson}' WHERE account_id = ${currentAccount.account_id} RETURNING *`,
            sqlType: 'getOne',
        });
    };

    if (admin) {
        editor.querySelector('#inv-rename').onclick = () => {
            const username = editor.querySelector('#inv-username').value.trim();
            if (!username || username === currentAccount.username) return;
            if (!confirm(`Rename #${currentAccount.account_id} from "${currentAccount.username}" to "${username}"? Their saved "remember me" login on their own device will stop working until they log in again.`)) return;
            AdminApp.send('adminSetUsername', { account_id: currentAccount.account_id, username });
        };
        editor.querySelector('#inv-setpw').onclick = async () => {
            const pw = editor.querySelector('#inv-password').value;
            if (pw.length < 8) { alert('Password must be at least 8 characters.'); return; };
            if (!confirm(`Set a new password for ${currentAccount.username} (#${currentAccount.account_id})?`)) return;
            AdminApp.send('adminSetPassword', { account_id: currentAccount.account_id, passwordSha256: await sha256Hex(pw) });
            editor.querySelector('#inv-password').value = '';
        };
        editor.querySelector('#inv-impersonate').onclick = () => {
            if (!confirm(`Open a new tab logged in as ${currentAccount.username}? This rotates their remember-me token (they'll re-enter their password next time on their own device). Nothing is saved in this browser.`)) return;
            AdminApp.send('adminImpersonate', { account_id: currentAccount.account_id });
        };
    };

    renderModPanel();
};

function renderModPanel() {
    const panel = $('inv-mod-panel');
    if (!panel || !currentAccount) return;
    const id = String(currentAccount.account_id);
    const mine = modRows.filter(r => r.target_type === 'account_id' && String(r.target_value) === id);
    const banRow = mine.find(r => r.type === 'ban');
    const muteRow = mine.find(r => r.type === 'mute');

    panel.innerHTML = `
        <div class="${labelClass} !text-slate-600 dark:!text-slate-300 !font-semibold mb-2">Moderation (account-wide)</div>
        <div class="flex flex-wrap gap-2 items-center">
            <span class="text-xs px-2 py-0.5 rounded ${banRow ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}">${banRow ? 'BANNED' : 'not banned'}</span>
            <button id="inv-ban-toggle" class="${banRow ? plainBtn : dangerBtn}">${banRow ? 'Lift ban' : 'Ban account'}</button>
            <span class="text-xs px-2 py-0.5 rounded ${muteRow ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}">${muteRow ? 'MUTED' : 'not muted'}</span>
            <button id="inv-mute-toggle" class="${muteRow ? plainBtn : dangerBtn}">${muteRow ? 'Unmute' : 'Mute account'}</button>
        </div>
        ${banRow?.reason || muteRow?.reason ? `<div class="text-xs text-slate-400 dark:text-slate-500 mt-1">${esc([banRow?.reason && 'ban: ' + banRow.reason, muteRow?.reason && 'mute: ' + muteRow.reason].filter(Boolean).join(' · '))}</div>` : ''}
    `;

    const toggle = (type, row) => () => {
        if (row) {
            AdminApp.send('adminRemoveModeration', { id: row.id });
        } else {
            const reason = prompt(`Reason for ${type} (optional):`, '') ?? '';
            AdminApp.send('adminAddModeration', { type, targetType: 'account_id', targetValue: id, reason });
        };
        setTimeout(() => AdminApp.send('adminListModeration'), 200);
    };
    panel.querySelector('#inv-ban-toggle').onclick = toggle('ban', banRow);
    panel.querySelector('#inv-mute-toggle').onclick = toggle('mute', muteRow);
};

AdminApp.on('adminSetUsername', (r) => {
    if (currentAccount && currentAccount.account_id === r.account_id) currentAccount.username = r.username;
    AdminApp.send('sqlRequest', { sql: 'SELECT account_id, username, adminRoles FROM users ORDER BY username', sqlType: 'getAll' });
    const el = $('tabContent')?.querySelector('#inv-editor');
    if (el) renderEditor($('tabContent'));
});
AdminApp.on('adminSetPassword', () => { const s = $('status'); if (s) { s.textContent = 'Password updated.'; s.className = 'px-4 py-1 text-xs min-h-[1.5em] text-emerald-600'; } });
AdminApp.on('adminImpersonate', (r) => {
    const url = `/?adminImpersonate=1&impUser=${encodeURIComponent(r.username)}&impToken=${encodeURIComponent(r.authToken)}`;
    window.open(url, '_blank', 'noopener');
});

registerTab({ id: 'accounts', label: 'Accounts', render, moderatorOnly: true });
