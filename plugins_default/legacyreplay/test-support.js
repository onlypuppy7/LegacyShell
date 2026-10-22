//legacyshell: shared sample data for the replay tests
import { ReplayFormat as F } from './format.js';

export const sampleHeader = () => ({
    versionEnum: 656, versionHash: "abc123", mapId: 3, mapName: "Dirt", mapHash: "deadbeef",
    map: { name: "Dirt", data: [[[1, 2], [3, 4]]] }, items: [{ id: 5, name: "Eggk47" }],
    gameType: 0, startTime: 1000, players: [{ id: 0, name: "puppy" }, { id: 1, name: "bot" }], plugins: ["legacyweather"],
});

export function sampleReplay() {
    const w = new F.Writer(sampleHeader());
    w.add(F.Type.keyframe, 0, new Uint8Array([1, 2, 3]));
    w.add(F.Type.packets, 100, new Uint8Array([6, 0, 0]));
    w.add(F.Type.playerPackets, 150, new Uint8Array([10, 9, 9]), 1);
    w.add(F.Type.marker, 200, new TextEncoder().encode(JSON.stringify({ label: "sick" })));
    w.add(F.Type.packets, 300, new Uint8Array([8]));
    return w;
};
