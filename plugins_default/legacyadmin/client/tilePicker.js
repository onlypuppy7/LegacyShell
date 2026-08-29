// Shared real-tile rendering for the Items tab, and the reusable item-picker widget used by both
// the Codes tab and the Inventory tab (a CSV id field + "select all" + searchable tile grid, kept
// in sync both ways). Lazy-loads BabylonJS + the standalone item-renderer bundle (see
// buildItemRendererBundle.js) only once, the first time a tile actually needs rendering.
let loadPromise = null;
let renderer = null;

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = src;
        el.onload = resolve;
        el.onerror = () => reject(new Error('Failed to load ' + src));
        document.head.appendChild(el);
    });
};

// loadMeshes() (src/shell/loading.js) asks Babylon to load "models/<name>.babylon" - a URL
// relative to the CURRENT page. On the real game (served at site root) that's correct as-is.
// Here the page lives at /admin/, and confirmed live that Babylon's own SceneLoader does NOT
// respect a <base href="/"> tag the way a plain fetch()/XHR would (document.baseURI itself is
// correctly "/" - verified directly - so this is Babylon computing the request URL itself,
// likely via location.href string math rather than the browser's own URL-resolution algorithm).
// Rather than depend on understanding Babylon 3.3's internals further, just rewrite the two
// asset prefixes it actually asks for back to where they really live (the client's own root
// static mount, server-client/start-client.js's `store/client-modified`) - same effect as
// "point it at the normal root" without needing Babylon to cooperate.
function stripAdminPrefix(url) {
    if (typeof url !== 'string') return url;
    // No leading `^` anchor deliberately - Babylon may hand XHR/fetch either a path
    // ("/admin/models/x") or a full absolute URL ("http://host/admin/models/x"); this rewrites
    // the prefix wherever it lands in either form.
    return url.replace(/\/admin\/(models|img)\//, '/$1/');
};
let patchedNetworking = false;
function patchNetworkingOnce() {
    if (patchedNetworking) return;
    patchedNetworking = true;
    const realOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        return realOpen.call(this, method, stripAdminPrefix(url), ...rest);
    };
    const realFetch = window.fetch;
    window.fetch = function (input, init) {
        if (typeof input === 'string') input = stripAdminPrefix(input);
        return realFetch.call(window, input, init);
    };
};

async function ensureRenderer() {
    if (renderer) return renderer;
    if (!loadPromise) {
        loadPromise = (async () => {
            patchNetworkingOnce();
            if (typeof BABYLON === 'undefined') {
                // Same babylon.js source the main client bundles (server-client/src/data/
                // babylon.js, copied alongside the rest of this vendor bundle at boot - see
                // buildItemRendererBundle.js) - not a CDN copy, which may not match the version
                // this codebase's Babylon API usage actually targets, or be reachable at all.
                await loadScript('/admin/vendor/babylon.js');
            };
            await loadScript('/admin/vendor/item-renderer-bundle.js');

            // ItemRenderer's constructor kicks off loadMeshes() for the base weapon/hat mesh
            // packs asynchronously (real network requests - confirmed live: 6 *.babylon.manifest
            // fetches) but returns immediately, before any of them actually finish. The original
            // game gets away with firing tile renders before that completes because Customizer is
            // typically constructed well ahead of a player actually opening it; this panel
            // constructs ItemRenderer on demand, right when a tile needs rendering, with no such
            // head start - without waiting here, the very first render calls silently draw
            // nothing (a caught "mesh not found" that logs only when devmode is on, which this
            // bundle deliberately keeps off). Race a timeout so a genuine load failure can't hang
            // the picker forever - already-loaded meshes will render fine anyway, and any that
            // never arrived will just keep failing the same way they always did (blank tile,
            // console.warn from renderOneTile below).
            let r;
            await Promise.race([
                new Promise((resolve) => { r = new window.ItemRenderer(resolve); }),
                new Promise((resolve) => setTimeout(resolve, 8000)),
            ]);
            renderer = r;
            return renderer;
        })();
    };
    return loadPromise;
};

// renderToCanvas/renderStampToCanvas are synchronous and share ONE engine/scene/camera (a single
// ItemRenderer instance, reused for the whole page's lifetime). Every tab that shows a tile grid
// (Items, and the Codes/Inventory item picker) used to fire renderItemTile() for every visible
// item all at once via a plain forEach - for a full catalog that's 50-150+ back-to-back
// synchronous Babylon renders with no gap for the browser to process input or paint, which is
// exactly what "changing tabs hangs the page" was: opening a tab queued the whole catalog's worth
// of rendering as a single unbroken burst of main-thread work. Serialized into a real queue that
// yields to the browser between each tile, and skips a tile whose canvas already left the DOM.
//
// Two queues, not one: `priorityQueue` for tiles actually on screen, `backgroundQueue` for
// everything else (below/above the fold). A shared IntersectionObserver watches every queued
// canvas and promotes it into `priorityQueue` the moment it scrolls into view - so scrolling down
// a long grid jumps those newly-visible tiles to the front instead of waiting behind however many
// off-screen ones were queued first. `root: null` (viewport) still correctly tracks visibility
// inside an `overflow-auto` grid too - the browser accounts for clipping scroll ancestors either
// way, not just the literal root.
const priorityQueue = [];
const backgroundQueue = [];
const pending = new Map(); // canvas -> {item, canvas}, so the observer can find/promote an entry
let queueRunning = false;

const visibilityObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const queued = pending.get(entry.target);
        if (!queued || priorityQueue.includes(queued)) continue;
        const idx = backgroundQueue.indexOf(queued);
        if (idx !== -1) backgroundQueue.splice(idx, 1);
        priorityQueue.push(queued);
        if (!queueRunning) runQueue();
    };
}, { rootMargin: '200px' }); // start a tile just before it actually reaches the visible area

async function runQueue() {
    if (queueRunning) return; // already draining - the loop below will pick up newly-promoted entries itself
    queueRunning = true;
    while (priorityQueue.length || backgroundQueue.length) {
        const entry = priorityQueue.shift() || backgroundQueue.shift();
        pending.delete(entry.canvas);
        visibilityObserver.unobserve(entry.canvas);
        if (entry.canvas.isConnected) await renderOneTile(entry.item, entry.canvas);
        // setTimeout, not requestAnimationFrame - confirmed live that rAF callbacks can go
        // entirely unfired for a backgrounded/inactive tab (scheduled, never called, even after
        // several seconds), which would permanently stall this whole loop if the user alt-tabs
        // away mid-load. setTimeout keeps firing (browsers throttle it in background tabs, cap
        // ~1/sec, but never fully pause it) so the queue always eventually drains either way.
        await new Promise((resolve) => setTimeout(resolve, 0));
    };
    queueRunning = false;
};

// Rebuilding a grid (re-filtering, switching tabs) used to just discard the old canvases and add
// a whole new batch on top - the old entries stayed in the queues (isConnected skips actually
// rendering them, but each one still burns a full queue turn), so retyping a filter kept stacking
// an ever-growing backlog of already-orphaned tiles ahead of the ones you could currently see.
// Callers that are about to replace a grid's contents should call this first to drop anything
// still pending for the canvases they're discarding.
export function clearPendingRenders() {
    priorityQueue.length = 0;
    backgroundQueue.length = 0;
    for (const canvas of pending.keys()) visibilityObserver.unobserve(canvas);
    pending.clear();
};

// Same per-type camera presets Customizer itself uses (shellshock.min.js, Customizer's
// constructor: `this.weaponCam = [{alpha:0,radius:1.3,primaryGun:true}, {alpha:0,radius:1,
// secondaryGun:true}]; this.hatCam = {alpha:0,radius:1.3};`) - renderToCanvas has no built-in
// zoom-to-fit, the mesh renders at whatever size `cam.radius` puts the camera at (default 1 if
// omitted), so using the wrong preset is exactly what "wrong scaling" looks like: too close/
// cropped for anything that isn't a secondary weapon, which is the only one radius 1 is correct
// for.
function camForItem(item) {
    if (item.item_type_name === 'Primary') return { alpha: 0, radius: 1.3, primaryGun: true };
    if (item.item_type_name === 'Secondary') return { alpha: 0, radius: 1, secondaryGun: true };
    return { alpha: 0, radius: 1.3 }; // hatCam - also what Hat items use
};

async function renderOneTile(item, canvas) {
    try {
        const itemRenderer = await ensureRenderer();
        if (!canvas.isConnected) return; // may have left the DOM while we were waiting on ensureRenderer()
        if (item.item_data?.meshName) {
            itemRenderer.renderToCanvas(item.item_data.meshName, canvas, camForItem(item));
        } else if (item.item_data?.x !== undefined) {
            itemRenderer.renderStampToCanvas(item, canvas);
        };
    } catch (error) {
        console.warn('Tile render failed for', item.name, error);
    };
};

// Renders one item's tile into `canvas` (a real <canvas> element - MUST be 256x256, not just
// "recommended": renderToCanvas's centering math and its final drawImage copy are both hardcoded
// to 256x256, so anything smaller silently clips instead of scaling down. Use CSS on the canvas
// to control its on-screen size instead, same as every current caller already does via the shared
// .tile-canvas class). `item` is a row from adminGetCatalog - dispatches on item_data shape
// exactly like the game's own Customizer does (meshName = weapon/hat, x/y = stamp).
// Queues rather than rendering immediately, starting in the background queue and watched for
// visibility - see the queue notes above.
export function renderItemTile(item, canvas) {
    const entry = { item, canvas };
    pending.set(canvas, entry);
    backgroundQueue.push(entry);
    visibilityObserver.observe(canvas);
    if (!queueRunning) runQueue();
};

// A reusable "pick some items" widget: a comma-separated-ID text field, a select-all/select-none
// toggle, a filter box, and a searchable tile grid - all three ways of picking stay in sync.
// `container` gets its innerHTML replaced. `allItems` is the full catalog (from adminGetCatalog).
// `initialIds` seeds the selection. `onChange(idsArray)` fires on every change, from any input.
export function createItemPicker(container, allItems, initialIds, onChange) {
    let selected = new Set(initialIds || []);

    container.innerHTML = `
        <div class="flex gap-2 mb-2">
            <input type="text" data-role="csv" placeholder="Comma-separated item IDs" class="flex-1 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-md px-2 py-1 text-sm font-mono">
            <button type="button" data-role="select-all" class="text-xs px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap">Select all</button>
        </div>
        <input type="text" data-role="filter" placeholder="Filter items..." class="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-md px-2 py-1 text-sm mb-2">
        <div data-role="grid" class="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-72 overflow-auto border border-slate-100 dark:border-slate-700 rounded-md p-2">Loading...</div>
    `;
    const csvInput = container.querySelector('[data-role="csv"]');
    const selectAllBtn = container.querySelector('[data-role="select-all"]');
    const filterInput = container.querySelector('[data-role="filter"]');
    const grid = container.querySelector('[data-role="grid"]');

    function syncCsv() {
        csvInput.value = [...selected].join(', ');
    };

    function emit() {
        onChange([...selected]);
    };

    function renderGrid(filterText) {
        const filter = (filterText || '').toLowerCase();
        const filtered = allItems.filter(i => !filter || i.name?.toLowerCase().includes(filter));
        clearPendingRenders();
        grid.innerHTML = '';
        filtered.forEach(item => {
            const tile = document.createElement('div');
            const applyTileClass = () => {
                tile.className = 'cursor-pointer rounded-md p-1 border-2 ' + (selected.has(item.id) ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950' : 'border-transparent hover:border-slate-200 dark:hover:border-slate-600');
            };
            applyTileClass();
            const canvas = document.createElement('canvas');
            // Must be 256x256 - renderToCanvas's centering math and its final drawImage copy are
            // both hardcoded to a 256x256 source/destination (see the constructor's own 256x256
            // internal canvas), so anything else silently clips instead of scaling. This was 128
            // here (items-tab.js's own tiles were already 256, which is why the scaling fix only
            // visibly applied there and not to this shared picker) - verified live: a 128x128
            // destination showed only ~2100 non-transparent px clipped flush against its own
            // edge, versus ~11800px properly centered at 256x256 for the identical render call.
            // CSS (.tile-canvas) is what actually controls the smaller on-screen tile size here,
            // same as items-tab.js already relies on - never shrink the canvas's own resolution.
            canvas.width = 256; canvas.height = 256;
            canvas.className = 'tile-canvas';
            tile.appendChild(canvas);
            const name = document.createElement('div');
            name.className = 'text-[10px] text-center truncate';
            name.textContent = item.name;
            tile.appendChild(name);
            tile.onclick = () => {
                if (selected.has(item.id)) selected.delete(item.id); else selected.add(item.id);
                applyTileClass();
                syncCsv();
                emit();
            };
            grid.appendChild(tile);
            renderItemTile(item, canvas);
        });
        if (filtered.length === 0) grid.innerHTML = '<div class="col-span-full text-xs text-slate-400 p-2">No items match.</div>';
    };

    csvInput.oninput = () => {
        selected = new Set(csvInput.value.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n)));
        renderGrid(filterInput.value);
        emit();
    };
    selectAllBtn.onclick = () => {
        const filter = (filterInput.value || '').toLowerCase();
        const visible = allItems.filter(i => !filter || i.name?.toLowerCase().includes(filter));
        const allVisibleSelected = visible.every(i => selected.has(i.id));
        visible.forEach(i => { if (allVisibleSelected) selected.delete(i.id); else selected.add(i.id); });
        syncCsv();
        renderGrid(filterInput.value);
        emit();
    };
    filterInput.oninput = () => renderGrid(filterInput.value);

    syncCsv();
    renderGrid('');

    return {
        getSelected: () => [...selected],
        setSelected: (ids) => {
            selected = new Set(ids || []);
            syncCsv();
            renderGrid(filterInput.value);
        },
    };
};
