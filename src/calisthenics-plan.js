'use strict';

// ============================================================================
// Calisthenics plan catalog — buildDefaultProgramme() returns the v2 training
// block as a plain data object. It is the *seed* only: on first visit the UI
// copies it into the store (STORE.calisthenics.programme), after which the
// catalog lives as editable data, not code. A future block (v3, …) is added by
// archiveAndSetProgramme() with a freshly-built programme object — no edits here.
//
// `exercises` is a shared movement registry: the same key reused across sessions
// (e.g. pull_ups in A/B/C) charts as one continuous progression series.
// ============================================================================

function buildDefaultProgramme() {
  return {
    id: 'v2',
    name: 'Calisthenics v2',
    startedAt: null, // set to today when the UI seeds it
    planPath: 'data/calisthenics_plan_v2.md',
    exercises: {
      pull_ups: { name: 'Pull-ups', metric: 'reps' },
      pseudo_planche_pushups: { name: 'Pseudo-planche push-ups', metric: 'reps' },
      pike_pushups: { name: 'Pike push-ups', metric: 'reps' },
      archer_pushups: { name: 'Archer push-ups', metric: 'reps' },
      inverted_rows: { name: 'Inverted rows (feet elevated)', metric: 'reps' },
      bulgarian_split_squat: { name: 'Bulgarian split squats', metric: 'reps' },
      single_leg_rdl: { name: 'Single-leg RDL', metric: 'reps' },
      assisted_pistol: { name: 'Assisted pistol squats', metric: 'reps' },
      handstand_hold: { name: 'Chest-to-wall handstand hold', metric: 'seconds' },
      front_lever_hold: { name: 'Adv. tuck front lever hold', metric: 'seconds' },
      hollow_body_hold: { name: 'Hollow body hold', metric: 'seconds' },
      hanging_leg_raises: { name: 'Hanging leg raises', metric: 'reps' },
      copenhagen_plank: { name: 'Copenhagen plank', metric: 'seconds' },
      nordic_negatives: { name: 'Nordic curl negatives', metric: 'reps' },
    },
    sessions: [
      {
        key: 'A',
        name: 'Push',
        subtitle: 'Push emphasis + Handstand',
        items: [
          { ex: 'handstand_hold', target: '3×20–45s' },
          { ex: 'pseudo_planche_pushups', target: '4×6–10' },
          { ex: 'pull_ups', target: '3×6' },
          { ex: 'pike_pushups', target: '3×6–8' },
          { ex: 'bulgarian_split_squat', target: '3×8/leg' },
        ],
      },
      {
        key: 'B',
        name: 'Pull',
        subtitle: 'Pull emphasis + Front Lever',
        items: [
          { ex: 'front_lever_hold', target: '3×10–12s' },
          { ex: 'pull_ups', target: '4×6' },
          { ex: 'archer_pushups', target: '3×5–6/side' },
          { ex: 'inverted_rows', target: '3×8–10' },
          { ex: 'single_leg_rdl', target: '3×8/leg' },
        ],
      },
      {
        key: 'C',
        name: 'Balanced',
        subtitle: 'Full body',
        items: [
          { ex: 'pull_ups', target: '3×6' },
          { ex: 'pseudo_planche_pushups', target: '3×6–8' },
          { ex: 'pike_pushups', target: '3×6–8' },
          { ex: 'assisted_pistol', target: '3×4–6/leg' },
        ],
      },
      {
        key: 'Conditioning',
        name: 'Conditioning',
        subtitle: 'Core + posterior + wrist',
        items: [
          { ex: 'hollow_body_hold', target: '3×30–45s' },
          { ex: 'hanging_leg_raises', target: '3×6–8' },
          { ex: 'copenhagen_plank', target: '3×15–25s/side' },
          { ex: 'nordic_negatives', target: '3×3–5' },
        ],
      },
    ],
  };
}
