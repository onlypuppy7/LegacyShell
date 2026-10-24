//legacyshell: writes an mp4 from video (H.264) and sound (AAC) that were already encoded, which is all the browser's own recorder can't do: put every frame at exactly the time it was made for, whatever time it took to make.
//no imports, no browser apis but Blob, so the same file is tested in node (test-mux.js) and spliced into the browser bundle.
//one chunk of video then one of sound in the file, the moov (where everything is) first so it plays before it has all arrived.
//

export const ReplayMux = {
    //a sample: { data: Uint8Array, key: bool } (video), { data } (sound). video = { samples, width, height, timescale, delta (ticks a frame lasts), avcC (the decoder config record, as the encoder gives it) }.
    //audio = { samples, sampleRate, channels, delta (samples an encoded frame holds), asc (the audio specific config, as the encoder gives it), bitrate } or null
    mp4: function (video, audio) {
        const M = ReplayMux;
        const be = (n, size) => { const a = new Array(size); for (let i = size - 1; i >= 0; i--) { a[i] = n % 256; n = Math.floor(n / 256) }; return a };
        const ascii = (s) => Array.from(s).map((c) => c.charCodeAt(0));
        const bytes = (p) => p instanceof Uint8Array ? p : Uint8Array.from(p);
        const join = (parts) => { const list = parts.map(bytes), out = new Uint8Array(list.reduce((s, p) => s + p.length, 0)); let at = 0; list.forEach((p) => { out.set(p, at); at += p.length }); return out };
        const box = (type, ...parts) => { const body = join(parts); return join([be(body.length + 8, 4), ascii(type), body]) };
        const zeros = (n) => new Array(n).fill(0);
        const matrix = [...be(0x10000, 4), ...zeros(12), ...be(0x10000, 4), ...zeros(12), ...be(0x40000000, 4)];
        const sum = (list) => list.reduce((s, x) => s + x.data.length, 0);

        const videoTicks = video.samples.length * video.delta, videoMs = Math.round(videoTicks / video.timescale * 1000);
        const audioMs = audio ? Math.round(audio.samples.length * audio.delta / audio.sampleRate * 1000) : 0;
        const movieMs = Math.max(videoMs, audioMs);

        const sampleTables = (list, delta, extra) => [
            box('stts', be(0, 4), be(1, 4), be(list.length, 4), be(delta, 4)),
            ...(extra || []),
            box('stsz', be(0, 4), be(0, 4), be(list.length, 4), ...list.map((s) => be(s.data.length, 4))),
            box('stsc', be(0, 4), be(1, 4), be(1, 4), be(list.length, 4), be(1, 4)),
        ];
        const dinf = box('dinf', box('dref', be(0, 4), be(1, 4), box('url ', be(1, 4))));
        const track = (id, ms, handler, media, header, entry, tables, offset, timescale, ticks, size) => box('trak',
            box('tkhd', be(3, 4), be(0, 4), be(0, 4), be(id, 4), be(0, 4), be(ms, 4), zeros(8), be(0, 2), be(0, 2), be(handler === 'soun' ? 0x100 : 0, 2), be(0, 2), matrix, be(size[0] * 65536, 4), be(size[1] * 65536, 4)),
            box('mdia',
                box('mdhd', be(0, 4), be(0, 4), be(0, 4), be(timescale, 4), be(ticks, 4), be(0x55c4, 2), be(0, 2)),
                box('hdlr', be(0, 4), be(0, 4), ascii(handler), zeros(12), ascii(media + '\0')),
                box('minf', header, dinf, box('stbl', box('stsd', be(0, 4), be(1, 4), entry), ...tables, box('stco', be(0, 4), be(1, 4), be(offset, 4)))))
        );
        const avc1 = box('avc1', zeros(6), be(1, 2), zeros(16), be(video.width, 2), be(video.height, 2), be(0x480000, 4), be(0x480000, 4), be(0, 4), be(1, 2), zeros(32), be(0x18, 2), be(0xffff, 2), box('avcC', video.avcC));
        const length = (n) => [0x80, 0x80, 0x80, n]; //the descriptors' lengths, in the long form every player reads
        const esds = audio && box('esds', be(0, 4),
            [0x03, ...length(32 + audio.asc.length), 0, 0, 0],
            [0x04, ...length(18 + audio.asc.length), 0x40, 0x15, ...be(0, 3), ...be(audio.bitrate || 192000, 4), ...be(audio.bitrate || 192000, 4)],
            [0x05, ...length(audio.asc.length), ...audio.asc],
            [0x06, ...length(1), 0x02]);
        const mp4a = audio && box('mp4a', zeros(6), be(1, 2), zeros(8), be(audio.channels, 2), be(16, 2), be(0, 2), be(0, 2), be(audio.sampleRate * 65536 % 4294967296, 4), esds);

        const moov = (videoAt, audioAt) => box('moov',
            box('mvhd', be(0, 4), be(0, 4), be(0, 4), be(1000, 4), be(movieMs, 4), be(0x10000, 4), be(0x100, 2), zeros(10), matrix, zeros(24), be(audio ? 3 : 2, 4)),
            track(1, videoMs, 'vide', 'VideoHandler', box('vmhd', be(1, 4), zeros(8)), avc1,
                sampleTables(video.samples, video.delta, [box('stss', be(0, 4), be(video.samples.filter((s) => s.key).length, 4), ...video.samples.map((s, i) => s.key ? be(i + 1, 4) : []))]), videoAt, video.timescale, videoTicks, [video.width, video.height]),
            audio ? track(2, audioMs, 'soun', 'SoundHandler', box('smhd', be(0, 4), zeros(4)), mp4a, sampleTables(audio.samples, audio.delta), audioAt, audio.sampleRate, audio.samples.length * audio.delta, [0, 0]) : []);

        const ftyp = box('ftyp', ascii('isom'), be(512, 4), ascii('isom'), ascii('iso2'), ascii('avc1'), ascii('mp41'));
        const mdatSize = sum(video.samples) + (audio ? sum(audio.samples) : 0);
        if (mdatSize + 8 > 0xffffffff) throw new Error('too big for an mp4');
        const head = moov(0, 0).length + ftyp.length + 8; //(where the pictures start, which the table of where they are is part of, so the length is worked out first)
        const moovFinal = moov(head, head + sum(video.samples));
        const mdat = join([be(mdatSize + 8, 4), ascii('mdat')]);
        return new Blob([ftyp, moovFinal, mdat, ...video.samples.map((s) => s.data), ...(audio ? audio.samples.map((s) => s.data) : [])], { type: 'video/mp4' });
    },
};
