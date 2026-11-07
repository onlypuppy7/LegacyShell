// AdminRoles tab: the ranks adminRoles is checked against (distributed_permissions.yaml's `ranks`), with an icon for each one
// that legacyprofiles shows on profiles and the leaderboard. Admin or the SQL password can edit, game and client pick it up on restart.
import { AdminApp, registerTab, setStatus, $, esc } from './app.js';

const card = 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg';
const inputClass = 'border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-md px-2 py-1 text-sm disabled:opacity-50';
const button = 'text-xs px-3 py-1.5 rounded-md font-medium border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40';
const primaryButton = 'text-xs px-3 py-1.5 rounded-md font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40';
const dangerButton = 'text-xs px-3 py-1.5 rounded-md font-medium bg-red-600 hover:bg-red-500 text-white disabled:opacity-40';

let server = null, rows = [], nextId = 1;

const canEdit = () => AdminApp.adminRoles >= 20 || !!$('sqlPassword').value;
const iconUrl = (icon) => !icon ? '' : icon.startsWith('<') ? 'data:image/svg+xml,' + encodeURIComponent(icon) : `/legacyprofiles/icons/roles/${encodeURIComponent(icon)}.svg`;

function load(data) {
    server = data;
    rows = data.roles.map(role => ({ id: nextId++, value: String(role.value), name: role.name, icon: data.icons[role.value] || '' }));
    draw();
};

const fixed = (row) => server.locked.includes(Number(row.value)) || server.pinned.includes(Number(row.value));
const nameFixed = (row) => server.locked.includes(Number(row.value));

function problems() {
    const seen = new Map(), names = new Map(), found = new Map();
    for (const row of rows) {
        const value = Number(row.value), name = row.name.trim();
        if (row.value === '' || !Number.isInteger(value) || value < 0 || value > 255) found.set(row.id, 'Positions are whole numbers from 0 to 255.');
        else if (seen.has(value)) { found.set(row.id, `Position ${value} is already taken.`); found.set(seen.get(value), `Position ${value} is already taken.`); }
        else seen.set(value, row.id);
        if (!name) found.set(row.id, found.get(row.id) || 'Give it a name.');
        else if (names.has(name.toLowerCase())) { found.set(row.id, found.get(row.id) || 'That name is already used.'); found.set(names.get(name.toLowerCase()), found.get(names.get(name.toLowerCase())) || 'That name is already used.'); }
        else names.set(name.toLowerCase(), row.id);
    };
    return found;
};

function refreshState() {
    const found = problems();
    for (const row of rows) {
        const el = document.querySelector(`[data-row="${row.id}"]`);
        if (!el) continue;
        el.querySelector('[data-msg]').textContent = found.get(row.id) || '';
        el.querySelector('[data-value]').classList.toggle('border-red-500', found.has(row.id));
    };
    const save = $('ar-save');
    if (save) save.disabled = found.size > 0 || !canEdit();
    const note = $('ar-restart');
    if (note) note.classList.add('hidden');
};

function iconCell(row) {
    const options = ['', ...server.builtin].map(name => `<option value="${name}" ${row.icon === name ? 'selected' : ''}>${name || 'Default'}</option>`).join('');
    const custom = row.icon.startsWith('<');
    return `
        <span data-preview class="inline-block w-6 h-6 shrink-0 ${row.icon ? 'bg-slate-700 dark:bg-slate-200' : 'border border-dashed border-slate-300 dark:border-slate-600 rounded'}" style="${row.icon ? `-webkit-mask:url('${iconUrl(row.icon)}') center/contain no-repeat;mask:url('${iconUrl(row.icon)}') center/contain no-repeat` : ''}"></span>
        <select data-icon class="${inputClass} w-28">${options}<option value="__custom" ${custom ? 'selected' : ''}>Custom svg</option></select>
        <button data-upload class="${button}" ${canEdit() ? '' : 'disabled'}>Upload svg</button>
        <input data-file type="file" accept=".svg,image/svg+xml" class="hidden">`;
};

function draw() {
    const container = $('ar-body');
    if (!container) return;
    rows.sort((a, b) => (Number(a.value) || 0) - (Number(b.value) || 0));
    const editable = canEdit();
    container.innerHTML = rows.map(row => `
        <div data-row="${row.id}" class="flex flex-wrap items-center gap-2 p-2 border-t border-slate-100 dark:border-slate-700 first:border-t-0">
            <input data-value type="number" min="0" max="255" value="${esc(row.value)}" class="${inputClass} w-20" ${fixed(row) || !editable ? 'disabled' : ''} title="0 to 255">
            <input data-name type="text" maxlength="32" value="${esc(row.name)}" class="${inputClass} w-48" ${nameFixed(row) || !editable ? 'disabled' : ''}>
            ${iconCell(row)}
            <button data-remove class="${button}" ${fixed(row) || !editable ? 'disabled' : ''} title="${fixed(row) ? 'This one has to stay' : ''}">Remove</button>
            <span data-msg class="text-xs text-red-500"></span>
        </div>`).join('');

    for (const row of rows) {
        const el = container.querySelector(`[data-row="${row.id}"]`);
        const redraw = () => { draw(); refreshState(); };
        el.querySelector('[data-value]').oninput = (e) => { row.value = e.target.value; refreshState(); };
        el.querySelector('[data-value]').onchange = redraw;
        el.querySelector('[data-name]').oninput = (e) => { row.name = e.target.value; refreshState(); };
        el.querySelector('[data-remove]').onclick = () => { rows = rows.filter(r => r !== row); redraw(); };
        el.querySelector('[data-icon]').onchange = (e) => {
            if (e.target.value === '__custom') return el.querySelector('[data-file]').click();
            row.icon = e.target.value; redraw();
        };
        el.querySelector('[data-upload]').onclick = () => el.querySelector('[data-file]').click();
        el.querySelector('[data-file]').oncancel = redraw;
        el.querySelector('[data-file]').onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return redraw();
            if (file.size > server.maxSvg) { setStatus(`That svg is too big (${server.maxSvg} bytes max).`, true); return redraw(); };
            row.icon = (await file.text()).trim();
            redraw();
        };
    };
    refreshState();
};

function render(container) {
    container.innerHTML = `
        <p class="text-sm text-slate-500 dark:text-slate-400 mb-3 max-w-3xl">The ranks an account's <code>adminRoles</code> number is matched against: a player counts as the highest rank at or below their number, and permissions are checked the same way. Icons show on profiles and the leaderboard. They are drawn in one colour, so only the shape of the svg matters (it needs a viewBox, ${8192 / 1024}KB max). Guests and bots keep their own.</p>
        <div class="${card} mb-3">
            <div class="flex items-center gap-2 p-2 text-xs text-slate-500 dark:text-slate-400"><span class="w-20">Position</span><span class="w-48">Name</span><span>Icon</span></div>
            <div id="ar-body" class="px-0">Loading...</div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
            <button id="ar-add" class="${button}">Add rank</button>
            <button id="ar-save" class="${primaryButton}" disabled>Save</button>
            <button id="ar-revert" class="${button}">Revert</button>
            <span id="ar-restart" class="hidden text-xs text-slate-500 dark:text-slate-400">Saved. Game and client read this when they start, so
                <button id="ar-restart-btn" class="${dangerButton}" ${$('sqlPassword').value ? '' : 'disabled title="Needs the SQL password"'}>Restart everything</button></span>
        </div>`;
    $('ar-add').onclick = () => {
        const taken = new Set(rows.map(row => Number(row.value)));
        let value = 2; while (taken.has(value) && value < 255) value++;
        if (taken.has(value)) return setStatus('Every position is taken.', true);
        rows.push({ id: nextId++, value: String(value), name: '', icon: '' });
        draw();
        document.querySelector(`[data-row="${rows.find(r => r.value === String(value)).id}"] [data-name]`)?.focus();
    };
    $('ar-add').disabled = !canEdit();
    $('ar-revert').onclick = () => AdminApp.send('adminGetRoles');
    $('ar-save').onclick = () => {
        const icons = {};
        for (const row of rows) if (row.icon) icons[Number(row.value)] = row.icon;
        AdminApp.send('adminSetRoles', { roles: rows.map(row => ({ value: Number(row.value), name: row.name.trim() })), icons });
    };
    $('ar-restart-btn').onclick = () => {
        if (confirm('Restart services and every connected instance now? Everyone in a game gets dropped briefly.')) AdminApp.send('adminRestartServices');
    };
    AdminApp.send('adminGetRoles');
};

AdminApp.on('adminGetRoles', load);
AdminApp.on('adminSetRoles', (data) => {
    load(data);
    setStatus('Roles saved.');
    $('ar-restart')?.classList.remove('hidden');
});

registerTab({ id: 'adminroles', label: 'AdminRoles', render, adminOnly: true });
