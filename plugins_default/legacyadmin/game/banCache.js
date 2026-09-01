// Global (cross-room) ban enforcement. Polls services' adminGetBanList (auth_key gated) into a
// per-identity-type cache and enforces it two ways:
//   - game:beforeJoinRoom (MAIN thread) - fast reject for ip / uuid bans before a worker spins up;
//     the account isn't resolved from the session yet at this point.
//   - game:clientInitEnd (ROOM WORKER) - the account IS resolved by now, so this is where an
//     account_id ban (or a uuid ban) actually boots the player.
// Because both hooks live on different threads and workers share no memory, the poll runs on
// every thread that has a hook.
import { parentPort } from 'node:worker_threads';
import wsrequest from '#wsrequest';
import { ss } from '#misc';
import Comm from '#comm';
import log from 'puppylog';

const banned = { ip: new Set(), uuid: new Set(), account_id: new Set() };
const REFRESH_INTERVAL_MS = 20e3;
let warnedPollFail = false;

function authKeyUsable() {
    const k = ss.config.game?.auth_key;
    return !!k && k !== 'AUTH_KEY';
};

async function refresh() {
    try {
        const response = await wsrequest({ cmd: 'adminGetBanList' }, ss.config.game.services_server, ss.config.game.auth_key);
        if (response?.error) {
            if (!warnedPollFail) {
                log.warning('legacyadmin banCache: ban list poll rejected by services: "' + response.error + '" - check game.yaml auth_key matches a game_servers row. Ban enforcement is inactive until this resolves.');
                warnedPollFail = true;
            };
            return;
        };
        warnedPollFail = false;
        for (const key in banned) banned[key].clear();
        (response?.adminGetBanList?.targets || []).forEach(t => {
            // Back-compat: an older services build returns a bare string with no type.
            if (typeof t === 'string') { banned.ip.add(t); banned.uuid.add(t); return; };
            if (t && banned[t.type]) banned[t.type].add(String(t.value));
        });
    } catch {
        // keep the last known list on a transient failure rather than failing open
    };
};

function isBanned({ ip, uuid, account_id }) {
    return (ip !== undefined && ip !== null && banned.ip.has(String(ip)))
        || (uuid !== undefined && uuid !== null && banned.uuid.has(String(uuid)))
        || (account_id !== undefined && account_id !== null && banned.account_id.has(String(account_id)));
};

export function registerBanEnforcement(plugins) {
    plugins.on('game:beforeJoinRoom', ({ msg, ip }) => {
        if (isBanned({ ip, uuid: msg?.uuid })) plugins.cancel = true;
    });

    plugins.on('game:clientInitEnd', ({ this: client }) => {
        if (client && isBanned({ ip: client.ip, uuid: client.uuid, account_id: client.account_id })) {
            try { client.sendCloseToWs(Comm.Close.booted); } catch (e) { /* socket already gone */ };
        };
    });

    if (!authKeyUsable()) {
        log.warning('legacyadmin banCache: game.yaml auth_key is unset/placeholder - global ban enforcement is DISABLED on this instance (run npm run init, or set a real auth_key).');
        return;
    };
    refresh();
    setInterval(refresh, REFRESH_INTERVAL_MS);
};
