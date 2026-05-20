'use strict';

// ============================================================================
// Storage
// ============================================================================

const CONFIGS_KEY = 'meditationTimer.configs.v1';
const LAST_KEY = 'meditationTimer.lastConfig.v1';
const ROTATION_KEY = 'meditationTimer.rotation.v1';
const WEIGHTS_KEY = 'meditationTimer.weights.v1';
const EMISSIONS_KEY = 'meditationTimer.emissions.v1';
const WATERING_KEY = 'meditationTimer.watering.v1';
const BELL_TIMING_KEY = 'meditationTimer.bellTiming.v1';
const BELL_GAP_MIN_SEC = 0.2;
const BELL_GAP_MAX_SEC = 10;
const DEFAULT_OPENING_GAP_SEC = 2.5;
const DEFAULT_CLOSING_GAP_SEC = 0.5;

function clampGapSeconds(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_OPENING_GAP_SEC;
  return Math.min(BELL_GAP_MAX_SEC, Math.max(BELL_GAP_MIN_SEC, n));
}

function loadBellTiming() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(BELL_TIMING_KEY)); } catch {}
  const src = raw && typeof raw === 'object' ? raw : {};
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
  localStorage.setItem(BELL_TIMING_KEY, JSON.stringify(clean));
  return clean;
}

function loadConfigs() {
  try {
    return JSON.parse(localStorage.getItem(CONFIGS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveConfigs(configs) {
  localStorage.setItem(CONFIGS_KEY, JSON.stringify(configs));
}

function saveConfig(name, config) {
  const configs = loadConfigs();
  configs[name] = config;
  saveConfigs(configs);
}

function deleteConfig(name) {
  const configs = loadConfigs();
  delete configs[name];
  saveConfigs(configs);
}

function getLastConfigName() {
  return localStorage.getItem(LAST_KEY) || '';
}

function setLastConfigName(name) {
  if (name) localStorage.setItem(LAST_KEY, name);
  else localStorage.removeItem(LAST_KEY);
}

function loadRotation() {
  try {
    return JSON.parse(localStorage.getItem(ROTATION_KEY)) || null;
  } catch {
    return null;
  }
}

function saveRotation(rot) {
  localStorage.setItem(ROTATION_KEY, JSON.stringify(rot));
}

function clearRotation() {
  localStorage.removeItem(ROTATION_KEY);
}

function loadWeights() {
  try {
    return JSON.parse(localStorage.getItem(WEIGHTS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveWeights(map) {
  localStorage.setItem(WEIGHTS_KEY, JSON.stringify(map));
}

function upsertWeight(dateStr, kg) {
  const map = loadWeights();
  map[dateStr] = kg;
  saveWeights(map);
}

function getWeightsSorted() {
  const map = loadWeights();
  return Object.keys(map)
    .sort()
    .map((date) => ({ date, kg: map[date] }));
}

// --- Emissions: a map { "YYYY-MM-DD": true }; presence = logged (per-day dedupe).
function loadEmissions() {
  try {
    return JSON.parse(localStorage.getItem(EMISSIONS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveEmissions(map) {
  localStorage.setItem(EMISSIONS_KEY, JSON.stringify(map));
}

function addEmission(dateStr) {
  const map = loadEmissions();
  map[dateStr] = true;
  saveEmissions(map);
}

function removeEmission(dateStr) {
  const map = loadEmissions();
  delete map[dateStr];
  saveEmissions(map);
}

function getEmissionsSorted() {
  const map = loadEmissions();
  return Object.keys(map)
    .sort()
    .map((date) => ({ date }));
}

// --- Watering: a map { "YYYY-MM-DD": true }; presence = watered (per-day dedupe).
function loadWatering() {
  try {
    return JSON.parse(localStorage.getItem(WATERING_KEY)) || {};
  } catch {
    return {};
  }
}

function saveWatering(map) {
  localStorage.setItem(WATERING_KEY, JSON.stringify(map));
}

function addWatering(dateStr) {
  const map = loadWatering();
  map[dateStr] = true;
  saveWatering(map);
}

function removeWatering(dateStr) {
  const map = loadWatering();
  delete map[dateStr];
  saveWatering(map);
}

function getWateringSorted() {
  const map = loadWatering();
  return Object.keys(map)
    .sort()
    .map((date) => ({ date }));
}

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Returns the name to suggest today, or null if no rotation is configured /
// neither side resolves to a saved config.
function getTodaysSuggestion() {
  const rot = loadRotation();
  if (!rot) return null;
  const configs = loadConfigs();
  const aOk = rot.a && configs[rot.a];
  const bOk = rot.b && configs[rot.b];
  if (!aOk && !bOk) return null;
  if (aOk && !bOk) return rot.a;
  if (!aOk && bOk) return rot.b;
  // Both sides exist. If they completed something today, keep it; otherwise alternate.
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
