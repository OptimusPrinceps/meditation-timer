'use strict';

// ============================================================================
// Watering UI — dashboard of plants + per-plant detail (log, stats, gap chart,
// history) and add/rename/delete. Reuses shared helpers from charts.js and
// buildGapPoints from emissions-ui.js.
// ============================================================================

const PLANT_EMOJIS = ['🌳', '🌵', '🌿', '🪴', '🌱', '🌴', '🌸', '🍀'];

let currentPlantId = null;
let currentWateringRange = '90';
let formMode = 'add';           // 'add' | 'rename'
let selectedEmoji = PLANT_EMOJIS[0];

// --- View switching within the tab ---

function showWatering() {
  hideAllViews();
  els.tabBar.classList.remove('hidden');
  setActiveTab('watering');
  els.wateringView.classList.remove('hidden');
  showDashboard();
}

function showDashboard() {
  els.wateringDetail.classList.add('hidden');
  els.wateringDashboard.classList.remove('hidden');
  hidePlantForm();
  renderDashboard();
}

function openDetail(id) {
  currentPlantId = id;
  hidePlantForm();
  els.wateringDashboard.classList.add('hidden');
  els.wateringDetail.classList.remove('hidden');
  els.wateringDate.value = todayLocal();
  els.wateringMessage.textContent = '';
  refreshDetail();
}

// --- Dashboard ---

function renderDashboard() {
  const plants = loadPlants();
  if (plants.length === 0) {
    const li = document.createElement('li');
    li.className = 'history-empty';
    li.textContent = 'No plants yet — add one.';
    els.plantList.replaceChildren(li);
    return;
  }
  const rows = plants.map((p) => {
    const { daysSince } = emissionsDaysSince(getPlantLogSorted(p.id));
    const li = document.createElement('li');
    li.className = 'history-row';

    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'link-button plant-label';
    label.textContent = `${p.emoji} ${p.name}`;
    label.addEventListener('click', () => openDetail(p.id));

    const days = document.createElement('span');
    days.className = 'plant-days';
    days.textContent = daysSince == null ? '—' : `${daysSince}d`;

    const water = document.createElement('button');
    water.type = 'button';
    water.textContent = 'Water';
    water.addEventListener('click', () => {
      addWatering(p.id, todayLocal());
      renderDashboard();
    });

    li.append(label, days, water);
    return li;
  });
  els.plantList.replaceChildren(...rows);
}

// --- Add / rename form ---

function renderEmojiPalette() {
  const btns = PLANT_EMOJIS.map((e) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'range-btn' + (e === selectedEmoji ? ' active' : '');
    b.textContent = e;
    b.addEventListener('click', () => {
      selectedEmoji = e;
      renderEmojiPalette();
    });
    return b;
  });
  els.emojiPalette.replaceChildren(...btns);
}

function openPlantForm(mode, plant) {
  formMode = mode;
  selectedEmoji = plant ? plant.emoji : PLANT_EMOJIS[0];
  els.plantName.value = plant ? plant.name : '';
  els.plantFormMessage.textContent = '';
  renderEmojiPalette();
  els.plantForm.classList.remove('hidden');
}

function hidePlantForm() {
  els.plantForm.classList.add('hidden');
}

els.btnAddPlant.addEventListener('click', () => openPlantForm('add', null));
els.btnPlantCancel.addEventListener('click', hidePlantForm);

els.btnPlantSave.addEventListener('click', () => {
  const name = els.plantName.value.trim();
  if (!name) {
    els.plantFormMessage.textContent = 'Name the plant.';
    els.plantFormMessage.style.color = 'var(--danger)';
    return;
  }
  if (formMode === 'add') {
    addPlant(name, selectedEmoji);
    hidePlantForm();
    renderDashboard();
  } else {
    updatePlant(currentPlantId, name, selectedEmoji);
    hidePlantForm();
    refreshDetail();
  }
});

// --- Detail ---

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
      removeWatering(currentPlantId, e.date);
      refreshDetail();
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

function refreshDetail() {
  const plant = getPlant(currentPlantId);
  if (!plant) return showDashboard();
  els.wateringTitle.textContent = `${plant.emoji} ${plant.name}`;

  const sorted = getPlantLogSorted(currentPlantId);
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

els.btnWateringBack.addEventListener('click', showDashboard);
els.btnPlantRename.addEventListener('click', () => openPlantForm('rename', getPlant(currentPlantId)));
els.btnPlantDelete.addEventListener('click', () => {
  const plant = getPlant(currentPlantId);
  if (!plant) return;
  if (!confirm(`Delete ${plant.name} and its history?`)) return;
  deletePlant(currentPlantId);
  currentPlantId = null;
  showDashboard();
});

els.btnWateringLogToday.addEventListener('click', () => {
  const today = todayLocal();
  addWatering(currentPlantId, today);
  setWateringMessage(`Logged ${today}.`, false);
  refreshDetail();
});

els.btnWateringSave.addEventListener('click', () => {
  const date = els.wateringDate.value;
  if (!date) return setWateringMessage('Pick a date.');
  addWatering(currentPlantId, date);
  setWateringMessage(`Logged ${date}.`, false);
  refreshDetail();
});

for (const btn of els.wateringRangeBtns) {
  btn.addEventListener('click', () => {
    currentWateringRange = btn.dataset.wrange;
    for (const b of els.wateringRangeBtns) b.classList.toggle('active', b === btn);
    refreshDetail();
  });
}
