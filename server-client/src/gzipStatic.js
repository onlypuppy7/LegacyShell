//basic
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
//legacyshell: logging
import log from 'puppylog';
//

const gzip = promisify(zlib.gzip);
const brotli = promisify(zlib.brotliCompress);

const types = {
    '.babylon': 'application/json',
    '.json': 'application/json',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.html': 'text/html',
    '.svg': 'image/svg+xml',
    '.manifest': 'application/json',
    '.lightmap': 'application/json',
};

const minSize = 1024;
const chunkSize = 512 * 1024;
const fastQuality = 9;
const slowQuality = 11;

//gzips on first request. brotli is made in the background by precompress(): everything at q9 flat out first, then q11 slowly, swapping each one in as it finishes.
//dutyCycle is the share of the time each q11 thread is actually running (0.5 = takes twice as long but leaves the rest of the cpu alone).
//cacheDir keeps the results on disk by content hash so a restart only has to redo what changed
export default function gzipStatic(roots, { cacheDir, threads = 2, dutyCycle = 0.5 } = {}) {
    const gzipCache = new Map(); //filepath -> { mtimeMs, size, etag, promise }
    const brotliCache = new Map(); //filepath -> { mtimeMs, size, etag, buffer }

    //feeds brotli a chunk at a time and sleeps as long as each chunk took, so it never hogs the cpu for long
    const brotliCompress = (buffer, quality, duty) => new Promise((resolve, reject) => {
        const options = { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: quality, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buffer.length } };
        if (duty >= 1) return brotli(buffer, options).then(resolve, reject);

        const compressor = zlib.createBrotliCompress(options);
        const chunks = [];
        compressor.on('data', (chunk) => chunks.push(chunk)).on('end', () => resolve(Buffer.concat(chunks))).on('error', reject);

        let offset = 0;
        const next = () => {
            if (offset >= buffer.length) return compressor.end();
            const start = Date.now();
            compressor.write(buffer.subarray(offset, offset += chunkSize));
            compressor.flush(zlib.constants.BROTLI_OPERATION_FLUSH, () => setTimeout(next, (Date.now() - start) * (1 / duty - 1)));
        };
        next();
    });

    const middleware = async (req, res, next) => {
        try {
            if (req.method !== 'GET' && req.method !== 'HEAD') return next();

            const accepted = req.headers['accept-encoding'] || '';
            if (req.headers.range || !/\b(br|gzip)\b/.test(accepted)) return next();

            const urlPath = req.path === '/' ? '/index.html' : req.path;
            const ext = path.extname(urlPath).toLowerCase();
            if (!types[ext]) return next();

            let filepath, stat;
            for (const root of roots) {
                const candidate = path.join(root, decodeURIComponent(urlPath));
                if (!candidate.startsWith(root + path.sep)) continue;
                try {
                    stat = fs.statSync(candidate);
                    if (stat.isFile()) { filepath = candidate; break; };
                } catch (error) { };
            };
            if (!filepath || stat.size < minSize) return next();

            let encoding = 'gzip', etag, body;

            const done = brotliCache.get(filepath);
            if (/\bbr\b/.test(accepted) && done && done.mtimeMs === stat.mtimeMs && done.size === stat.size) {
                encoding = 'br';
                etag = done.etag;
                body = done.buffer;
            } else {
                let entry = gzipCache.get(filepath);
                if (!entry || entry.mtimeMs !== stat.mtimeMs || entry.size !== stat.size) {
                    entry = {
                        mtimeMs: stat.mtimeMs,
                        size: stat.size,
                        etag: `W/"gz-${stat.size.toString(36)}-${stat.mtimeMs.toString(36)}"`,
                        promise: fs.promises.readFile(filepath).then(buffer => gzip(buffer, { level: 6 })),
                    };
                    gzipCache.set(filepath, entry);
                };
                etag = entry.etag;
            };

            res.set({ 'Content-Type': types[ext], 'Content-Encoding': encoding, 'Vary': 'Accept-Encoding', 'ETag': etag, 'Cache-Control': 'no-cache' });
            if (req.headers['if-none-match'] === etag) return res.status(304).end();

            body ??= await gzipCache.get(filepath).promise;
            res.set('Content-Length', body.length);
            res.end(req.method === 'HEAD' ? undefined : body);
        } catch (error) {
            next();
        };
    };

    //not awaited by the caller, so it never holds up the client starting
    middleware.precompress = async () => {
        const startTime = Date.now();

        const files = new Map(); //url path -> { filepath, size, mtimeMs }, first root wins like express.static would
        const walk = (root, dir) => {
            for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
                const filepath = path.join(dir, dirent.name);
                if (dirent.isDirectory()) { walk(root, filepath); continue; };
                if (!types[path.extname(dirent.name).toLowerCase()]) continue;
                const urlPath = path.relative(root, filepath).split(path.sep).join('/');
                if (files.has(urlPath)) continue;
                const stat = fs.statSync(filepath);
                if (stat.size >= minSize) files.set(urlPath, { filepath, size: stat.size, mtimeMs: stat.mtimeMs });
            };
        };
        for (const root of roots) {
            try { walk(root, root); } catch (error) { log.warning(`Brotli: couldn't scan ${root}:`, error); };
        };

        const list = [...files.entries()].map(([urlPath, file]) => ({ urlPath, ...file })).sort((a, b) => b.size - a.size); //biggest first, theyre the ones that matter

        const cacheName = (file, quality) => `${file.hash}.${quality}.br`;
        const readCached = (file, quality) => {
            try { return cacheDir && fs.readFileSync(path.join(cacheDir, cacheName(file, quality))) } catch (error) { return null };
        };
        const save = (file, quality, buffer) => {
            if (!cacheDir) return;
            const target = path.join(cacheDir, cacheName(file, quality));
            fs.writeFileSync(target + '.tmp', buffer);
            fs.renameSync(target + '.tmp', target);
        };
        const use = (file, quality, buffer) => brotliCache.set(file.filepath, {
            mtimeMs: file.mtimeMs,
            size: file.size,
            etag: `W/"br${quality}-${file.size.toString(36)}-${file.mtimeMs.toString(36)}"`,
            buffer,
        });

        cacheDir && fs.mkdirSync(cacheDir, { recursive: true });

        const keep = new Set();
        const fast = [], slow = [];
        let fromDisk = 0;
        for (const file of list) {
            try {
                file.hash = crypto.createHash('sha1').update(await fs.promises.readFile(file.filepath)).digest('hex');
                keep.add(cacheName(file, fastQuality)).add(cacheName(file, slowQuality));

                const best = readCached(file, slowQuality);
                if (best) { use(file, slowQuality, best); fromDisk++; continue; };

                const quick = readCached(file, fastQuality);
                if (quick) { use(file, fastQuality, quick); fromDisk++; slow.push(file); continue; };

                fast.push(file);
            } catch (error) {
                log.warning(`Brotli: couldn't read ${file.urlPath}, sticking with gzip for it:`, error);
            };
        };
        fromDisk && log.info(`Brotli: ${fromDisk}/${list.length} files loaded from the disk cache.`);

        const runStage = async (queue, quality, duty, after) => {
            const total = queue.length;
            if (!total) return;

            const stageStart = Date.now();
            let finished = 0;
            log.info(`Brotli q${quality}: compressing ${total} files in the background${duty < 1 ? ` (${Math.round(duty * 100)}% duty cycle on each of ${threads} threads)` : ""}. ${quality === fastQuality ? "gzip is served until each one is done." : "q9 is served until each one is swapped out."}`);

            const worker = async () => {
                let file;
                while ((file = queue.shift())) {
                    const fileStart = Date.now();
                    try {
                        const buffer = await brotliCompress(await fs.promises.readFile(file.filepath), quality, duty);
                        use(file, quality, buffer);
                        save(file, quality, buffer);
                        after && after(file);
                        log.green(`Brotli q${quality}: ${file.urlPath} ${(file.size / 1048576).toFixed(2)}MB -> ${(buffer.length / 1048576).toFixed(2)}MB in ${Date.now() - fileStart}ms (${++finished}/${total})`);
                    } catch (error) {
                        log.warning(`Brotli q${quality}: failed on ${file.urlPath}, keeping what it already had:`, error);
                        finished++;
                    };
                };
            };
            await Promise.all(Array.from({ length: threads }, worker));

            log.success(`Brotli q${quality}: all ${total} files done in ${Date.now() - stageStart}ms.`);
        };

        await runStage(fast, fastQuality, 1, (file) => slow.push(file));
        await runStage(slow, slowQuality, dutyCycle);

        //old results from files that have changed or gone
        if (cacheDir && list.length) {
            for (const name of fs.readdirSync(cacheDir)) if (!keep.has(name)) fs.rmSync(path.join(cacheDir, name), { force: true });
        };

        let rawTotal = 0, brotliTotal = 0;
        for (const entry of brotliCache.values()) { rawTotal += entry.size; brotliTotal += entry.buffer.length };

        log.success(`Brotli: ${list.length} files done in ${Date.now() - startTime}ms (${(rawTotal / 1048576).toFixed(1)}MB -> ${(brotliTotal / 1048576).toFixed(1)}MB).`);
    };

    return middleware;
};
