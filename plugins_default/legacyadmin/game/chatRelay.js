// Worker-side: relays every chat message that actually gets sent (post mute/censor/etc - hooks
// the room's own packChat, which only ever fires for a message that's really going out) up to the
// main thread, for legacyadmin's room-chat monitoring feature. Main thread buffers it per room -
// see roomManager.js's new Comm.Worker.chat case.
import { parentPort } from 'node:worker_threads';
import Comm from '#comm';

export function registerChatRelay(plugins) {
    plugins.on('game:packChat', ({ this: room, text, id, chatType }) => {
        if (!parentPort) return; // defensive - packChat only ever runs inside a room worker anyway
        const senderName = room.clients_by_id?.[id]?.player?.name || room.clients_by_id?.[id]?.username || `#${id}`;
        parentPort.postMessage([Comm.Worker.chat, { text, playerId: id, senderName, chatType, at: Date.now() }]);
    });
};
