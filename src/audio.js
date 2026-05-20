'use strict';

// ============================================================================
// Audio — pool of HTMLAudioElement so bells can overlap if needed
// ============================================================================

let bellSrc = null;
let bellPool = [];
let bellIndex = 0;
let pendingBellTimeouts = [];

function probeBellSrc() {
  return new Promise((resolve) => {
    const candidates = ['bell.mp3', 'bell.wav'];
    const tryNext = (i) => {
      if (i >= candidates.length) return resolve(null);
      const a = new Audio();
      a.preload = 'auto';
      const onLoad = () => { cleanup(); resolve(candidates[i]); };
      const onError = () => { cleanup(); tryNext(i + 1); };
      const cleanup = () => {
        a.removeEventListener('canplaythrough', onLoad);
        a.removeEventListener('loadeddata', onLoad);
        a.removeEventListener('error', onError);
      };
      a.addEventListener('canplaythrough', onLoad, { once: true });
      a.addEventListener('loadeddata', onLoad, { once: true });
      a.addEventListener('error', onError, { once: true });
      a.src = candidates[i];
    };
    tryNext(0);
  });
}

async function initAudio() {
  bellSrc = await probeBellSrc();
  if (!bellSrc) return false;
  bellPool = Array.from({ length: 4 }, () => {
    const a = new Audio(bellSrc);
    a.preload = 'auto';
    return a;
  });
  return true;
}

function playBellNow() {
  if (!bellPool.length) return;
  const a = bellPool[bellIndex];
  bellIndex = (bellIndex + 1) % bellPool.length;
  try {
    a.currentTime = 0;
    const p = a.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {}
}

function scheduleBells(count, gapMs) {
  const gap = Number.isFinite(gapMs) && gapMs > 0 ? gapMs : 2500;
  const ids = [];
  for (let i = 0; i < count; i++) {
    if (i === 0) {
      playBellNow();
    } else {
      ids.push(setTimeout(playBellNow, i * gap));
    }
  }
  pendingBellTimeouts.push(...ids);
  return ids;
}

function cancelPendingBells() {
  for (const id of pendingBellTimeouts) clearTimeout(id);
  pendingBellTimeouts = [];
}

// ============================================================================
// Wake Lock — keep the screen awake during a session so audio doesn't get
// killed by the OS. Auto-released when the tab is hidden; we re-request on
// re-focus while a session is active.
// ============================================================================

let wakeLock = null;

async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch {
    // Permission denied or unsupported — silent.
  }
}

async function releaseWakeLock() {
  if (!wakeLock) return;
  try { await wakeLock.release(); } catch {}
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !Engine.done && Engine.schedule && !wakeLock) {
    acquireWakeLock();
  }
});
