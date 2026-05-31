'use strict';

// ============================================================================
// Schedule builder
// ============================================================================

function minutesToMs(min) {
  return Math.round(min * 60 * 1000);
}

// Append the optional kegel section to `segments`. Each kegel ends with a single
// bell; when this is the closing section (kegels at the end of the session) the
// last kegel ends with the closing double bell instead.
function pushKegels(segments, config, closingGapMs, isClosing) {
  const kegelN = config.kegelCount || 0;
  const kegelDurMs = Math.round((config.kegelSeconds || 0) * 1000);
  if (kegelN <= 0 || kegelDurMs <= 0) return;
  for (let i = 0; i < kegelN; i++) {
    const isLast = i === kegelN - 1;
    const closes = isLast && isClosing;
    segments.push({
      kind: 'kegel',
      label: `Kegel ${i + 1} of ${kegelN}`,
      durationMs: kegelDurMs,
      bellsAfter: closes ? 2 : 1,
      ...(closes ? { bellGapMs: closingGapMs } : {}),
    });
  }
}

function buildSchedule(config, bellTiming) {
  const openingGapMs = Math.round(bellTiming.openingGapSeconds * 1000);
  const closingGapMs = Math.round(bellTiming.closingGapSeconds * 1000);

  const segments = [];
  const delaySec = config.delaySeconds;
  const warmupMs = minutesToMs(config.warmupMinutes || 0);
  const intervalDur = minutesToMs(config.intervalMinutes);
  const hasFree = config.freeMinutes > 0;
  const hasWarmup = warmupMs > 0;
  const kegelAtStart = config.kegelPosition === 'start';
  const n = config.intervalCount;

  segments.push({
    kind: 'delay',
    label: delaySec > 0 ? 'Get ready' : 'Starting',
    durationMs: delaySec * 1000,
    bellsAfter: 3,
    bellGapMs: openingGapMs,
  });

  // Kegels at the start sit right after the delay and ring a single transition
  // bell each — the session's real close still belongs to the last interval/free.
  if (kegelAtStart) pushKegels(segments, config, closingGapMs, false);

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

  // By default the kegel section is appended at the very end and closes the session.
  if (!kegelAtStart) pushKegels(segments, config, closingGapMs, true);

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
    if (seg.bellsAfter > 0) scheduleBells(seg.bellsAfter, seg.bellGapMs);
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildSchedule, totalIntervalsMs, minutesToMs };
}
