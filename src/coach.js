'use strict';

// ============================================================================
// Coach client — POSTs to the server's /api/coach/<surface> endpoint and returns
// the { generatedAt, read, actions } report, throwing a readable error otherwise.
// ============================================================================

async function askCoach(surface) {
  const res = await fetch(`/api/coach/${surface}`, { method: 'POST' });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok || data.error) {
    throw new Error(data.error || `Server error ${res.status}`);
  }
  return data; // { generatedAt, read, actions }
}
