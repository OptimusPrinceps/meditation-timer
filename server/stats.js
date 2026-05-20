'use strict';
// ============================================================================
// Stats — pure weight-coaching math (regression trend, recent average). Mirrors
// the local-time date handling used by the browser charts. No dependencies.
// ============================================================================

const DAY_MS = 86400000;

function parseDateLocal(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// weights: { 'YYYY-MM-DD': kg } -> coaching stats.
function computeWeightStats(weights) {
  const entries = Object.keys(weights || {})
    .sort()
    .map((date) => ({ date, kg: weights[date] }));

  if (entries.length === 0) {
    return { currentKg: null, sevenDayAvgKg: null, trendKgPerWeek: null, weeksOfData: 0, entryCount: 0 };
  }

  const last = entries[entries.length - 1];
  const lastMs = parseDateLocal(last.date).getTime();
  const firstMs = parseDateLocal(entries[0].date).getTime();

  // 7-day average: entries within 6 days before the last entry's date.
  const windowStart = lastMs - 6 * DAY_MS;
  const recent = entries.filter((e) => parseDateLocal(e.date).getTime() >= windowStart);
  const sevenDayAvgKg = recent.reduce((a, e) => a + e.kg, 0) / recent.length;

  // Least-squares slope over all entries (kg/day) -> kg/week.
  let trendKgPerWeek = null;
  if (entries.length >= 2) {
    const n = entries.length;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (const e of entries) {
      const x = (parseDateLocal(e.date).getTime() - firstMs) / DAY_MS;
      sx += x; sy += e.kg; sxy += x * e.kg; sxx += x * x;
    }
    const den = n * sxx - sx * sx;
    const slope = den === 0 ? 0 : (n * sxy - sx * sy) / den;
    trendKgPerWeek = slope * 7;
  }

  const round = (v, p) => (v == null ? null : Math.round(v * 10 ** p) / 10 ** p);
  return {
    currentKg: round(last.kg, 1),
    sevenDayAvgKg: round(sevenDayAvgKg, 2),
    trendKgPerWeek: round(trendKgPerWeek, 2),
    weeksOfData: round((lastMs - firstMs) / (7 * DAY_MS), 1),
    entryCount: entries.length,
  };
}

module.exports = { computeWeightStats };
