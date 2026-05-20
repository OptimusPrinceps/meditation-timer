# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

The app requires a small local server. Start it with `node server.js` and open
`http://localhost:369`. The server (zero npm dependencies — built-in Node modules
only) serves the static files, owns `data/store.json` (the single source of truth —
see Architecture), and proxies weight coaching to the `claude` CLI. There is a unit
test for the stats math: `node --test`.

`bell.mp3` must sit next to `index.html` for the timer audio to work (the app probes
for `bell.mp3` then `bell.wav`).

**Coaching auth:** run `claude setup-token` once, then `cp .env.example .env` and paste
the token into `CLAUDE_CODE_OAUTH_TOKEN`. `server.js` loads the gitignored `.env` into
`process.env` on startup (a real env var still wins). Ensure `ANTHROPIC_API_KEY` is NOT
set anywhere, or it takes precedence and reverts to paid API billing instead of the Max
subscription.

**Browser code stays dependency-free:** classic `<script>` tags, shared global scope,
no ES modules/`import`/`export`/bundlers. Server files (`server.js`, `server/*.js`) are
plain Node CommonJS.

## Architecture

A single-page app with four tabs (Timer, Weight, Emissions, Watering), all defined as
hidden `<main>` views in `index.html`. View switching is just toggling the `hidden` class.

### Global-scope module loading

`src/*.js` files share one global scope — there are no modules. **Load order in
`index.html` is significant** because later files reference functions and the `els` object
defined in earlier ones. The order is:

1. `storage.js` — the in-memory `STORE` cache + `fetchStore()`/`persist()` sync to the server's `/api/store` (versioned via `meta.version`)
2. `audio.js` — bell playback pool, bell scheduling, screen Wake Lock
3. `schedule.js` — `buildSchedule()` (config → segment list) and the `Engine` timer object
4. `charts.js` — pure math + SVG rendering shared by Weight and the gap-based trackers
5. `coach.js` — the `askCoach(surface)` client wrapper for `/api/coach/<surface>`
6. `ui-core.js` — the shared `els` DOM cache and `hideAllViews()`/`setActiveTab()`
7. `timer-ui.js`, `weight-ui.js`, `emissions-ui.js`, `watering-ui.js` — per-tab UI + event wiring
8. `main.js` — tab-bar wiring and the `bootstrap()` IIFE; loaded last so everything it calls exists

When adding DOM elements, register them in the `els` literal in `ui-core.js` and reference
them as `els.someName` everywhere else.

### Persistence & the coach (server)

`storage.js` keeps an in-memory `STORE` as a read cache; `data/store.json` (owned by
`server.js`) is the single source of truth. Boot calls `fetchStore()`; every mutation
updates `STORE` and debounce-POSTs it to `/api/store`. The `coach` section is
server-authoritative — `POST /api/store` preserves it so a client save can't clobber a
report. On first boot the client migrates any legacy `localStorage` keys into the store.

Coaching surfaces follow one contract: a `prompts/<surface>.md` system prompt, a
`POST /api/coach/<surface>` endpoint that reads the store + computes stats + calls
`claude -p`, a `{ read, actions }` response stored under `coach.<surface>`, and a report
slot on the tab. Weight is the first surface; it regenerates weekly via an in-process
staleness check (`server.js`) and on demand via a Refresh button.

### Timer subsystem (Timer tab)

- A **config** is `{ delaySeconds, warmupMinutes, intervalCount, intervalMinutes, freeMinutes }`,
  saved by name in the store (`STORE.configs`).
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
- All persisted data lives in `data/store.json`, served and owned by `server.js`.
  `storage.js` mirrors it into an in-memory `STORE` (versioned via `meta.version`); bump
  that version if a stored shape changes incompatibly. The old `localStorage` keys are
  read only once, by the first-boot migration.
- Design docs go in `docs/superpowers/specs/` and plans in `docs/superpowers/plans/`.
- Working on and committing directly to main is expected.
