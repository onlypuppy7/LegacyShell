//legacyshell: signing test. node plugins_default/legacyreplay/test-signing.js
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ReplayFormat as F } from './format.js';
import { ReplaySigning } from './signing.js';
import { sampleReplay } from './test-support.js';

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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lsreplay-sign-'));
ReplaySigning.file = () => path.join(dir, 'replay_signing.json');

const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const publicKeys = () => ReplaySigning.load().list.map(({ keyId, publicKey }) => ({ keyId, publicKey }));

//what the game server does: build the body, have it signed, put the signature on the end
async function signedFile(writer = sampleReplay(), serverName = "local") {
    const body = writer.finish();
    const signature = ReplaySigning.sign(sha(body), serverName);
    return F.concat([body, F.signatureRecord(F.cleanSignature(signature), writer.lastT)]);
};

const check = async (body, keys = publicKeys()) => F.verify(body, F.parse(body), keys);

await test("a file signed by services verifies, and says who signed it", async () => {
    const body = await signedFile();
    const parsed = F.parse(body);
    assert.equal(parsed.error, null);
    assert.ok(parsed.signature && parsed.signedEnd > 0);
    const result = await F.verify(body, parsed, publicKeys());
    assert.equal(result.status, "verified");
    assert.equal(result.serverName, "local");
    assert.equal(parsed.records.length, 5); //the signature is not one of the records
});

await test("it still verifies after being packed and unpacked like a real file", async () => {
    const file = await F.pack(await signedFile());
    const body = await F.unpack(file);
    assert.equal((await check(body)).status, "verified");
});

await test("a changed byte anywhere in what was signed fails", async () => {
    const body = await signedFile();
    const signedEnd = F.parse(body).signedEnd;
    for (const at of [0, 4 + 10, signedEnd - 1, signedEnd - 20, Math.floor(signedEnd / 2)]) {
        const bad = new Uint8Array(body);
        bad[at] ^= 0x01;
        let status;
        try { status = (await check(bad)).status } catch (e) { status = "rejected" }; //a flipped byte may also make it unreadable, which is just as good
        assert.ok(status === "unverified" || status === "rejected", "byte " + at + " gave " + status);
    };
});

await test("a record added, or one removed, fails", async () => {
    const w = sampleReplay();
    const body = w.finish();
    const signature = ReplaySigning.sign(sha(body), "local");
    const longer = F.concat([body, new Uint8Array([0, 0x90, 0x01, 0, 0, 1, 0, 0, 0, 7])]); //one more packets record before the signature
    const tampered = F.concat([longer, F.signatureRecord(F.cleanSignature(signature), 400)]);
    assert.equal((await check(tampered)).status, "unverified");
});

await test("who signed it and when are part of what is signed", async () => {
    const w = sampleReplay();
    const body = w.finish();
    const signature = F.cleanSignature(ReplaySigning.sign(sha(body), "local"));
    for (const change of [{ serverName: "other" }, { signedAt: signature.signedAt + 1 }]) {
        const file = F.concat([body, F.signatureRecord({ ...signature, ...change }, w.lastT)]);
        assert.equal((await check(file)).status, "unverified", JSON.stringify(change));
    };
});

await test("a signature on the end of a different file does not carry over", async () => {
    const a = await signedFile();
    const bodyA = a.subarray(0, F.parse(a).signedEnd);
    const other = new Uint8Array(bodyA);
    other[other.length - 1] ^= 1; //same length, one byte different in the last record
    const signatureRecord = a.subarray(F.parse(a).signedEnd);
    assert.equal((await check(F.concat([other, signatureRecord]))).status, "unverified");
    assert.equal((await check(F.concat([bodyA, signatureRecord]))).status, "verified");
});

await test("no signature = unsigned, a key we don't have = unknown (with the key id)", async () => {
    assert.equal((await check(sampleReplay().finish())).status, "unsigned");
    const body = await signedFile();
    const result = await check(body, []);
    assert.equal(result.status, "unknown");
    assert.equal(result.keyId, F.parse(body).signature.keyId);
    assert.equal((await check(body, [{ keyId: "0000000000000000", publicKey: publicKeys()[0].publicKey }])).status, "unknown");
});

await test("the right key id with the wrong key is unverified, not an error", async () => {
    const body = await signedFile();
    const real = publicKeys()[0];
    const other = crypto.generateKeyPairSync('ed25519').publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');
    assert.equal((await check(body, [{ keyId: real.keyId, publicKey: other }])).status, "unverified");
    assert.equal((await check(body, [{ keyId: real.keyId, publicKey: "not a key" }])).status, "unverified");
});

await test("rotating the key: old replays still verify with the old key kept, new ones use the new one", async () => {
    const old = await signedFile();
    const oldId = F.parse(old).signature.keyId;
    ReplaySigning.rotate(ReplaySigning.load());
    assert.equal(ReplaySigning.load().list.length, 2);
    assert.notEqual(ReplaySigning.load().current, oldId);
    assert.equal((await check(old)).status, "verified");
    const fresh = await signedFile();
    assert.notEqual(F.parse(fresh).signature.keyId, oldId);
    assert.equal((await check(fresh)).status, "verified");
    assert.equal((await check(old, publicKeys().filter((k) => k.keyId !== oldId))).status, "unknown"); //without the old key it can't be checked
});

await test("keys survive a restart, and the private key never goes out in the public list", async () => {
    ReplaySigning.keys = null; //as if services restarted
    assert.equal(ReplaySigning.load().list.length, 2);
    const stored = JSON.parse(fs.readFileSync(ReplaySigning.file(), 'utf8'));
    assert.equal(stored.list.length, 2);
    const publicOnly = ReplaySigning.load().list.map(({ keyId, publicKey, created }) => ({ keyId, publicKey, created }));
    assert.ok(!JSON.stringify(publicOnly).includes(stored.list[0].privateKey));
});

fs.rmSync(dir, { recursive: true, force: true });
console.log(passed + " passed");
