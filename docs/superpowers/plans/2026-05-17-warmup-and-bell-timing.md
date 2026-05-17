# Warmup & Bell Timing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-config warmup segment between opening delay and intervals, change session-ending bells from 3 → 2, and make opening/closing bell gaps independently configurable as a global setting.

**Architecture:** Single-file vanilla JS web app (`app.js` + `index.html` + `style.css`). Each segment in the engine's schedule will carry its own `bellGapMs`. A new global localStorage key holds bell timing prefs. Per-config schema gains `warmupMinutes`.

**Tech Stack:** Vanilla JS, no build step, no test harness. Verification is manual via the browser (`open index.html` in `meditation-timer/`).

**Spec:** `docs/superpowers/specs/2026-05-17-warmup-and-bell-timing-design.md`

---

## File map

- **Modify** `app.js` — storage helpers, schedule builder, audio, engine, form I/O, UI handlers, bootstrap
- **Modify** `index.html` — new Warmup input row, new Bells settings card
- **Modify** `style.css` — only if new elements need styling (likely none; existing `.card`/`.row` classes should cover it)

Manual verification replaces automated tests. Each task ends with browser-based verification steps and a commit.

---

### Task 1: Bell timing storage helpers + clamp

**Files:**
- Modify: `app.js` (storage section, near the top)

- [ ] **Step 1: Add storage key constant and helpers**

Add near the existing `*_KEY` constants (after line `const WEIGHTS_KEY = 'meditationTimer.weights.v1';`):

```js
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
```

- [ ] **Step 2: Verify in DevTools console**

Open `index.html` in browser, open DevTools console:

```js
loadBellTiming()
// Expected: {openingGapSeconds: 2.5, closingGapSeconds: 0.5}

saveBellTiming({openingGapSeconds: 100, closingGapSeconds: 0.01})
// Expected: {openingGapSeconds: 10, closingGapSeconds: 0.2}  (clamped)

loadBellTiming()
// Expected: {openingGapSeconds: 10, closingGapSeconds: 0.2}

// Reset for clean state:
localStorage.removeItem('meditationTimer.bellTiming.v1')
```

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "Add bell-timing storage helpers with clamped defaults"
```

---

### Task 2: Schedule builder — warmup segment, per-segment bell gap, 2 closing bells

**Files:**
- Modify: `app.js` — `buildSchedule` function

- [ ] **Step 1: Replace `buildSchedule`**

Replace the existing `buildSchedule` function (currently `function buildSchedule(config) { ... }`) with:

```js
function buildSchedule(config, bellTiming) {
  const openingGapMs = Math.round(bellTiming.openingGapSeconds * 1000);
  const closingGapMs = Math.round(bellTiming.closingGapSeconds * 1000);

  const segments = [];
  const delaySec = config.delaySeconds;
  const warmupMs = minutesToMs(config.warmupMinutes || 0);
  const intervalDur = minutesToMs(config.intervalMinutes);
  const hasFree = config.freeMinutes > 0;
  const hasWarmup = warmupMs > 0;
  const n = config.intervalCount;

  segments.push({
    kind: 'delay',
    label: delaySec > 0 ? 'Get ready' : 'Starting',
    durationMs: delaySec * 1000,
    bellsAfter: 3,
    bellGapMs: openingGapMs,
  });

  if (hasWarmup) {
    segments.push({
      kind: 'warmup',
      label: 'Warmup',
      durationMs: warmupMs,
      bellsAfter: 1,
    });
  }

  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    const endsSession = isLast && !hasFree;
    segments.push({
      kind: 'interval',
      label: `Interval ${i + 1} of ${n}`,
      durationMs: intervalDur,
      bellsAfter: endsSession ? 2 : 1,
      ...(endsSession ? { bellGapMs: closingGapMs } : {}),
    });
  }

  if (hasFree) {
    segments.push({
      kind: 'free',
      label: 'Free time',
      durationMs: minutesToMs(config.freeMinutes),
      bellsAfter: 2,
      bellGapMs: closingGapMs,
    });
  }

  return segments;
}
```

- [ ] **Step 2: Verify in DevTools console**

Reload `index.html`, then in console:

```js
buildSchedule({delaySeconds: 5, warmupMinutes: 2, intervalCount: 2, intervalMinutes: 0.5, freeMinutes: 0}, {openingGapSeconds: 2.5, closingGapSeconds: 0.5})
// Expected: array of 4 segments:
//   delay (5000ms, 3 bells, gap 2500)
//   warmup (120000ms, 1 bell, no gap)
//   interval 1 (30000ms, 1 bell, no gap)
//   interval 2 (30000ms, 2 bells, gap 500)

buildSchedule({delaySeconds: 0, warmupMinutes: 0, intervalCount: 1, intervalMinutes: 1, freeMinutes: 5}, {openingGapSeconds: 2.5, closingGapSeconds: 0.5})
// Expected: 3 segments:
//   delay 0ms label="Starting" 3 bells gap 2500
//   interval 1 (60000ms, 1 bell, no gap)
//   free (300000ms, 2 bells, gap 500)
```

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "Insert warmup segment and per-segment bell gaps in schedule"
```

---

### Task 3: Audio — `scheduleBells` accepts gap arg; engine passes per-segment gap

**Files:**
- Modify: `app.js` — `scheduleBells`, `Engine._endSegment`, remove `BELL_GAP_MS` constant

- [ ] **Step 1: Remove the old `BELL_GAP_MS` constant**

Delete the line:

```js
const BELL_GAP_MS = 2500;
```

(Currently at the top of the Audio section, around line 121.)

- [ ] **Step 2: Update `scheduleBells` to take a gap parameter**

Replace the existing `scheduleBells` with:

```js
function scheduleBells(count, gapMs) {
  const gap = Number.isFinite(gapMs) && gapMs > 0 ? gapMs : 2500;
  const ids = [];
  for (let i = 0; i < count; i++) {
    if (i === 0) {
      playBellNow();
    } else {
      ids.push(setTimeout(playBellNow, i * gap));
    }
  }
  pendingBellTimeouts.push(...ids);
  return ids;
}
```

- [ ] **Step 3: Update `Engine._endSegment` to forward the segment's gap**

Replace the existing `_endSegment` method body. Old:

```js
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
```

New:

```js
_endSegment() {
  const seg = this.schedule[this.index];
  if (seg.bellsAfter > 0) scheduleBells(seg.bellsAfter, seg.bellGapMs);
  if (this.index >= this.schedule.length - 1) {
    this._finish();
    return;
  }
  this.index += 1;
  this._beginSegment();
},
```

- [ ] **Step 4: Verify nothing else references `BELL_GAP_MS`**

Run:

```bash
grep -n "BELL_GAP_MS" app.js
```

Expected: no matches.

- [ ] **Step 5: Verify in DevTools console**

Reload `index.html`. Click the home "▶︎ Bell" button — should still play one bell. Then in console:

```js
scheduleBells(3, 500)
// Expected: three quick bells (~0.5s apart)

scheduleBells(2, 2500)
// Expected: two bells ~2.5s apart
```

- [ ] **Step 6: Commit**

```bash
git add app.js
git commit -m "Replace BELL_GAP_MS constant with per-segment gapMs argument"
```

---

### Task 4: `readForm` / `writeForm` — handle `warmupMinutes`

**Files:**
- Modify: `app.js` — `readForm`, `writeForm`, `els` table, `updateTotal` input listeners
- Modify: `index.html` — add Warmup input row

- [ ] **Step 1: Add Warmup input row to `index.html`**

In `index.html`, find the row:

```html
<div class="row">
  <label for="delay-seconds">Opening delay (sec)</label>
  <input id="delay-seconds" type="number" min="0" step="1" value="30" />
</div>
```

Immediately after it, add:

```html
<div class="row">
  <label for="warmup-minutes">Warmup (min)</label>
  <input id="warmup-minutes" type="number" min="0" step="0.5" value="0" />
</div>
```

- [ ] **Step 2: Add `warmupMinutes` to the `els` table**

In `app.js`, find the settings entries in `els` (around the `delaySeconds: $('delay-seconds'),` line) and insert after it:

```js
  warmupMinutes: $('warmup-minutes'),
```

- [ ] **Step 3: Update `readForm` to include `warmupMinutes`**

Replace:

```js
function readForm() {
  return {
    delaySeconds: Math.max(0, parseInt(els.delaySeconds.value, 10) || 0),
    intervalCount: Math.max(1, parseInt(els.intervalCount.value, 10) || 1),
    intervalMinutes: Math.max(0.5, parseFloat(els.intervalMinutes.value) || 0.5),
    freeMinutes: Math.max(0, parseFloat(els.freeMinutes.value) || 0),
  };
}
```

With:

```js
function readForm() {
  return {
    delaySeconds: Math.max(0, parseInt(els.delaySeconds.value, 10) || 0),
    warmupMinutes: Math.max(0, parseFloat(els.warmupMinutes.value) || 0),
    intervalCount: Math.max(1, parseInt(els.intervalCount.value, 10) || 1),
    intervalMinutes: Math.max(0.5, parseFloat(els.intervalMinutes.value) || 0.5),
    freeMinutes: Math.max(0, parseFloat(els.freeMinutes.value) || 0),
  };
}
```

- [ ] **Step 4: Update `writeForm` to include `warmupMinutes`**

Replace:

```js
function writeForm(config) {
  els.delaySeconds.value = config.delaySeconds;
  els.intervalCount.value = config.intervalCount;
  els.intervalMinutes.value = config.intervalMinutes;
  els.freeMinutes.value = config.freeMinutes;
  updateTotal();
}
```

With:

```js
function writeForm(config) {
  els.delaySeconds.value = config.delaySeconds;
  els.warmupMinutes.value = config.warmupMinutes || 0;
  els.intervalCount.value = config.intervalCount;
  els.intervalMinutes.value = config.intervalMinutes;
  els.freeMinutes.value = config.freeMinutes;
  updateTotal();
}
```

- [ ] **Step 5: Add `warmupMinutes` input to the live-update list**

Find:

```js
for (const el of [els.delaySeconds, els.intervalCount, els.intervalMinutes, els.freeMinutes]) {
  el.addEventListener('input', updateTotal);
}
```

Replace with:

```js
for (const el of [els.delaySeconds, els.warmupMinutes, els.intervalCount, els.intervalMinutes, els.freeMinutes]) {
  el.addEventListener('input', updateTotal);
}
```

- [ ] **Step 6: Update bootstrap default config**

Find:

```js
else writeForm({ delaySeconds: 30, intervalCount: 4, intervalMinutes: 5, freeMinutes: 0 });
```

Replace with:

```js
else writeForm({ delaySeconds: 30, warmupMinutes: 0, intervalCount: 4, intervalMinutes: 5, freeMinutes: 0 });
```

- [ ] **Step 7: Verify in browser**

Reload `index.html`. Open Settings. Confirm the "Warmup (min)" row appears below "Opening delay". Type values and confirm no console errors. Save a config with warmup 2 min, then reload it from the dropdown — value should round-trip.

- [ ] **Step 8: Commit**

```bash
git add app.js index.html
git commit -m "Add warmup-minutes input to per-config settings form"
```

---

### Task 5: Display updates — totals, breakdowns, home view

**Files:**
- Modify: `app.js` — `updateTotal`, `refreshHome`

- [ ] **Step 1: Update `updateTotal` to show warmup chip when > 0**

Replace:

```js
function updateTotal() {
  const c = readForm();
  const intervalsMs = totalIntervalsMs(c);
  const freeMs = minutesToMs(c.freeMinutes);
  const totalMs = intervalsMs + freeMs;
  els.totalDisplay.textContent = formatMmSs(totalMs);
  els.totalBreakdown.textContent =
    `Intervals ${formatMmSs(intervalsMs)} · Free ${formatMmSs(freeMs)}`;
}
```

With:

```js
function updateTotal() {
  const c = readForm();
  const intervalsMs = totalIntervalsMs(c);
  const freeMs = minutesToMs(c.freeMinutes);
  const warmupMs = minutesToMs(c.warmupMinutes || 0);
  const totalMs = intervalsMs + freeMs;
  els.totalDisplay.textContent = formatMmSs(totalMs);
  const parts = [];
  if (warmupMs > 0) parts.push(`Warmup ${formatMmSs(warmupMs)}`);
  parts.push(`Intervals ${formatMmSs(intervalsMs)}`);
  parts.push(`Free ${formatMmSs(freeMs)}`);
  els.totalBreakdown.textContent = parts.join(' · ');
}
```

- [ ] **Step 2: Update `refreshHome` breakdown to include warmup**

Find this block in `refreshHome`:

```js
const parts = [`${config.intervalCount} × ${config.intervalMinutes} min`];
if (config.freeMinutes > 0) parts.push(`Free ${config.freeMinutes} min`);
if (config.delaySeconds > 0) parts.push(`Delay ${config.delaySeconds}s`);
els.homeBreakdown.textContent = parts.join(' · ');
```

Replace with:

```js
const parts = [`${config.intervalCount} × ${config.intervalMinutes} min`];
if (config.warmupMinutes > 0) parts.push(`Warmup ${config.warmupMinutes} min`);
if (config.freeMinutes > 0) parts.push(`Free ${config.freeMinutes} min`);
if (config.delaySeconds > 0) parts.push(`Delay ${config.delaySeconds}s`);
els.homeBreakdown.textContent = parts.join(' · ');
```

- [ ] **Step 3: Verify in browser**

Reload `index.html`. In Settings: set warmup = 2, intervals = 4 × 5 min, free = 0. Total breakdown row should read `Warmup 2:00 · Intervals 20:00 · Free 0:00`. Big number stays `20:00`.

Set warmup = 0 → breakdown reverts to `Intervals 20:00 · Free 0:00`.

Save the config, go to home, confirm home breakdown includes `Warmup 2 min` when > 0 and omits it when 0.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "Show warmup in settings total and home breakdown when > 0"
```

---

### Task 6: Bells settings card — HTML, handlers, persistence

**Files:**
- Modify: `index.html` — add Bells card at end of settings view
- Modify: `app.js` — els entries, input/save handler, initial population

- [ ] **Step 1: Add the Bells card to `index.html`**

In `index.html`, find the `<section class="card total">` block (it contains `total-display`). Immediately AFTER its closing `</section>`, add:

```html
    <section class="card">
      <div class="row">
        <label for="opening-gap-sec">Opening bell gap (sec)</label>
        <input id="opening-gap-sec" type="number" min="0.2" max="10" step="0.1" value="2.5" />
      </div>
      <div class="row">
        <label for="closing-gap-sec">Closing bell gap (sec)</label>
        <input id="closing-gap-sec" type="number" min="0.2" max="10" step="0.1" value="0.5" />
      </div>
      <div class="row">
        <button id="btn-save-bells" type="button">Save bells</button>
        <span id="bells-status" class="rotation-status"></span>
      </div>
    </section>
```

(Reusing the existing `.rotation-status` class for the status span — it already has muted styling.)

- [ ] **Step 2: Add els entries**

In `app.js`, in the settings entries of `els` (after `btnSave: $('btn-save'),` is a good spot), add:

```js
  openingGapSec: $('opening-gap-sec'),
  closingGapSec: $('closing-gap-sec'),
  btnSaveBells: $('btn-save-bells'),
  bellsStatus: $('bells-status'),
```

- [ ] **Step 3: Add a helper to populate the bells inputs**

Add this function near `refreshConfigSelect` (anywhere in the UI controller section):

```js
function populateBellsForm() {
  const t = loadBellTiming();
  els.openingGapSec.value = t.openingGapSeconds;
  els.closingGapSec.value = t.closingGapSeconds;
}
```

- [ ] **Step 4: Wire the save handler**

Add near the other settings handlers (e.g. after `els.btnClearRotation.addEventListener(...)`):

```js
els.btnSaveBells.addEventListener('click', () => {
  const saved = saveBellTiming({
    openingGapSeconds: parseFloat(els.openingGapSec.value),
    closingGapSeconds: parseFloat(els.closingGapSec.value),
  });
  // Reflect any clamping back in the inputs.
  els.openingGapSec.value = saved.openingGapSeconds;
  els.closingGapSec.value = saved.closingGapSeconds;
  els.bellsStatus.textContent = 'Saved.';
  setTimeout(() => { els.bellsStatus.textContent = ''; }, 2000);
});
```

- [ ] **Step 5: Populate the form on settings open and at bootstrap**

In `showSettings`, add a call to `populateBellsForm()` (after `refreshRotationSelects()`):

```js
function showSettings() {
  hideAllViews();
  els.tabBar.classList.remove('hidden');
  setActiveTab('timer');
  els.settingsView.classList.remove('hidden');
  if (currentConfigName && loadConfigs()[currentConfigName]) {
    loadConfigByName(currentConfigName);
    els.configSelect.value = currentConfigName;
  }
  refreshConfigSelect(currentConfigName);
  refreshRotationSelects();
  populateBellsForm();
  setMessage('');
}
```

- [ ] **Step 6: Verify in browser**

Reload `index.html`. Open Settings. Bells card should appear at the bottom showing 2.5 / 0.5. Change values to 1.5 / 0.3, click "Save bells", see "Saved." flash. Close settings and reopen — values should persist. Try a value of 100 → save → input should snap back to 10. Try 0.01 → save → snaps to 0.2.

- [ ] **Step 7: Commit**

```bash
git add app.js index.html
git commit -m "Add Bells settings card for opening/closing gap configuration"
```

---

### Task 7: Wire bell timing into `startSession`

**Files:**
- Modify: `app.js` — `startSession`

- [ ] **Step 1: Pass bell timing to `buildSchedule`**

Replace:

```js
const schedule = buildSchedule(config);
```

(inside `startSession`) with:

```js
const schedule = buildSchedule(config, loadBellTiming());
```

- [ ] **Step 2: Verify end-to-end in browser**

Reload `index.html`. Set up a short test config:
- Name: "Test"
- Opening delay: 5 sec
- Warmup: 0.5 min (30 sec — easier than 2 min for quick verification)
- Number of intervals: 2
- Interval length: 0.5 min
- Free section: 0

In Bells card: opening 2.5s, closing 0.5s. Save bells. Save config. Start session.

Expected timeline:
1. "Get ready" 5s countdown → **3 bells with ~2.5s gap**
2. "Warmup" 30s countdown → **1 bell**
3. "Interval 1 of 2" 30s countdown → **1 bell**
4. "Interval 2 of 2" 30s countdown → **2 bells with ~0.5s gap**
5. "Done"

Now test "Free time" path: edit config so Free = 0.5 min, save, start session. After interval 2 expect **1 bell** (not 2), then "Free time" 30s → **2 bells with 0.5s gap**.

Now test warmup=0: edit config Warmup back to 0, save, start. Expect no Warmup segment at all — straight to Interval 1 after the 3 opening bells.

Now test bell-timing change: change closing gap to 2.0s in Bells card, save, restart session. Confirm closing bells now ~2s apart.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "Apply configured bell timing when starting a session"
```

---

## Self-review

Spec coverage check:
- ✅ Warmup segment between delay and intervals → Task 2
- ✅ `warmupMinutes` per-config field, default 0, step 0.5 → Tasks 4, 5
- ✅ 3 → 2 closing bells → Task 2
- ✅ Global `meditationTimer.bellTiming.v1` key → Task 1
- ✅ Defaults 2.5 / 0.5, clamped [0.2, 10] → Task 1
- ✅ `scheduleBells(count, gapMs)` signature → Task 3
- ✅ Per-segment `bellGapMs` in schedule → Task 2
- ✅ Bells settings card → Task 6
- ✅ Warmup row in per-config card → Task 4
- ✅ Home breakdown shows warmup → Task 5
- ✅ Settings total shows warmup → Task 5
- ✅ Session view label "Warmup" → comes for free from `seg.label` (Task 2)
- ✅ Old configs without `warmupMinutes` default to 0 → Tasks 2 (`config.warmupMinutes || 0`), 4 (writeForm fallback), 5 (refreshHome guarded)
- ✅ End-to-end manual verification → Task 7

Type consistency:
- `loadBellTiming()` returns `{openingGapSeconds, closingGapSeconds}` — used consistently in Tasks 1, 6, 7.
- `scheduleBells(count, gapMs)` — Task 3 defines, Task 3 calls from Engine.
- `buildSchedule(config, bellTiming)` — Task 2 defines, Task 7 calls.
