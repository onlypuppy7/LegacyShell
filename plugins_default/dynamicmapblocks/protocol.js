//plugin: dynamicmapblocks
import Comm from '#comm';
import { isClient, FramesBetweenSyncs, stateBufferSize } from '#constants';

export const PlatformProtocol = {
    stats: { real: 0, realMs: 0, replay: 0, replayMs: 0, synced: 0, syncs: 0, since: 0, last: null }, //where a player's clock goes, for the F3 screen
    stateTime(player, idx, size = 256) { //a state's time from the last the server told us (its clock then, and a step on for each state since), so a replay lands each step on the moment it first did, whenever it runs
        var base = player.dmbBase;
        if (!base) return undefined;
        var steps = ((idx - base.idx) % size + size) % size;
        if (steps > size / 2) steps -= size;
        return base.time + steps / (player.modifiers?.physicsSpeedModifier || 1) / 60;
    },
    rates(now = performance.now()) {
        var s = this.stats;
        if (!s.since) s.since = now;
        if (now - s.since > 4000) { s.last = { ...s, seconds: (now - s.since) / 1000 }; Object.assign(s, { real: 0, realMs: 0, replay: 0, replayMs: 0, synced: 0, syncs: 0, since: now }); };
        var r = s.last; if (!r) return null;
        var per = value => Math.round(value / r.seconds);
        return 'Clock/s: ' + per(r.real) + ' steps, ' + per(r.replay) + ' replayed (' + per(r.replayMs) + 'ms), synced ' + per(r.synced) + 'ms, so ' + per(r.realMs + r.replayMs + r.synced - r.seconds * 1000) + 'ms/s ahead of real time';
    },
    reserve() { if (Comm.Code.platformState === undefined) Comm.Add('platformState'); },
    send(room) { //everything the clients need to know about the blocks, to all of them
        var world = room.Collider?.platformWorld;
        if (!world?.bodies.length || !room.sendToAll) return;
        this.reserve();
        var players = room.players_by_id.filter(Boolean).filter(player => Number.isFinite(player.platformTime))
            .map(player => ({ id: player.id, time: player.platformTime, idx: Number.isFinite(player.client?.adjustment) ? (((player.stateIdx + player.client.adjustment - FramesBetweenSyncs) % stateBufferSize) + stateBufferSize) % stateBufferSize : undefined })); //idx: the next state to run, as the player numbers them (as the sync packet does)
        var output = new Comm.Out();
        output.packInt8U(Comm.Code.platformState);
        var triggers = world.triggered.map(body => ({ id: body.definition.id, segs: body.progress.segs.slice(-8) })); //where each triggered block is headed, as of the last few changes
        output.packLongString(JSON.stringify({ time: world.clock.now(), players, triggers }));
        room.sendToAll(output, null, 'platformState');
    },
    register(pluginManager) {
        var reserve = () => this.reserve();
        pluginManager.on('game:onResourcesLoadedEnd', reserve);
        pluginManager.on('game:roomInitEnd', reserve);
        pluginManager.on('game:clientSync', data => this.send(data.this));
        if (!isClient) return;
        pluginManager.on('game:LegacyShellOnMessage', data => {
            if (data.cmd !== Comm.Code.platformState || Comm.Code.platformState === undefined) return;
            var state = JSON.parse(data.input.unPackLongString());
            var world = Collider.platformWorld;
            if (world && Number.isFinite(state.time) && Array.isArray(state.players)) {
                world.clock.observe(state.time + (typeof ping === 'number' && Number.isFinite(ping) ? Math.max(0, ping) / 2000 : 0));
                for (var trigger of state.triggers || []) {
                    var body = world.triggered.find(item => item.definition.id === trigger.id);
                    if (body) {
                        world.hear(body, trigger.segs.filter(seg => Number.isFinite(seg.t0) && Number.isFinite(seg.p0) && Number.isFinite(seg.rate)), state.time);
                    };
                };
                for (var statePlayer of state.players) {
                    var player = players_by_id[statePlayer.id];
                    if (player && Number.isFinite(statePlayer.time)) {
                        if (player.id === meId && Number.isFinite(statePlayer.idx)) { //your own clock goes by state number: the server's time for one state, and everything else counted on from it
                            player.dmbBase = { time: statePlayer.time, idx: statePlayer.idx };
                            var mapped = PlatformProtocol.stateTime(player, player.stateIdx);
                            if (Number.isFinite(player.platformTime)) { PlatformProtocol.stats.synced += (mapped - player.platformTime) * 1000; PlatformProtocol.stats.syncs++; };
                            player.platformTime = mapped;
                            continue;
                        };
                        if (player.id === meId && Number.isFinite(player.platformTime)) { PlatformProtocol.stats.synced += (statePlayer.time - player.platformTime) * 1000; PlatformProtocol.stats.syncs++; };
                        player.platformTime = statePlayer.time;
                    };
                };
            };
            pluginManager.cancel = true;
        });
    },
};
