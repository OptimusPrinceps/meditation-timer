'use strict';

// ============================================================================
// Timer UI — home, settings, and session views.
// ============================================================================

// The config currently displayed/loaded on the home screen.
let currentConfigName = null;

function readForm() {
  return {
    delaySeconds: Math.max(0, parseInt(els.delaySeconds.value, 10) || 0),
    warmupMinutes: Math.max(0, parseFloat(els.warmupMinutes.value) || 0),
    intervalCount: Math.max(1, parseInt(els.intervalCount.value, 10) || 1),
    intervalMinutes: Math.max(0.5, parseFloat(els.intervalMinutes.value) || 0.5),
    freeMinutes: Math.max(0, parseFloat(els.freeMinutes.value) || 0),
  };
}

function writeForm(config) {
  els.delaySeconds.value = config.delaySeconds;
  els.warmupMinutes.value = config.warmupMinutes || 0;
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
  const warmupMs = minutesToMs(c.warmupMinutes || 0);
  const delayMs = c.delaySeconds * 1000;
  const totalMs = delayMs + warmupMs + intervalsMs + freeMs;
  els.totalDisplay.textContent = formatMmSs(totalMs);
  const parts = [];
  if (delayMs > 0) parts.push(`Delay ${formatMmSs(delayMs)}`);
  if (warmupMs > 0) parts.push(`Warmup ${formatMmSs(warmupMs)}`);
  parts.push(`Intervals ${formatMmSs(intervalsMs)}`);
  parts.push(`Free ${formatMmSs(freeMs)}`);
  els.totalBreakdown.textContent = parts.join(' · ');
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

function populateBellsForm() {
  const t = loadBellTiming();
  els.openingGapSec.value = t.openingGapSeconds;
  els.closingGapSec.value = t.closingGapSeconds;
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

function showHome() {
  hideAllViews();
  els.tabBar.classList.remove('hidden');
  setActiveTab('timer');
  els.homeView.classList.remove('hidden');
  refreshHome();
}

function showSettings() {
  hideAllViews();
  els.tabBar.classList.remove('hidden');
  setActiveTab('timer');
  els.settingsView.classList.remove('hidden');
  // Populate the settings form with whatever is currently loaded.
  if (currentConfigName && loadConfigs()[currentConfigName]) {
    loadConfigByName(currentConfigName);
    els.configSelect.value = currentConfigName;
  }
  refreshConfigSelect(currentConfigName);
  refreshRotationSelects();
  populateBellsForm();
  setMessage('');
}

function showSession() {
  hideAllViews();
  els.tabBar.classList.add('hidden');
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
  const warmupMs = minutesToMs(config.warmupMinutes || 0);
  const delayMs = config.delaySeconds * 1000;
  els.homeTotal.textContent = formatMmSs(delayMs + warmupMs + intervalsMs + freeMs);
  const parts = [`${config.intervalCount} × ${config.intervalMinutes} min`];
  if (config.warmupMinutes > 0) parts.push(`Warmup ${config.warmupMinutes} min`);
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

  const schedule = buildSchedule(config, loadBellTiming());
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

els.btnSaveBells.addEventListener('click', () => {
  const saved = saveBellTiming({
    openingGapSeconds: parseFloat(els.openingGapSec.value),
    closingGapSeconds: parseFloat(els.closingGapSec.value),
  });
  els.openingGapSec.value = saved.openingGapSeconds;
  els.closingGapSec.value = saved.closingGapSeconds;
  els.bellsStatus.textContent = 'Saved.';
  setTimeout(() => { els.bellsStatus.textContent = ''; }, 2000);
});

for (const el of [els.delaySeconds, els.warmupMinutes, els.intervalCount, els.intervalMinutes, els.freeMinutes]) {
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
