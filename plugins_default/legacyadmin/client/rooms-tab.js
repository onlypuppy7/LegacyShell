// Room/player/chat monitoring. The overview comes for free from the existing servicesInfo
// pipeline (adminGetServicesInfo just reads what game servers already push there periodically -
// see services/roomOverview.js). Drilling into one room's live player list / chat / kick action
// routes directly to that specific game instance instead (see game/roomBridge.js).
import { AdminApp, registerTab, $, setQueryParam } from './app.js';

let lastGameInfo = {};
let drilldownGameId = null;

function render(container, params) {
    drilldownGameId = params.get('room') || null;
    container.innerHTML = `
        <button id="rooms-refresh" class="text-xs px-3 py-1.5 rounded-md font-medium border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 mb-4">Refresh</button>
        <div id="rooms-overview" class="space-y-4"></div>
        <div id="rooms-drilldown" class="mt-4"></div>
    `;
    container.querySelector('#rooms-refresh').onclick = () => AdminApp.send('adminGetServicesInfo');
    AdminApp.send('adminGetServicesInfo');
    if (drilldownGameId) loadDrilldown(drilldownGameId, container);
};

function routeIdForServerIndex(index) {
    const server = AdminApp.servers.find(s => String(s.yourServer) === String(index) && s.serverType === 'game');
    return server?.id || null;
};

AdminApp.on('adminGetServicesInfo', (result) => {
    lastGameInfo = result.gameInfo || {};
    const overview = $('rooms-overview');
    if (!overview) return;

    const serverIndices = Object.keys(lastGameInfo);
    if (serverIndices.length === 0) { overview.innerHTML = '<div class="text-sm text-slate-400 dark:text-slate-500">No game servers have reported in yet.</div>'; return; };

    overview.innerHTML = '';
    for (const index of serverIndices) {
        const info = lastGameInfo[index];
        const rooms = info.rooms || [];
        const routeId = routeIdForServerIndex(index);
        const section = document.createElement('section');
        section.className = 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden';
        section.innerHTML = `<div class="bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-sm font-semibold">Game server #${escapeHtml(index)}</div>`;
        if (rooms.length === 0) {
            section.innerHTML += '<div class="p-3 text-sm text-slate-400 dark:text-slate-500">No open rooms.</div>';
        } else {
            const table = document.createElement('table');
            table.className = 'w-full text-sm';
            table.innerHTML = `<thead class="text-xs text-slate-500 dark:text-slate-400"><tr><th class="text-left p-2">Game ID</th><th class="text-left p-2">Map</th><th class="text-left p-2">Type</th><th class="text-left p-2">Players</th><th class="text-left p-2">Names</th><th class="p-2"></th></tr></thead>`;
            const tbody = document.createElement('tbody');
            rooms.forEach(room => {
                const tr = document.createElement('tr');
                tr.className = 'border-t border-slate-100 dark:border-slate-700';
                const btn = routeId ? `<button class="text-xs text-indigo-600 hover:underline">Manage</button>` : '';
                const names = (room.playerNames || []).filter(Boolean).map(escapeHtml).join(', ');
                tr.innerHTML = `<td class="p-2 font-mono">${escapeHtml(room.gameId)}</td><td class="p-2">${escapeHtml(room.mapId)}</td><td class="p-2">${escapeHtml(room.gameType)}</td><td class="p-2">${escapeHtml(room.playerCount)}/${escapeHtml(room.playerLimit)}</td><td class="p-2 truncate max-w-xs">${names}</td><td class="p-2">${btn}</td>`;
                const manageBtn = tr.querySelector('button');
                if (manageBtn) manageBtn.onclick = () => {
                    AdminApp.setTarget(routeId);
                    setQueryParam('room', room.gameId);
                    loadDrilldown(room.gameId, $('tabContent'));
                };
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            section.appendChild(table);
        };
        overview.appendChild(section);
    };
});

function loadDrilldown(gameId, container) {
    drilldownGameId = gameId;
    const drilldown = container.querySelector('#rooms-drilldown');
    if (!drilldown) return;
    drilldown.innerHTML = `<div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
        <h3 class="text-sm font-semibold mb-2">Room ${escapeHtml(gameId)}</h3>
        <div id="room-players">Loading...</div>
        <div id="room-chat"></div>
    </div>`;
    AdminApp.send('adminListRooms');
    AdminApp.send('adminGetRoomChat', { gameId });
};

AdminApp.on('adminListRooms', (result) => {
    const playersEl = $('room-players');
    if (!playersEl || !drilldownGameId) return;
    const room = (result.rooms || []).find(r => String(r.gameId) === String(drilldownGameId));
    if (!room) { playersEl.innerHTML = '<div class="text-sm text-slate-400 dark:text-slate-500">Room not found on this server (it may have just closed).</div>'; return; };

    const table = document.createElement('table');
    table.className = 'w-full text-sm mb-3';
    table.innerHTML = '<thead class="text-xs text-slate-500 dark:text-slate-400"><tr><th class="text-left p-1">Player</th><th class="p-1"></th></tr></thead>';
    const tbody = document.createElement('tbody');
    (room.playerNames || []).forEach((name, i) => {
        if (!name) return;
        const playerId = room.playerIds?.[i];
        const tr = document.createElement('tr');
        tr.className = 'border-t border-slate-100 dark:border-slate-700';
        tr.innerHTML = `<td class="p-1">${escapeHtml(name)}</td><td class="p-1"><button class="text-xs text-rose-600">Kick</button></td>`;
        tr.querySelector('button').onclick = () => {
            if (!confirm(`Kick ${name}?`)) return;
            AdminApp.send('adminKickPlayer', { gameId: drilldownGameId, playerId, reason: 'Kicked via admin panel' });
        };
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    playersEl.innerHTML = '';
    playersEl.appendChild(table);
});

AdminApp.on('adminGetRoomChat', (result) => {
    const chatEl = $('room-chat');
    if (!chatEl) return;
    const messages = result.messages || [];
    chatEl.innerHTML = '<h4 class="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Recent chat</h4>' + (messages.length
        ? '<div class="max-h-48 overflow-auto font-mono text-xs bg-slate-50 dark:bg-slate-900/40 rounded-md p-2 space-y-0.5">' +
            messages.map(m => `<div>[${new Date(m.at).toLocaleTimeString()}] <span class="font-semibold">${escapeHtml(m.senderName)}:</span> ${escapeHtml(m.text)}</div>`).join('') +
          '</div>'
        : '<div class="text-sm text-slate-400 dark:text-slate-500">No chat captured yet.</div>');
});

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
};

registerTab({ id: 'rooms', label: 'Rooms', render, moderatorOnly: true });
