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

// sessions: [{ date, programmeId, session, results: {exKey: value}, notes }].
// programme: the active training block { id, startedAt, exercises }.
// Returns block-scoped coaching stats: weeks on the block, session count, and a
// per-exercise summary (latest, best, trend, and a stall signal) computed over
// only the *current* block (sessions tagged with the active programmeId).
function computeCalisthenicsStats(sessions, programme) {
  const all = (Array.isArray(sessions) ? sessions.slice() : []).sort((a, b) => a.date.localeCompare(b.date));
  const progId = programme ? programme.id : null;
  const block = all.filter((s) => s.programmeId === progId);

  let weeksOnBlock = null;
  if (programme && programme.startedAt) {
    const startMs = parseDateLocal(programme.startedAt).getTime();
    weeksOnBlock = Math.round((Date.now() - startMs) / (7 * DAY_MS) * 10) / 10;
  }

  // Per-exercise series within the current block, in date order.
  const exMeta = (programme && programme.exercises) || {};
  const seriesByEx = {};
  for (const s of block) {
    for (const [k, v] of Object.entries(s.results || {})) {
      if (typeof v !== 'number') continue;
      (seriesByEx[k] = seriesByEx[k] || []).push({ date: s.date, value: v });
    }
  }

  const exercises = {};
  for (const [k, series] of Object.entries(seriesByEx)) {
    const values = series.map((p) => p.value);
    const latest = values[values.length - 1];
    const best = Math.max(...values);

    // Least-squares slope (per day) -> per week, over the block series.
    let trendPerWeek = null;
    if (series.length >= 2) {
      const firstMs = parseDateLocal(series[0].date).getTime();
      const n = series.length;
      let sx = 0, sy = 0, sxy = 0, sxx = 0;
      for (const p of series) {
        const x = (parseDateLocal(p.date).getTime() - firstMs) / DAY_MS;
        sx += x; sy += p.value; sxy += x * p.value; sxx += x * x;
      }
      const den = n * sxx - sx * sx;
      const slope = den === 0 ? 0 : (n * sxy - sx * sy) / den;
      trendPerWeek = Math.round(slope * 7 * 100) / 100;
    }

    // Stall signal: how many of the most-recent consecutive sessions failed to
    // set a new best. 0 = the latest session was a PR.
    let sessionsSinceImprovement = 0;
    for (let i = values.length - 1; i >= 0; i--) {
      const priorBest = i === 0 ? -Infinity : Math.max(...values.slice(0, i));
      if (values[i] > priorBest) break;
      sessionsSinceImprovement++;
    }

    const meta = exMeta[k] || {};
    exercises[k] = {
      name: meta.name || k,
      metric: meta.metric || 'reps',
      latest,
      best,
      entryCount: series.length,
      trendPerWeek,
      sessionsSinceImprovement,
    };
  }

  return {
    weeksOnBlock,
    blockSessionCount: block.length,
    totalSessionCount: all.length,
    exercises,
  };
}

module.exports = { computeWeightStats, computeCalisthenicsStats };
