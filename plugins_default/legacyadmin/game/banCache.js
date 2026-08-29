// Main-thread-only (joinRoom is main-thread code - see roomManager.js) periodic poll of the
// global ban list (services/moderation.js's adminGetBanList), cached locally so a join check
// never needs a live DB round trip. Refreshed on an interval rather than pushed, matching the
// existing servicesInfo poll cadence in spirit - simplest correct option for this pass.
import { parentPort } from 'node:worker_threads';
import wsrequest from '#wsrequest';
import { ss } from '#misc';

// Kept per identity type so an ip ban value can't coincidentally match a uuid (or vice versa).
const banned = { ip: new Set(), uuid: new Set(), account_id: new Set() };
const REFRESH_INTERVAL_MS = 20e3;

async function refresh() {
    try {
        const response = await wsrequest({ cmd: 'adminGetBanList' }, ss.config.game.services_server, ss.config.game.auth_key);
        for (const key in banned) banned[key].clear();
        (response?.adminGetBanList?.targets || []).forEach(t => {
            // Back-compat: an older services build returns a bare string with no type - can't
            // tell ip from uuid, so match it as either (the pre-fix behaviour).
            if (typeof t === 'string') { banned.ip.add(t); banned.uuid.add(t); return; };
            if (t && banned[t.type]) banned[t.type].add(String(t.value));
        });
    } catch {
        // keep the last known list on a transient failure rather than failing open
    };
};

export function registerBanEnforcement(plugins) {
    plugins.on('game:beforeJoinRoom', ({ msg, ip }) => {
        // beforeJoinRoom only carries ip + msg.uuid - the account isn't resolved from the
        // session yet, so account_id bans are enforced elsewhere (chat/mute path), not here.
        if (banned.ip.has(String(ip)) || (msg.uuid !== undefined && banned.uuid.has(String(msg.uuid)))) {
            plugins.cancel = true;
        };
    });

    // parentPort is only truthy inside a worker thread - joinRoom only ever runs on the main
    // thread, so only the main thread needs to poll at all.
    if (!parentPort) {
        refresh();
        setInterval(refresh, REFRESH_INTERVAL_MS);
    };
};
