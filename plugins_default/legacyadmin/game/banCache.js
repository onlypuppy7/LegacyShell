// Main-thread-only (joinRoom is main-thread code - see roomManager.js) periodic poll of the
// global ban list (services/moderation.js's adminGetBanList), cached locally so a join check
// never needs a live DB round trip. Refreshed on an interval rather than pushed, matching the
// existing servicesInfo poll cadence in spirit - simplest correct option for this pass.
import { parentPort } from 'node:worker_threads';
import wsrequest from '#wsrequest';
import { ss } from '#misc';

const bannedTargets = new Set();
const REFRESH_INTERVAL_MS = 20e3;

async function refresh() {
    try {
        const response = await wsrequest({ cmd: 'adminGetBanList' }, ss.config.game.services_server, ss.config.game.auth_key);
        bannedTargets.clear();
        (response?.adminGetBanList?.targets || []).forEach(t => bannedTargets.add(t));
    } catch {
        // keep the last known list on a transient failure rather than failing open
    };
};

export function registerBanEnforcement(plugins) {
    plugins.on('game:beforeJoinRoom', ({ msg, ip }) => {
        if (bannedTargets.has(ip) || (msg.uuid !== undefined && bannedTargets.has(String(msg.uuid)))) {
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
