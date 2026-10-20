// Item catalog browser - real weapon/hat/stamp tiles via the extracted #itemRenderer module (see
// tilePicker.js), same rendering the game's own Customizer uses. Data comes from
// services/catalogBridge.js (ss.recs.getAllItemData(true)).
import { AdminApp, registerTab, $, setQueryParam } from './app.js';
import { renderItemTile, clearPendingRenders } from './tilePicker.js';

let allItems = [];
let selectedTags = new Set();
let tagsOpen = false;

const itemTags = (item) => item.item_data?.tags || [];

function render(container, params) {
    container.innerHTML = `
        <input type="text" id="item-search" placeholder="Filter by name/type..." value="${params.get('q') || ''}" class="w-full max-w-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-md px-3 py-1.5 text-sm mb-4">
        <div id="tag-filter" class="flex flex-wrap items-center gap-1.5 mb-4"></div>
        <div id="item-list" class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">Loading...</div>
    `;
    selectedTags = new Set((params.get('tags') || '').split(',').filter(Boolean));
    tagsOpen = selectedTags.size > 0;
    container.querySelector('#item-search').oninput = (e) => { setQueryParam('q', e.target.value); renderList(container, e.target.value); };
    AdminApp.send('adminGetCatalog');
};

AdminApp.on('adminGetCatalog', (result) => {
    allItems = result.items || [];
    const container = $('tabContent');
    if (!container.querySelector('#item-list')) return;
    renderTagFilter(container);
    renderList(container, container.querySelector('#item-search')?.value || '');
});

function renderTagFilter(container) {
    const bar = container.querySelector('#tag-filter');
    if (!bar) return;
    const counts = new Map();
    allItems.forEach(i => itemTags(i).forEach(t => counts.set(t, (counts.get(t) || 0) + 1)));
    bar.innerHTML = '';
    if (counts.size === 0) return;
    const toggle = document.createElement('button');
    toggle.className = 'text-xs text-slate-500 dark:text-slate-400 mr-1 hover:underline';
    toggle.textContent = `${tagsOpen ? '▾' : '▸'} Tags (any match)${selectedTags.size ? ` - ${selectedTags.size} selected` : ''}`;
    toggle.onclick = () => { tagsOpen = !tagsOpen; renderTagFilter(container); };
    bar.appendChild(toggle);
    if (selectedTags.size) bar.appendChild(makeClear(container));
    if (!tagsOpen) return;
    [...counts.keys()].sort((a, b) => a.localeCompare(b)).forEach(tag => {
        const chip = document.createElement('button');
        const active = selectedTags.has(tag);
        chip.className = 'text-[11px] px-2 py-0.5 rounded-full border ' + (active
            ? 'bg-indigo-600 border-indigo-600 text-white'
            : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800');
        chip.textContent = `${tag} (${counts.get(tag)})`;
        chip.onclick = () => {
            if (selectedTags.has(tag)) selectedTags.delete(tag); else selectedTags.add(tag);
            setQueryParam('tags', [...selectedTags].join(','));
            renderTagFilter(container);
            renderList(container, container.querySelector('#item-search')?.value || '');
        };
        bar.appendChild(chip);
    });
};

function makeClear(container) {
    const clear = document.createElement('button');
    clear.className = 'text-[11px] px-2 py-0.5 text-slate-500 dark:text-slate-400 underline';
    clear.textContent = 'clear';
    clear.onclick = () => {
        selectedTags.clear();
        setQueryParam('tags', '');
        renderTagFilter(container);
        renderList(container, container.querySelector('#item-search')?.value || '');
    };
    return clear;
};

function renderList(container, filterText) {
    const list = container.querySelector('#item-list');
    if (!list) return;
    const filter = (filterText || '').toLowerCase();
    const filtered = allItems.filter(i => !selectedTags.size || itemTags(i).some(t => selectedTags.has(t))).filter(i => !filter || i.name?.toLowerCase().includes(filter) || i.item_type_name?.toLowerCase().includes(filter) || i.category_name?.toLowerCase().includes(filter));

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
