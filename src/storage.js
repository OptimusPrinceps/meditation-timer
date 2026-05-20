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
    coach: {},
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
  } catch {
    STORE = emptyStore(); // server unreachable — the app requires the server
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
    }).catch(() => {});
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
