'use strict';

// ============================================================================
// Main — tab-bar wiring and bootstrap. Loaded last so everything it calls
// is already defined.
// ============================================================================

// --- Tab bar handlers ---

els.btnTabTimer.addEventListener('click', () => {
  if (!els.sessionView.classList.contains('hidden')) return;
  showHome();
});

els.btnTabWeight.addEventListener('click', () => {
  if (!els.sessionView.classList.contains('hidden')) return;
  showWeight();
});

els.btnTabEmissions.addEventListener('click', () => {
  if (!els.sessionView.classList.contains('hidden')) return;
  showEmissions();
});

els.btnTabWatering.addEventListener('click', () => {
  if (!els.sessionView.classList.contains('hidden')) return;
  showWatering();
});

// --- Bootstrap ---

(async function bootstrap() {
  await fetchStore();
  refreshConfigSelect();
  refreshRotationSelects();
  const configs = loadConfigs();
  const suggestion = getTodaysSuggestion();
  const last = getLastConfigName();
  const fallback = Object.keys(configs)[0] || null;
  const initial = suggestion || (last && configs[last] ? last : null) || fallback;
  setCurrentConfig(initial);
  if (initial) loadConfigByName(initial);
  else writeForm({ delaySeconds: 30, warmupMinutes: 0, intervalCount: 4, intervalMinutes: 5, freeMinutes: 0 });

  showHome();

  initAudio().then((ok) => {
    if (!ok) setHomeMessage('Note: bell.mp3 (or bell.wav) not found next to index.html. Add it before starting.');
  });
})();
