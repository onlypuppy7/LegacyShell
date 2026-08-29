// Worker-only (chat only ever happens inside a room worker - see server-game/src/client.js's
// onmessage) periodic poll of the global mute list (services/moderation.js's adminGetMuteList).
// Each active room worker polls independently (workers share no state with each other or the main
// thread - see CLAUDE.md) - a little redundant across many concurrent rooms, but simplest correct
// option for this pass, and the poll itself is tiny/cheap.
import { parentPort } from 'node:worker_threads';
import wsrequest from '#wsrequest';
import { ss } from '#misc';

// Kept per identity type so a uuid mute value can't coincidentally match an account_id (or an
// ip mute entry that isn't checkable here at all).
const muted = { ip: new Set(), uuid: new Set(), account_id: new Set() };
const REFRESH_INTERVAL_MS = 20e3;

async function refresh() {
    try {
        const response = await wsrequest({ cmd: 'adminGetMuteList' }, ss.config.game.services_server, ss.config.game.auth_key);
        for (const key in muted) muted[key].clear();
        (response?.adminGetMuteList?.targets || []).forEach(t => {
            // Back-compat: an older services build returns a bare string with no type - match it
            // as either uuid or account_id (the pre-fix behaviour for the chat path).
            if (typeof t === 'string') { muted.uuid.add(t); muted.account_id.add(t); return; };
            if (t && muted[t.type]) muted[t.type].add(String(t.value));
        });
    } catch {
        // keep the last known list on a transient failure rather than failing open
    };
};

export function registerMuteEnforcement(plugins) {
    plugins.on('game:beforeChat', ({ this: client }) => {
        const uuid = client?.uuid;
        const accountId = client?.account_id;
        if ((uuid !== undefined && uuid !== null && muted.uuid.has(String(uuid))) ||
            (accountId !== undefined && accountId !== null && muted.account_id.has(String(accountId)))) {
            plugins.cancel = true;
            client.notify && client.notify('You are muted and cannot send chat messages.');
        };
    });

    // Only a room worker ever processes chat - the main thread doesn't need this list at all.
    if (parentPort) {
        refresh();
        setInterval(refresh, REFRESH_INTERVAL_MS);
    };
};
