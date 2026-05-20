'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { computeWeightStats } = require('../server/stats');

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
