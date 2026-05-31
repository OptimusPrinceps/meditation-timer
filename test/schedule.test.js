'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { buildSchedule } = require('../src/schedule');

const TIMING = { openingGapSeconds: 2.5, closingGapSeconds: 0.5 };
const base = {
  delaySeconds: 30,
  warmupMinutes: 0,
  intervalCount: 2,
  intervalMinutes: 5,
  freeMinutes: 0,
};

test('no kegel segments when kegelCount is 0', () => {
  const segs = buildSchedule({ ...base, kegelCount: 0, kegelSeconds: 30 }, TIMING);
  assert.strictEqual(segs.filter((s) => s.kind === 'kegel').length, 0);
});

test('no kegel segments when kegelSeconds is 0', () => {
  const segs = buildSchedule({ ...base, kegelCount: 3, kegelSeconds: 0 }, TIMING);
  assert.strictEqual(segs.filter((s) => s.kind === 'kegel').length, 0);
});

test('appends N kegel segments with correct duration', () => {
  const segs = buildSchedule({ ...base, kegelCount: 3, kegelSeconds: 20 }, TIMING);
  const kegels = segs.filter((s) => s.kind === 'kegel');
  assert.strictEqual(kegels.length, 3);
  for (const k of kegels) assert.strictEqual(k.durationMs, 20000);
});

test('each kegel ends with one bell except the last which is a closing double', () => {
  const segs = buildSchedule({ ...base, kegelCount: 3, kegelSeconds: 20 }, TIMING);
  const kegels = segs.filter((s) => s.kind === 'kegel');
  assert.strictEqual(kegels[0].bellsAfter, 1);
  assert.strictEqual(kegels[1].bellsAfter, 1);
  assert.strictEqual(kegels[2].bellsAfter, 2);
  assert.strictEqual(kegels[2].bellGapMs, 500);
  assert.strictEqual(kegels[0].bellGapMs, undefined);
});

test('kegels are appended after the free section (free keeps its closing double)', () => {
  const segs = buildSchedule(
    { ...base, freeMinutes: 5, kegelCount: 2, kegelSeconds: 15 }, TIMING);
  const free = segs.find((s) => s.kind === 'free');
  const firstKegelIdx = segs.findIndex((s) => s.kind === 'kegel');
  const freeIdx = segs.indexOf(free);
  assert.strictEqual(free.bellsAfter, 2);
  assert.ok(firstKegelIdx > freeIdx, 'kegel segments come after free');
});

test('no-free case: last interval keeps its closing double, then kegels', () => {
  const segs = buildSchedule({ ...base, kegelCount: 1, kegelSeconds: 10 }, TIMING);
  const intervals = segs.filter((s) => s.kind === 'interval');
  const lastInterval = intervals[intervals.length - 1];
  assert.strictEqual(lastInterval.bellsAfter, 2);
  const kegels = segs.filter((s) => s.kind === 'kegel');
  assert.strictEqual(kegels.length, 1);
  assert.strictEqual(kegels[0].bellsAfter, 2);
});

test('kegelPosition "start" places kegels right after the delay', () => {
  const segs = buildSchedule(
    { ...base, kegelPosition: 'start', kegelCount: 2, kegelSeconds: 15 }, TIMING);
  assert.strictEqual(segs[0].kind, 'delay');
  assert.strictEqual(segs[1].kind, 'kegel');
  assert.strictEqual(segs[2].kind, 'kegel');
  const firstKegelIdx = segs.findIndex((s) => s.kind === 'kegel');
  const firstIntervalIdx = segs.findIndex((s) => s.kind === 'interval');
  assert.ok(firstKegelIdx < firstIntervalIdx, 'kegels come before the intervals');
});

test('kegels at the start ring a single bell each (no closing double)', () => {
  const segs = buildSchedule(
    { ...base, kegelPosition: 'start', kegelCount: 2, kegelSeconds: 15 }, TIMING);
  const kegels = segs.filter((s) => s.kind === 'kegel');
  assert.strictEqual(kegels[0].bellsAfter, 1);
  assert.strictEqual(kegels[1].bellsAfter, 1);
  assert.strictEqual(kegels[1].bellGapMs, undefined);
  // The session still closes on the last interval (no free here).
  const intervals = segs.filter((s) => s.kind === 'interval');
  assert.strictEqual(intervals[intervals.length - 1].bellsAfter, 2);
});
