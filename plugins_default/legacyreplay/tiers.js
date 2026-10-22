//legacyshell: replay limits by rank. no imports, services (storage) and the game worker (recorder) both read it
//a player only ever sees their own numbers, nothing in here is sent as a table
//

const day = 24 * 60 * 60 * 1000, mb = 1024 * 1024;

export const ReplayTiers = {
    castRank: 10, //who can watch a room live (Moderator)

    member: {
        replays: 20, bytes: 50 * mb, file: 16 * mb, pins: 10, reels: 40, keepMs: 30 * day, //kept on the account
        clipMax: 60, //seconds, /replay clip
        recordMs: 10 * 60e3, recordBytes: 48 * mb, //a whole game, /replay record: how long, and how much memory the room may spend on it
    },
    mod: {
        replays: 100, bytes: 500 * mb, file: 32 * mb, pins: 50, reels: 100, keepMs: 90 * day,
        clipMax: 120,
        recordMs: 45 * 60e3, recordBytes: 120 * mb,
    },
    admin: {
        replays: 2000, bytes: 10 * 1024 * mb, file: 64 * mb, pins: 500, reels: 500, keepMs: 365 * day,
        clipMax: 300,
        recordMs: 3 * 60 * 60e3, recordBytes: 240 * mb, //the reader refuses a body over 256MB
    },

    //adminRoles as the game and services have it: 10 is Moderator, 20 is Admin
    for: function (adminRoles) {
        var rank = Number(adminRoles) || 0;
        return rank >= 20 ? this.admin : rank >= 10 ? this.mod : this.member;
    },
};
