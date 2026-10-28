export function profileRank(value, ranks = {}) {
    const rank = Math.max(0, Math.floor(Number(value) || 0));
    const names = { 0: 'Player', 1: 'Player', 5: 'Content Creator', 10: 'Moderator', 20: 'Admin', 255: 'Owner', ...ranks };
    const key = Object.keys(names).map(Number).filter(n => n <= rank).sort((a, b) => b - a)[0];
    const name = names[key] || 'Player';
    return { value: rank, name: name === 'Signed In' || name === 'Guest' ? 'Player' : name === 'Superuser' ? 'Owner' : name };
};
