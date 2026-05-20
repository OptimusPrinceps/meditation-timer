'use strict';

// ============================================================================
// Emissions UI — log/backfill, stats, history list, and gap chart.
// ============================================================================

let currentEmissionRange = '90';

function showEmissions() {
  hideAllViews();
  els.tabBar.classList.remove('hidden');
  setActiveTab('emissions');
  els.emissionsView.classList.remove('hidden');
  els.emissionDate.value = todayLocal();
  els.emissionMessage.textContent = '';
  refreshEmissionsView();
}

function setEmissionMessage(text, isError = true) {
  els.emissionMessage.textContent = text;
  els.emissionMessage.style.color = isError ? 'var(--danger)' : 'var(--muted)';
}

// Consecutive pairs -> [{date: laterDateStr, gap: days}].
function buildGapPoints(sorted) {
  const points = [];
  for (let i = 1; i < sorted.length; i++) {
    points.push({ date: sorted[i].date, gap: daysBetween(sorted[i - 1].date, sorted[i].date) });
  }
  return points;
}

function renderEmissionHistory(sorted) {
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
      removeEmission(e.date);
      refreshEmissionsView();
    });
    li.append(span, btn);
    return li;
  });
  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'history-empty';
    li.textContent = 'No entries yet.';
    els.emissionHistory.replaceChildren(li);
    return;
  }
  els.emissionHistory.replaceChildren(...items);
}

function refreshEmissionsView() {
  const sorted = getEmissionsSorted();
  const { daysSince } = emissionsDaysSince(sorted);
  const avg = averageGap(sorted);
  els.emissionDaysSince.textContent = daysSince == null ? '—' : String(daysSince);
  els.emissionAvgGap.textContent = avg == null ? '—' : `${avg.toFixed(1)} d`;

  renderEmissionHistory(sorted);

  const gapPoints = buildGapPoints(sorted);
  const ranged = filterRange(gapPoints, currentEmissionRange);
  if (ranged.length === 0) {
    els.emissionChart.classList.add('hidden');
    els.emissionEmpty.classList.remove('hidden');
    els.emissionEmpty.textContent = sorted.length < 2
      ? 'Log at least two entries to see gaps.'
      : 'No entries in this range.';
    return;
  }
  els.emissionEmpty.classList.add('hidden');
  els.emissionChart.classList.remove('hidden');
  renderGapChart(els.emissionChart, ranged);
}

// --- Emissions view handlers ---

els.btnEmissionLogToday.addEventListener('click', () => {
  const today = todayLocal();
  addEmission(today);
  setEmissionMessage(`Logged ${today}.`, false);
  refreshEmissionsView();
});

els.btnEmissionSave.addEventListener('click', () => {
  const date = els.emissionDate.value;
  if (!date) return setEmissionMessage('Pick a date.');
  addEmission(date);
  setEmissionMessage(`Logged ${date}.`, false);
  refreshEmissionsView();
});

for (const btn of els.emissionRangeBtns) {
  btn.addEventListener('click', () => {
    currentEmissionRange = btn.dataset.erange;
    for (const b of els.emissionRangeBtns) b.classList.toggle('active', b === btn);
    refreshEmissionsView();
  });
}
