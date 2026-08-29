// Item catalog browser - real weapon/hat/stamp tiles via the extracted #itemRenderer module (see
// tilePicker.js), same rendering the game's own Customizer uses. Data comes from
// services/catalogBridge.js (ss.recs.getAllItemData(true)).
import { AdminApp, registerTab, $, setQueryParam } from './app.js';
import { renderItemTile, clearPendingRenders } from './tilePicker.js';

let allItems = [];

function render(container, params) {
    container.innerHTML = `
        <input type="text" id="item-search" placeholder="Filter by name/type..." value="${params.get('q') || ''}" class="w-full max-w-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-md px-3 py-1.5 text-sm mb-4">
        <div id="item-list" class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">Loading...</div>
    `;
    container.querySelector('#item-search').oninput = (e) => { setQueryParam('q', e.target.value); renderList(container, e.target.value); };
    AdminApp.send('adminGetCatalog');
};

AdminApp.on('adminGetCatalog', (result) => {
    allItems = result.items || [];
    const container = $('tabContent');
    if (!container.querySelector('#item-list')) return;
    renderList(container, container.querySelector('#item-search')?.value || '');
});

function renderList(container, filterText) {
    const list = container.querySelector('#item-list');
    if (!list) return;
    const filter = (filterText || '').toLowerCase();
    const filtered = allItems.filter(i => !filter || i.name?.toLowerCase().includes(filter) || i.item_type_name?.toLowerCase().includes(filter) || i.category_name?.toLowerCase().includes(filter));

    clearPendingRenders(); // drop any still-queued renders for the tiles we're about to discard
    list.innerHTML = '';
    filtered.forEach(item => {
        const card = document.createElement('div');
        card.className = 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-center';
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        canvas.className = 'tile-canvas';
        card.appendChild(canvas);
        const name = document.createElement('div');
        name.className = 'text-xs font-medium mt-1 truncate';
        name.textContent = item.name;
        card.appendChild(name);
        const meta = document.createElement('div');
        meta.className = 'text-[11px] text-slate-400 dark:text-slate-500';
        meta.textContent = `${item.item_type_name || ''} · ${item.price} eggs${item.is_available ? '' : ' · hidden'}`;
        card.appendChild(meta);
        list.appendChild(card);
        renderItemTile(item, canvas);
    });
    if (filtered.length === 0) list.innerHTML = '<div class="col-span-full text-sm text-slate-400 dark:text-slate-500 p-4">No items match.</div>';
};

registerTab({ id: 'items', label: 'Items', render, moderatorOnly: true });
