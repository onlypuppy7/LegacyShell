// IndexedDB store of rendered item-tile PNGs (skin / hat / stamp previews), so a repeat visit
// draws them instantly and never has to load Babylon at all if every visible tile is cached.
// Invalidation is manual (Home tab -> Clear tile cache); the key also folds in a hash of the
// item's own item_data so editing one item busts just that item's tile.

const DB_NAME = 'legacyadminTiles';
const STORE = 'tiles';
let dbPromise = null;

function openDb() {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => req.result.createObjectStore(STORE);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        }).catch(() => null);
    };
    return dbPromise;
};

async function store(mode) {
    const db = await openDb();
    if (!db) return null;
    return db.transaction(STORE, mode).objectStore(STORE);
};

export async function getTile(key) {
    try {
        const s = await store('readonly');
        if (!s) return null;
        return await new Promise((resolve) => {
            const r = s.get(key);
            r.onsuccess = () => resolve(r.result || null);
            r.onerror = () => resolve(null);
        });
    } catch { return null; };
};

export async function putTile(key, blob) {
    try {
        const s = await store('readwrite');
        if (s) s.put(blob, key);
    } catch { /* cache is best-effort */ };
};

export async function clearTiles() {
    try {
        const s = await store('readwrite');
        if (!s) return;
        await new Promise((resolve) => { const r = s.clear(); r.onsuccess = resolve; r.onerror = resolve; });
    } catch { /* ignore */ };
};

// djb2 over item_data - stable, cheap, no crypto. Different pixels => different key.
export function tileKey(item) {
    const s = JSON.stringify(item.item_data || {});
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return item.id + ':' + (h >>> 0).toString(36);
};
