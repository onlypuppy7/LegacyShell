//node plugins_default/dynamicmapblocks/test-ingame.js [bots] [seconds] [pads|nopads|signs|nosigns] [host] [port]
//Drives a real, running game server with headless clients (no browser): the first makes a private room on client/teleporters.json, the rest join it,
//and every bot walks to and fro through the first two pads so they keep sending it. Nothing here decodes what the server says back beyond how much of it there is:
//what the room does shows in the game server's own log, and nopads runs the same map without its teleporters to compare. Requires services + game running.
import fs from 'node:fs';
import WebSocket from 'ws';
import Comm from '../../src/shell/comm.js';

const bots = Number(process.argv[2]) || 4, seconds = Number(process.argv[3]) || 40, pads = process.argv[4] !== 'nopads';
const url = `ws://${process.argv[5] || 'localhost'}:${process.argv[6] || 13382}`;
const signs = ['signs', 'nosigns'].includes(process.argv[4]);
const map = JSON.parse(fs.readFileSync(new URL(signs ? './client/signs-stress.json' : './client/teleporters.json', import.meta.url), 'utf8'));
if (!pads) delete map.extents.teleporters;
if (process.argv[4] === 'nosigns') delete map.extents.signs;
if (!signs) { map.data['SPECIAL.spawn-blue.none'] = [{ x: 2, y: 1, z: 4 }]; map.data['SPECIAL.spawn-red.none'] = [{ x: 11, y: 1, z: 9 }]; }; //next to the first two pads
const CONTROL = { up: 1 }, FramesBetweenSyncs = 6;

const join = (type, id) => {
    const out = new Comm.Out();
    out.packInt8(Comm.Code.joinGame); out.packInt8U(type); out.packInt8U(0); out.packInt8U(0);
    out.packInt16U(id || 0); out.packInt16U(0); out.packInt8U(0); out.packInt16U(0); out.packInt16U(0);
    out.packInt8U(0); out.packInt16U(0); out.packInt16U(0); out.packString('tpbot' + (id || 0));
    out.packInt32U(0); out.packVeryLongString(JSON.stringify(type === Comm.Code.createPrivateGame ? { customMinMap: map } : {}));
    return out.buffer;
};
const simple = code => { const out = new Comm.Out(); out.packInt8(code); return out.buffer; };
const stats = [];

function bot(index, gameId, onJoined) {
    const ws = new WebSocket(url), stat = { index, bytes: 0, messages: 0 }, east = index % 2 === 0; stats.push(stat);
    let stateIdx = 0, tick = 0;
    ws.on('open', () => ws.send(join(gameId ? Comm.Code.joinPrivateGame : Comm.Code.createPrivateGame, gameId)));
    ws.on('message', data => {
        stat.bytes += data.length; stat.messages++;
        try {
            const input = new Comm.In(data);
            if (input.unPackInt8U() === Comm.Code.gameJoined && !stat.joined) {
                stat.joined = true; input.unPackInt8U(); input.unPackInt8U(); input.unPackInt8U();
                onJoined?.(input.unPackInt16U());
                setTimeout(() => { ws.send(simple(Comm.Code.clientReady)); ws.send(simple(Comm.Code.requestRespawn)); }, gameId ? 2000 : 8000); //the first waits for its map to build
                setTimeout(() => {
                    setInterval(() => { //a sync is six states, ten times a second
                        const out = new Comm.Out(); out.packInt8U(Comm.Code.sync); out.packInt8U(stateIdx); out.packInt8(0);
                        for (let i = 0; i < FramesBetweenSyncs; i++, tick++) {
                            const heading = Math.floor(tick / 70) % 2 === 0 ? east : !east; //70 states one way, then 70 the other
                            out.packInt8U(CONTROL.up); out.packRadU(heading ? Math.PI / 2 : Math.PI * 1.5); out.packRad(0);
                        };
                        stateIdx = (stateIdx + FramesBetweenSyncs) % 256;
                        if (ws.readyState === WebSocket.OPEN) ws.send(out.buffer);
                    }, 100);
                    setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(simple(Comm.Code.ping)); }, 5000);
                }, gameId ? 3500 : 9500);
            };
        } catch {};
    });
    ws.on('error', error => console.error('[tpbots] error:', error.message));
    return ws;
};

console.log(`[tpbots] ${bots} bots, ${seconds}s, ${signs ? process.argv[4] : (pads ? 'with' : 'without') + ' teleporters'}, ${url}`);
const first = bot(0, 0, id => { console.log('[tpbots] room', id); for (let i = 1; i < bots; i++) setTimeout(() => bot(i, id), 300 * i); });
const started = Date.now();
setTimeout(() => {
    const elapsed = (Date.now() - started) / 1000;
    for (const stat of stats) console.log(`[tpbots] bot ${stat.index}: ${stat.joined ? '' : 'NEVER JOINED, '}${(stat.bytes / elapsed / 1024).toFixed(1)} KiB/s, ${(stat.messages / elapsed).toFixed(0)} messages/s`);
    console.log('[tpbots] done'); process.exit(0);
}, (seconds + 10) * 1000);
