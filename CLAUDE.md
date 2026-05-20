# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

There is no build step, package manager, server, or test framework. The app runs
directly from the filesystem — open `index.html` by double-clicking it (it loads over
the `file://` protocol). All source is plain ES5/ES2017 JavaScript loaded via classic
`<script>` tags.

**Do not introduce ES modules, `import`/`export`, bundlers, or npm dependencies.** The
`file://` protocol blocks module loading, so everything relies on classic scripts and a
shared global scope.

`bell.mp3` must sit next to `index.html` for the timer audio to work (the app probes for
`bell.mp3` then `bell.wav`).

## Architecture

A single-page app with four tabs (Timer, Weight, Emissions, Watering), all defined as
hidden `<main>` views in `index.html`. View switching is just toggling the `hidden` class.

### Global-scope module loading

`src/*.js` files share one global scope — there are no modules. **Load order in
`index.html` is significant** because later files reference functions and the `els` object
defined in earlier ones. The order is:

1. `storage.js` — all `localStorage` read/write (keys are versioned, e.g. `meditationTimer.configs.v1`)
2. `audio.js` — bell playback pool, bell scheduling, screen Wake Lock
3. `schedule.js` — `buildSchedule()` (config → segment list) and the `Engine` timer object
4. `charts.js` — pure math + SVG rendering shared by Weight and the gap-based trackers
5. `ui-core.js` — the shared `els` DOM cache and `hideAllViews()`/`setActiveTab()`
6. `timer-ui.js`, `weight-ui.js`, `emissions-ui.js`, `watering-ui.js` — per-tab UI + event wiring
7. `main.js` — tab-bar wiring and the `bootstrap()` IIFE; loaded last so everything it calls exists

When adding DOM elements, register them in the `els` literal in `ui-core.js` and reference
them as `els.someName` everywhere else.

### Timer subsystem (Timer tab)

- A **config** is `{ delaySeconds, warmupMinutes, intervalCount, intervalMinutes, freeMinutes }`,
  saved by name in `localStorage`.
- `buildSchedule(config, bellTiming)` expands a config into an ordered list of segments
  (`delay` → optional `warmup` → N `interval`s → optional `free`), each carrying `durationMs`,
  `bellsAfter` (how many bell strikes), and an optional `bellGapMs`.
- `Engine` (in `schedule.js`) runs the schedule: `setTimeout` drives real segment transitions
  while `requestAnimationFrame` only repaints the countdown. It calls `onTick`/`onComplete`
  hooks passed by `timer-ui.js`. Pausing captures remaining ms and cancels pending bells.
- **Rotation**: an optional A/B daily alternation. `getTodaysSuggestion()` picks which config
  to surface; starting a session calls `markRotationDone()` ("started counts as done today").

### Trackers (Weight, Emissions, Watering tabs)

- **Weight** stores `{ "YYYY-MM-DD": kg }` and plots values with a least-squares trend line
  (`linearRegression`, `renderWeightChart`).
- **Emissions** and **Watering** store `{ "YYYY-MM-DD": true }` (presence = logged, per-day
  deduped) and plot the *gap in days between consecutive entries* via `renderGapChart`.
- Emissions and Watering are near-identical: Watering reuses `buildGapPoints`, `daysBetween`,
  `emissionsDaysSince`, and `averageGap` from emissions/charts code. Changes to one usually
  belong in the other.
- All charts are hand-built SVG (no chart library); dates are parsed/compared in **local time**
  via `parseDateLocal` and `todayLocal` — never use UTC date parsing here.

## Conventions

- Every JS file starts with `'use strict';` and a banner comment describing its role.
- All persisted data lives in `localStorage` under versioned keys defined at the top of
  `storage.js`. Bump the version suffix if a stored shape changes incompatibly.
- Design docs go in `docs/superpowers/specs/` and plans in `docs/superpowers/plans/`.
- Working on and committing directly to main is expected.
