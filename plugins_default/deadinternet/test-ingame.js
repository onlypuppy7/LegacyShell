// Drives a real, running game server as a minimal WebSocket client - no browser, no rendering,
// none of the client-side overhead that can make a real browser slow to join in a constrained
// environment. Creates a private room, joins it as a real player, then issues DeadInternet's
// `/bots pathtest` chat command and lets it run.
//
// This only sends real protocol messages (using the actual Comm.Out/Comm.In classes, so the
// framing is guaranteed correct) - it deliberately does NOT attempt to fully parse every kind of
// incoming server message the way the real client does, since that's not needed here. The actual
// proof this test is after - does a bot really navigate the real map through real physics - shows
// up in the GAME SERVER's own console output (pathtestbot's route summary and position samples,
// see shared.js), not in anything this script prints. Watch that log while this runs.
//
// Requires services + game already running. Usage:
//   node plugins_default/deadinternet/test-ingame.js [gameHost] [gamePort]
// defaults to localhost:13372 - pass your scratch instance's port when testing against one.

import WebSocket from 'ws';
import Comm from '../../src/shell/comm.js';

const host = process.argv[2] || 'localhost';
const port = process.argv[3] || 13372;
const url = `ws://${host}:${port}`;

console.log(`[test-ingame] connecting to ${url}...`);
const ws = new WebSocket(url);

function packJoinGame(nickname) {
    const out = new Comm.Out();
    out.packInt8(Comm.Code.joinGame);
    out.packInt8U(Comm.Code.createPrivateGame); // joinType - create our own room directly, no matchmaking randomness
    out.packInt8U(0); // gameType - FFA
    out.packInt8U(0); // mapId - let the server pick from the private pool
    out.packInt16U(0); // gameId - unused for createPrivateGame
    out.packInt16U(0); // gameKey - unused for createPrivateGame
    out.packInt8U(0); // classIdx - Soldier
    out.packInt16U(0); // primary_item_id
    out.packInt16U(0); // secondary_item_id
    out.packInt8U(0); // colorIdx
    out.packInt16U(0); // hatId
    out.packInt16U(0); // stampId
    out.packString(nickname);
    out.packInt32U(0); // uuid
    out.packVeryLongString(JSON.stringify({}));
    return out.buffer;
};

function packChat(text) {
    const out = new Comm.Out();
    out.packInt8(Comm.Code.chat);
    out.packLongString(text); // NOT packString - client.js's chat handler reads unPackLongString (2-byte length prefix), packString's 1-byte prefix garbles the text
    return out.buffer;
};

function packPing() {
    const out = new Comm.Out();
    out.packInt8(Comm.Code.ping);
    return out.buffer;
};

function packRequestRespawn() {
    const out = new Comm.Out();
    out.packInt8(Comm.Code.requestRespawn);
    return out.buffer;
};

let joined = false;

ws.on('open', () => {
    console.log('[test-ingame] connected - sending joinGame (createPrivateGame)');
    ws.send(packJoinGame('PathfindTester'));

    // Real clients ping continuously to stay alive (see rooms.js's 15s lastPingDelta kick) -
    // this test needs to do the same or the server will drop it mid-test.
    setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(packPing()); }, 5000);
});

ws.on('message', (data) => {
    console.log(`[test-ingame] <- raw message, ${data.length} bytes: ${Buffer.from(data).subarray(0, 16).toString('hex')}`);
    // Deliberately shallow: just peek the leading opcode for visibility, don't try to fully
    // parse the payload (see file header for why that's fine for this test's purposes).
    try {
        const input = new Comm.In(data);
        const cmd = input.unPackInt8U();
        console.log(`[test-ingame] <- ${Comm.Convert(cmd)}`);

        if (cmd === Comm.Code.gameJoined) {
            joined = true;
        };
    } catch (error) {
        console.log(`[test-ingame] <- (failed to peek opcode: ${error.message})`);
    };
});

ws.on('close', (code) => console.log(`[test-ingame] connection closed (${Comm.Convert(code) ?? code})`));
ws.on('error', (error) => console.error('[test-ingame] error:', error.message));

// Give the room a while to actually build (map/model loading can take several seconds on a
// cold start - see the plugin's README for what this looked like on a first-ever room), then
// fire the actual test command and let it run for a while before disconnecting.
setTimeout(() => {
    if (!joined) console.log("[test-ingame] haven't seen gameJoined yet, sending commands anyway - might be too early");
    // A real browser client sends sync/respawn traffic constantly, which is what actually gives
    // it a real x/y/z on the server - this minimal client sends neither, so without this the
    // "player" pathtest would target sits at the uninitialized default (0,0,0), which isn't a
    // real position on the map (confirmed by testing: findPath correctly refused it as
    // unreachable - not a pathfinding bug, just this test client not having a real position yet).
    console.log('[test-ingame] sending requestRespawn to get a real position');
    ws.send(packRequestRespawn());
}, 8000);

setTimeout(() => {
    console.log('[test-ingame] sending /bots pathtest');
    ws.send(packChat('/bots pathtest'));
}, 10000);

setTimeout(() => {
    console.log('[test-ingame] done, disconnecting');
    ws.close();
    process.exit(0);
}, 75000);
