//legacyshell: the mp4 writer puts every sample where its tables say, and a real player's parser agrees. node plugins_default/legacyreplay/test-mux.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ReplayMux } from './mux.js';

var passed = 0;
async function test(name, fn) {
    try { await fn(); passed++; console.log('ok   ', name) } catch (e) { console.log('FAIL ', name, '\n', e); process.exitCode = 1 };
};

//what the boxes of an mp4 hold, found by walking them
const boxes = (buf, from = 0, to = buf.length) => {
    const list = [];
    for (let at = from; at + 8 <= to;) {
        const size = buf.readUInt32BE(at), type = buf.toString('latin1', at + 4, at + 8);
        list.push({ type, start: at, body: at + 8, end: at + size });
        at += size;
    };
    return list;
};
const find = (buf, list, ...types) => types.reduce((where, type) => { const found = boxes(buf, where.body, where.end).find((b) => b.type === type); assert.ok(found, 'no ' + type); return found }, { body: 0, end: buf.length });

//a made up video of 30 frames (every tenth a key) and 40 frames of sound, each a different length so a mix-up shows
const video = { samples: Array.from({ length: 30 }, (_, i) => ({ data: new Uint8Array(100 + i).fill(i + 1), key: i % 10 === 0 })), width: 1280, height: 720, timescale: 90000, delta: 3000, avcC: Uint8Array.from([1, 100, 0, 31, 255, 225, 0, 4, 0x67, 0x64, 0, 0x1f, 1, 0, 2, 0x68, 0xee]) };
const audio = { samples: Array.from({ length: 40 }, (_, i) => ({ data: new Uint8Array(30 + i).fill(200 + (i % 50)) })), sampleRate: 48000, channels: 2, delta: 1024, asc: Uint8Array.from([0x11, 0x90]), bitrate: 192000 };
const made = Buffer.from(await ReplayMux.mp4(video, audio).arrayBuffer());

await test('the file is ftyp, moov, mdat, in that order, and each box ends where the next begins', () => {
    const top = boxes(made);
    assert.deepEqual(top.map((b) => b.type), ['ftyp', 'moov', 'mdat']);
    assert.equal(top[top.length - 1].end, made.length);
});

await test('every sample is where the tables say: the first byte of each is its own', () => {
    const moov = find(made, [], 'moov');
    const traks = boxes(made, moov.body, moov.end).filter((b) => b.type === 'trak');
    assert.equal(traks.length, 2);
    [[video, 0], [audio, 1]].forEach(([track, i]) => {
        const stbl = (types) => { let where = traks[i]; types.forEach((type) => { where = boxes(made, where.body, where.end).find((b) => b.type === type) }); return where };
        const table = stbl(['mdia', 'minf', 'stbl']);
        const get = (type) => boxes(made, table.body, table.end).find((b) => b.type === type);
        const sizes = get('stsz'), count = made.readUInt32BE(sizes.body + 8), offset = made.readUInt32BE(get('stco').body + 8);
        assert.equal(count, track.samples.length);
        let at = offset;
        for (let s = 0; s < count; s++) {
            const size = made.readUInt32BE(sizes.body + 12 + s * 4);
            assert.equal(size, track.samples[s].data.length, 'size of sample ' + s);
            assert.equal(made[at], track.samples[s].data[0], 'sample ' + s + ' starts where it should');
            assert.equal(made[at + size - 1], track.samples[s].data[size - 1]);
            at += size;
        };
    });
});

await test('the key frames are the ones that were marked', () => {
    const moov = find(made, [], 'moov');
    const trak = boxes(made, moov.body, moov.end).find((b) => b.type === 'trak');
    const stbl = find(made, [], 'moov', 'trak', 'mdia', 'minf', 'stbl');
    const stss = boxes(made, stbl.body, stbl.end).find((b) => b.type === 'stss');
    const keys = []; for (let i = 0; i < made.readUInt32BE(stss.body + 4); i++) keys.push(made.readUInt32BE(stss.body + 8 + i * 4));
    assert.deepEqual(keys, [1, 11, 21]);
});

const silent = Buffer.from(await ReplayMux.mp4(video, null).arrayBuffer());
await test('a file with no sound has one track', () => {
    const moov = find(silent, [], 'moov');
    assert.equal(boxes(silent, moov.body, moov.end).filter((b) => b.type === 'trak').length, 1);
});

//and a player's own parser, where there is one
const probe = ['C:/ffmpeg/bin/ffprobe.exe', 'ffprobe'].find((p) => { try { return spawnSync(p, ['-version']).status === 0 } catch (e) { return false } });
await test('ffprobe reads it: both streams, the size, the frame rate, the length' + (probe ? '' : ' (no ffprobe here, skipped)'), () => {
    if (!probe) return;
    const file = path.join(os.tmpdir(), 'legacyreplay-mux-test.mp4');
    fs.writeFileSync(file, made);
    const result = spawnSync(probe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' });
    fs.unlinkSync(file);
    const info = JSON.parse(result.stdout);
    const v = info.streams.find((s) => s.codec_type === 'video'), a = info.streams.find((s) => s.codec_type === 'audio');
    assert.equal(v.codec_name, 'h264');
    assert.equal(v.width, 1280);
    assert.equal(v.height, 720);
    assert.ok(Math.abs(eval(v.avg_frame_rate) - 30) < 0.01, 'frame rate ' + v.avg_frame_rate);
    assert.equal(a.codec_name, 'aac');
    assert.equal(a.sample_rate, '48000');
    assert.equal(a.channels, 2);
    assert.ok(Math.abs(Number(v.duration) - 1) < 0.01, 'video length ' + v.duration);
});

console.log(passed + ' passed');
