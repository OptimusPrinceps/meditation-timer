'use strict';

// ============================================================================
// Chart & stat math — pure functions for filtering, regression, and chart math.
// Shared by the weight tracker and the emissions tracker.
// ============================================================================

const DAY_MS = 86400000;

function parseDateLocal(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function filterRange(entries, rangeKey) {
  if (rangeKey === 'all') return entries.slice();
  const days = parseInt(rangeKey, 10);
  if (!days) return entries.slice();
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffMs = cutoff.getTime();
  return entries.filter((e) => parseDateLocal(e.date).getTime() >= cutoffMs);
}

// Least-squares regression on (days since first entry, kg).
// Returns {slope, intercept, firstMs} in kg/day, or null for <2 points.
function linearRegression(entries) {
  if (entries.length < 2) return null;
  const firstMs = parseDateLocal(entries[0].date).getTime();
  const n = entries.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (const e of entries) {
    const x = (parseDateLocal(e.date).getTime() - firstMs) / DAY_MS;
    const y = e.kg;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const den = n * sumXX - sumX * sumX;
  if (den === 0) return { slope: 0, intercept: sumY / n, firstMs };
  const slope = (n * sumXY - sumX * sumY) / den;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept, firstMs };
}

// Trailing exponential moving average over weigh-ins in plot order.
// entries: [{date, kg}] ascending. Returns [{ms, kg}] (smoothed). [] if empty.
const WEIGHT_EMA_ALPHA = 0.15;

function computeEMA(entries, alpha) {
  if (!entries.length) return [];
  let prev = entries[0].kg;
  const out = [{ ms: parseDateLocal(entries[0].date).getTime(), kg: prev }];
  for (let i = 1; i < entries.length; i++) {
    prev = alpha * entries[i].kg + (1 - alpha) * prev;
    out.push({ ms: parseDateLocal(entries[i].date).getTime(), kg: prev });
  }
  return out;
}

// Real implementation added in Task 2; stub keeps the module loadable for now.
function emaWeeklyDelta() { return null; }

function formatWeeklyChange(slope) {
  if (slope == null) return '—';
  const perWeek = slope * 7;
  if (Math.abs(perWeek) < 0.05) return '0.0 kg/wk';
  const sign = perWeek < 0 ? '−' : '+';
  return `${sign}${Math.abs(perWeek).toFixed(1)} kg/wk`;
}

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function formatChartDate(d) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

// `markers` (optional): array of YYYY-MM-DD dates drawn as vertical dashed
// lines (e.g. training block changes). In-range dates only; ignored elsewhere.
function renderWeightChart(svg, entries, regression, markers) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  if (entries.length === 0) return;

  const W = 600, H = 320;
  const M = { top: 12, right: 16, bottom: 28, left: 50 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;

  const ys = entries.map((e) => e.kg);
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  const yPad = (yMax - yMin) * 0.1;
  yMin -= yPad; yMax += yPad;

  const xs = entries.map((e) => parseDateLocal(e.date).getTime());
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const xRange = Math.max(1, xMax - xMin);

  const xScale = (ms) => entries.length === 1
    ? M.left + plotW / 2
    : M.left + ((ms - xMin) / xRange) * plotW;
  const yScale = (kg) => M.top + (1 - (kg - yMin) / (yMax - yMin)) * plotH;

  // Y gridlines + labels
  const yTickCount = 4;
  for (let i = 0; i <= yTickCount; i++) {
    const t = i / yTickCount;
    const y = M.top + t * plotH;
    const kg = yMax - t * (yMax - yMin);
    svg.appendChild(svgEl('line', {
      x1: M.left, x2: M.left + plotW, y1: y, y2: y, class: 'chart-grid',
    }));
    const text = svgEl('text', {
      x: M.left - 8, y: y + 4, 'text-anchor': 'end', class: 'chart-tick',
    });
    text.textContent = kg.toFixed(1);
    svg.appendChild(text);
  }

  // X labels — up to 4, evenly spaced
  const xTickCount = entries.length === 1 ? 1 : Math.min(4, entries.length);
  for (let i = 0; i < xTickCount; i++) {
    const t = xTickCount === 1 ? 0.5 : i / (xTickCount - 1);
    const ms = xMin + t * xRange;
    const x = entries.length === 1 ? M.left + plotW / 2 : M.left + t * plotW;
    const text = svgEl('text', {
      x, y: H - 8, 'text-anchor': 'middle', class: 'chart-tick',
    });
    text.textContent = formatChartDate(new Date(ms));
    svg.appendChild(text);
  }

  // Block-change markers (vertical dashed lines) behind the data
  if (Array.isArray(markers) && entries.length >= 2) {
    for (const dateStr of markers) {
      const ms = parseDateLocal(dateStr).getTime();
      if (ms < xMin || ms > xMax) continue;
      const x = xScale(ms);
      svg.appendChild(svgEl('line', {
        x1: x, x2: x, y1: M.top, y2: M.top + plotH, class: 'chart-block-marker',
      }));
    }
  }

  // Trend line first so it sits behind the data line
  if (regression && entries.length >= 2) {
    const dayEnd = (xMax - regression.firstMs) / DAY_MS;
    const yStart = regression.intercept;
    const yEnd = regression.intercept + regression.slope * dayEnd;
    svg.appendChild(svgEl('line', {
      x1: xScale(xMin), y1: yScale(yStart),
      x2: xScale(xMax), y2: yScale(yEnd),
      class: 'chart-trend',
    }));
  }

  // Data line
  if (entries.length >= 2) {
    const d = entries.map((e, i) => {
      const x = xScale(parseDateLocal(e.date).getTime());
      const y = yScale(e.kg);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
    svg.appendChild(svgEl('path', { d, class: 'chart-line' }));
  }

  // Data dots on top
  for (const e of entries) {
    svg.appendChild(svgEl('circle', {
      cx: xScale(parseDateLocal(e.date).getTime()),
      cy: yScale(e.kg),
      r: 3.5,
      class: 'chart-dot',
    }));
  }

  return {
    xScale,
    yScale,
    plot: { x: M.left, y: M.top, w: plotW, h: plotH },
  };
}

// Wires pointer interactivity onto a chart rendered by renderWeightChart.
// `descriptor` is renderWeightChart's return value; `tooltipEl` is an HTML
// element positioned over the chart card. Maps clientX into the 600-wide
// viewBox, snaps to the nearest entry, and shows a crosshair + focus dot +
// tooltip. Re-appends its own overlay on each call (safe after a re-render,
// which wipes the SVG).
function attachChartHover(svg, entries, descriptor, tooltipEl) {
  if (!descriptor || entries.length === 0) {
    tooltipEl.classList.add('hidden');
    return;
  }
  const { xScale, yScale, plot } = descriptor;

  const crosshair = svgEl('line', {
    x1: 0, x2: 0, y1: plot.y, y2: plot.y + plot.h,
    class: 'chart-crosshair hidden',
  });
  const focus = svgEl('circle', { cx: 0, cy: 0, r: 5, class: 'chart-focus hidden' });
  const hit = svgEl('rect', {
    x: plot.x, y: plot.y, width: plot.w, height: plot.h,
    fill: 'transparent', style: 'cursor: crosshair;',
  });
  svg.appendChild(crosshair);
  svg.appendChild(focus);
  svg.appendChild(hit);

  const xsMs = entries.map((e) => parseDateLocal(e.date).getTime());

  function hide() {
    crosshair.classList.add('hidden');
    focus.classList.add('hidden');
    tooltipEl.classList.add('hidden');
  }

  function show(evt) {
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    // viewBox is 0 0 600 320; map client X into viewBox units.
    const vbX = ((evt.clientX - rect.left) / rect.width) * 600;
    // Nearest entry by plotted x position.
    let best = 0, bestDist = Infinity;
    for (let i = 0; i < entries.length; i++) {
      const d = Math.abs(xScale(xsMs[i]) - vbX);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    const e = entries[best];
    const px = xScale(xsMs[best]);
    const py = yScale(e.kg);

    crosshair.setAttribute('x1', px);
    crosshair.setAttribute('x2', px);
    crosshair.classList.remove('hidden');
    focus.setAttribute('cx', px);
    focus.setAttribute('cy', py);
    focus.classList.remove('hidden');

    tooltipEl.textContent = `${formatChartDate(parseDateLocal(e.date))} · ${e.kg.toFixed(1)} kg`;
    tooltipEl.classList.remove('hidden');
    // Position the HTML tooltip relative to the chart card, clamped on screen.
    const leftPct = (px / 600) * 100;
    tooltipEl.style.left = `${Math.max(4, Math.min(96, leftPct))}%`;
  }

  hit.addEventListener('pointermove', show);
  hit.addEventListener('pointerdown', show);
  hit.addEventListener('pointerleave', hide);
}

// ============================================================================
// Emissions stat math
// ============================================================================

// Whole days between two YYYY-MM-DD strings (b - a).
function daysBetween(aStr, bStr) {
  return Math.round((parseDateLocal(bStr).getTime() - parseDateLocal(aStr).getTime()) / DAY_MS);
}

// sorted: [{date}] ascending. -> { lastDate, daysSince } or nulls when empty.
function emissionsDaysSince(sorted) {
  if (!sorted.length) return { lastDate: null, daysSince: null };
  const lastDate = sorted[sorted.length - 1].date;
  return { lastDate, daysSince: daysBetween(lastDate, todayLocal()) };
}

// Consecutive gaps in days; length = entries - 1.
function emissionGaps(sorted) {
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date));
  }
  return gaps;
}

// Mean gap in days, or null when there are fewer than 2 entries.
function averageGap(sorted) {
  const gaps = emissionGaps(sorted);
  if (!gaps.length) return null;
  return gaps.reduce((a, b) => a + b, 0) / gaps.length;
}

// gapPoints: [{date: laterDateStr, gap: days}]. Plots gap-in-days over time,
// reusing the weight-chart scaffolding minus the regression trend line.
function renderGapChart(svg, gapPoints) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  if (gapPoints.length === 0) return;

  const W = 600, H = 320;
  const M = { top: 12, right: 16, bottom: 28, left: 50 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;

  const ys = gapPoints.map((p) => p.gap);
  let yMin = Math.min(0, ...ys);
  let yMax = Math.max(...ys);
  if (yMin === yMax) { yMax += 1; }
  const yPad = (yMax - yMin) * 0.1;
  yMax += yPad;

  const xs = gapPoints.map((p) => parseDateLocal(p.date).getTime());
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const xRange = Math.max(1, xMax - xMin);

  const xScale = (ms) => gapPoints.length === 1
    ? M.left + plotW / 2
    : M.left + ((ms - xMin) / xRange) * plotW;
  const yScale = (g) => M.top + (1 - (g - yMin) / (yMax - yMin)) * plotH;

  // Y gridlines + labels (integer days)
  const yTickCount = 4;
  for (let i = 0; i <= yTickCount; i++) {
    const t = i / yTickCount;
    const y = M.top + t * plotH;
    const g = yMax - t * (yMax - yMin);
    svg.appendChild(svgEl('line', {
      x1: M.left, x2: M.left + plotW, y1: y, y2: y, class: 'chart-grid',
    }));
    const text = svgEl('text', {
      x: M.left - 8, y: y + 4, 'text-anchor': 'end', class: 'chart-tick',
    });
    text.textContent = String(Math.round(g));
    svg.appendChild(text);
  }

  // X labels — up to 4, evenly spaced
  const xTickCount = gapPoints.length === 1 ? 1 : Math.min(4, gapPoints.length);
  for (let i = 0; i < xTickCount; i++) {
    const t = xTickCount === 1 ? 0.5 : i / (xTickCount - 1);
    const ms = xMin + t * xRange;
    const x = gapPoints.length === 1 ? M.left + plotW / 2 : M.left + t * plotW;
    const text = svgEl('text', {
      x, y: H - 8, 'text-anchor': 'middle', class: 'chart-tick',
    });
    text.textContent = formatChartDate(new Date(ms));
    svg.appendChild(text);
  }

  // Data line
  if (gapPoints.length >= 2) {
    const d = gapPoints.map((p, i) => {
      const x = xScale(parseDateLocal(p.date).getTime());
      const y = yScale(p.gap);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
    svg.appendChild(svgEl('path', { d, class: 'chart-line' }));
  }

  // Data dots on top
  for (const p of gapPoints) {
    svg.appendChild(svgEl('circle', {
      cx: xScale(parseDateLocal(p.date).getTime()),
      cy: yScale(p.gap),
      r: 3.5,
      class: 'chart-dot',
    }));
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    computeEMA, emaWeeklyDelta, linearRegression, formatWeeklyChange, WEIGHT_EMA_ALPHA,
  };
}
