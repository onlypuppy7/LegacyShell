import { profileRank } from './ranks.js';
import { readProfilePreferences } from './preferences.js';
import { profileLoadout } from './loadout.js';
export { profileRank };

//only the stuff other players are meant to see
function count(value) {
    return Math.max(0, Math.floor(Number(value) || 0));
};

function json(value, fallback) {
    try { return typeof value === 'string' ? JSON.parse(value) : value ?? fallback; }
    catch { return fallback; };
};

export async function getPublicProfile(context, username, now = Date.now()) {
    if (typeof username !== 'string' || !/^[A-Za-z0-9?!._-]{3,}$/.test(username)) return null;

    const user = await context.getOne(`SELECT username, kills, deaths, streak,
        currentBalance, eggsSpent, ownedItemIds, loadout, adminRoles, dateCreated,
        upgradeProductId, upgradeExpiryDate, upgradeMultiplier FROM users WHERE username = ?`, [username]);
    if (!user) return null;

    const owned = json(user.ownedItemIds, []);
    const loadout = json(user.loadout, {});
    const weapons = profileLoadout(loadout);
    const ids = values => Array.isArray(values) ? values.map(n => Number.isSafeInteger(n) && n >= 0 ? n : null) : [];
    const vipActive = count(user.upgradeProductId) > 0 && count(user.upgradeExpiryDate) * 1000 > now;
    return {
        username: user.username,
        kills: count(user.kills),
        deaths: count(user.deaths),
        streak: count(user.streak),
        eggs: count(user.currentBalance),
        eggsSpent: count(user.eggsSpent),
        joined: count(user.dateCreated),
        rank: profileRank(user.adminRoles, context.config.distributed_permissions?.ranks),
        inventory: [...new Set(ids(owned).filter(n => n !== null))],
        preferences: readProfilePreferences(context.db, user.username, ids(owned)),
        loadout: {
            classIdx: Number.isSafeInteger(loadout?.classIdx) && loadout.classIdx >= 0 && Number.isSafeInteger(weapons.primaryId[loadout.classIdx]) ? loadout.classIdx : 0,
            colorIdx: count(loadout?.colorIdx),
            ...weapons,
            hatId: Number.isSafeInteger(loadout?.hatId) ? loadout.hatId : null,
            stampId: Number.isSafeInteger(loadout?.stampId) ? loadout.stampId : null,
        },
        vip: { active: vipActive, expires: vipActive ? count(user.upgradeExpiryDate) : null, multiplier: vipActive ? count(user.upgradeMultiplier) : 1 },
    };
};
