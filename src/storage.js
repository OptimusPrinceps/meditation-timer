'use strict';

// ============================================================================
// Storage — an in-memory STORE is the runtime read cache; data/store.json (via
// the local server) is the single source of truth. Boot calls fetchStore();
// every mutation updates STORE and schedules a debounced POST /api/store.
// ============================================================================

const STORE_VERSION = 1;
const BELL_GAP_MIN_SEC = 0.2;
const BELL_GAP_MAX_SEC = 10;
const DEFAULT_OPENING_GAP_SEC = 2.5;
const DEFAULT_CLOSING_GAP_SEC = 0.5;

// Legacy localStorage keys — read once on first boot for migration.
const LEGACY = {
  configs: 'meditationTimer.configs.v1',
  lastConfig: 'meditationTimer.lastConfig.v1',
  rotation: 'meditationTimer.rotation.v1',
  weights: 'meditationTimer.weights.v1',
  emissions: 'meditationTimer.emissions.v1',
  plants: 'meditationTimer.plants.v1',
  bellTiming: 'meditationTimer.bellTiming.v1',
};

function emptyStore() {
  return {
    meta: { version: STORE_VERSION, updatedAt: 0, seeded: false },
    configs: {},
    lastConfig: '',
    rotation: null,
    bellTiming: null,
    weights: {},
    weightGoal: null,
    emissions: {},
    plants: [],
    calisthenics: { programme: null, archivedProgrammes: [], sessions: [] },
    coach: {},
    weather: null,
  };
}

let STORE = emptyStore();

// --- Server sync ---

async function fetchStore() {
  try {
    const res = await fetch('/api/store');
    if (!res.ok) throw new Error(`store fetch failed: ${res.status}`);
    const data = await res.json();
    STORE = Object.assign(emptyStore(), data);
    reportServerReachable(true);
  } catch {
    STORE = emptyStore(); // server unreachable — the app requires the server
    reportServerReachable(false);
  }
  if (!STORE.meta || !STORE.meta.seeded) migrateFromLocalStorage();
}

function migrateFromLocalStorage() {
  const getJson = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  let migrated = false;
  const c = getJson(LEGACY.configs); if (c) { STORE.configs = c; migrated = true; }
  const last = localStorage.getItem(LEGACY.lastConfig); if (last) { STORE.lastConfig = last; migrated = true; }
  const rot = getJson(LEGACY.rotation); if (rot) { STORE.rotation = rot; migrated = true; }
  const w = getJson(LEGACY.weights); if (w) { STORE.weights = w; migrated = true; }
  const em = getJson(LEGACY.emissions); if (em) { STORE.emissions = em; migrated = true; }
  const pl = getJson(LEGACY.plants); if (pl && pl.plants) { STORE.plants = pl.plants; migrated = true; }
  const bt = getJson(LEGACY.bellTiming); if (bt) { STORE.bellTiming = bt; migrated = true; }
  STORE.meta = STORE.meta || { version: STORE_VERSION };
  STORE.meta.seeded = true;
  persist();
  if (migrated) console.log('[storage] migrated existing localStorage data into the server store');
}

let persistTimer = null;
function persist() {
  STORE.meta.updatedAt = Date.now();
  STORE.meta.version = STORE_VERSION;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    fetch('/api/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(STORE),
    })
      .then((res) => reportServerReachable(res.ok))
      .catch(() => reportServerReachable(false));
  }, 250);
}

// --- Bell timing ---
function clampGapSeconds(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_OPENING_GAP_SEC;
  return Math.min(BELL_GAP_MAX_SEC, Math.max(BELL_GAP_MIN_SEC, n));
}

function loadBellTiming() {
  const src = STORE.bellTiming && typeof STORE.bellTiming === 'object' ? STORE.bellTiming : {};
  return {
    openingGapSeconds: clampGapSeconds(src.openingGapSeconds ?? DEFAULT_OPENING_GAP_SEC),
    closingGapSeconds: clampGapSeconds(src.closingGapSeconds ?? DEFAULT_CLOSING_GAP_SEC),
  };
}

function saveBellTiming(timing) {
  const clean = {
    openingGapSeconds: clampGapSeconds(timing.openingGapSeconds),
    closingGapSeconds: clampGapSeconds(timing.closingGapSeconds),
  };
  STORE.bellTiming = clean;
  persist();
  return clean;
}

// --- Configs ---
function loadConfigs() { return STORE.configs || {}; }
function saveConfigs(configs) { STORE.configs = configs; persist(); }
function saveConfig(name, config) { STORE.configs[name] = config; persist(); }
function deleteConfig(name) { delete STORE.configs[name]; persist(); }
function getLastConfigName() { return STORE.lastConfig || ''; }
function setLastConfigName(name) { STORE.lastConfig = name || ''; persist(); }

// --- Rotation ---
function loadRotation() { return STORE.rotation || null; }
function saveRotation(rot) { STORE.rotation = rot; persist(); }
function clearRotation() { STORE.rotation = null; persist(); }

// --- Weights ---
function loadWeights() { return STORE.weights || {}; }
function saveWeights(map) { STORE.weights = map; persist(); }
function upsertWeight(dateStr, kg) { STORE.weights[dateStr] = kg; persist(); }
function getWeightsSorted() {
  const map = STORE.weights || {};
  return Object.keys(map).sort().map((date) => ({ date, kg: map[date] }));
}

// --- Weight goal ---
function getWeightGoal() { return STORE.weightGoal || null; }
function setWeightGoal(goal) { STORE.weightGoal = goal; persist(); }

// --- Coach (server-owned; read-only on the client) ---
function getCoachReport(surface) { return (STORE.coach && STORE.coach[surface]) || null; }

// --- Weather (server-owned cache; read-only on the client) ---
// Returns the normalized weather payload plus fetchedAt, or null if uncached.
function getCachedWeather() {
  const w = STORE.weather;
  if (!w || !w.data) return null;
  return { ...w.data, fetchedAt: w.fetchedAt, stale: true };
}

// --- Emissions ---
function loadEmissions() { return STORE.emissions || {}; }
function saveEmissions(map) { STORE.emissions = map; persist(); }
function addEmission(dateStr) { STORE.emissions[dateStr] = true; persist(); }
function removeEmission(dateStr) { delete STORE.emissions[dateStr]; persist(); }
function getEmissionsSorted() {
  const map = STORE.emissions || {};
  return Object.keys(map).sort().map((date) => ({ date }));
}

// --- Plants ---
function loadPlants() { return STORE.plants || []; }
function savePlants(plants) { STORE.plants = plants; persist(); }
function getPlant(id) { return loadPlants().find((p) => p.id === id) || null; }
function addPlant(name, emoji) {
  const plant = { id: crypto.randomUUID(), name, emoji, log: {} };
  STORE.plants.push(plant);
  persist();
  return plant.id;
}
function updatePlant(id, name, emoji) {
  const p = STORE.plants.find((x) => x.id === id);
  if (!p) return;
  p.name = name;
  p.emoji = emoji;
  persist();
}
function deletePlant(id) { STORE.plants = loadPlants().filter((p) => p.id !== id); persist(); }
function addWatering(id, dateStr) {
  const p = STORE.plants.find((x) => x.id === id);
  if (!p) return;
  p.log[dateStr] = true;
  persist();
}
function removeWatering(id, dateStr) {
  const p = STORE.plants.find((x) => x.id === id);
  if (!p) return;
  delete p.log[dateStr];
  persist();
}
function getPlantLogSorted(id) {
  const p = getPlant(id);
  if (!p) return [];
  return Object.keys(p.log).sort().map((date) => ({ date }));
}

// --- Calisthenics (training blocks) ---
// STORE.calisthenics = { programme, archivedProgrammes[], sessions[] }. The
// active `programme` holds the catalog as data; sessions are tagged with the
// programmeId of the block they were logged under, so charts/coach can span or
// separate blocks. See src/calisthenics-plan.js for the seed.
function loadCalisthenics() {
  const c = STORE.calisthenics;
  if (!c || typeof c !== 'object') {
    STORE.calisthenics = { programme: null, archivedProgrammes: [], sessions: [] };
  } else {
    c.archivedProgrammes = c.archivedProgrammes || [];
    c.sessions = c.sessions || [];
    if (!('programme' in c)) c.programme = null;
  }
  return STORE.calisthenics;
}

function getActiveProgramme() { return loadCalisthenics().programme; }
function setActiveProgramme(p) { loadCalisthenics().programme = p; persist(); }

// Start a fresh block: archive the current programme, adopt `newProg` (stamped
// with today's startedAt). Past sessions keep their old programmeId, so history
// is preserved and charts still span both blocks.
function archiveAndSetProgramme(newProg) {
  const c = loadCalisthenics();
  if (c.programme) c.archivedProgrammes.push(c.programme);
  c.programme = { ...newProg, startedAt: newProg.startedAt || todayLocal() };
  persist();
  return c.programme;
}

function getCalisthenicsSessions() {
  return loadCalisthenics().sessions.slice().sort((a, b) => a.date.localeCompare(b.date));
}

function addCalisthenicsSession(date, session, results, notes) {
  const c = loadCalisthenics();
  const programmeId = c.programme ? c.programme.id : null;
  c.sessions.push({ id: crypto.randomUUID(), date, programmeId, session, results, notes: notes || '' });
  persist();
}

function removeCalisthenicsSession(id) {
  const c = loadCalisthenics();
  c.sessions = c.sessions.filter((s) => s.id !== id);
  persist();
}

// Successor of the last logged session in the active programme's session order
// (A → B → C → Conditioning → A …). Defaults to the first session when empty.
function getNextCalisthenicsSession() {
  const prog = getActiveProgramme();
  if (!prog || !prog.sessions.length) return null;
  const order = prog.sessions.map((s) => s.key);
  const logged = getCalisthenicsSessions();
  if (!logged.length) return order[0];
  const lastKey = logged[logged.length - 1].session;
  const idx = order.indexOf(lastKey);
  return idx === -1 ? order[0] : order[(idx + 1) % order.length];
}

// All sessions (across blocks) carrying a numeric result for exKey, as
// [{ date, kg: value }] — the `kg` key lets the existing chart/regression
// helpers consume it unchanged.
function getExerciseHistory(exKey) {
  return getCalisthenicsSessions()
    .filter((s) => s.results && typeof s.results[exKey] === 'number')
    .map((s) => ({ date: s.date, kg: s.results[exKey] }));
}

// Block-change dates for chart markers: each block's startedAt, minus the
// earliest (the first block isn't a "change").
function getBlockBoundaryDates() {
  const c = loadCalisthenics();
  const dates = [...c.archivedProgrammes, c.programme]
    .filter((p) => p && p.startedAt)
    .map((p) => p.startedAt)
    .sort();
  return dates.slice(1);
}

// Resolve an exercise's { name, metric } from the active programme first, then
// archived blocks, so old sessions still render names after a block swap.
function getExerciseMeta(key) {
  const c = loadCalisthenics();
  const blocks = [c.programme, ...c.archivedProgrammes].filter(Boolean);
  for (const b of blocks) {
    if (b.exercises && b.exercises[key]) return b.exercises[key];
  }
  return { name: key, metric: 'reps' };
}

// --- Dates / rotation suggestion ---
function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTodaysSuggestion() {
  const rot = loadRotation();
  if (!rot) return null;
  const configs = loadConfigs();
  const aOk = rot.a && configs[rot.a];
  const bOk = rot.b && configs[rot.b];
  if (!aOk && !bOk) return null;
  if (aOk && !bOk) return rot.a;
  if (!aOk && bOk) return rot.b;
  if (rot.lastDoneDate === todayLocal() && (rot.lastDoneName === rot.a || rot.lastDoneName === rot.b)) {
    return rot.lastDoneName;
  }
  return rot.lastDoneName === rot.a ? rot.b : rot.a;
}

function markRotationDone(name) {
  const rot = loadRotation();
  if (!rot || (name !== rot.a && name !== rot.b)) return;
  rot.lastDoneName = name;
  rot.lastDoneDate = todayLocal();
  saveRotation(rot);
}
