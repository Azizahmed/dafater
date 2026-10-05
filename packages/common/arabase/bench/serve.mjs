// Minimal static server with SPA fallback for measuring production builds.
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';
const gz = new Map();

const [root, port = '8090'] = process.argv.slice(2);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
};
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = normalize(join(root, decodeURIComponent(url.pathname)));
  if (!file.startsWith(normalize(root))) {
    res.writeHead(403).end();
    return;
  }
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = join(file, 'index.html');
    await stat(file);
  } catch {
    file = join(root, 'index.html');
  }
  try {
    const ext = extname(file);
    const headers = {
      'content-type': types[ext] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    };
    let body = await readFile(file);
    if (
      ['.js', '.css', '.html', '.json', '.wasm', '.svg'].includes(ext) &&
      /gzip/.test(req.headers['accept-encoding'] ?? '')
    ) {
      if (!gz.has(file)) gz.set(file, gzipSync(body, { level: 6 }));
      body = gz.get(file);
      headers['content-encoding'] = 'gzip';
    }
    res.writeHead(200, headers);
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(Number(port), () => console.log(`serving ${root} on ${port}`));
