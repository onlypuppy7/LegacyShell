//plugin: dynamicmapblocks
import Comm from '#comm';
import { isClient } from '#constants';

export const PlatformProtocol = {
    register(pluginManager) {
        var reserve = () => { if (Comm.Code.platformState === undefined) Comm.Add('platformState'); };
        pluginManager.on('game:onResourcesLoadedEnd', reserve);
        pluginManager.on('game:roomInitEnd', reserve);
        pluginManager.on('game:clientSync', data => {
            var world = data.this.Collider.platformWorld;
            if (!world?.bodies.length) return;
            reserve();
            var players = data.this.players_by_id.filter(Boolean).filter(player => Number.isFinite(player.platformTime))
                .map(player => ({ id: player.id, time: player.platformTime }));
            var output = new Comm.Out();
            output.packInt8U(Comm.Code.platformState);
            output.packLongString(JSON.stringify({ time: world.clock.now(), players }));
            data.this.sendToAll(output, null, 'platformState');
        });
        if (!isClient) return;
        pluginManager.on('game:LegacyShellOnMessage', data => {
            if (data.cmd !== Comm.Code.platformState || Comm.Code.platformState === undefined) return;
            var state = JSON.parse(data.input.unPackLongString());
            var world = Collider.platformWorld;
            if (world && Number.isFinite(state.time) && Array.isArray(state.players)) {
                world.clock.observe(state.time + (typeof ping === 'number' && Number.isFinite(ping) ? Math.max(0, ping) / 2000 : 0));
                for (var statePlayer of state.players) {
                    var player = players_by_id[statePlayer.id];
                    if (player && Number.isFinite(statePlayer.time)) player.platformTime = statePlayer.time;
                };
            };
            pluginManager.cancel = true;
        });
    },
};
