'use strict';

// ============================================================================
// Storage
// ============================================================================

const CONFIGS_KEY = 'meditationTimer.configs.v1';
const LAST_KEY = 'meditationTimer.lastConfig.v1';
const ROTATION_KEY = 'meditationTimer.rotation.v1';

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

// ============================================================================
// Audio — pool of HTMLAudioElement so bells can overlap if needed
// ============================================================================

const BELL_GAP_MS = 2500;
let bellSrc = null;
let bellPool = [];
let bellIndex = 0;
let pendingBellTimeouts = [];

function probeBellSrc() {
  return new Promise((resolve) => {
    const candidates = ['bell.mp3', 'bell.wav'];
    const tryNext = (i) => {
      if (i >= candidates.length) return resolve(null);
      const a = new Audio();
      a.preload = 'auto';
      const onLoad = () => { cleanup(); resolve(candidates[i]); };
      const onError = () => { cleanup(); tryNext(i + 1); };
      const cleanup = () => {
        a.removeEventListener('canplaythrough', onLoad);
        a.removeEventListener('loadeddata', onLoad);
        a.removeEventListener('error', onError);
      };
      a.addEventListener('canplaythrough', onLoad, { once: true });
      a.addEventListener('loadeddata', onLoad, { once: true });
      a.addEventListener('error', onError, { once: true });
      a.src = candidates[i];
    };
    tryNext(0);
  });
}

async function initAudio() {
  bellSrc = await probeBellSrc();
  if (!bellSrc) return false;
  bellPool = Array.from({ length: 4 }, () => {
    const a = new Audio(bellSrc);
    a.preload = 'auto';
    return a;
  });
  return true;
}

function playBellNow() {
  if (!bellPool.length) return;
  const a = bellPool[bellIndex];
  bellIndex = (bellIndex + 1) % bellPool.length;
  try {
    a.currentTime = 0;
    const p = a.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {}
}

function scheduleBells(count) {
  const ids = [];
  for (let i = 0; i < count; i++) {
    if (i === 0) {
      playBellNow();
    } else {
      ids.push(setTimeout(playBellNow, i * BELL_GAP_MS));
    }
  }
  pendingBellTimeouts.push(...ids);
  return ids;
}

function cancelPendingBells() {
  for (const id of pendingBellTimeouts) clearTimeout(id);
  pendingBellTimeouts = [];
}

// ============================================================================
// Wake Lock — keep the screen awake during a session so audio doesn't get
// killed by the OS. Auto-released when the tab is hidden; we re-request on
// re-focus while a session is active.
// ============================================================================

let wakeLock = null;

async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch {
    // Permission denied or unsupported — silent.
  }
}

async function releaseWakeLock() {
  if (!wakeLock) return;
  try { await wakeLock.release(); } catch {}
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !Engine.done && Engine.schedule && !wakeLock) {
    acquireWakeLock();
  }
});

// ============================================================================
// Schedule builder
// ============================================================================

function minutesToMs(min) {
  return Math.round(min * 60 * 1000);
}

function buildSchedule(config) {
  const segments = [];
  const delaySec = config.delaySeconds;

  segments.push({
    kind: 'delay',
    label: delaySec > 0 ? 'Get ready' : 'Starting',
    durationMs: delaySec * 1000,
    bellsAfter: 3,
  });

  const intervalDur = minutesToMs(config.intervalMinutes);
  const hasFree = config.freeMinutes > 0;
  const n = config.intervalCount;

  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    segments.push({
      kind: 'interval',
      label: `Interval ${i + 1} of ${n}`,
      durationMs: intervalDur,
      bellsAfter: isLast ? (hasFree ? 1 : 3) : 1,
    });
  }

  if (hasFree) {
    segments.push({
      kind: 'free',
      label: 'Free time',
      durationMs: minutesToMs(config.freeMinutes),
      bellsAfter: 3,
    });
  }

  return segments;
}

function totalIntervalsMs(config) {
  return minutesToMs(config.intervalMinutes) * config.intervalCount;
}

// ============================================================================
// Timer engine
// ============================================================================

const Engine = {
  schedule: null,
  index: 0,
  segmentEndAt: 0,
  pausedRemainingMs: null,
  segmentTimeoutId: null,
  rafId: null,
  onTick: null,
  onComplete: null,
  done: false,

  start(schedule, hooks) {
    this.schedule = schedule;
    this.index = 0;
    this.pausedRemainingMs = null;
    this.done = false;
    this.onTick = hooks.onTick;
    this.onComplete = hooks.onComplete;
    this._beginSegment();
    this._startRaf();
  },

  _beginSegment() {
    const seg = this.schedule[this.index];
    this.segmentEndAt = performance.now() + seg.durationMs;
    this._fire();
    this._scheduleSegmentEnd(seg.durationMs);
  },

  _scheduleSegmentEnd(remainingMs) {
    clearTimeout(this.segmentTimeoutId);
    this.segmentTimeoutId = setTimeout(() => this._endSegment(), remainingMs);
  },

  _endSegment() {
    const seg = this.schedule[this.index];
    if (seg.bellsAfter > 0) scheduleBells(seg.bellsAfter);
    if (this.index >= this.schedule.length - 1) {
      this._finish();
      return;
    }
    this.index += 1;
    this._beginSegment();
  },

  _finish() {
    this.done = true;
    clearTimeout(this.segmentTimeoutId);
    this.segmentTimeoutId = null;
    this._stopRaf();
    this._fire();
    if (this.onComplete) this.onComplete();
  },

  pause() {
    if (this.done || this.pausedRemainingMs != null) return;
    this.pausedRemainingMs = Math.max(0, this.segmentEndAt - performance.now());
    clearTimeout(this.segmentTimeoutId);
    this.segmentTimeoutId = null;
    cancelPendingBells();
    this._fire();
  },

  resume() {
    if (this.done || this.pausedRemainingMs == null) return;
    const rem = this.pausedRemainingMs;
    this.pausedRemainingMs = null;
    this.segmentEndAt = performance.now() + rem;
    this._scheduleSegmentEnd(rem);
    this._fire();
  },

  stop() {
    this.done = true;
    clearTimeout(this.segmentTimeoutId);
    this.segmentTimeoutId = null;
    this._stopRaf();
    cancelPendingBells();
  },

  _startRaf() {
    const loop = () => {
      this._fire();
      if (!this.done) this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  },

  _stopRaf() {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  },

  _fire() {
    if (!this.onTick || !this.schedule) return;
    const seg = this.schedule[this.index];
    let remaining;
    if (this.done) remaining = 0;
    else if (this.pausedRemainingMs != null) remaining = this.pausedRemainingMs;
    else remaining = Math.max(0, this.segmentEndAt - performance.now());
    this.onTick({
      label: this.done ? 'Done' : seg.label,
      remainingMs: remaining,
      index: this.index,
      total: this.schedule.length,
      paused: this.pausedRemainingMs != null,
      done: this.done,
    });
  },
};

// ============================================================================
// UI controller
// ============================================================================

const $ = (id) => document.getElementById(id);

const els = {
  // views
  homeView: $('home-view'),
  settingsView: $('settings-view'),
  sessionView: $('session-view'),
  // home
  homeName: $('home-name'),
  homeTotal: $('home-total'),
  homeBreakdown: $('home-breakdown'),
  btnHomeStart: $('btn-home-start'),
  btnAdvance: $('btn-advance'),
  homeMessage: $('home-message'),
  btnOpenSettings: $('btn-open-settings'),
  btnHomePreview: $('btn-home-preview'),
  // settings
  btnBackHome: $('btn-back-home'),
  configSelect: $('config-select'),
  btnDelete: $('btn-delete'),
  rotationA: $('rotation-a'),
  rotationB: $('rotation-b'),
  btnSaveRotation: $('btn-save-rotation'),
  btnClearRotation: $('btn-clear-rotation'),
  rotationStatus: $('rotation-status'),
  configName: $('config-name'),
  delaySeconds: $('delay-seconds'),
  intervalCount: $('interval-count'),
  intervalMinutes: $('interval-minutes'),
  freeMinutes: $('free-minutes'),
  btnSave: $('btn-save'),
  totalDisplay: $('total-display'),
  totalBreakdown: $('total-breakdown'),
  message: $('setup-message'),
  // session
  segmentLabel: $('segment-label'),
  countdown: $('countdown'),
  sessionProgress: $('session-progress'),
  btnPause: $('btn-pause'),
  btnResume: $('btn-resume'),
  btnStop: $('btn-stop'),
  btnBack: $('btn-back'),
};

// The config currently displayed/loaded on the home screen.
let currentConfigName = null;

function readForm() {
  return {
    delaySeconds: Math.max(0, parseInt(els.delaySeconds.value, 10) || 0),
    intervalCount: Math.max(1, parseInt(els.intervalCount.value, 10) || 1),
    intervalMinutes: Math.max(0.5, parseFloat(els.intervalMinutes.value) || 0.5),
    freeMinutes: Math.max(0, parseFloat(els.freeMinutes.value) || 0),
  };
}

function writeForm(config) {
  els.delaySeconds.value = config.delaySeconds;
  els.intervalCount.value = config.intervalCount;
  els.intervalMinutes.value = config.intervalMinutes;
  els.freeMinutes.value = config.freeMinutes;
  updateTotal();
}

function formatMmSs(ms) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function updateTotal() {
  const c = readForm();
  const intervalsMs = totalIntervalsMs(c);
  const freeMs = minutesToMs(c.freeMinutes);
  const totalMs = intervalsMs + freeMs;
  els.totalDisplay.textContent = formatMmSs(totalMs);
  els.totalBreakdown.textContent =
    `Intervals ${formatMmSs(intervalsMs)} · Free ${formatMmSs(freeMs)}`;
}

let activeSessionName = '';

function buildOptions(names, includeBlank) {
  const opts = [];
  if (includeBlank) {
    const o = document.createElement('option');
    o.value = '';
    o.textContent = '—';
    opts.push(o);
  }
  for (const n of names) {
    const o = document.createElement('option');
    o.value = n;
    o.textContent = n;
    opts.push(o);
  }
  return opts;
}

function refreshRotationSelects() {
  const names = Object.keys(loadConfigs()).sort((a, b) => a.localeCompare(b));
  const rot = loadRotation();
  els.rotationA.replaceChildren(...buildOptions(names, true));
  els.rotationB.replaceChildren(...buildOptions(names, true));
  if (rot) {
    if (rot.a && names.includes(rot.a)) els.rotationA.value = rot.a;
    if (rot.b && names.includes(rot.b)) els.rotationB.value = rot.b;
  }
  refreshRotationStatus();
}

function refreshRotationStatus() {
  const rot = loadRotation();
  if (!rot || (!rot.a && !rot.b)) {
    els.rotationStatus.textContent = '';
    return;
  }
  const suggestion = getTodaysSuggestion();
  if (!suggestion) {
    els.rotationStatus.textContent = '';
    return;
  }
  const sameDay = rot.lastDoneDate === todayLocal();
  els.rotationStatus.textContent = sameDay
    ? `Today: ${suggestion} (done)`
    : `Today: ${suggestion}`;
}

function refreshConfigSelect(selectName) {
  const configs = loadConfigs();
  const names = Object.keys(configs).sort((a, b) => a.localeCompare(b));
  const options = [];
  if (!names.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '— none saved —';
    options.push(opt);
  } else {
    for (const n of names) {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      options.push(opt);
    }
  }
  els.configSelect.replaceChildren(...options);
  if (selectName && names.includes(selectName)) {
    els.configSelect.value = selectName;
  }
}

function loadConfigByName(name) {
  const configs = loadConfigs();
  const c = configs[name];
  if (!c) return false;
  els.configName.value = name;
  writeForm(c);
  setLastConfigName(name);
  return true;
}

function setMessage(text, isError = true) {
  els.message.textContent = text;
  els.message.style.color = isError ? 'var(--danger)' : 'var(--muted)';
}

function setHomeMessage(text, isError = true) {
  els.homeMessage.textContent = text;
  els.homeMessage.style.color = isError ? 'var(--danger)' : 'var(--muted)';
}

function hideAllViews() {
  els.homeView.classList.add('hidden');
  els.settingsView.classList.add('hidden');
  els.sessionView.classList.add('hidden');
}

function showHome() {
  hideAllViews();
  els.homeView.classList.remove('hidden');
  refreshHome();
}

function showSettings() {
  hideAllViews();
  els.settingsView.classList.remove('hidden');
  // Populate the settings form with whatever is currently loaded.
  if (currentConfigName && loadConfigs()[currentConfigName]) {
    loadConfigByName(currentConfigName);
    els.configSelect.value = currentConfigName;
  }
  refreshConfigSelect(currentConfigName);
  refreshRotationSelects();
  setMessage('');
}

function showSession() {
  hideAllViews();
  els.sessionView.classList.remove('hidden');
  els.btnPause.classList.remove('hidden');
  els.btnResume.classList.add('hidden');
  els.btnStop.classList.remove('hidden');
  els.btnBack.classList.add('hidden');
}

function refreshHome() {
  setHomeMessage('');
  const configs = loadConfigs();
  const config = currentConfigName ? configs[currentConfigName] : null;
  if (!config) {
    els.homeName.textContent = 'No config';
    els.homeTotal.textContent = '—';
    els.homeBreakdown.textContent = 'Open Settings to create one.';
    els.btnHomeStart.disabled = true;
    els.btnAdvance.classList.add('hidden');
    return;
  }
  els.btnHomeStart.disabled = false;
  els.homeName.textContent = currentConfigName;
  const intervalsMs = totalIntervalsMs(config);
  const freeMs = minutesToMs(config.freeMinutes);
  els.homeTotal.textContent = formatMmSs(intervalsMs + freeMs);
  const parts = [`${config.intervalCount} × ${config.intervalMinutes} min`];
  if (config.freeMinutes > 0) parts.push(`Free ${config.freeMinutes} min`);
  if (config.delaySeconds > 0) parts.push(`Delay ${config.delaySeconds}s`);
  els.homeBreakdown.textContent = parts.join(' · ');

  // Advance button: only when rotation has both slots and current matches one.
  const rot = loadRotation();
  if (rot && rot.a && rot.b && configs[rot.a] && configs[rot.b]
      && (currentConfigName === rot.a || currentConfigName === rot.b)) {
    const other = currentConfigName === rot.a ? rot.b : rot.a;
    els.btnAdvance.textContent = `Switch to ${other}`;
    els.btnAdvance.classList.remove('hidden');
  } else {
    els.btnAdvance.classList.add('hidden');
  }
}

function setCurrentConfig(name) {
  if (name && loadConfigs()[name]) {
    currentConfigName = name;
    setLastConfigName(name);
  } else {
    currentConfigName = null;
  }
}

function onTick(state) {
  els.segmentLabel.textContent = state.paused ? `${state.label} (paused)` : state.label;
  els.countdown.textContent = formatMmSs(state.remainingMs);
  els.sessionProgress.textContent = state.done
    ? ''
    : `Segment ${state.index + 1} of ${state.total}`;
  if (state.done) {
    els.btnPause.classList.add('hidden');
    els.btnResume.classList.add('hidden');
    els.btnStop.classList.add('hidden');
    els.btnBack.classList.remove('hidden');
  }
}

function onComplete() {
  releaseWakeLock();
}

async function ensureBellLoaded(reportFn) {
  if (bellPool.length) return true;
  const ok = await initAudio();
  if (!ok) reportFn('bell.mp3 (or bell.wav) not found next to index.html. Add it and reload.');
  return ok;
}

async function startSession() {
  if (!currentConfigName) return;
  const config = loadConfigs()[currentConfigName];
  if (!config) return;
  if (!(await ensureBellLoaded(setHomeMessage))) return;

  activeSessionName = currentConfigName;
  // "Started counts as done today" — record now, not on completion.
  markRotationDone(currentConfigName);
  refreshRotationStatus();

  const schedule = buildSchedule(config);
  showSession();
  acquireWakeLock();
  Engine.start(schedule, { onTick, onComplete });
}

// --- Home view handlers ---

els.btnHomeStart.addEventListener('click', startSession);

els.btnAdvance.addEventListener('click', () => {
  const rot = loadRotation();
  if (!rot || !rot.a || !rot.b) return;
  const configs = loadConfigs();
  if (!configs[rot.a] || !configs[rot.b]) return;
  const other = currentConfigName === rot.a ? rot.b : rot.a;
  setCurrentConfig(other);
  refreshHome();
});

els.btnOpenSettings.addEventListener('click', showSettings);

els.btnHomePreview.addEventListener('click', async () => {
  if (!(await ensureBellLoaded(setHomeMessage))) return;
  playBellNow();
});

// --- Settings view handlers ---

els.btnBackHome.addEventListener('click', () => {
  // Make sure currentConfigName still points at something valid (e.g. after deletes).
  if (!currentConfigName || !loadConfigs()[currentConfigName]) {
    setCurrentConfig(getTodaysSuggestion() || getLastConfigName() || Object.keys(loadConfigs())[0] || null);
  }
  showHome();
});

els.configSelect.addEventListener('change', () => {
  const name = els.configSelect.value;
  if (!name) return;
  if (loadConfigByName(name)) {
    setCurrentConfig(name);
    setMessage(`Loaded "${name}".`, false);
  }
});

els.btnDelete.addEventListener('click', () => {
  const name = els.configSelect.value;
  if (!name) return setMessage('No config selected.');
  if (!confirm(`Delete config "${name}"?`)) return;
  deleteConfig(name);
  if (getLastConfigName() === name) setLastConfigName('');
  if (currentConfigName === name) currentConfigName = null;
  refreshConfigSelect();
  refreshRotationSelects();
  setMessage(`Deleted "${name}".`, false);
});

els.btnSave.addEventListener('click', () => {
  const name = els.configName.value.trim();
  if (!name) return setMessage('Enter a name to save.');
  saveConfig(name, readForm());
  setCurrentConfig(name);
  refreshConfigSelect(name);
  refreshRotationSelects();
  setMessage(`Saved "${name}".`, false);
});

els.btnSaveRotation.addEventListener('click', () => {
  const a = els.rotationA.value || null;
  const b = els.rotationB.value || null;
  if (!a && !b) return setMessage('Pick at least one rotation slot.');
  const existing = loadRotation() || {};
  saveRotation({
    a, b,
    lastDoneName: existing.lastDoneName || null,
    lastDoneDate: existing.lastDoneDate || null,
  });
  refreshRotationStatus();
  setMessage('Rotation saved.', false);
});

els.btnClearRotation.addEventListener('click', () => {
  clearRotation();
  els.rotationA.value = '';
  els.rotationB.value = '';
  refreshRotationStatus();
  setMessage('Rotation cleared.', false);
});

for (const el of [els.delaySeconds, els.intervalCount, els.intervalMinutes, els.freeMinutes]) {
  el.addEventListener('input', updateTotal);
}

// --- Session view handlers ---

els.btnPause.addEventListener('click', () => {
  Engine.pause();
  els.btnPause.classList.add('hidden');
  els.btnResume.classList.remove('hidden');
});

els.btnResume.addEventListener('click', () => {
  Engine.resume();
  els.btnResume.classList.add('hidden');
  els.btnPause.classList.remove('hidden');
});

els.btnStop.addEventListener('click', () => {
  Engine.stop();
  releaseWakeLock();
  showHome();
});

els.btnBack.addEventListener('click', () => {
  showHome();
});

// --- Bootstrap ---

(function bootstrap() {
  refreshConfigSelect();
  refreshRotationSelects();
  const configs = loadConfigs();
  const suggestion = getTodaysSuggestion();
  const last = getLastConfigName();
  const fallback = Object.keys(configs)[0] || null;
  const initial = suggestion || (last && configs[last] ? last : null) || fallback;
  setCurrentConfig(initial);
  // Pre-populate the settings form with the current config (so opening Settings shows it).
  if (initial) loadConfigByName(initial);
  else writeForm({ delaySeconds: 30, intervalCount: 4, intervalMinutes: 5, freeMinutes: 0 });

  showHome();

  initAudio().then((ok) => {
    if (!ok) setHomeMessage('Note: bell.mp3 (or bell.wav) not found next to index.html. Add it before starting.');
  });
})();
