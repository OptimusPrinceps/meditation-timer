'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { computeEMA, emaWeeklyDelta, WEIGHT_EMA_ALPHA } = require('../src/charts');

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

test('emaWeeklyDelta: stub returns null (real impl in Task 2)', () => {
  assert.strictEqual(emaWeeklyDelta(), null);
});
