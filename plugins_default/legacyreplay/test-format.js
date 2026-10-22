//legacyshell: replay format tests. node plugins_default/_legacyreplay/test-format.js
import assert from 'node:assert/strict';
import { ReplayFormat as F } from './format.js';
import { sampleHeader, sampleReplay } from './test-support.js';

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

await test("round trip", async () => {
    const file = await F.pack(sampleReplay().finish());
    assert.deepEqual([...file.subarray(0, 4)], F.MAGIC);
    const res = F.parse(await F.unpack(file));
    assert.equal(res.error, null);
    assert.equal(res.header.mapName, "Dirt");
    assert.equal(res.header.duration, 300);
    assert.equal(res.header.players[1].name, "bot");
    assert.deepEqual(res.records.map(r => r.type), [1, 0, 3, 2, 0]);
    assert.deepEqual([...res.records[2].data], [10, 9, 9]);
    assert.equal(res.records[2].toId, 1);
    assert.equal(res.records[3].data.label, "sick");
    assert.equal(res.signature, null);
});

await test("timestamps are clamped forwards by the writer", async () => {
    const w = new F.Writer(sampleHeader());
    w.add(F.Type.packets, 500, new Uint8Array([1]));
    w.add(F.Type.packets, 100, new Uint8Array([2]));
    const res = F.parse(w.finish());
    assert.equal(res.error, null);
    assert.deepEqual(res.records.map(r => r.tMs), [500, 500]);
});

await test("findKeyframe", async () => {
    const w = new F.Writer(sampleHeader());
    w.add(F.Type.keyframe, 0, new Uint8Array([1]));
    w.add(F.Type.packets, 100, new Uint8Array([1]));
    w.add(F.Type.keyframe, 5000, new Uint8Array([1]));
    w.add(F.Type.packets, 5100, new Uint8Array([1]));
    const { records } = F.parse(w.finish());
    assert.equal(F.findKeyframe(records, 4999), 0);
    assert.equal(F.findKeyframe(records, 5000), 2);
    assert.equal(F.findKeyframe(records, 99999), 2);
});

await test("signature record is read and marks the signed range", async () => {
    const w = sampleReplay();
    const unsignedLength = w.finish().length;
    w.add(F.Type.signature, 300, new TextEncoder().encode(JSON.stringify({ keyId: "k1", signature: "c2ln", signedAt: 5, serverName: "local" })));
    const res = F.parse(w.finish());
    assert.equal(res.error, null);
    assert.equal(res.signature.keyId, "k1");
    assert.equal(res.signedEnd, unsignedLength); //header duration doesnt change since it was already set by the first finish()
});

await test("anything after the signature is an error", async () => {
    const w = sampleReplay();
    w.add(F.Type.signature, 300, new TextEncoder().encode(JSON.stringify({ keyId: "k1", signature: "c2ln" })));
    w.add(F.Type.packets, 400, new Uint8Array([1]));
    const res = F.parse(w.finish());
    assert.equal(res.error, "data after signature");
    assert.equal(res.records.length, 5);
});

await test("header strings are cleaned and unknown fields dropped", async () => {
    const w = new F.Writer({ ...sampleHeader(), mapName: "Di\u0000rt\n" + "x".repeat(200), evil: "no" });
    assert.ok(w.header.mapName.length <= 64);
    assert.ok(!w.header.mapName.includes("\u0000"));
    assert.equal(w.header.evil, undefined);
});

await test("__proto__ in header json is dropped", async () => {
    const json = '{"v":1,"versionEnum":1,"mapId":0,"gameType":0,"players":[],"plugins":[],"map":{"__proto__":{"polluted":true},"a":1}}';
    const bytes = new TextEncoder().encode(json);
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, bytes.length, true);
    const res = F.parse(F.concat([len, bytes]));
    assert.equal(Object.getPrototypeOf(res.header.map), Object.prototype);
    assert.equal(({}).polluted, undefined);
    assert.equal(res.header.map.a, 1);
});

await test("escapeHtml", async () => {
    assert.equal(F.escapeHtml('<img src=x onerror="a">'), "&#60;img src=x onerror=&#34;a&#34;&#62;");
});

const syncEntry = (id, frames = 6) => { //opcode, 16 field bytes (each byte distinct so a wrong permutation shows), then frames
    const e = new Uint8Array(F.syncEntrySize(frames));
    e[0] = 6;
    for (let i = 1; i < 17; i++) e[i] = id * 20 + i;
    for (let i = 17; i < e.length; i++) e[i] = 200 + (i % 50);
    return e;
};

await test("sync records: parsed, and a bad length is an error", async () => {
    const w = new F.Writer(sampleHeader());
    w.add(F.Type.sync, 10, F.concat([syncEntry(0), syncEntry(1)]));
    let res = F.parse(w.finish());
    assert.equal(res.error, null);
    assert.equal(res.records[0].data.length, 2 * F.syncEntrySize(6));
    const bad = new F.Writer(sampleHeader());
    bad.add(F.Type.sync, 10, new Uint8Array(47 + 3));
    assert.equal(F.parse(bad.finish()).error, "bad sync record");
});

await test("syncFrames in the header changes the entry size", async () => {
    const w = new F.Writer({ ...sampleHeader(), syncFrames: 3 });
    w.add(F.Type.sync, 0, syncEntry(0, 3));
    const res = F.parse(w.finish());
    assert.equal(res.error, null);
    assert.equal(res.header.syncFrames, 3);
    assert.throws(() => new F.Writer({ ...sampleHeader(), syncFrames: 0 }), /syncFrames/);
});

await test("markers: kind and player ids are kept, anything else is dropped", async () => {
    const w = new F.Writer(sampleHeader());
    w.add(F.Type.marker, 5, F.markerBytes({ label: "x".repeat(200), kind: "kill", a: 3, b: 300, junk: "no" }));
    w.add(F.Type.marker, 6, F.markerBytes({ label: "plain" }));
    const res = F.parse(w.finish());
    assert.equal(res.error, null);
    assert.equal(res.records[0].data.label.length, 64);
    assert.equal(res.records[0].data.kind, "kill");
    assert.equal(res.records[0].data.a, 3);
    assert.equal(res.records[0].data.b, null); //not an id
    assert.equal(res.records[0].data.junk, undefined);
    assert.deepEqual(res.records[1].data, { label: "plain", kind: "", a: null, b: null });
});

console.log(passed + " passed");
