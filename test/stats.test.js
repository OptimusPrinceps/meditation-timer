'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { computeWeightStats, computeCalisthenicsStats } = require('../server/stats');

test('empty weights -> nulls and zero count', () => {
  const s = computeWeightStats({});
  assert.strictEqual(s.currentKg, null);
  assert.strictEqual(s.trendKgPerWeek, null);
  assert.strictEqual(s.entryCount, 0);
});

test('steady ~0.7 kg/week loss yields negative weekly trend', () => {
  const s = computeWeightStats({
    '2026-05-01': 84.0,
    '2026-05-08': 83.3,
    '2026-05-15': 82.6,
  });
  assert.strictEqual(s.currentKg, 82.6);
  assert.strictEqual(s.entryCount, 3);
  assert.ok(s.trendKgPerWeek < -0.6 && s.trendKgPerWeek > -0.8, `trend was ${s.trendKgPerWeek}`);
});

test('single entry -> current set, trend null', () => {
  const s = computeWeightStats({ '2026-05-15': 82.6 });
  assert.strictEqual(s.currentKg, 82.6);
  assert.strictEqual(s.trendKgPerWeek, null);
});

// --- Calisthenics stats ---

const PROG = {
  id: 'v2',
  startedAt: '2026-05-01',
  exercises: {
    pull_ups: { name: 'Pull-ups', metric: 'reps' },
    front_lever_hold: { name: 'Front lever hold', metric: 'seconds' },
  },
};

test('calisthenics: empty sessions -> no exercises, zero counts', () => {
  const s = computeCalisthenicsStats([], PROG);
  assert.deepStrictEqual(s.exercises, {});
  assert.strictEqual(s.blockSessionCount, 0);
  assert.strictEqual(s.totalSessionCount, 0);
});

test('calisthenics: single session -> latest=best, no stall, trend null', () => {
  const s = computeCalisthenicsStats(
    [{ date: '2026-05-02', programmeId: 'v2', session: 'B', results: { pull_ups: 6 } }],
    PROG,
  );
  const ex = s.exercises.pull_ups;
  assert.strictEqual(ex.latest, 6);
  assert.strictEqual(ex.best, 6);
  assert.strictEqual(ex.entryCount, 1);
  assert.strictEqual(ex.trendPerWeek, null);
  assert.strictEqual(ex.sessionsSinceImprovement, 0);
});

test('calisthenics: same movement across sessions aggregates into one series with positive trend', () => {
  const s = computeCalisthenicsStats([
    { date: '2026-05-02', programmeId: 'v2', session: 'A', results: { pull_ups: 6 } },
    { date: '2026-05-09', programmeId: 'v2', session: 'B', results: { pull_ups: 7 } },
    { date: '2026-05-16', programmeId: 'v2', session: 'C', results: { pull_ups: 8 } },
  ], PROG);
  const ex = s.exercises.pull_ups;
  assert.strictEqual(ex.entryCount, 3);
  assert.strictEqual(ex.latest, 8);
  assert.strictEqual(ex.best, 8);
  assert.ok(ex.trendPerWeek > 0.9 && ex.trendPerWeek < 1.1, `trend was ${ex.trendPerWeek}`);
  assert.strictEqual(ex.sessionsSinceImprovement, 0);
});

test('calisthenics: stall -> sessionsSinceImprovement counts trailing non-PR sessions', () => {
  const s = computeCalisthenicsStats([
    { date: '2026-05-02', programmeId: 'v2', session: 'B', results: { pull_ups: 8 } },
    { date: '2026-05-09', programmeId: 'v2', session: 'B', results: { pull_ups: 8 } },
    { date: '2026-05-16', programmeId: 'v2', session: 'B', results: { pull_ups: 7 } },
  ], PROG);
  assert.strictEqual(s.exercises.pull_ups.sessionsSinceImprovement, 2);
});

test('calisthenics: only current-block sessions count; weeksOnBlock from startedAt', () => {
  const sessions = [
    { date: '2026-04-01', programmeId: 'v1', session: 'A', results: { pull_ups: 4 } },
    { date: '2026-05-02', programmeId: 'v2', session: 'B', results: { pull_ups: 8 } },
    { date: '2026-05-09', programmeId: 'v2', session: 'B', results: { pull_ups: 9 } },
  ];
  const s = computeCalisthenicsStats(sessions, PROG);
  assert.strictEqual(s.totalSessionCount, 3);
  assert.strictEqual(s.blockSessionCount, 2);          // v1 session excluded
  assert.strictEqual(s.exercises.pull_ups.entryCount, 2);
  assert.ok(s.weeksOnBlock >= 0);
});
