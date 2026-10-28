import { profileLoadout } from './loadout.js';

export const defaultProfilePreferences = () => ({ yaw: 0, pitch: 0, classIdx: null, featuredItems: [] });

export function initProfilePreferences(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS profile_preferences (
        account_id INTEGER PRIMARY KEY, preferences TEXT NOT NULL
    )`);
};

export function readProfilePreferences(db, username, inventory) {
    if (!db || !db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'profile_preferences'").get()) return defaultProfilePreferences();
    const row = db.prepare(`SELECT preferences FROM profile_preferences p JOIN users u ON u.account_id = p.account_id WHERE u.username = ?`).get(username);
    try {
        const value = JSON.parse(row?.preferences || '{}');
        return {
            yaw: Number.isFinite(value.yaw) ? value.yaw : 0,
            pitch: Number.isFinite(value.pitch) ? Math.max(-Math.PI / 3, Math.min(Math.PI / 3, value.pitch)) : 0,
            classIdx: Number.isInteger(value.classIdx) && value.classIdx >= 0 ? value.classIdx : null,
            featuredItems: Array.isArray(value.featuredItems) ? [...new Set(value.featuredItems)].filter(id => inventory.includes(id)).slice(0, 6) : [],
        };
    } catch { return defaultProfilePreferences(); };
};

export function saveProfilePreferences(db, accountId, value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Choose your profile settings first.');
    initProfilePreferences(db);
    return db.transaction(() => {
        const user = db.prepare('SELECT username, ownedItemIds, loadout FROM users WHERE account_id = ?').get(accountId);
        if (!user) throw new Error('Player not found.');
        let owned = [], loadout = {};
        try { owned = JSON.parse(user.ownedItemIds || '[]'); } catch {};
        try { loadout = JSON.parse(user.loadout || '{}') || {}; } catch {};
        if (!Number.isFinite(value.yaw) || !Number.isFinite(value.pitch) || Math.abs(value.pitch) > Math.PI / 3) throw new Error('Choose a valid egg angle.');
        if (value.classIdx !== null && (!Number.isInteger(value.classIdx) || value.classIdx < 0 || !Number.isSafeInteger(profileLoadout(loadout).primaryId[value.classIdx]))) throw new Error('Choose one of your loadouts.');
        if (!Array.isArray(value.featuredItems) || value.featuredItems.length > 6 || new Set(value.featuredItems).size !== value.featuredItems.length || value.featuredItems.some(id => !Number.isSafeInteger(id) || !Array.isArray(owned) || !owned.includes(id))) throw new Error('Choose up to six items from your inventory.');
        const preferences = { yaw: ((value.yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI, pitch: value.pitch, classIdx: value.classIdx, featuredItems: value.featuredItems };
        db.prepare(`INSERT INTO profile_preferences (account_id, preferences) VALUES (?, ?)
            ON CONFLICT(account_id) DO UPDATE SET preferences = excluded.preferences`).run(accountId, JSON.stringify(preferences));
        return user.username;
    }).immediate();
};
