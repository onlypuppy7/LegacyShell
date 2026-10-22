//legacyshell: replay reader fuzz. node plugins_default/_legacyreplay/test-fuzz.js
//every bad file has to fail cleanly: no throw we dont expect, no hang, no big allocation
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { ReplayFormat as F } from './format.js';
import { sampleReplay, sampleHeader } from './test-support.js';

var passed = 0;
async function test(name, fn) {
    try {
        await fn();
        passed++;
        console.log("ok   ", name);
    } catch (e) {
        console.log("FAIL ", name, "\n", e);
        process.exitCode = 1;
    };
};

//run the whole read path, the only things allowed out are a clean error message or a result
async function read(file, limits) {
    try {
        const res = F.parse(await F.unpack(file, limits), limits);
        return { ok: true, res };
    } catch (e) {
        assert.ok(e instanceof Error);
        return { ok: false, message: e.message };
    };
};

const seeded = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; //so failures can be reproduced
const goodFile = await F.pack(sampleReplay().finish());
const goodBody = sampleReplay().finish();

await test("random bytes", async () => {
    const rand = seeded(1);
    for (let i = 0; i < 300; i++) {
        const file = new Uint8Array(Math.floor(rand() * 200)).map(() => rand() * 256);
        assert.equal((await read(file)).ok, false);
    };
});

await test("good magic then garbage", async () => {
    const rand = seeded(2);
    for (let i = 0; i < 100; i++) {
        const file = F.concat([new Uint8Array([...F.MAGIC, F.VERSION]), new Uint8Array(Math.floor(rand() * 100)).map(() => rand() * 256)]);
        assert.equal((await read(file)).ok, false);
    };
});

await test("wrong version byte", async () => {
    const file = goodFile.slice();
    file[4] = 99;
    assert.match((await read(file)).message, /unsupported replay version/);
});

await test("truncated at every length", async () => {
    for (let n = 0; n < goodFile.length; n++) await read(goodFile.subarray(0, n)); //must not throw or hang, result can be either
    for (let n = 0; n < goodBody.length; n++) {
        try {
            const res = F.parse(goodBody.subarray(0, n));
            assert.ok(res.records.length <= 5);
        } catch (e) {
            assert.ok(e instanceof Error);
        };
    };
});

await test("every single byte flipped in the body", async () => {
    const rand = seeded(3);
    for (let i = 0; i < goodBody.length; i++) {
        const body = goodBody.slice();
        body[i] ^= 1 << Math.floor(rand() * 8);
        try {
            F.parse(body);
        } catch (e) {
            assert.ok(e instanceof Error);
        };
    };
});

await test("huge declared header length", async () => {
    const body = goodBody.slice();
    new DataView(body.buffer).setUint32(0, 0xffffffff, true);
    assert.throws(() => F.parse(body), /header length/);
});

await test("huge declared record length", async () => {
    const w = sampleReplay();
    const body = w.finish();
    const at = body.length - 9 - 1; //last record header
    new DataView(body.buffer).setUint32(at + 5, 0xfffffff0, true);
    const res = F.parse(body);
    assert.equal(res.error, "record too big");
    assert.equal(res.records.length, 4);
});

await test("backwards timestamps", async () => {
    const body = sampleReplay().finish();
    const at = body.length - 9 - 1;
    new DataView(body.buffer).setUint32(at + 1, 0, true);
    const res = F.parse(body);
    assert.equal(res.error, "timestamps go backwards");
    assert.equal(res.records.length, 4);
});

await test("unknown record type", async () => {
    const body = sampleReplay().finish();
    body[body.length - 9 - 1] = 77;
    assert.equal(F.parse(body).error, "unknown record type 77");
});

await test("gzip bomb stops at the cap", async () => {
    const zeros = new Uint8Array(64 * 1024 * 1024); //compresses to about 64KB
    const file = F.concat([new Uint8Array([...F.MAGIC, F.VERSION]), zlib.gzipSync(zeros)]);
    assert.ok(file.length < 200 * 1024);
    const start = Date.now();
    const out = await read(file, { ...F.Limits, maxBody: 1024 * 1024 });
    assert.equal(out.ok, false);
    assert.match(out.message, /over limit/);
    assert.ok(Date.now() - start < 5000);
});

await test("file over the size limit", async () => {
    const out = await read(new Uint8Array(2048), { ...F.Limits, maxFile: 1024 });
    assert.match(out.message, /too big/);
});

await test("bad header contents are rejected", async () => {
    const mk = (header) => {
        const bytes = new TextEncoder().encode(JSON.stringify(header));
        const len = new Uint8Array(4);
        new DataView(len.buffer).setUint32(0, bytes.length, true);
        return F.concat([len, bytes]);
    };
    const good = { v: 1, ...sampleHeader() };
    const bad = [
        { ...good, v: 2 }, { ...good, versionEnum: "656" }, { ...good, mapId: -1 }, { ...good, mapId: 1.5 }, { ...good, gameType: 256 },
        { ...good, players: "x" }, { ...good, players: [{ id: 999, name: "a" }] }, { ...good, players: new Array(100).fill({ id: 1, name: "a" }) },
        { ...good, plugins: [1] }, { ...good, map: [] }, { ...good, map: "x" }, { ...good, items: [1] }, [], "x", null,
    ];
    for (const header of bad) assert.throws(() => F.parse(mk(header)), /rejected/, JSON.stringify(header).slice(0, 80));
    F.parse(mk(good)); //and the good one still passes
});

await test("invalid utf8 / non json header", async () => {
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, 3, true);
    assert.throws(() => F.parse(F.concat([len, new Uint8Array([0xff, 0xfe, 0xfd])])), /rejected/);
    new DataView(len.buffer).setUint32(0, 4, true);
    assert.throws(() => F.parse(F.concat([len, new TextEncoder().encode("nope")])), /rejected/);
});

await test("html in names is only ever data, escapeHtml neutralises it", async () => {
    const w = new F.Writer({ ...sampleHeader(), players: [{ id: 0, name: '<img src=x onerror=alert(1)>' }] });
    const res = F.parse(w.finish());
    const name = res.header.players[0].name; //raw text is kept, display code must use textContent or escapeHtml
    assert.ok(!F.escapeHtml(name).includes("<"));
    assert.ok(!F.escapeHtml(name).includes(">"));
});

await test("player packets with no toId byte", async () => {
    const body = sampleReplay().finish();
    const w = new F.Writer(sampleHeader());
    w.add(F.Type.packets, 1, new Uint8Array([1]));
    const raw = w.finish();
    raw[raw.length - 9 - 1] = F.Type.playerPackets; //pretend the lone 1 byte packet is a player packets record
    const res = F.parse(raw);
    assert.equal(res.error, null); //1 byte = toId only, no packets, thats legal but empty
    assert.equal(res.records[0].data.length, 0);
    assert.ok(body.length > 0);
});

console.log(passed + " passed");
