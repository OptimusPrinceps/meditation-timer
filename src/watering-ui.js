'use strict';

// ============================================================================
// Watering UI — log/backfill, stats, history list, and gap chart for the Bonsai.
// Reuses shared helpers from charts.js and buildGapPoints from emissions-ui.js.
// ============================================================================

let currentWateringRange = '90';

function showWatering() {
  hideAllViews();
  els.tabBar.classList.remove('hidden');
  setActiveTab('watering');
  els.wateringView.classList.remove('hidden');
  els.wateringDate.value = todayLocal();
  els.wateringMessage.textContent = '';
  refreshWateringView();
}

function setWateringMessage(text, isError = true) {
  els.wateringMessage.textContent = text;
  els.wateringMessage.style.color = isError ? 'var(--danger)' : 'var(--muted)';
}

function renderWateringHistory(sorted) {
  const items = sorted.slice().reverse().map((e) => {
    const li = document.createElement('li');
    li.className = 'history-row';
    const span = document.createElement('span');
    span.textContent = e.date;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'history-del';
    btn.title = 'Delete';
    btn.textContent = '✕';
    btn.addEventListener('click', () => {
      removeWatering(e.date);
      refreshWateringView();
    });
    li.append(span, btn);
    return li;
  });
  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'history-empty';
    li.textContent = 'No entries yet.';
    els.wateringHistory.replaceChildren(li);
    return;
  }
  els.wateringHistory.replaceChildren(...items);
}

function refreshWateringView() {
  const sorted = getWateringSorted();
  const { daysSince } = emissionsDaysSince(sorted);
  const avg = averageGap(sorted);
  els.wateringDaysSince.textContent = daysSince == null ? '—' : String(daysSince);
  els.wateringAvgGap.textContent = avg == null ? '—' : `${avg.toFixed(1)} d`;

  renderWateringHistory(sorted);

  const gapPoints = buildGapPoints(sorted);
  const ranged = filterRange(gapPoints, currentWateringRange);
  if (ranged.length === 0) {
    els.wateringChart.classList.add('hidden');
    els.wateringEmpty.classList.remove('hidden');
    els.wateringEmpty.textContent = sorted.length < 2
      ? 'Log at least two entries to see gaps.'
      : 'No entries in this range.';
    return;
  }
  els.wateringEmpty.classList.add('hidden');
  els.wateringChart.classList.remove('hidden');
  renderGapChart(els.wateringChart, ranged);
}

// --- Watering view handlers ---

els.btnWateringLogToday.addEventListener('click', () => {
  const today = todayLocal();
  addWatering(today);
  setWateringMessage(`Logged ${today}.`, false);
  refreshWateringView();
});

els.btnWateringSave.addEventListener('click', () => {
  const date = els.wateringDate.value;
  if (!date) return setWateringMessage('Pick a date.');
  addWatering(date);
  setWateringMessage(`Logged ${date}.`, false);
  refreshWateringView();
});

for (const btn of els.wateringRangeBtns) {
  btn.addEventListener('click', () => {
    currentWateringRange = btn.dataset.wrange;
    for (const b of els.wateringRangeBtns) b.classList.toggle('active', b === btn);
    refreshWateringView();
  });
}
