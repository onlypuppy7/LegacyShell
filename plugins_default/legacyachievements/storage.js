import { AchievementDefinitions } from './definitions.js';

export class AchievementStore {
    constructor(db, definitions = AchievementDefinitions) {
        this.db = db;
        this.definitions = definitions;
        db.exec(`CREATE TABLE IF NOT EXISTS achievement_unlocks (
            account_id INTEGER NOT NULL,
            achievement_id TEXT NOT NULL,
            unlocked_at INTEGER NOT NULL,
            notified_at INTEGER,
            claimed_at INTEGER,
            reward TEXT NOT NULL,
            PRIMARY KEY (account_id, achievement_id)
        )`);
        db.exec(`CREATE TABLE IF NOT EXISTS achievement_showcases (
            account_id INTEGER PRIMARY KEY, pins TEXT NOT NULL
        )`);
    };

    user(id) {
        return this.db.prepare(`SELECT account_id, username, kills, currentBalance, ownedItemIds,
            upgradeProductId, upgradeMultiplier, upgradeAdFree, upgradeExpiryDate FROM users WHERE account_id = ?`).get(id);
    };

    evaluate(id, now = Math.floor(Date.now() / 1000)) {
        const user = this.user(id);
        if (!user) return [];
        const earned = [];
        const insert = this.db.prepare(`INSERT OR IGNORE INTO achievement_unlocks
            (account_id, achievement_id, unlocked_at, reward) VALUES (?, ?, ?, ?)`);
        this.db.transaction(() => {
            for (const definition of this.definitions) {
                const progress = definition.metric === 'account' ? 1 : definition.metric === 'kills' ? user.kills : 0;
                if (progress >= definition.goal && insert.run(id, definition.id, now, JSON.stringify(definition.reward)).changes) earned.push(definition.id);
            };
        })();
        return earned;
    };

    unlock(id, achievementId, now = Math.floor(Date.now() / 1000)) {
        const definition = this.definitions.find(entry => entry.id === achievementId);
        if (!definition || !this.user(id)) throw new Error('Achievement not found.');
        return !!this.db.prepare(`INSERT OR IGNORE INTO achievement_unlocks
            (account_id, achievement_id, unlocked_at, reward) VALUES (?, ?, ?, ?)`)
            .run(id, definition.id, now, JSON.stringify(definition.reward)).changes;
    };

    list(user) {
        const rows = new Map(this.db.prepare('SELECT * FROM achievement_unlocks WHERE account_id = ?').all(user.account_id).map(row => [row.achievement_id, row]));
        return this.definitions.map(definition => {
            const row = rows.get(definition.id);
            const progress = definition.metric === 'account' ? 1 : definition.metric === 'kills' ? Math.max(0, user.kills || 0) : 0;
            return { id: definition.id, name: definition.name, category: definition.category || 'Other', description: definition.description,
                image: definition.image || '/legacyachievements/img/placeholder.png', goal: definition.goal,
                tier: Number.isInteger(definition.tier) && definition.tier > 0 ? definition.tier : null,
                progress: row ? definition.goal : Math.min(definition.goal, progress),
                unlockedAt: row?.unlocked_at || null, claimedAt: row?.claimed_at || null,
                reward: row ? JSON.parse(row.reward) : definition.reward };
        });
    };

    publicList(username) {
        if (typeof username !== 'string' || !/^[A-Za-z0-9?!._-]{3,}$/.test(username)) return null;
        const user = this.db.prepare('SELECT account_id, username, kills FROM users WHERE username = ?').get(username);
        return user ? { username: user.username, achievements: this.list(user), featured: this.featured(user.account_id) } : null;
    };

    featured(id) {
        const row = this.db.prepare('SELECT pins FROM achievement_showcases WHERE account_id = ?').get(id);
        const earned = new Set(this.db.prepare('SELECT achievement_id FROM achievement_unlocks WHERE account_id = ?').all(id).map(row => row.achievement_id));
        try { return JSON.parse(row?.pins || '[]').filter(pin => earned.has(pin) && this.definitions.some(definition => definition.id === pin)).slice(0, 3); }
        catch { return []; };
    };

    feature(id, pins) {
        return this.db.transaction(() => {
            if (!Array.isArray(pins) || pins.length > 3 || new Set(pins).size !== pins.length || pins.some(pin => typeof pin !== 'string' || !this.definitions.some(definition => definition.id === pin) || !this.db.prepare('SELECT 1 FROM achievement_unlocks WHERE account_id = ? AND achievement_id = ?').get(id, pin))) throw new Error('Choose up to three earned pins.');
            this.db.prepare(`INSERT INTO achievement_showcases (account_id, pins) VALUES (?, ?)
                ON CONFLICT(account_id) DO UPDATE SET pins = excluded.pins`).run(id, JSON.stringify(pins));
        }).immediate();
    };

    snapshot(id) {
        const user = this.user(id);
        if (!user) throw new Error('Account not found.');
        const pending = this.db.prepare('SELECT achievement_id FROM achievement_unlocks WHERE account_id = ? AND notified_at IS NULL').all(id).map(row => row.achievement_id);
        const hasClaimed = !!this.db.prepare('SELECT 1 FROM achievement_unlocks WHERE account_id = ? AND claimed_at IS NOT NULL LIMIT 1').get(id);
        return { username: user.username, kills: Math.max(0, user.kills || 0), achievements: this.list(user), featured: this.featured(id), pending, hasClaimed };
    };

    seen(id, achievementId) {
        this.db.prepare(`UPDATE achievement_unlocks SET notified_at = COALESCE(notified_at, strftime('%s','now'))
            WHERE account_id = ? AND achievement_id = ?`).run(id, achievementId);
    };

    claim(id, achievementId, now = Math.floor(Date.now() / 1000)) {
        return this.db.transaction(() => {
            const row = this.db.prepare('SELECT * FROM achievement_unlocks WHERE account_id = ? AND achievement_id = ?').get(id, achievementId);
            if (!row || !this.definitions.some(definition => definition.id === achievementId)) throw new Error('That achievement has not been unlocked.');
            const user = this.user(id);
            if (!user) throw new Error('Account not found.');
            if (!row.claimed_at) {
                const reward = JSON.parse(row.reward);
                if (!Number.isSafeInteger(reward.eggs) || reward.eggs < 0 || !Number.isSafeInteger(reward.vipSeconds || 0) || (reward.vipSeconds || 0) < 0) throw new Error('Invalid achievement reward.');
                const owned = JSON.parse(user.ownedItemIds || '[]');
                if (!Array.isArray(owned)) throw new Error('Could not read the inventory.');
                for (const itemId of reward.items || []) {
                    if (!Number.isSafeInteger(itemId) || !this.db.prepare('SELECT id FROM items WHERE id = ?').get(itemId)) throw new Error('A reward item is unavailable. Try again later.');
                    if (!owned.includes(itemId)) owned.push(itemId);
                };
                const activeVip = user.upgradeProductId > 0 && user.upgradeExpiryDate > now;
                if (reward.vipSeconds) {
                    user.upgradeExpiryDate = Math.max(now, user.upgradeExpiryDate || 0) + reward.vipSeconds;
                    if (!activeVip) { user.upgradeProductId = 1; user.upgradeMultiplier = 2; user.upgradeAdFree = 1; };
                };
                this.db.prepare(`UPDATE users SET currentBalance = currentBalance + ?, ownedItemIds = ?,
                    upgradeProductId = ?, upgradeMultiplier = ?, upgradeAdFree = ?, upgradeExpiryDate = ? WHERE account_id = ?`)
                    .run(reward.eggs, JSON.stringify(owned), user.upgradeProductId, user.upgradeMultiplier, user.upgradeAdFree, user.upgradeExpiryDate, id);
                this.db.prepare('UPDATE achievement_unlocks SET claimed_at = ?, notified_at = COALESCE(notified_at, ?) WHERE account_id = ? AND achievement_id = ?')
                    .run(now, now, id, achievementId);
            };
            const account = this.user(id);
            return { alreadyClaimed: !!row.claimed_at, account: {
                currentBalance: account.currentBalance, ownedItemIds: JSON.parse(account.ownedItemIds),
                upgradeProductId: account.upgradeProductId, upgradeMultiplier: account.upgradeMultiplier,
                upgradeAdFree: !!account.upgradeAdFree, upgradeExpiryDate: account.upgradeExpiryDate,
            }, ...this.snapshot(id) };
        }).immediate();
    };
};
