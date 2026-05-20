'use strict';
// ============================================================================
// Local server — serves the static app, owns data/store.json (the single source
// of truth), and (in Phase 3) proxies coaching to the `claude` CLI.
// ============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const PORT = process.env.PORT || 8787;

const EMPTY_STORE = { meta: { version: 1, updatedAt: 0, seeded: false } };

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch {
    return { ...EMPTY_STORE };
  }
}

function writeStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = STORE_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, STORE_PATH); // atomic-ish replace
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.svg': 'image/svg+xml',
};

function serveStatic(req, res) {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const filePath = path.join(ROOT, path.normalize(rel));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(buf);
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => resolve(data));
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  if (req.method === 'GET' && url === '/api/store') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(readStore()));
  }

  if (req.method === 'POST' && url === '/api/store') {
    const body = await readBody(req);
    let incoming;
    try { incoming = JSON.parse(body); } catch { res.writeHead(400); return res.end('{"error":"bad json"}'); }
    const existing = readStore();
    // `coach` is server-authoritative — a client save must never clobber it.
    const merged = { ...incoming, coach: existing.coach || {} };
    writeStore(merged);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end('{"ok":true}');
  }

  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Meditation app on http://localhost:${PORT}`);
});
