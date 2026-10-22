//legacyshell: live casting, game main thread. a caster is a moderator who joins a room's socket without taking a player slot, and is sent the room's recording as it is made (see recorder.js addCaster).
//the join message is the normal one with extraParams.replayCast, so nothing about how clients connect changes. who may cast is checked here, with the account services says the session belongs to
import { isMainThread } from 'node:worker_threads';
import Comm from '#comm';
import { ReplayTiers } from './tiers.js';
//

export const ReplayCast = {
    registerListeners: function (pluginManager) {
        if (!isMainThread) return; //joins are handled on the main thread, the room's worker is told afterwards
        this.plugins = pluginManager;

        //a caster doesn't need a free slot
        this.plugins.on('game:joinGameFound', (data) => { if (data.msg.extraParams?.replayCast) data.skipFull = true });

        this.plugins.on('game:beforeJoinRoom', async (data) => {
            var { msg, ws, room } = data;
            if (!msg.extraParams?.replayCast) return;
            data.handled = true; //not a player join, whatever happens to it

            var user = msg.session ? await data.userLookup : null;
            if (!user?.userData || (user.userData.adminRoles || 0) < ReplayTiers.castRank) return ws.close(Comm.Close.booted); //what the lookup gives is { userData, sessionData }

            var wsId = room.wsIdx++;
            ws.removeAllListeners('message'); //the join handler, it would read anything sent as another join
            ws.removeAllListeners('close');
            ws.on('message', () => { });
            ws.on('close', () => {
                room.wsMap.delete(wsId);
                room.worker.postMessage(["adminCommand", { replayCastStop: wsId }]);
            });
            ws.wsId = wsId;
            ws.ip = data.ip;
            room.wsMap.set(wsId, ws); //so the room's worker can send to it like it does for a player
            room.worker.postMessage(["adminCommand", { replayCast: wsId }]);
        });
    },
};
