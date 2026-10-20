//basic
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
//

const compressors = {
    br: promisify(zlib.brotliCompress),
    gzip: promisify(zlib.gzip),
};
const options = {
    br: { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } },
    gzip: { level: 6 },
};

const types = {
    '.babylon': 'application/json',
    '.json': 'application/json',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.html': 'text/html',
    '.svg': 'image/svg+xml',
    '.manifest': 'application/json',
};

//compresses on first request (brotli if the browser takes it, else gzip), then keeps it in memory until the file changes
export default function gzipStatic(roots) {
    const cache = new Map(); //encoding:filepath -> { mtimeMs, size, etag, promise }

    return async (req, res, next) => {
        try {
            if (req.method !== 'GET' && req.method !== 'HEAD') return next();
            const accepted = req.headers['accept-encoding'] || '';
            const encoding = /\bbr\b/.test(accepted) ? 'br' : /\bgzip\b/.test(accepted) ? 'gzip' : null;
            if (req.headers.range || !encoding) return next();

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
            if (!filepath || stat.size < 1024) return next();

            const key = `${encoding}:${filepath}`;
            let entry = cache.get(key);
            if (!entry || entry.mtimeMs !== stat.mtimeMs || entry.size !== stat.size) {
                entry = {
                    mtimeMs: stat.mtimeMs,
                    size: stat.size,
                    etag: `W/"${encoding}-${stat.size.toString(36)}-${stat.mtimeMs.toString(36)}"`,
                    promise: fs.promises.readFile(filepath).then(buffer => compressors[encoding](buffer, options[encoding])),
                };
                cache.set(key, entry);
            };

            res.set({ 'Content-Type': types[ext], 'Content-Encoding': encoding, 'Vary': 'Accept-Encoding', 'ETag': entry.etag, 'Cache-Control': 'no-cache' });
            if (req.headers['if-none-match'] === entry.etag) return res.status(304).end();

            const compressed = await entry.promise;
            res.set('Content-Length', compressed.length);
            res.end(req.method === 'HEAD' ? undefined : compressed);
        } catch (error) {
            next();
        };
    };
};
