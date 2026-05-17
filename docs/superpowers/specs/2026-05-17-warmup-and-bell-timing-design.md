# Warmup segment & configurable bell timing

## Goals

1. Add a per-config **warmup** segment that runs between the opening delay and the first interval, so the meditator has a settling period after the opening bells before the timed intervals begin.
2. Change session-ending bells from **3** to **2**, with **tighter spacing**.
3. Make the gap between opening (3) and closing (2) bells **independently configurable** as a global setting.

## Non-goals

- Mid-session bell gap (single bell at end of each interval / warmup): not configurable — it's one bell, gap doesn't apply.
- Per-config bell timing: explicitly rejected in favour of a single global setting.
- Bell sound selection or per-segment custom audio.

## Schedule changes

When `warmupMinutes > 0`, the schedule becomes:

| # | Segment | Label | Bells after | Gap |
|---|---|---|---|---|
| 1 | delay | `Get ready` (or `Starting` if delay = 0) | 3 | opening |
| 2 | warmup | `Warmup` | 1 | n/a (single bell) |
| 3..N+2 | interval `i` of N | `Interval i of N` | 1 each, except last | n/a |
| (last interval) | — | — | **1** if free time follows, else **2** | closing if 2 |
| free (optional) | `Free time` | 2 | closing |

When `warmupMinutes === 0` the warmup segment is omitted; flow is identical to today except the final 3 bells become 2 with the configurable closing gap.

## Data model

### Per-config (existing `meditationTimer.configs.v1`)

Add one field:

- `warmupMinutes` (number, ≥ 0, step 0.5, default `0`)

Existing saved configs without this field are treated as `warmupMinutes = 0`.

### Global bell timing (new key `meditationTimer.bellTiming.v1`)

```json
{
  "openingGapSeconds": 2.5,
  "closingGapSeconds": 0.5
}
```

Defaults if key absent:
- `openingGapSeconds = 2.5` (matches today's behaviour)
- `closingGapSeconds = 0.5` (new, tight)

Inputs clamped to `[0.2, 10]` seconds.

## Code changes

### `buildSchedule(config, bellTiming)`

Now takes the global bell timing as a second arg. Each segment in the returned schedule carries:

- `kind`, `label`, `durationMs`, `bellsAfter` (existing)
- `bellGapMs` (new) — `openingGapSeconds * 1000` for the delay segment, `closingGapSeconds * 1000` for whichever segment is last in the schedule, otherwise omitted (single bell, no gap needed).

Insert a warmup segment immediately after the delay segment when `warmupMinutes > 0`:

```js
{ kind: 'warmup', label: 'Warmup', durationMs: minutesToMs(config.warmupMinutes), bellsAfter: 1 }
```

The closing bell count drops from 3 → **2** for the session-ending segment.

### Audio (`scheduleBells`)

Replace the module-level `BELL_GAP_MS` constant with a parameter:

```js
function scheduleBells(count, gapMs) { … }
```

`Engine._endSegment` reads `seg.bellGapMs` (falling back to a sensible default for the single-bell case, which is never actually used since count = 1) and passes it through.

### Storage helpers

Two new helpers next to existing config helpers:

```js
function loadBellTiming() { /* returns object with defaults applied */ }
function saveBellTiming(timing) { /* writes meditationTimer.bellTiming.v1 */ }
```

### `readForm` / `writeForm`

Add `warmupMinutes` to the read/write round-trip alongside the other per-config fields.

## UI changes

### Settings view

**Within the existing per-config card**, add one row between "Opening delay" and "Number of intervals":

```
Opening delay (sec)   [ 30  ]
Warmup (min)          [  0  ]      ← new
Number of intervals   [  4  ]
Interval length (min) [  5  ]
Free section (min)    [  0  ]
[ Save ]
```

**New global card** at the bottom of the settings view, after the total/breakdown card:

```
Bells
  Opening gap (sec)   [ 2.5 ]
  Closing gap (sec)   [ 0.5 ]
  [ Save bells ]                  status: "Saved." / ""
```

Save commits to `meditationTimer.bellTiming.v1`. Inputs silently clamped to `[0.2, 10]` on save (matches the existing per-config pattern using `Math.max`/`Math.min` in `readForm`).

### Home view breakdown

Today: `4 × 5 min · Delay 30s`

Update to optionally include warmup when > 0:

`4 × 5 min · Warmup 2 min · Delay 30s`

### Settings total card

Today: `Intervals 20:00 · Free 0:00`

Update to include warmup when > 0:

`Warmup 2:00 · Intervals 20:00 · Free 0:00`

The big `total-display` number stays as intervals + free (matching today's semantics — delay and warmup are pre-meditation framing, not "meditation time").

### Session view

No structural change. During the warmup segment, `segment-label` reads `Warmup`; the countdown ticks down from the configured warmup length. `session-progress` (e.g. `Segment 2 of 7`) automatically reflects the extra segment.

## Edge cases

- **Warmup = 0**: segment omitted; total/breakdown displays don't mention warmup.
- **Bell gap = 0.2**: lowest allowed; bells will be very rapid.
- **Bell gap > 10 or < 0.2**: clamped silently to the bound on save.
- **Existing saved configs** without `warmupMinutes`: default to 0, no behavioural change apart from 2-bell ending.
- **First-time users / no bell-timing key**: defaults applied silently; opening behaviour identical to today, closing tighter and with one fewer bell.
- **Pause during warmup**: works identically to pause during any other segment (existing engine handles via `pausedRemainingMs`).
- **Last interval with free time**: last interval still rings 1 bell (transition into free time); free time rings 2 closing bells.
- **Last interval without free time**: rings 2 closing bells.

## Testing

This project is a single-file vanilla JS web app with no test harness. Verification is manual:

1. Save a config with warmup = 2 min, delay = 5 sec, 2 × 0.5 min intervals, free = 0. Start session.
2. Confirm: 5s delay → 3 bells at 2.5s gap → "Warmup" segment counts down 2:00 → 1 bell → "Interval 1 of 2" counts down 30s → 1 bell → "Interval 2 of 2" counts down 30s → **2 bells at 0.5s gap** → done.
3. Change bell gaps in the Bells card, save, start a new session, confirm new gaps apply.
4. Load a config saved before this change — confirm it still works (warmup = 0, no warmup segment, 2 closing bells with new gap).
5. Pause/resume during warmup — confirm remaining time preserved.
6. Home breakdown and Settings total reflect warmup when > 0 and hide it when = 0.
