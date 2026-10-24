//only the stuff other players are meant to see
function count(value) {
    return Math.max(0, Math.floor(Number(value) || 0));
};

function json(value, fallback) {
    try { return typeof value === 'string' ? JSON.parse(value) : value ?? fallback; }
    catch { return fallback; };
};

export function profileRank(value, ranks = {}) {
    const rank = count(value);
    const names = { 0: 'Player', 1: 'Player', 5: 'Content Creator', 10: 'Moderator', 20: 'Admin', 255: 'Owner', ...ranks };
    const key = Object.keys(names).map(Number).filter(n => n <= rank).sort((a, b) => b - a)[0];
    const name = names[key] || 'Player';
    return { value: rank, name: name === 'Signed In' || name === 'Guest' ? 'Player' : name === 'Superuser' ? 'Owner' : name };
};

export async function getPublicProfile(context, identifier, now = Date.now()) {
    if (!/^[1-9][0-9]*$/.test(String(identifier))) return null;
    const accountId = Number(identifier);
    if (!Number.isSafeInteger(accountId) || accountId > 0xffffffff) return null;

    const user = await context.getOne(`SELECT account_id, username, kills, deaths, streak,
        currentBalance, eggsSpent, ownedItemIds, loadout, adminRoles, dateCreated,
        upgradeProductId, upgradeExpiryDate, upgradeMultiplier FROM users WHERE account_id = ?`, [accountId]);
    if (!user) return null;

    const owned = json(user.ownedItemIds, []);
    const loadout = json(user.loadout, {});
    const ids = values => Array.isArray(values) ? values.map(n => Number.isSafeInteger(n) && n >= 0 ? n : null) : [];
    const vipActive = count(user.upgradeProductId) > 0 && count(user.upgradeExpiryDate) * 1000 > now;
    return {
        account_id: user.account_id,
        username: user.username,
        kills: count(user.kills),
        deaths: count(user.deaths),
        streak: count(user.streak),
        eggs: count(user.currentBalance),
        eggsSpent: count(user.eggsSpent),
        joined: count(user.dateCreated),
        rank: profileRank(user.adminRoles, context.config.distributed_permissions?.ranks),
        inventory: [...new Set(ids(owned).filter(n => n !== null))],
        loadout: {
            classIdx: Math.min(3, count(loadout?.classIdx)),
            colorIdx: count(loadout?.colorIdx),
            primaryId: ids(loadout?.primaryId),
            secondaryId: ids(loadout?.secondaryId),
            hatId: Number.isSafeInteger(loadout?.hatId) ? loadout.hatId : null,
            stampId: Number.isSafeInteger(loadout?.stampId) ? loadout.stampId : null,
        },
        vip: { active: vipActive, expires: vipActive ? count(user.upgradeExpiryDate) : null, multiplier: vipActive ? count(user.upgradeMultiplier) : 1 },
    };
};
