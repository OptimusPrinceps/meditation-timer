'use strict';
// ============================================================================
// Local server — serves the static app, owns data/store.json (the single source
// of truth), and (in Phase 3) proxies coaching to the `claude` CLI.
// ============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const { runWeightCoach } = require('./server/coach');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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
  // The store is reachable only through the API, never as a raw static file.
  if (filePath.startsWith(DATA_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
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
    req.on('error', () => resolve(''));
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
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      res.writeHead(400); return res.end('{"error":"store must be an object"}');
    }
    try {
      const existing = readStore();
      // `coach` is server-authoritative — a client save must never clobber it.
      const merged = { ...incoming, coach: existing.coach || {} };
      writeStore(merged);
    } catch {
      res.writeHead(500); return res.end('{"error":"write failed"}');
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end('{"ok":true}');
  }

  if (req.method === 'POST' && url === '/api/coach/weight') {
    try {
      const store = readStore();
      const report = await runWeightCoach(store);
      store.coach = store.coach || {};
      store.coach.weight = report;
      writeStore(store);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(report));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: String(e.message || e) }));
    }
  }

  return serveStatic(req, res);
});

// --- Weekly staleness scheduler: regenerate if the report is missing or >7d old ---
async function maybeRunWeekly() {
  try {
    const store = readStore();
    if (Object.keys(store.weights || {}).length < 2) return;
    const last = store.coach && store.coach.weight ? store.coach.weight.generatedAt : 0;
    if (Date.now() - (last || 0) < WEEK_MS) return;
    const report = await runWeightCoach(store);
    store.coach = store.coach || {};
    store.coach.weight = report;
    writeStore(store);
    console.log('[coach] weekly weight report regenerated');
  } catch (e) {
    console.error('[coach] weekly run failed:', e.message);
  }
}

server.listen(PORT, () => {
  console.log(`Meditation app on http://localhost:${PORT}`);
  maybeRunWeekly();
  setInterval(maybeRunWeekly, 60 * 60 * 1000); // hourly
});
