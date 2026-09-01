// Dashboard - the default view, reached by the "LegacyAdmin" nav button (#home), hidden from the
// tab bar. Fans out a batch of read commands on open and fills cards as answers arrive.
import { AdminApp, registerTab, $ } from './app.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function fmtBytes(n) {
    if (n == null) return '-';
    if (n < 1024) return n + ' B';
    const u = ['KB', 'MB', 'GB', 'TB']; let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return n.toFixed(1) + ' ' + u[i];
};
function fmtUp(sec) { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h >= 24 ? `${Math.floor(h / 24)}d${h % 24}h` : `${h}h${m}m`; };

const card = 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4';
const stat = (label, value, sub) => `<div class="${card}"><div class="text-xs text-slate-400 dark:text-slate-500">${label}</div><div class="text-2xl font-semibold mt-1">${value}</div>${sub ? `<div class="text-xs text-slate-400 dark:text-slate-500 mt-0.5">${sub}</div>` : ''}</div>`;

let perfByTag = {};

function render(container) {
    perfByTag = {};
    container.innerHTML = `
        <div class="flex items-center gap-3 mb-4">
            <h2 class="text-lg font-semibold">Dashboard</h2>
            <button id="dash-refresh" class="text-xs px-3 py-1.5 rounded-md font-medium border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700">Refresh</button>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <div id="dash-accounts">${stat('Accounts', '…')}</div>
            <div id="dash-online">${stat('Players online', '…')}</div>
            <div id="dash-rooms">${stat('Open rooms', '…')}</div>
            <div id="dash-mod">${stat('Bans / mutes', '…')}</div>
            <div id="dash-db">${stat('Database', '…')}</div>
            <div id="dash-backups">${stat('Backups', '…')}</div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div class="${card}">
                <h3 class="text-sm font-semibold mb-2">Instances &amp; performance</h3>
                <div class="overflow-auto"><table class="w-full text-sm">
                    <thead class="text-xs text-slate-500 dark:text-slate-400"><tr><th class="text-left p-1.5">Instance</th><th class="text-right p-1.5">CPU</th><th class="text-right p-1.5">RSS</th><th class="text-right p-1.5">Uptime</th></tr></thead>
                    <tbody id="dash-instances"><tr><td class="p-1.5 text-slate-400 dark:text-slate-500" colspan="4">Loading…</td></tr></tbody>
                </table></div>
                <div class="text-xs text-slate-400 dark:text-slate-500 mt-1" id="dash-load"></div>
            </div>
            <div class="${card}">
                <h3 class="text-sm font-semibold mb-2">Recent privileged actions</h3>
                <div id="dash-audit" class="text-xs text-slate-400 dark:text-slate-500">…</div>
            </div>
        </div>
    `;
    container.querySelector('#dash-refresh').onclick = fanout;
    fanout();
};

function fanout() {
    const fullAccess = !!document.getElementById('sqlPassword')?.value;
    const adminTier = AdminApp.adminRoles >= 20 || fullAccess;
    AdminApp.send('adminListServers');
    AdminApp.send('adminGetServicesInfo');
    AdminApp.send('adminListModeration');
    AdminApp.send('adminGetStorage');
    AdminApp.sendTo('', 'adminGetPerf', { tag: 'services' }); // force direct-to-services regardless of the global selection
    if (adminTier) AdminApp.send('adminGetAuditLog', { limit: 8 });
    else { const a = $('dash-audit'); if (a) a.textContent = 'Admin tier only.'; }
    if (fullAccess) AdminApp.send('sqlRequest', { sql: 'SELECT COUNT(*) AS c, SUM(adminRoles >= 10) AS staff FROM users', sqlType: 'getOne' });
    else { const a = $('dash-accounts'); if (a) a.innerHTML = stat('Accounts', 'n/a', 'needs SQL password'); }
}

AdminApp.on('adminListServers', (r) => {
    const tb = $('dash-instances');
    if (!tb) return;
    const servers = r.servers || [];
    for (const s of servers) AdminApp.sendTo(s.id, 'adminGetPerf', { tag: s.id });
    renderInstances(servers);
});

function renderInstances(servers) {
    const tb = $('dash-instances');
    if (!tb) return;
    const rowFor = (label, tag) => {
        const p = perfByTag[tag];
        return `<tr class="border-t border-slate-100 dark:border-slate-700">
            <td class="p-1.5">${esc(label)}</td>
            <td class="p-1.5 text-right ${p && p.cpuPercent > 80 ? 'text-rose-600 font-medium' : ''}">${p ? p.cpuPercent + '%' : '…'}</td>
            <td class="p-1.5 text-right">${p ? p.rssMB + 'MB' : '…'}</td>
            <td class="p-1.5 text-right">${p ? fmtUp(p.uptimeSec) : '…'}</td>
        </tr>`;
    };
    const rows = [rowFor('services (this)', 'services')]
        .concat((servers || []).map(s => rowFor(s.name ? `${s.name} · ${s.serverType} #${s.yourServer}` : `${s.serverType} (unregistered)`, s.id)));
    tb.innerHTML = rows.join('') || '<tr><td class="p-1.5 text-slate-400 dark:text-slate-500" colspan="4">No instances connected.</td></tr>';
    const svc = perfByTag['services'];
    const load = $('dash-load');
    if (load && svc) load.textContent = `host: ${svc.cpuCount} cores · load ${svc.loadavg1} · RAM ${fmtBytes((svc.sysTotalMB - svc.sysFreeMB) * 1048576)} / ${fmtBytes(svc.sysTotalMB * 1048576)} used`;
};

AdminApp.on('adminGetPerf', (p) => {
    if (!p || !p.tag) return;
    perfByTag[p.tag] = p;
    if ($('dash-instances')) renderInstances(AdminApp.servers);
});

AdminApp.on('adminGetServicesInfo', (result) => {
    const info = result.gameInfo || {};
    let players = 0, rooms = 0;
    for (const idx of Object.keys(info)) {
        const rs = info[idx].rooms || [];
        rooms += rs.length;
        for (const rm of rs) players += (rm.playerCount || 0);
    };
    if ($('dash-online')) $('dash-online').innerHTML = stat('Players online', players, `${Object.keys(info).length} game server(s)`);
    if ($('dash-rooms')) $('dash-rooms').innerHTML = stat('Open rooms', rooms);
});

AdminApp.on('adminListModeration', (result) => {
    const rows = result.rows || [];
    const bans = rows.filter(r => r.type === 'ban').length;
    const mutes = rows.filter(r => r.type === 'mute').length;
    if ($('dash-mod')) $('dash-mod').innerHTML = stat('Bans / mutes', `${bans} / ${mutes}`);
});

AdminApp.on('adminGetStorage', (s) => {
    if ($('dash-db')) $('dash-db').innerHTML = stat('Database', fmtBytes(s.db.bytes), `${(s.tables || []).length} tables`);
    if ($('dash-backups')) $('dash-backups').innerHTML = stat('Backups', s.backups.count, fmtBytes(s.backups.bytes));
});

AdminApp.on('result', (r) => {
    // the COUNT(*) getOne from fanout(): a bare object with a numeric `c`
    if (r && !Array.isArray(r) && typeof r.c === 'number' && $('dash-accounts')) {
        $('dash-accounts').innerHTML = stat('Accounts', r.c.toLocaleString(), `${r.staff || 0} staff (rank &ge; 10)`);
    };
});

AdminApp.on('adminGetAuditLog', (result) => {
    const el = $('dash-audit');
    if (!el) return;
    const rows = (result.rows || []).slice(0, 8);
    if (result.note) { el.textContent = result.note; return; };
    if (!rows.length) { el.textContent = 'No audit entries.'; return; };
    el.innerHTML = rows.map(x => `<div class="border-t border-slate-100 dark:border-slate-700 py-1 flex gap-2">
        <span class="text-slate-400 dark:text-slate-500 whitespace-nowrap">${esc(new Date(x.at * 1000).toLocaleTimeString())}</span>
        <span class="font-mono">${esc(x.action)}</span>
        <span>${esc(x.actor)}</span>
        <span class="${x.result === 'ok' ? 'text-emerald-600' : x.result === 'denied' ? 'text-amber-600' : 'text-rose-600'}">${esc(x.result)}</span>
        <span class="text-slate-400 dark:text-slate-500 truncate">${esc(x.target || '')}</span>
    </div>`).join('');
});

registerTab({ id: 'home', label: 'Home', render, hidden: true });
