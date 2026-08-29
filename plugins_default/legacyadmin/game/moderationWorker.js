// Runs inside a room worker (this plugin's Plugin class constructor executes once per worker too,
// same as every other plugin - see CLAUDE.md's "Game server internals"). Handles admin actions
// routed to THIS specific room by the main thread (see roomManager.js's admin dispatch inside
// index.js's onServicesCommand, and worker.js's new "adminCommand" case).
import { ss } from '#misc';

export function registerModerationWorkerListeners(plugins) {
    plugins.on('game:adminCommand', ({ payload }) => {
        if (!ss.room) return; // only meaningful inside a room worker, never fires on the main thread
        if (payload.action === 'kick') {
            const client = ss.room.clients_by_id[payload.playerId];
            if (client?.sendBootToWs) {
                client.sendBootToWs('Kicked by admin' + (payload.reason ? `: ${payload.reason}` : ''));
            };
        };
    });
};
