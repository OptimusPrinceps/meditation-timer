'use strict';

// ============================================================================
// Calisthenics (Training) UI — session logging against the active block's
// catalog, per-exercise progression charts (spanning blocks, with block-change
// markers), session history, and the weekly coach. Mirrors weight-ui.js.
// ============================================================================

let currentCaliRange = '90';
let currentCaliExercise = null;

// First visit: copy the default v2 block into the store, stamped with today.
function ensureProgrammeSeeded() {
  if (!getActiveProgramme()) {
    const prog = buildDefaultProgramme();
    prog.startedAt = todayLocal();
    setActiveProgramme(prog);
  }
}

function showCalisthenics() {
  ensureProgrammeSeeded();
  hideAllViews();
  els.tabBar.classList.remove('hidden');
  setActiveTab('calisthenics');
  els.calisthenicsView.classList.remove('hidden');
  els.caliDate.value = todayLocal();
  els.caliMessage.textContent = '';
  els.caliCoachStatus.textContent = '';
  populateSessionPicker();
  renderBlockHeader();
  renderSessionForm(els.caliSession.value);
  renderCaliCoachReport();
  refreshProgression();
  renderCaliHistory();
}

function setCaliMessage(text, isError = true) {
  els.caliMessage.textContent = text;
  els.caliMessage.style.color = isError ? 'var(--danger)' : 'var(--muted)';
}

function sessionLabel(key) {
  const prog = getActiveProgramme();
  const s = prog && prog.sessions.find((x) => x.key === key);
  return s ? `${s.key} · ${s.name}` : key;
}

function renderBlockHeader() {
  const prog = getActiveProgramme();
  els.caliBlockName.textContent = prog ? prog.name : '—';
  if (prog && prog.startedAt) {
    const weeks = Math.floor(daysBetween(prog.startedAt, todayLocal()) / 7);
    els.caliBlockWeeks.textContent = String(Math.max(0, weeks));
  } else {
    els.caliBlockWeeks.textContent = '—';
  }
  const next = getNextCalisthenicsSession();
  els.caliNextUp.textContent = next ? `Next up: ${sessionLabel(next)}` : '';
}

function populateSessionPicker() {
  const prog = getActiveProgramme();
  const sessions = prog ? prog.sessions : [];
  const next = getNextCalisthenicsSession();
  els.caliSession.replaceChildren(...sessions.map((s) => {
    const opt = document.createElement('option');
    opt.value = s.key;
    opt.textContent = `${s.key} · ${s.name}`;
    return opt;
  }));
  if (next) els.caliSession.value = next;
}

function renderSessionForm(sessionKey) {
  const prog = getActiveProgramme();
  const session = prog && prog.sessions.find((s) => s.key === sessionKey);
  if (!session) { els.caliExercises.replaceChildren(); return; }
  const rows = session.items.map((item) => {
    const meta = getExerciseMeta(item.ex);
    const row = document.createElement('div');
    row.className = 'cali-row';

    const label = document.createElement('span');
    label.className = 'cali-ex-label';
    label.textContent = meta.name;

    const target = document.createElement('span');
    target.className = 'cali-ex-target';
    target.textContent = item.target;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '1';
    input.dataset.ex = item.ex;
    input.placeholder = meta.metric === 'seconds' ? 'sec' : 'reps';

    const unit = document.createElement('span');
    unit.className = 'cali-ex-unit';
    unit.textContent = meta.metric === 'seconds' ? 's' : '';

    row.append(label, target, input, unit);
    return row;
  });
  els.caliExercises.replaceChildren(...rows);
}

// "Pull-ups 8, Adv. tuck front lever hold 12s" — compact per-session line.
function summarizeResults(results) {
  return Object.entries(results || {})
    .map(([k, v]) => {
      const meta = getExerciseMeta(k);
      return `${meta.name} ${v}${meta.metric === 'seconds' ? 's' : ''}`;
    })
    .join(', ');
}

function renderCaliHistory() {
  const sorted = getCalisthenicsSessions().slice().reverse();
  if (sorted.length === 0) {
    const li = document.createElement('li');
    li.className = 'history-empty';
    li.textContent = 'No sessions yet.';
    els.caliHistory.replaceChildren(li);
    return;
  }
  const items = sorted.map((s) => {
    const li = document.createElement('li');
    li.className = 'history-row';
    const span = document.createElement('span');
    span.textContent = `${s.date} · ${s.session} · ${summarizeResults(s.results)}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'history-del';
    btn.title = 'Delete';
    btn.textContent = '✕';
    btn.addEventListener('click', () => {
      removeCalisthenicsSession(s.id);
      renderBlockHeader();
      populateSessionPicker();
      renderSessionForm(els.caliSession.value);
      refreshProgression();
      renderCaliHistory();
    });
    li.append(span, btn);
    return li;
  });
  els.caliHistory.replaceChildren(...items);
}

// --- Progression chart ---

function populateExercisePick() {
  const keys = [];
  const seen = new Set();
  for (const s of getCalisthenicsSessions()) {
    for (const k of Object.keys(s.results || {})) {
      if (!seen.has(k)) { seen.add(k); keys.push(k); }
    }
  }
  els.caliExercisePick.replaceChildren(...keys.map((k) => {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = getExerciseMeta(k).name;
    return opt;
  }));
  if (!(currentCaliExercise && keys.includes(currentCaliExercise))) {
    currentCaliExercise = keys[0] || null;
  }
  if (currentCaliExercise) els.caliExercisePick.value = currentCaliExercise;
  return keys;
}

function renderProgressionChart() {
  if (!currentCaliExercise) {
    els.caliChart.classList.add('hidden');
    els.caliEmpty.classList.remove('hidden');
    els.caliEmpty.textContent = 'Log sessions to see progression.';
    return;
  }
  const all = getExerciseHistory(currentCaliExercise);
  const entries = filterRange(all, currentCaliRange);
  if (entries.length === 0) {
    els.caliChart.classList.add('hidden');
    els.caliEmpty.classList.remove('hidden');
    els.caliEmpty.textContent = all.length === 0
      ? 'Log sessions to see progression.'
      : 'No entries in this range.';
    return;
  }
  els.caliEmpty.classList.add('hidden');
  els.caliChart.classList.remove('hidden');
  renderWeightChart(els.caliChart, entries, linearRegression(entries), getBlockBoundaryDates());
}

function refreshProgression() {
  populateExercisePick();
  renderProgressionChart();
}

// --- Coach (mirror weight) ---

function renderCaliCoachReport(report) {
  const r = report || getCoachReport('calisthenics');
  while (els.caliCoachActions.firstChild) els.caliCoachActions.removeChild(els.caliCoachActions.firstChild);
  if (!r) {
    els.caliCoachGenerated.textContent = '';
    els.caliCoachRead.textContent = 'No weekly read yet — log at least two sessions, then Refresh.';
    return;
  }
  const when = r.generatedAt ? new Date(r.generatedAt) : null;
  els.caliCoachGenerated.textContent = when && !isNaN(when) ? `Generated ${when.toLocaleDateString()}` : '';
  els.caliCoachRead.textContent = r.read || '';
  for (const action of r.actions || []) {
    const li = document.createElement('li');
    li.textContent = action;
    els.caliCoachActions.appendChild(li);
  }
}

// --- Handlers ---

els.caliSession.addEventListener('change', () => renderSessionForm(els.caliSession.value));

els.btnCaliSave.addEventListener('click', () => {
  const date = els.caliDate.value;
  if (!date) return setCaliMessage('Pick a date.');
  const sessionKey = els.caliSession.value;
  const results = {};
  for (const inp of els.caliExercises.querySelectorAll('input[data-ex]')) {
    const v = parseFloat(inp.value);
    if (Number.isFinite(v) && v > 0) results[inp.dataset.ex] = Math.round(v);
  }
  if (Object.keys(results).length === 0) return setCaliMessage('Enter at least one result.');
  addCalisthenicsSession(date, sessionKey, results, els.caliNotes.value.trim());
  els.caliNotes.value = '';
  els.caliDate.value = todayLocal();
  setCaliMessage(`Saved Session ${sessionKey} for ${date}.`, false);
  renderBlockHeader();
  populateSessionPicker();
  renderSessionForm(els.caliSession.value);
  refreshProgression();
  renderCaliHistory();
});

els.caliExercisePick.addEventListener('change', () => {
  currentCaliExercise = els.caliExercisePick.value;
  renderProgressionChart();
});

for (const btn of els.caliRangeBtns) {
  btn.addEventListener('click', () => {
    currentCaliRange = btn.dataset.crange;
    for (const b of els.caliRangeBtns) b.classList.toggle('active', b === btn);
    renderProgressionChart();
  });
}

els.btnCaliCoachRefresh.addEventListener('click', async () => {
  els.caliCoachStatus.textContent = 'Thinking…';
  els.btnCaliCoachRefresh.disabled = true;
  try {
    const report = await askCoach('calisthenics');
    renderCaliCoachReport(report);
    els.caliCoachStatus.textContent = '';
  } catch (e) {
    els.caliCoachStatus.textContent = `Couldn't refresh: ${e.message}`;
  } finally {
    els.btnCaliCoachRefresh.disabled = false;
  }
});
