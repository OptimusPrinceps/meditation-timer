'use strict';
// ============================================================================
// Local server — serves the static app, owns data/store.json (the single source
// of truth), and (in Phase 3) proxies coaching to the `claude` CLI.
// ============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const { runWeightCoach } = require('./server/coach');
const { fetchWeather } = require('./server/weather');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WEATHER_TTL_MS = 15 * 60 * 1000;

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

// Load secrets from a gitignored `.env` (KEY=value lines) into process.env, so
// the coach's `claude` subprocess inherits CLAUDE_CODE_OAUTH_TOKEN. A real
// environment variable always wins — the file only fills in what isn't set.
// Runs before the constants below so `.env` can also configure PORT.
function loadEnvFile() {
  let text;
  try { text = fs.readFileSync(path.join(ROOT, '.env'), 'utf8'); } catch { return; }
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvFile();

const PORT = process.env.PORT || 369;
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
  // Never serve dotfiles (.env, .git, .gitignore, …) as static content.
  if (rel.split('/').some((seg) => seg.startsWith('.'))) { res.writeHead(403); return res.end('Forbidden'); }
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
      // `coach` and `weather` are server-authoritative — a client save (which
      // POSTs its whole STORE) must never clobber them.
      const merged = {
        ...incoming,
        coach: existing.coach || {},
        weather: existing.weather || incoming.weather || null,
      };
      writeStore(merged);
    } catch {
      res.writeHead(500); return res.end('{"error":"write failed"}');
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end('{"ok":true}');
  }

  if (req.method === 'POST' && url === '/api/weather') {
    const body = await readBody(req);
    let coords;
    try { coords = JSON.parse(body); } catch { res.writeHead(400); return res.end('{"error":"bad json"}'); }
    const lat = Number(coords && coords.lat);
    const lon = Number(coords && coords.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      res.writeHead(400); return res.end('{"error":"lat/lon required"}');
    }
    // Cache key = coords rounded to ~1km so GPS jitter doesn't bust the cache.
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const store = readStore();
    const cached = store.weather;
    const fresh = cached && cached.key === key && (Date.now() - cached.fetchedAt) < WEATHER_TTL_MS;
    if (fresh) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ...cached.data, fetchedAt: cached.fetchedAt, stale: false }));
    }
    try {
      const data = await fetchWeather(lat, lon);
      const entry = { key, fetchedAt: Date.now(), data };
      store.weather = entry;
      writeStore(store);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ...data, fetchedAt: entry.fetchedAt, stale: false }));
    } catch (e) {
      // Offline / Open-Meteo error: serve the last cache (any age) if we have one.
      if (cached && cached.data) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ...cached.data, fetchedAt: cached.fetchedAt, stale: true }));
      }
      res.writeHead(502, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: String(e.message || e) }));
    }
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
