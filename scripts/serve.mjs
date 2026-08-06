// Minimal static file server for the repo root — the same files GitHub Pages serves.
//
//     node scripts/serve.mjs [port]
//
// Deliberately dependency-free (node:http + node:fs) so the dev loop needs nothing
// installed beyond what the screenshot tool already pulls in.
//
// Note it serves from the repo root with no path prefix, while Pages serves the app
// under /mobileapp/. That difference is exactly why every path in the app must be
// relative: an absolute /assets/... works here and 404s in production, which is the
// classic way this breaks only after deploy.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
};

export function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';

    // Resolve inside ROOT and reject anything that escapes it.
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    fs.readFile(file, (err, body) => {
      if (err) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found: ' + rel);
        return;
      }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(body);
    });
  });
}

/** Start on `port`, or on a free port when port is 0. Resolves with the base URL. */
export function listen(port = 0) {
  const server = createServer();
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () =>
      resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }),
    );
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { origin } = await listen(Number(process.argv[2]) || 8000);
  console.log(`serving ${ROOT} at ${origin}`);
}
