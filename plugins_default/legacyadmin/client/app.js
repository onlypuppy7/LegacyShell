// Core shell: connection (always direct to services), auth (both tiers), the login gate ->
// main-app transition, tab routing via #hash + ?query, and a tiny pub/sub so each tab module can
// register for the response keys it cares about without app.js needing to know their shapes.

const $ = (id) => document.getElementById(id);

// Commands that get wrapped in adminRouteToServer when a target instance is selected. Everything
// else (login, SQL, catalog, codes, moderation CRUD, servicesInfo) is inherently services-local and
// always sent directly, regardless of what's selected in the target picker.
const ROUTABLE_COMMANDS = new Set(['adminListFiles', 'adminReadFile', 'adminWriteFile', 'adminRestartThis', 'adminListRooms', 'adminGetRoomChat', 'adminKickPlayer', 'adminGetPerf', 'adminUpdatePull']);

// Commands that genuinely need SQL-password / file / restart power. The SQL password and auth key
// are only attached to these (or to the adminRouteToServer wrapper, or when there's no moderator
// session to authenticate with) - not stapled onto every list refresh the way they used to be.
const SQL_TIER_COMMANDS = new Set(['sqlRequest', 'adminListFiles', 'adminReadFile', 'adminWriteFile', 'adminRestartThis', 'adminRestartServices', 'adminUpdatePull']);

const listeners = new Map(); // response key -> Set<fn>

export const AdminApp = {
    ws: null,
    connected: false,
    adminRoles: 0,
    servers: [], // last adminListServers result
    targetId: '', // '' = manage this services instance; otherwise a registry id (set from the Instances tab)

    // auto-reconnect state
    everConnected: false,   // don't retry a first connect that never succeeded (probably a bad address)
    intentionalClose: false, // set by logout() so we don't fight it
    _reconnectAttempts: 0,
    _reconnectTimer: null,
    _stableTimer: null,

    on(key, fn) {
        if (!listeners.has(key)) listeners.set(key, new Set());
        listeners.get(key).add(fn);
    },

    send(cmd, extra) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) { setStatus('Not connected', true); return; };

        const sqlPw = $('sqlPassword').value;
        const authKey = $('gameServerAuthKey').value;
        const session = localStorage.getItem('adminSession');
        const targetId = this.targetId;
        const routing = !!(targetId && ROUTABLE_COMMANDS.has(cmd));
        const needsSql = SQL_TIER_COMMANDS.has(cmd);

        const creds = {};
        if (session) creds.session = session;
        if (sqlPw && (needsSql || routing || !session)) creds.sqlPassword = sqlPw;
        if (authKey && (needsSql || routing)) creds.auth_key = authKey;

        if (routing) {
            // Credentials go ONLY on the wrapper - services authorizes the operator here. The
            // routed payload reaches the target instance, which trusts it came from services and
            // never sees a secret.
            this.ws.send(JSON.stringify({ cmd: 'adminRouteToServer', targetId, payload: { cmd, ...(extra || {}) }, ...creds }));
        } else {
            this.ws.send(JSON.stringify({ cmd, ...(extra || {}), ...creds }));
        };
    },

    _clearReconnect() {
        if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; };
    },

    _scheduleReconnect() {
        if (this._reconnectTimer || this.intentionalClose || !this.everConnected) return;
        const delays = [1000, 2000, 5000, 10000];
        const delay = delays[Math.min(this._reconnectAttempts, delays.length - 1)];
        this._reconnectAttempts++;
        setStatus(`Disconnected - reconnecting in ${delay / 1000}s (attempt ${this._reconnectAttempts})`, true);
        this._reconnectTimer = setTimeout(() => { this._reconnectTimer = null; this.connect(true); }, delay);
    },

    connect(isRetry) {
        this._clearReconnect();
        this.intentionalClose = false;
        if (!isRetry) this._reconnectAttempts = 0;

        const addr = $('servicesServer').value;
        if (/^ws:\/\/(?!localhost|127\.|\[::1\])/i.test(addr)) {
            console.warn('LegacyAdmin: connecting over plaintext ws:// to a non-local host - the SQL password, session and auth key travel unencrypted. Use wss:// behind TLS.');
        };
        localStorage.setItem('servicesServer', $('servicesServer').value);
        localStorage.setItem('sqlPassword', $('sqlPassword').value);
        localStorage.setItem('gameServerAuthKey', $('gameServerAuthKey').value);

        // Drop any previous socket without letting its onclose fire another reconnect.
        if (this.ws) { try { this.ws.onclose = null; this.ws.onerror = null; this.ws.close(); } catch (e) {}; };

        setLoginStatus(isRetry ? 'Reconnecting...' : 'Connecting...');
        this.ws = new WebSocket($('servicesServer').value);
        this.ws.onopen = () => {
            this.connected = true;
            this.everConnected = true;
            // Only clear the backoff once the connection has actually held for a bit - stops a
            // server that accepts then instantly drops from being hammered every 1s.
            clearTimeout(this._stableTimer);
            this._stableTimer = setTimeout(() => { this._reconnectAttempts = 0; }, 5000);
            const username = $('loginUsername').value;
            const password = $('loginPassword').value;
            if (username && password) this.send('adminAccountLogin', { username, password });
            else if (localStorage.getItem('adminSession')) this.send('adminAccountSession');
            enterApp();
        };
        this.ws.onclose = () => {
            this.connected = false;
            clearTimeout(this._stableTimer);
            if (this.everConnected && !this.intentionalClose) this._scheduleReconnect();
            else setStatus('Disconnected', true);
        };
        this.ws.onerror = () => {
            if (!this.everConnected) setLoginStatus('Connection error - check the address', true);
        };
        this.ws.onmessage = (event) => {
            let data;
            try { data = JSON.parse(event.data); } catch { return; };
            if (data.error) { setStatus(data.error, true); return; };
            if (data.adminListServers) { AdminApp.servers = data.adminListServers.servers; updateAuthUI(); }
            for (const key of Object.keys(data)) {
                const set = listeners.get(key);
                if (set) set.forEach(fn => fn(data[key]));
            };
        };
    },

    logout() {
        // Only the account session - the connection details (services address, sqlPassword,
        // auth key) are a separate, persistent thing you don't want to retype every time you log
        // out of the account tier specifically. The "instafills and relogs in" symptom wasn't
        // this localStorage at all - it was the browser's OWN native form autofill re-populating
        // the username/password fields on reload; autocomplete="off" below stops that instead.
        // M1: actually revoke the session server-side, not just locally. Small delay so the frame
        // flushes before reload tears the socket down.
        this.intentionalClose = true;
        this._clearReconnect();
        try { this.send('adminAccountLogout'); } catch (e) {};
        localStorage.removeItem('adminSession');
        localStorage.removeItem('adminUsername');
        setTimeout(() => location.reload(), 150);
    },

    setTarget(id) {
        this.targetId = id || '';
        updateAuthUI();
        renderActiveTab();
    },

    // Route one command to a specific instance without disturbing the global selection.
    sendTo(targetId, cmd, extra) {
        const saved = this.targetId;
        this.targetId = targetId || '';
        try { this.send(cmd, extra); } finally { this.targetId = saved; };
    },
};

function setStatus(text, isError) {
    const el = $('status');
    if (!el) return;
    el.textContent = text;
    el.className = 'px-4 py-1 text-xs min-h-[1.5em] ' + (isError ? 'text-rose-600' : 'text-slate-500');
};

function setLoginStatus(text, isError) {
    const el = $('login-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'text-sm text-center min-h-[1.25em] ' + (isError ? 'text-rose-600' : 'text-slate-500');
};

function enterApp() {
    $('login-screen').classList.add('hidden');
    $('app-screen').classList.remove('hidden');
    setStatus('Connected.');
    AdminApp.send('adminListServers');
    renderActiveTab();
}

// Human label for a registry entry - shared by the Instances tab and the nav status line.
export function serverLabel(server) {
    return server.name
        ? `${server.name} - ${server.serverType} #${server.yourServer}`
        : `${server.serverType} (unregistered)`;
};

function updateAuthUI() {
    const loggedIn = !!localStorage.getItem('adminSession');
    const target = AdminApp.targetId
        ? (AdminApp.servers.find(s => s.id === AdminApp.targetId) ? serverLabel(AdminApp.servers.find(s => s.id === AdminApp.targetId)) : AdminApp.targetId)
        : 'this services instance';
    $('accountStatus').textContent = (loggedIn
        ? `${localStorage.getItem('adminUsername') || '?'} (role ${AdminApp.adminRoles})`
        : ($('sqlPassword').value ? 'Full access' : 'Browsing only')) + ` · managing: ${target}`;
    renderTabNav();
};

AdminApp.on('adminAccountLogin', (result) => {
    localStorage.setItem('adminSession', result.session);
    localStorage.setItem('adminUsername', result.username);
    AdminApp.adminRoles = result.adminRoles;
    updateAuthUI();
});
AdminApp.on('adminAccountSession', (result) => {
    localStorage.setItem('adminUsername', result.username);
    AdminApp.adminRoles = result.adminRoles;
    updateAuthUI();
});
AdminApp.on('adminRestartServices', () => setStatus('Restart requested - services will bounce shortly, and game/client should follow once they see the new startTime.'));

// --- Tabs & URL state -------------------------------------------------------------------------
const tabs = [];
export function registerTab(tab) { tabs.push(tab); };

function currentTabId() {
    const id = (location.hash || '').replace('#', '');
    return tabs.find(t => t.id === id) ? id : (tabs[0]?.id || '');
};

function renderTabNav() {
    const nav = $('tabNav');
    nav.innerHTML = '';
    const activeId = currentTabId();
    for (const tab of tabs) {
        if (tab.hidden) continue;
        if (tab.moderatorOnly && !(AdminApp.adminRoles >= 10 || $('sqlPassword').value)) continue;
        if (tab.adminOnly && !(AdminApp.adminRoles >= 20 || $('sqlPassword').value)) continue;
        const btn = document.createElement('button');
        btn.textContent = tab.label;
        btn.className = 'text-sm px-3 py-1.5 rounded-md font-medium transition-colors ' +
            (tab.id === activeId ? 'bg-indigo-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700');
        btn.onclick = () => { location.hash = tab.id; };
        nav.appendChild(btn);
    };
};

function renderActiveTab() {
    renderTabNav();
    const id = currentTabId();
    const tab = tabs.find(t => t.id === id);
    $('tabContent').innerHTML = '';
    if (tab) tab.render($('tabContent'), new URLSearchParams(location.search));
};

window.addEventListener('hashchange', renderActiveTab);

export function setQueryParam(key, value) {
    const params = new URLSearchParams(location.search);
    if (value === undefined || value === null || value === '') params.delete(key); else params.set(key, value);
    history.replaceState(null, '', `${location.pathname}?${params.toString()}${location.hash}`);
};

export { $, setStatus };

// --- Boot ---------------------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    $('servicesServer').value = localStorage.getItem('servicesServer') || '';
    $('sqlPassword').value = localStorage.getItem('sqlPassword') || '';
    $('gameServerAuthKey').value = localStorage.getItem('gameServerAuthKey') || '';

    $('connectBtn').onclick = () => AdminApp.connect();
    $('logoutBtn').onclick = () => AdminApp.logout();
    $('homeBtn')?.addEventListener('click', () => { location.hash = 'home'; });
    const toggleTheme = () => {
        const dark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', dark ? 'dark' : 'light');
    };
    $('themeToggle').onclick = toggleTheme;
    $('themeToggleLogin').onclick = toggleTheme;
    // Instance selection + restart now live in the Instances tab, not the navbar.
    $('servicesServer').addEventListener('keydown', (e) => { if (e.key === 'Enter') AdminApp.connect(); });
    $('sqlPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') AdminApp.connect(); });
    $('loginPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') AdminApp.connect(); });

    // Import order sets the tab-bar order, and tabs[0] (dashboard) is the default when there's no #hash.
    await Promise.all([
        import('./home-tab.js'),
        import('./instances-tab.js'),
        import('./sql-tab.js'),
        import('./items-tab.js'),
        import('./codes-tab.js'),
        import('./inventory-tab.js'),
        import('./moderation-tab.js'),
        import('./rooms-tab.js'),
        import('./storage-tab.js'),
        import('./logs-tab.js'),
    ]);

    updateAuthUI();

    if ($('servicesServer').value) AdminApp.connect();
});
