'use strict';
// ============================================================================
// Coach — builds the weight-coaching payload and calls the `claude` CLI in
// headless mode (Max subscription auth). Returns { generatedAt, read, actions }.
// ============================================================================

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { computeWeightStats, computeCalisthenicsStats } = require('./stats');

const ROOT = path.join(__dirname, '..');
const PROMPT_PATH = path.join(ROOT, 'prompts', 'weight.md');
const CALI_PROMPT_PATH = path.join(ROOT, 'prompts', 'calisthenics.md');
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';

// Run `claude -p` headless with our system prompt. Forces subscription auth by
// removing ANTHROPIC_API_KEY from the child env (if set, it overrides the
// CLAUDE_CODE_OAUTH_TOKEN and reverts to paid API billing). NOTE: do NOT pass
// `--bare` — it makes auth strictly ANTHROPIC_API_KEY and never reads the OAuth
// token, which would break subscription auth. `--system-prompt-file` already
// replaces the default system prompt (so no CLAUDE.md bleed), `--tools ''`
// disables all tools (pure inference, no tool-call overhead), and running from
// a neutral cwd avoids discovering the project's own .claude config.
function runClaude(promptText, promptPath = PROMPT_PATH) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    const args = [
      '-p',
      '--system-prompt-file', promptPath,
      '--tools', '',
      '--output-format', 'json',
      promptText,
    ];
    execFile(CLAUDE_BIN, args, { env, cwd: os.tmpdir(), timeout: 120000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`claude CLI failed: ${stderr || err.message}`));
      resolve(stdout);
    });
  });
}

// Strip optional ``` fences and parse the model's {read, actions} JSON.
function extractJson(text) {
  const cleaned = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  return JSON.parse(cleaned);
}

async function runWeightCoach(store) {
  const weights = store.weights || {};
  const stats = computeWeightStats(weights);
  if (stats.entryCount < 2) throw new Error('Not enough weight data to coach yet.');

  const history = Object.keys(weights).sort().map((d) => ({ date: d, kg: weights[d] }));
  const payload = JSON.stringify({ history, goal: store.weightGoal || null, stats });

  const raw = await runClaude(payload);
  const envelope = JSON.parse(raw);       // claude -p --output-format json wrapper
  const modelText = envelope.result || ''; // the model's text turn
  const parsed = extractJson(modelText);   // { read, actions }

  return {
    generatedAt: Date.now(),
    read: String(parsed.read || ''),
    actions: Array.isArray(parsed.actions) ? parsed.actions.map(String) : [],
  };
}

async function runCalisthenicsCoach(store) {
  const cali = store.calisthenics || {};
  const sessions = Array.isArray(cali.sessions) ? cali.sessions : [];
  if (sessions.length < 2) throw new Error('Not enough training data to coach yet.');

  const programme = cali.programme || null;
  const stats = computeCalisthenicsStats(sessions, programme);

  // The block's prose plan (ladders, progression rule, safety notes) — optional.
  let plan = '';
  if (programme && programme.planPath) {
    try { plan = fs.readFileSync(path.join(ROOT, programme.planPath), 'utf8'); } catch { /* fall back to catalog */ }
  }

  // Recent sessions only — keep the payload small.
  const recent = sessions.slice().sort((a, b) => a.date.localeCompare(b.date)).slice(-12);
  const payload = JSON.stringify({ plan, programme, sessions: recent, stats });

  const raw = await runClaude(payload, CALI_PROMPT_PATH);
  const envelope = JSON.parse(raw);
  const modelText = envelope.result || '';
  const parsed = extractJson(modelText);

  return {
    generatedAt: Date.now(),
    read: String(parsed.read || ''),
    actions: Array.isArray(parsed.actions) ? parsed.actions.map(String) : [],
  };
}

module.exports = { runWeightCoach, runCalisthenicsCoach };
