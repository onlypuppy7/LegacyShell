// Main-thread only (this all reads ss.RoomManager, which only exists on the main thread - see
// start-game.js's startServer()). Backs the room/player/chat monitoring + kick features of the
// admin panel - reuses roomManager.js's already-live `rooms` Map (no new plumbing needed for
// listing rooms/players - see CLAUDE.md's notes on this) plus the new chatBuffer/adminCommand
// pieces added alongside this plugin (roomManager.js's Comm.Worker.chat case, worker.js's
// "adminCommand" case, and this plugin's own game/chatRelay.js + game/moderationWorker.js).
import { ss } from '#misc';

export async function handleRoomAdminCommand(payload, respond) {
    if (!ss.RoomManager) { respond({ error: 'Room manager not ready yet' }); return; };

    if (payload.cmd === 'adminListRooms') {
        const rooms = [...ss.RoomManager.rooms.values()].map(r => ({
            gameId: r.gameId, gameKey: r.gameKey, mapId: r.mapId, gameType: r.gameType,
            joinType: r.joinType, playerCount: r.playerCount, playerLimit: r.playerLimit,
            playerNames: r.playerNames, playerIds: r.playerIds, locked: r.locked, ready: r.ready,
        }));
        respond({ adminListRooms: { rooms } });
        return;
    };

    if (payload.cmd === 'adminGetRoomChat') {
        const room = ss.RoomManager.rooms.get(payload.gameId);
        if (!room) { respond({ error: 'Room not found' }); return; };
        respond({ adminGetRoomChat: { messages: room.chatBuffer || [] } });
        return;
    };

    if (payload.cmd === 'adminKickPlayer') {
        const room = ss.RoomManager.rooms.get(payload.gameId);
        if (!room) { respond({ error: 'Room not found' }); return; };
        room.worker.postMessage(["adminCommand", { action: 'kick', playerId: payload.playerId, reason: payload.reason }]);
        respond({ adminKickPlayer: { success: true } });
        return;
    };

    respond({ error: 'Unknown room admin command: ' + payload.cmd });
};
