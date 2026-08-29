// SQL tab: the original /sql page's statement/template mode (verbatim templates, same
// sqlRequest cmd/sqlType semantics), plus a real graphical table editor (Tabulator, CDN-loaded
// lazily only when this mode is opened) as a second mode. Both modes hit the exact same
// `sqlRequest` command on services - the table editor is just a different UI generating
// getAll/runQuery calls instead of hand-written SQL. Always services-local (never routed).
import { AdminApp, registerTab, $, setQueryParam } from './app.js';

const templates = [
    { name: "[users] Get All Users", code: "SELECT * FROM users;" },
    { name: "[users] Get User by Account ID", code: "SELECT * FROM users WHERE account_id = ?;" },
    { name: "[users] Get User by Username", code: "SELECT * FROM users WHERE username = ?;" },
    { name: "[users] Insert New User", code: `INSERT INTO users (username, password, authToken) VALUES (?, ?, ?) RETURNING *;` },
    { name: "[users] Update User Stats", code: `UPDATE users SET kills = ?, deaths = ?, streak = ? WHERE account_id = ? RETURNING *;` },
    { name: "[users] Update User Balance", code: `UPDATE users SET currentBalance = ? WHERE account_id = ? RETURNING *;` },
    { name: "[users] Delete User by Account ID", code: `DELETE FROM users WHERE account_id = ? RETURNING *;` },
    { name: "[users] Set User Admin Role", code: `UPDATE users SET adminRoles = ? WHERE account_id = ? RETURNING *;` },
    { name: "[users] Grant all items to account", code: `UPDATE users SET ownedItemIds = (SELECT json_group_array(id) FROM items) WHERE account_id = ? RETURNING *;` },
    { name: "[codes] Get All Codes", code: "SELECT * FROM codes;" },
    { name: "[codes] Get Code by Key", code: "SELECT * FROM codes WHERE key = ?;" },
    { name: "[codes] Create New Code with Default Key", code: `INSERT INTO codes (item_ids, eggs_given, uses) VALUES ("[]", 0, 1) RETURNING *;` },
    { name: "[codes] Create New Code with Custom Key", code: `INSERT INTO codes (key, item_ids, eggs_given, uses) VALUES ("CODEKEY", "[]", 0, 1) RETURNING *;` },
    { name: "[codes] Delete Code by Key", code: `DELETE FROM codes WHERE key = ? RETURNING *;` },
    { name: "[items] Get All Items", code: "SELECT * FROM items;" },
    { name: "[items] Get Available Items", code: "SELECT * FROM items WHERE is_available = 1;" },
    { name: "[items] Update Item Info", code: `UPDATE items SET name = ?, price = ?, is_available = ?, item_data = ? WHERE id = ? RETURNING *;` },
    { name: "[sessions] Get All Sessions", code: "SELECT * FROM sessions;" },
    { name: "[game_servers] Get All Game Servers", code: "SELECT * FROM game_servers;" },
    { name: "[game_servers] Add New Game Server", code: `INSERT INTO game_servers (auth_key, name, address) VALUES (?, ?, ?) RETURNING *;` },
    { name: "[maps] Get Map by Name", code: "SELECT * FROM maps WHERE name = ?;" },
    { name: "[flags] Get All Flags", code: "SELECT * FROM flags;" },
    { name: "[moderation] Get All Moderation Entries", code: "SELECT * FROM moderation;" },
];

// Each editable table's real primary key column - used to target updates/deletes precisely,
// rather than relying on SQLite's bare `rowid` pseudo-column (which several of these tables,
// having their own INTEGER PRIMARY KEY, alias in ways that are easy to get wrong).
const EDITABLE_TABLES = {
    users: 'account_id',
    items: 'id',
    codes: 'key',
    sessions: 'session_id',
    game_servers: 'auth_key',
    maps: 'name',
    flags: 'name',
    moderation: 'id',
};

function sqlLiteral(value) {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') return String(value);
    return `'${String(value).replaceAll("'", "''")}'`;
};

const btnClass = 'text-xs px-3 py-1.5 rounded-md font-medium';
const primaryBtn = btnClass + ' bg-indigo-600 hover:bg-indigo-500 text-white';
const plainBtn = btnClass + ' border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700';

function render(container, params) {
    const mode = params.get('mode') === 'table' ? 'table' : 'statement';
    container.innerHTML = `
        <div class="flex gap-2 mb-4">
            <button id="sql-mode-statement" class="${mode === 'statement' ? primaryBtn : plainBtn}">Statement / Templates</button>
            <button id="sql-mode-table" class="${mode === 'table' ? primaryBtn : plainBtn}">Table Editor</button>
        </div>
        <div id="sql-body"></div>
    `;
    container.querySelector('#sql-mode-statement').onclick = () => { setQueryParam('mode', 'statement'); render(container, new URLSearchParams(location.search)); };
    container.querySelector('#sql-mode-table').onclick = () => { setQueryParam('mode', 'table'); render(container, new URLSearchParams(location.search)); };

    if (mode === 'table') renderTableEditor(container.querySelector('#sql-body'), params);
    else renderStatementMode(container.querySelector('#sql-body'));
};

// --- Statement / template mode ------------------------------------------------------------------
function renderStatementMode(body) {
    body.innerHTML = `
        <div class="flex flex-wrap gap-2 items-center mb-3">
            <select id="sql-template" class="text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-md px-2 py-1.5"><option value="">Select a template</option></select>
            <button id="sql-apply-template" class="${plainBtn}">Apply</button>
        </div>
        <div class="flex flex-wrap gap-4 items-center mb-2 text-sm">
            <label class="flex items-center gap-1"><input type="radio" name="sqlType" value="runQuery" checked> Run Query</label>
            <label class="flex items-center gap-1"><input type="radio" name="sqlType" value="getOne"> Get One</label>
            <label class="flex items-center gap-1"><input type="radio" name="sqlType" value="getAll"> Get All</label>
            <button id="sql-run" class="${primaryBtn}">Run</button>
        </div>
        <textarea id="sql-input" spellcheck="false" placeholder="Enter your SQL request here" class="w-full h-40 font-mono text-xs border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-md p-2"></textarea>
        <pre id="sql-output" class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md p-3 mt-3 text-xs whitespace-pre-wrap break-words max-h-96 overflow-auto"></pre>
    `;

    const select = body.querySelector('#sql-template');
    templates.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.code;
        opt.textContent = t.name;
        select.appendChild(opt);
    });
    body.querySelector('#sql-apply-template').onclick = () => {
        if (select.value) body.querySelector('#sql-input').value = select.value.trim();
    };
    body.querySelector('#sql-run').onclick = () => {
        const sql = body.querySelector('#sql-input').value;
        const sqlType = body.querySelector('input[name="sqlType"]:checked').value;
        AdminApp.send('sqlRequest', { sql, sqlType });
    };
};

AdminApp.on('result', (result) => {
    const output = document.getElementById('sql-output');
    if (output) output.textContent = JSON.stringify(result, null, 2);
});

// --- Table editor mode (Tabulator) ----------------------------------------------------------------
let tabulatorLoadPromise = null;
function ensureTabulator() {
    if (window.Tabulator) return Promise.resolve();
    if (!tabulatorLoadPromise) {
        tabulatorLoadPromise = new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://cdnjs.cloudflare.com/ajax/libs/tabulator/5.5.2/css/tabulator.min.css';
            document.head.appendChild(link);
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/tabulator/5.5.2/js/tabulator.min.js';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load Tabulator'));
            document.head.appendChild(script);
        });
    };
    return tabulatorLoadPromise;
};

let currentTable = null;
let tabulatorInstance = null;

function renderTableEditor(body, params) {
    // Defaults to the first table (rather than an empty "pick one" state) and loads immediately -
    // switching the dropdown loads right away too, no separate button click needed for that case.
    const requested = params.get('table');
    currentTable = (requested && EDITABLE_TABLES[requested]) ? requested : Object.keys(EDITABLE_TABLES)[0];

    body.innerHTML = `
        <div class="flex flex-wrap gap-2 items-center mb-3">
            <select id="table-select" class="text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-md px-2 py-1.5"></select>
            <button id="table-add-row" class="${plainBtn}">Add empty row</button>
            <span class="text-xs text-slate-400 dark:text-slate-500">Double-click a cell to edit; changes save automatically.</span>
        </div>
        <div id="table-grid" class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-sm text-slate-400 dark:text-slate-500 p-4">Loading...</div>
    `;
    const select = body.querySelector('#table-select');
    Object.keys(EDITABLE_TABLES).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t; opt.textContent = t;
        select.appendChild(opt);
    });
    select.value = currentTable;

    const load = () => {
        currentTable = select.value;
        setQueryParam('table', currentTable);
        AdminApp.send('sqlRequest', { sql: `SELECT * FROM ${currentTable}`, sqlType: 'getAll' });
    };
    select.onchange = load;
    body.querySelector('#table-add-row').onclick = () => {
        AdminApp.send('sqlRequest', { sql: `INSERT INTO ${currentTable} DEFAULT VALUES`, sqlType: 'runQuery' });
        setTimeout(load, 300);
    };
    load();
};

AdminApp.on('result', async (result) => {
    const grid = document.getElementById('table-grid');
    if (!grid || !Array.isArray(result) || !currentTable) return;

    await ensureTabulator();
    const pk = EDITABLE_TABLES[currentTable];
    if (result.length === 0) { grid.innerHTML = '<div class="p-4 text-slate-400 dark:text-slate-500 text-sm">No rows.</div>'; tabulatorInstance = null; return; };

    // Fixed width per column (not fitData/fitDataFill, which happily grows a column to fit a
    // whole JSON blob like item_data/ownedItemIds) - long values truncate with an ellipsis and
    // are readable in full via the cell's title tooltip or by editing it.
    const columns = Object.keys(result[0]).map(col => ({
        title: col,
        field: col,
        width: col === pk ? 110 : 180,
        editor: col === pk ? false : 'input',
        formatter: (cell) => {
            const v = cell.getValue();
            const text = v && typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
            cell.getElement().title = text;
            return `<span class="block truncate">${text.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</span>`;
        },
    }));
    columns.push({
        title: '', formatter: () => '<button class="text-rose-600 text-xs">Delete</button>', width: 80, hozAlign: 'center', headerSort: false,
        cellClick: (e, cell) => {
            const row = cell.getRow().getData();
            if (!confirm(`Delete this row from ${currentTable}?`)) return;
            AdminApp.send('sqlRequest', { sql: `DELETE FROM ${currentTable} WHERE ${pk} = ${sqlLiteral(row[pk])}`, sqlType: 'runQuery' });
            cell.getRow().delete();
        },
    });

    grid.innerHTML = '';
    tabulatorInstance = new window.Tabulator(grid, {
        data: result,
        columns,
        layout: 'fitDataTable',
        height: '28rem',
    });
    tabulatorInstance.on('cellEdited', (cell) => {
        const row = cell.getRow().getData();
        const col = cell.getField();
        AdminApp.send('sqlRequest', {
            sql: `UPDATE ${currentTable} SET ${col} = ${sqlLiteral(cell.getValue())} WHERE ${pk} = ${sqlLiteral(row[pk])}`,
            sqlType: 'runQuery',
        });
    });
});

registerTab({ id: 'sql', label: 'SQL', render });
