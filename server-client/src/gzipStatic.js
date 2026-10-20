//basic
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
//

const gzip = promisify(zlib.gzip);

const types = {
    '.babylon': 'application/json',
    '.json': 'application/json',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.html': 'text/html',
    '.svg': 'image/svg+xml',
    '.manifest': 'application/json',
};

//gzips on first request, then keeps it in memory until the file changes
export default function gzipStatic(roots) {
    const cache = new Map(); //filepath -> { mtimeMs, size, etag, promise }

    return async (req, res, next) => {
        try {
            if (req.method !== 'GET' && req.method !== 'HEAD') return next();
            if (req.headers.range || !/\bgzip\b/.test(req.headers['accept-encoding'] || '')) return next();

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

            let entry = cache.get(filepath);
            if (!entry || entry.mtimeMs !== stat.mtimeMs || entry.size !== stat.size) {
                entry = {
                    mtimeMs: stat.mtimeMs,
                    size: stat.size,
                    etag: `W/"gz-${stat.size.toString(36)}-${stat.mtimeMs.toString(36)}"`,
                    promise: fs.promises.readFile(filepath).then(buffer => gzip(buffer, { level: 6 })),
                };
                cache.set(filepath, entry);
            };

            res.set({ 'Content-Type': types[ext], 'Content-Encoding': 'gzip', 'Vary': 'Accept-Encoding', 'ETag': entry.etag, 'Cache-Control': 'no-cache' });
            if (req.headers['if-none-match'] === entry.etag) return res.status(304).end();

            const compressed = await entry.promise;
            res.set('Content-Length', compressed.length);
            res.end(req.method === 'HEAD' ? undefined : compressed);
        } catch (error) {
            next();
        };
    };
};
