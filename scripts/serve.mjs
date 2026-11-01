#!/usr/bin/env node
/**
 * serve.mjs: serve the www/ folder at http://localhost:<port> (default 3000), for
 * `npm run dev` and the Playwright tests. Uses only Node's built-in http module, so
 * there is no extra package to keep updated.
 *
 *   node scripts/serve.mjs [folder] [port]
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || 'www');
const PORT = Number(process.argv[3] || process.env.PORT || 3000);

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.mp3': 'audio/mpeg',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
};

const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end();
        return;
    }
    let urlPath;
    try {
        urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
        res.writeHead(400).end();
        return;
    }
    let file = path.join(ROOT, urlPath);
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
        res.writeHead(403).end(); // never serve files outside the folder
        return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
        res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'}).end('Not found');
        return;
    }
    res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': fs.statSync(file).size,
        'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') {
        res.end();
        return;
    }
    fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => console.log(`Serving ${path.relative(process.cwd(), ROOT) || '.'} at http://localhost:${PORT}`));
