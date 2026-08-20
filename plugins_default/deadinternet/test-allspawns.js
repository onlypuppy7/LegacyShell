// Rigorous live validation for pathfinding.js: forces the room onto a real, shipped map
// (server-services/src/maps/<TEST_MAP>.json, "Castle" by default) via the same customMinMap
// mechanism the in-game map editor's "Test ONLINE" button uses (see multiplayermaphost's
// roomBeforeMapBuild, which sets ctx.acceptCustomMaps = true unconditionally), then triggers
// `/bots pathtestall` - see shared.js for what that command actually does (algorithmic all-pairs
// check + a live full-spawn tour).
//
// Like test-ingame.js, this only sends real protocol messages and doesn't attempt to parse
// incoming payloads - the actual proof is the GAME SERVER's own console output. Watch that log
// while this runs. Unlike test-ingame.js, a full tour of every spawn point can take several
// minutes (each leg up to a 30s timeout), so this script waits far longer before disconnecting.
//
// Requires services + game already running. Usage:
//   node plugins_default/deadinternet/test-allspawns.js [gameHost] [gamePort] [maxLegs]
//   node plugins_default/deadinternet/test-allspawns.js [gameHost] [gamePort] pair <fromIdx> <toIdx>
// defaults to localhost:13372 - pass your scratch instance's port when testing against one.
// maxLegs (default 0 = every spawn point) caps the live tour to a small slice - useful while
// iterating on a fix, since a 5-leg run finishes in well under a minute instead of several.
// `pair <fromIdx> <toIdx>` reproduces one specific leg from a prior run's FAILED LEGS output
// directly (via shared.js's pathtestpair command) instead of hoping the random tour order
// happens to include it again.
// TEST_MAP env var picks a different shipped map by filename (without .json), e.g.
// `TEST_MAP=Blue node plugins_default/deadinternet/test-allspawns.js` - every fix in this file's
// change history was validated against Castle specifically, so testing a second, independently
// designed map is the real check that none of it was accidentally Castle-specific.

import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Comm from '../../src/shell/comm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const host = process.argv[2] || 'localhost';
const port = process.argv[3] || 13372;
const pairMode = process.argv[4] === 'pair';
const maxLegs = pairMode ? 0 : (Number(process.argv[4]) || 0);
const pairFrom = process.argv[5];
const pairTo = process.argv[6];
const url = `ws://${host}:${port}`;
const mapName = process.env.TEST_MAP || 'Castle';

const castleMapPath = path.join(__dirname, '..', '..', 'server-services', 'src', 'maps', `${mapName}.json`);
const castleMap = JSON.parse(fs.readFileSync(castleMapPath, 'utf8'));
console.log(`[test-allspawns] loaded ${castleMapPath} (surfaceArea ${castleMap.surfaceArea})`);

console.log(`[test-allspawns] connecting to ${url}...`);
const ws = new WebSocket(url);

function packJoinGame(nickname, extraParams) {
    const out = new Comm.Out();
    out.packInt8(Comm.Code.joinGame);
    out.packInt8U(Comm.Code.createPrivateGame); // joinType - create our own room directly
    out.packInt8U(0); // gameType - FFA
    out.packInt8U(0); // mapId - irrelevant once customMinMap is attached, but still required
    out.packInt16U(0); // gameId
    out.packInt16U(0); // gameKey
    out.packInt8U(0); // classIdx - Soldier
    out.packInt16U(0); // primary_item_id
    out.packInt16U(0); // secondary_item_id
    out.packInt8U(0); // colorIdx
    out.packInt16U(0); // hatId
    out.packInt16U(0); // stampId
    out.packString(nickname);
    out.packInt32U(0); // uuid
    out.packVeryLongString(JSON.stringify(extraParams));
    return out.buffer;
};

function packChat(text) {
    const out = new Comm.Out();
    out.packInt8(Comm.Code.chat);
    out.packLongString(text); // NOT packString - see test-ingame.js's header comment
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
    console.log(`[test-allspawns] connected - sending joinGame with ${mapName} as customMinMap`);
    ws.send(packJoinGame(`${mapName}Tester`, { customMinMap: castleMap }));
    setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(packPing()); }, 5000);
});

ws.on('message', (data) => {
    try {
        const input = new Comm.In(data);
        const cmd = input.unPackInt8U();
        console.log(`[test-allspawns] <- ${Comm.Convert(cmd)}`);
        if (cmd === Comm.Code.gameJoined) joined = true;
    } catch (error) {
        console.log(`[test-allspawns] <- (failed to peek opcode: ${error.message})`);
    };
});

ws.on('close', (code) => console.log(`[test-allspawns] connection closed (${Comm.Convert(code) ?? code})`));
ws.on('error', (error) => console.error('[test-allspawns] error:', error.message));

// Custom-map rooms still go through the same cold-start map build as any other room - give it
// plenty of time before assuming a real position/sending commands.
setTimeout(() => {
    if (!joined) console.log("[test-allspawns] haven't seen gameJoined yet, sending commands anyway - might be too early");
    console.log('[test-allspawns] sending requestRespawn to get a real position');
    ws.send(packRequestRespawn());
}, 10000);

setTimeout(() => {
    const cmd = pairMode ? `/bots pathtestpair ${pairFrom} ${pairTo}`
        : maxLegs > 0 ? `/bots pathtestall ${maxLegs}` : '/bots pathtestall';
    console.log(`[test-allspawns] sending ${cmd}`);
    ws.send(packChat(cmd));
}, 13000);

// Pings alone don't count as activity (rooms.js:289's lastActivity update explicitly excludes
// them), and this client otherwise never sends anything else after the initial respawn/chat -
// the room's 5-minute idle kick (rooms.js:423, separate from the 15s ping-based one) would
// disconnect this "human" proxy well before a long tour finishes, which destroys the whole room
// since bots don't count toward player count (confirmed by testing: exactly this cut a real tour
// short at leg 33/35). requestRespawn is harmless to resend even mid-game (it just gets silently
// rejected server-side since the player is already playing - see client.js's canRespawn check),
// but it still counts as real activity and resets the idle timer.
setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(packRequestRespawn()); }, 2 * 60 * 1000);

// A full tour can legitimately take several minutes (up to legTimeoutMs - see shared.js - per
// leg on a bad run) - give it generous headroom rather than cutting the test off mid-tour.
setTimeout(() => {
    console.log('[test-allspawns] done, disconnecting');
    ws.close();
    process.exit(0);
}, 6 * 60 * 60 * 1000);
