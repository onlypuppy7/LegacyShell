// Multi-server room/player overview - reuses the existing servicesInfo pipeline (every connected
// game server already pushes its full room list, including player names/uuids/sessions, to
// services roughly every game.servicesInfoCollectInterval - see roomManager.js's
// sendInfoToServices and start-services.js's `case 'servicesInfo':`) rather than opening a new
// channel. This is the "which servers/rooms exist at all" overview; drilling into one room's live
// chat, or kicking a player, still routes to that specific game instance directly (see
// game/roomBridge.js) since that data/action only exists on that instance.
import { ss } from '#misc';
import { requireModeratorOrAbove } from './auth.js';

export function registerRoomOverview(plugins) {
    plugins.on('services:unhandledCommand', async ({ msg, ws, ip }) => {
        if (msg.cmd !== 'adminGetServicesInfo') return;
        plugins.cancel = true;

        const userData = await requireModeratorOrAbove(msg, ws, ip);
        if (!userData) return;

        ws.send(JSON.stringify({ adminGetServicesInfo: { gameInfo: ss.servicesInfo?.gameInfo || {} } }));
    });
};
