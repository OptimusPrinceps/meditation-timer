'use strict';

// ============================================================================
// Weight UI — logging, stats, range filter, and chart.
// ============================================================================

let currentRange = '90';

function showWeight() {
  hideAllViews();
  els.tabBar.classList.remove('hidden');
  setActiveTab('weight');
  els.weightView.classList.remove('hidden');
  els.weightDate.value = todayLocal();
  els.weightMessage.textContent = '';
  populateGoalForm();
  els.coachStatus.textContent = '';
  renderCoachReport();
  refreshWeightView();
}

function setWeightMessage(text, isError = true) {
  els.weightMessage.textContent = text;
  els.weightMessage.style.color = isError ? 'var(--danger)' : 'var(--muted)';
}

function populateGoalForm() {
  const goal = getWeightGoal();
  els.goalKg.value = goal && goal.targetKg ? goal.targetKg : '';
  els.goalDate.value = goal && goal.targetDate ? goal.targetDate : '';
  els.goalStatus.textContent = goal ? '' : 'No goal set';
}

function renderCoachReport(report) {
  const r = report || getCoachReport('weight');
  while (els.coachActions.firstChild) els.coachActions.removeChild(els.coachActions.firstChild);
  if (!r) {
    els.coachGenerated.textContent = '';
    els.coachRead.textContent = 'No weekly read yet — log at least two weights, then Refresh.';
    return;
  }
  const when = r.generatedAt ? new Date(r.generatedAt) : null;
  els.coachGenerated.textContent = when && !isNaN(when) ? `Generated ${when.toLocaleDateString()}` : '';
  els.coachRead.textContent = r.read || '';
  for (const action of r.actions || []) {
    const li = document.createElement('li');
    li.textContent = action;
    els.coachActions.appendChild(li);
  }
}

function refreshWeightView() {
  const all = getWeightsSorted();
  const entries = filterRange(all, currentRange);
  const regression = linearRegression(entries);
  const recent = linearRegression(filterRange(all, '7'));
  els.weightCount.textContent = String(entries.length);
  els.weightWeekly.textContent = formatWeeklyChange(regression ? regression.slope : null);
  els.weightWeeklyRecent.textContent = formatWeeklyChange(recent ? recent.slope : null);

  if (entries.length === 0) {
    els.weightChart.classList.add('hidden');
    els.weightEmpty.classList.remove('hidden');
    els.weightEmpty.textContent = all.length === 0
      ? 'Log a weight to see your chart.'
      : 'No entries in this range.';
    return;
  }
  els.weightEmpty.classList.add('hidden');
  els.weightChart.classList.remove('hidden');
  renderWeightChart(els.weightChart, entries, regression);
}

// --- Weight view handlers ---

els.btnWeightSave.addEventListener('click', () => {
  const date = els.weightDate.value;
  const kg = parseFloat(els.weightKg.value);
  if (!date) return setWeightMessage('Pick a date.');
  if (!Number.isFinite(kg) || kg <= 0) return setWeightMessage('Enter a weight in kg.');
  upsertWeight(date, Math.round(kg * 10) / 10);
  els.weightKg.value = '';
  els.weightDate.value = todayLocal();
  setWeightMessage(`Saved ${kg.toFixed(1)} kg for ${date}.`, false);
  refreshWeightView();
});

els.weightKg.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') els.btnWeightSave.click();
});

els.btnWeightExport.addEventListener('click', () => {
  const map = loadWeights();
  const json = JSON.stringify(map, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `meditation-weights-${todayLocal()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  const count = Object.keys(map).length;
  setWeightMessage(`Exported ${count} ${count === 1 ? 'entry' : 'entries'}.`, false);
});

for (const btn of els.rangeBtns) {
  btn.addEventListener('click', () => {
    currentRange = btn.dataset.range;
    for (const b of els.rangeBtns) b.classList.toggle('active', b === btn);
    refreshWeightView();
  });
}

els.btnGoalSave.addEventListener('click', () => {
  const targetKg = parseFloat(els.goalKg.value);
  const targetDate = els.goalDate.value;
  if (!Number.isFinite(targetKg) || targetKg <= 0) {
    els.goalStatus.textContent = 'Enter a goal weight.';
    return;
  }
  setWeightGoal({ targetKg: Math.round(targetKg * 10) / 10, targetDate: targetDate || null });
  els.goalStatus.textContent = 'Goal saved.';
});

els.btnCoachRefresh.addEventListener('click', async () => {
  els.coachStatus.textContent = 'Thinking…';
  els.btnCoachRefresh.disabled = true;
  try {
    const report = await askCoach('weight');
    renderCoachReport(report);
    els.coachStatus.textContent = '';
  } catch (e) {
    els.coachStatus.textContent = `Couldn't refresh: ${e.message}`;
  } finally {
    els.btnCoachRefresh.disabled = false;
  }
});
