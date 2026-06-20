'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { computeEMA, emaWeeklyDelta, WEIGHT_EMA_ALPHA } = require('../src/charts');

const isoDate = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

test('computeEMA: empty input -> []', () => {
  assert.deepStrictEqual(computeEMA([], 0.15), []);
});

test('computeEMA: first point equals first raw value', () => {
  const out = computeEMA([{ date: '2026-05-01', kg: 80 }], 0.15);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].kg, 80);
  assert.strictEqual(out[0].ms, new Date(2026, 4, 1).getTime());
});

test('computeEMA: constant series stays at the constant', () => {
  const entries = ['2026-05-01', '2026-05-02', '2026-05-03'].map((d) => ({ date: d, kg: 82 }));
  for (const p of computeEMA(entries, 0.15)) assert.ok(Math.abs(p.kg - 82) < 1e-9);
});

test('computeEMA: smooths a step (lags below the raw jump)', () => {
  const entries = [
    { date: '2026-05-01', kg: 80 },
    { date: '2026-05-02', kg: 84 },
  ];
  const out = computeEMA(entries, 0.15);
  assert.ok(out[1].kg > 80 && out[1].kg < 84, `was ${out[1].kg}`);
  assert.ok(Math.abs(out[1].kg - (0.15 * 84 + 0.85 * 80)) < 1e-9);
});

test('WEIGHT_EMA_ALPHA is 0.15', () => {
  assert.strictEqual(WEIGHT_EMA_ALPHA, 0.15);
});

test('emaWeeklyDelta: no args -> null', () => {
  assert.strictEqual(emaWeeklyDelta(), null);
});

test('emaWeeklyDelta: fewer than 2 entries -> null', () => {
  assert.strictEqual(emaWeeklyDelta([], 0.15), null);
  assert.strictEqual(emaWeeklyDelta([{ date: '2026-05-01', kg: 80 }], 0.15), null);
});

test('emaWeeklyDelta: span under 3 days -> null', () => {
  const entries = [
    { date: '2026-05-01', kg: 80 },
    { date: '2026-05-02', kg: 80 },
  ];
  assert.strictEqual(emaWeeklyDelta(entries, 0.15), null);
});

test('emaWeeklyDelta: steady loss over 2+ weeks is negative', () => {
  const entries = [];
  for (let i = 0; i < 21; i++) {
    entries.push({ date: isoDate(2026, 5, 1 + i), kg: 84 - i * 0.1 });
  }
  const wk = emaWeeklyDelta(entries, 0.15);
  assert.ok(wk > -1 && wk < -0.4, `weekly delta was ${wk}`);
});

test('emaWeeklyDelta: flat tail after a decline reads near zero', () => {
  // EMA with alpha=0.15 has a ~4-entry half-life; use 30 flat days so the
  // smoother fully converges and the trailing 7-day delta approaches zero.
  const entries = [];
  for (let i = 0; i < 14; i++) {
    entries.push({ date: isoDate(2026, 5, 1 + i), kg: 84 - i * 0.28 });
  }
  for (let i = 0; i < 30; i++) {
    entries.push({ date: isoDate(2026, 5, 15 + i), kg: 80 });
  }
  const wk = emaWeeklyDelta(entries, 0.15);
  assert.ok(Math.abs(wk) < 0.15, `flat-tail weekly delta was ${wk}`);
});

test('emaWeeklyDelta: 2-day span -> null, 3-day span -> non-null', () => {
  const twoDay = [
    { date: '2026-05-01', kg: 80 },
    { date: '2026-05-02', kg: 80 },
    { date: '2026-05-03', kg: 80 },
  ]; // span = 2 days
  assert.strictEqual(emaWeeklyDelta(twoDay, 0.15), null);
  const threeDay = [
    { date: '2026-05-01', kg: 81 },
    { date: '2026-05-04', kg: 80 },
  ]; // span = 3 days
  assert.notStrictEqual(emaWeeklyDelta(threeDay, 0.15), null);
});
