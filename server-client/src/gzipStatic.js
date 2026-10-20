//basic
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
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
};

const minSize = 1024;
const brotliThreads = 2; //libuv only has 4 threads, dont hog them all

//gzips on first request. brotli (q11, too slow to do on request) is made in the background by precompress(), and only used once its done
export default function gzipStatic(roots) {
    const gzipCache = new Map(); //filepath -> { mtimeMs, size, etag, promise }
    const brotliCache = new Map(); //filepath -> { mtimeMs, size, etag, buffer }

    const middleware = async (req, res, next) => {
        try {
            if (req.method !== 'GET' && req.method !== 'HEAD') return next();

            const accepted = req.headers['accept-encoding'] || '';
            if (req.headers.range || !/\b(br|gzip)\b/.test(accepted)) return next();

            const ext = path.extname(req.path).toLowerCase();
            if (!types[ext]) return next();

            let filepath, stat;
            for (const root of roots) {
                const candidate = path.join(root, decodeURIComponent(req.path));
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

        const queue = [...files.entries()].sort((a, b) => b[1].size - a[1].size); //biggest first, theyre the ones that matter
        const total = queue.length;
        let finished = 0, rawTotal = 0, brotliTotal = 0;

        log.info(`Brotli: compressing ${total} files at quality 11 in the background. gzip is served until each one is done.`);

        const worker = async () => {
            let item;
            while ((item = queue.shift())) {
                const [urlPath, file] = item;
                const fileStart = Date.now();
                try {
                    const buffer = await brotli(await fs.promises.readFile(file.filepath), {
                        params: {
                            [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
                            [zlib.constants.BROTLI_PARAM_SIZE_HINT]: file.size,
                        },
                    });
                    brotliCache.set(file.filepath, {
                        mtimeMs: file.mtimeMs,
                        size: file.size,
                        etag: `W/"br-${file.size.toString(36)}-${file.mtimeMs.toString(36)}"`,
                        buffer,
                    });
                    rawTotal += file.size;
                    brotliTotal += buffer.length;
                    log.green(`Brotli: ${urlPath} ${(file.size / 1048576).toFixed(2)}MB -> ${(buffer.length / 1048576).toFixed(2)}MB in ${Date.now() - fileStart}ms (${++finished}/${total})`);
                } catch (error) {
                    log.warning(`Brotli: failed on ${urlPath}, sticking with gzip for it:`, error);
                    finished++;
                };
            };
        };

        await Promise.all(Array.from({ length: brotliThreads }, worker));

        log.success(`Brotli: all ${total} files done in ${Date.now() - startTime}ms (${(rawTotal / 1048576).toFixed(1)}MB -> ${(brotliTotal / 1048576).toFixed(1)}MB).`);
    };

    return middleware;
};
