'use strict';

// ============================================================================
// Connection status — surfaces a banner when the local server is unreachable
// (storage.js calls reportServerReachable() from fetchStore/persist) and, while
// down, polls until the server returns — then reloads to restore correct state.
// ============================================================================

let serverReachable = true;
let recheckTimer = null;
let reloading = false;

function reportServerReachable(ok) {
  if (ok === serverReachable) return; // no change — avoid redundant DOM/poll churn
  serverReachable = ok;
  if (els.serverBanner) els.serverBanner.hidden = ok;
  if (ok) stopRecheck();
  else startRecheck();
}

function startRecheck() {
  if (recheckTimer) return;
  recheckTimer = setInterval(async () => {
    try {
      const res = await fetch('/api/store');
      if (res.ok) onServerRecovered();
    } catch { /* still down — keep polling */ }
  }, 3000);
}

function stopRecheck() {
  clearInterval(recheckTimer);
  recheckTimer = null;
}

// On recovery, reload: if the app booted against a dead server the in-memory
// STORE is empty, and a reload is the simplest guarantee of correct state.
function onServerRecovered() {
  if (reloading) return;
  reloading = true;
  stopRecheck();
  if (els.serverBanner) {
    els.serverBanner.hidden = false;
    els.serverBanner.textContent = 'Server reconnected — reloading…';
  }
  setTimeout(() => location.reload(), 800);
}
