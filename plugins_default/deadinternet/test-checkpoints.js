// Drives `/bots pathtestcheckpoints` against a real running game server — deterministic
// checkpoint-route testing (see shared.js). Usage:
//   TEST_MAP=PathJumpTest node plugins_default/deadinternet/test-checkpoints.js [host] [port] [from to]
// defaults to localhost:13372 and the full checkpoint route when no pair is given.

import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Comm from '../../src/shell/comm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const host = process.argv[2] || 'localhost';
const port = process.argv[3] || 13372;
const pairFrom = process.argv[4];
const pairTo = process.argv[5];
const url = `ws://${host}:${port}`;
const mapName = process.env.TEST_MAP || 'PathJumpTest';

const candidatePaths = [
    path.join(__dirname, '..', '..', 'server-services', 'src', 'maps', `${mapName}.json`),
    path.join(__dirname, 'maps', `${mapName}.json`),
];
const mapPath = candidatePaths.find(p => fs.existsSync(p));
if (!mapPath) {
    console.error(`[test-checkpoints] map "${mapName}" not found in:`, candidatePaths);
    process.exit(1);
};
const mapJson = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
console.log(`[test-checkpoints] loaded ${mapPath}`);

function packJoinGame(nickname, extraParams) {
    const out = new Comm.Out();
    out.packInt8(Comm.Code.joinGame);
    out.packInt8U(Comm.Code.createPrivateGame);
    out.packInt8U(0);
    out.packInt8U(0);
    out.packInt16U(0);
    out.packInt16U(0);
    out.packInt8U(0);
    out.packInt16U(0);
    out.packInt16U(0);
    out.packInt8U(0);
    out.packInt16U(0);
    out.packInt16U(0);
    out.packString(nickname);
    out.packInt32U(0);
    out.packVeryLongString(JSON.stringify(extraParams));
    return out.buffer;
};

function packChat(text) {
    const out = new Comm.Out();
    out.packInt8(Comm.Code.chat);
    out.packLongString(text);
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

const ws = new WebSocket(url);
let joined = false;
let sawComplete = false;

ws.on('open', () => {
    console.log(`[test-checkpoints] connected to ${url}, map=${mapName}`);
    ws.send(packJoinGame(`${mapName}CheckpointTester`, { customMinMap: mapJson }));
    setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(packPing()); }, 5000);
});

ws.on('message', (data) => {
    try {
        const input = new Comm.In(data);
        const cmd = input.unPackInt8U();
        if (cmd === Comm.Code.gameJoined) joined = true;
    } catch { /* shallow peek only */ };
});

ws.on('close', (code) => console.log(`[test-checkpoints] closed (${code})`));
ws.on('error', (error) => console.error('[test-checkpoints] error:', error.message));

setTimeout(() => {
    if (!joined) console.log('[test-checkpoints] no gameJoined yet, continuing anyway');
    ws.send(packRequestRespawn());
}, 10000);

setTimeout(() => {
    const cmd = pairFrom && pairTo
        ? `/bots pathtestcheckpoints ${pairFrom} ${pairTo}`
        : '/bots pathtestcheckpoints';
    console.log(`[test-checkpoints] sending ${cmd}`);
    ws.send(packChat(cmd));
}, 13000);

// Poll game log for completion marker (server prints ROUTE COMPLETE).
const gameLogDir = path.join(__dirname, '..', '..', 'store', 'logs', 'game');
const waitMs = 10 * 60 * 1000;
const startedAt = Date.now();

const poll = setInterval(() => {
    try {
        if (!fs.existsSync(gameLogDir)) return;
        const logs = fs.readdirSync(gameLogDir)
            .filter(f => f.endsWith('.log'))
            .map(f => ({ f, m: fs.statSync(path.join(gameLogDir, f)).mtimeMs }))
            .sort((a, b) => b.m - a.m);
        if (!logs.length) return;
        const tail = fs.readFileSync(path.join(gameLogDir, logs[0].f), 'utf8').slice(-12000);
        const marker = `[deadinternet pathtestcheckpoints] ROUTE COMPLETE:`;
        if (tail.includes(marker) && Date.now() - startedAt > 15000) {
            sawComplete = true;
            clearInterval(poll);
            const idx = tail.lastIndexOf(marker);
            console.log('[test-checkpoints] server result:\n' + tail.slice(idx));
            const failed = /FAILED LEGS:/.test(tail.slice(idx));
            ws.close();
            process.exit(failed ? 1 : 0);
        };
    } catch { /* log may be locked briefly on Windows */ };
}, 3000);

setTimeout(() => {
    clearInterval(poll);
    if (!sawComplete) {
        console.log('[test-checkpoints] timed out waiting for ROUTE COMPLETE — check game server log');
        ws.close();
        process.exit(1);
    };
}, waitMs);
