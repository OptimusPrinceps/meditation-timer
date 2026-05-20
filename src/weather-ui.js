'use strict';

// ============================================================================
// Weather UI — geolocation + /api/weather, and an Apple-style render of current
// conditions, hourly strip, 10-day forecast, and detail tiles. Weather icons are
// hand-built inline SVG (keyed by the condition name the server returns), to
// match the app's hand-built SVG charts. No emoji, no icon library. DOM is built
// node-by-node (no innerHTML) like the other tabs.
// ============================================================================

let weatherLoading = false;

// --- Tiny DOM helpers ---

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function clearNode(node) { while (node.firstChild) node.removeChild(node.firstChild); }

// --- Hand-built SVG weather icons ---

const WX = {
  sun: '#f5c66b', moon: '#cdd3e0', cloud: '#c4c9d4',
  rain: '#7aa2f7', snow: '#dfe5f0', bolt: '#f5c66b',
};

function sunRays(cx, cy, inner, outer) {
  let s = `<g stroke="${WX.sun}" stroke-width="1.6" stroke-linecap="round">`;
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    s += `<line x1="${(cx + Math.cos(a) * inner).toFixed(1)}" y1="${(cy + Math.sin(a) * inner).toFixed(1)}" x2="${(cx + Math.cos(a) * outer).toFixed(1)}" y2="${(cy + Math.sin(a) * outer).toFixed(1)}"/>`;
  }
  return s + '</g>';
}

function cloud(fill) {
  return `<g fill="${fill}">
    <circle cx="8.5" cy="13" r="3.5"/><circle cx="12.5" cy="11" r="4.5"/>
    <circle cx="16" cy="13.5" r="3.2"/><rect x="7" y="12" width="10" height="5" rx="2.5"/>
  </g>`;
}

const ICON_BUILDERS = {
  'clear-day': () => sunRays(12, 12, 7, 9.5) + `<circle cx="12" cy="12" r="5" fill="${WX.sun}"/>`,
  'clear-night': () => `<path d="M15.5 3 A9 9 0 1 0 21 14.5 A7 7 0 0 1 15.5 3 Z" fill="${WX.moon}"/>`,
  'partly-day': () => sunRays(16.5, 7, 3.4, 5) + `<circle cx="16.5" cy="7" r="3" fill="${WX.sun}"/>` + cloud(WX.cloud),
  'partly-night': () => `<path d="M18.5 3.5 A4 4 0 1 0 20 9.5 A3 3 0 0 1 18.5 3.5 Z" fill="${WX.moon}"/>` + cloud(WX.cloud),
  cloudy: () => cloud(WX.cloud),
  fog: () => cloud(WX.cloud) + `<g stroke="${WX.cloud}" stroke-width="1.6" stroke-linecap="round"><line x1="6" y1="19.5" x2="18" y2="19.5"/><line x1="7.5" y1="22.5" x2="16.5" y2="22.5"/></g>`,
  drizzle: () => cloud(WX.cloud) + `<g fill="${WX.rain}"><circle cx="9" cy="20" r="1"/><circle cx="13" cy="20.5" r="1"/><circle cx="16" cy="20" r="1"/></g>`,
  rain: () => cloud(WX.cloud) + `<g stroke="${WX.rain}" stroke-width="1.7" stroke-linecap="round"><line x1="9" y1="18.5" x2="8" y2="21.5"/><line x1="12.5" y1="18.5" x2="11.5" y2="22"/><line x1="16" y1="18.5" x2="15" y2="21.5"/></g>`,
  snow: () => cloud(WX.cloud) + `<g fill="${WX.snow}"><circle cx="9" cy="20" r="1.2"/><circle cx="13" cy="21" r="1.2"/><circle cx="16" cy="20" r="1.2"/></g>`,
  thunder: () => cloud(WX.cloud) + `<polygon points="13,16.5 9.5,21.5 12,21.5 11,24 15.5,18.5 12.8,18.5" fill="${WX.bolt}"/>`,
};

// Returns an <svg> element. Markup is fully author-controlled (only numeric size
// and fixed colors are interpolated), parsed via DOMParser — no untrusted input.
function weatherIcon(name, size) {
  const build = ICON_BUILDERS[name] || ICON_BUILDERS.cloudy;
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true">${build()}</svg>`;
  return new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
}

// --- Helpers ---

function uvLabel(uv) {
  if (uv == null) return '';
  if (uv <= 2) return 'Low';
  if (uv <= 5) return 'Moderate';
  if (uv <= 7) return 'High';
  if (uv <= 10) return 'Very high';
  return 'Extreme';
}

function timeAgo(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

function setWeatherStatus(text) {
  els.weatherStatus.textContent = text || '';
  els.weatherStatus.classList.toggle('hidden', !text);
}

// --- Rendering ---

function renderHero(d) {
  const c = d.current;
  clearNode(els.weatherHero);
  els.weatherHero.classList.remove('hidden');

  const loc = el('div', 'wx-loc');
  loc.appendChild(el('span', 'wx-pin', '◉'));
  loc.appendChild(document.createTextNode(' My Location'));
  els.weatherHero.appendChild(loc);

  els.weatherHero.appendChild(el('div', 'wx-temp', `${c.temp}°`));
  els.weatherHero.appendChild(el('div', 'wx-cond', c.label));

  const hilo = el('div', 'wx-hilo');
  hilo.appendChild(document.createTextNode(`H:${c.hi}°  `));
  hilo.appendChild(el('span', 'wx-lo', `L:${c.lo}°`));
  els.weatherHero.appendChild(hilo);
}

function renderHourly(d) {
  els.weatherHourlyCard.classList.remove('hidden');
  clearNode(els.weatherHourly);
  d.hourly.forEach((h, i) => {
    const col = el('div', 'wx-hour');
    col.appendChild(el('div', 'wx-h-time', i === 0 ? 'Now' : h.hour));
    const ic = el('div', 'wx-h-ic');
    ic.appendChild(weatherIcon(h.icon, 22));
    col.appendChild(ic);
    col.appendChild(el('div', 'wx-h-temp', `${h.temp}°`));
    col.appendChild(el('div', 'wx-h-pop', h.precipProb >= 10 ? `${h.precipProb}%` : ''));
    els.weatherHourly.appendChild(col);
  });
}

function renderDaily(d) {
  els.weatherDailyCard.classList.remove('hidden');
  clearNode(els.weatherDaily);
  const span = Math.max(1, d.tempRange.max - d.tempRange.min);
  d.daily.forEach((day, i) => {
    const left = ((day.tempMin - d.tempRange.min) / span) * 100;
    const right = ((d.tempRange.max - day.tempMax) / span) * 100;

    const row = el('div', 'wx-day' + (i === 0 ? ' today' : ''));
    row.appendChild(el('div', 'wx-d-name', i === 0 ? 'Today' : day.dayName));
    const ic = el('div', 'wx-d-ic');
    ic.appendChild(weatherIcon(day.icon, 20));
    row.appendChild(ic);
    row.appendChild(el('div', 'wx-d-pop', day.precipProb >= 10 ? `${day.precipProb}%` : ''));
    row.appendChild(el('div', 'wx-d-lo', `${day.tempMin}°`));

    const track = el('div', 'wx-track');
    const seg = el('div', 'wx-seg');
    seg.style.left = `${left.toFixed(1)}%`;
    seg.style.right = `${right.toFixed(1)}%`;
    track.appendChild(seg);
    row.appendChild(track);

    row.appendChild(el('div', 'wx-d-hi', `${day.tempMax}°`));
    els.weatherDaily.appendChild(row);
  });
}

function renderTiles(d) {
  const c = d.current;
  const t = d.daily[0] || {};
  els.weatherTiles.classList.remove('hidden');
  clearNode(els.weatherTiles);
  const tiles = [
    ['Feels like', `${c.apparentTemp}°`, ''],
    ['Humidity', `${c.humidity}%`, ''],
    ['Wind', `${c.windSpeed}`, `${c.windDir} · ${d.units.wind}`],
    ['UV index', t.uvIndexMax != null ? `${t.uvIndexMax}` : '—', uvLabel(t.uvIndexMax)],
    ['Sunrise', t.sunrise || '—', t.sunset ? `Sunset ${t.sunset}` : ''],
    ['Pressure', `${c.pressure}`, 'hPa'],
  ];
  tiles.forEach(([label, val, sub]) => {
    const tile = el('div', 'wx-tile');
    tile.appendChild(el('div', 'wx-t-label', label));
    tile.appendChild(el('div', 'wx-t-val', val));
    tile.appendChild(el('div', 'wx-t-sub', sub));
    els.weatherTiles.appendChild(tile);
  });
}

function renderWeather(d) {
  if (!d || !d.current) return;
  renderHero(d);
  renderHourly(d);
  renderDaily(d);
  renderTiles(d);
  els.weatherUpdated.textContent = d.fetchedAt ? `Updated ${timeAgo(d.fetchedAt)}` : '';
}

// --- Data ---

async function requestWeather(lat, lon) {
  const res = await fetch('/api/weather', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lon }),
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok || data.error) throw new Error(data.error || `Server error ${res.status}`);
  return data;
}

// Show cached weather (if any) plus a note when we can't get a fresh location.
function fallBackToCache(note) {
  const cached = getCachedWeather();
  if (cached) {
    renderWeather(cached);
    setWeatherStatus(`${note} Showing last update.`);
  } else {
    setWeatherStatus(note);
  }
}

function refreshWeather() {
  if (weatherLoading) return;
  if (!navigator.geolocation) {
    fallBackToCache("This browser can't share your location.");
    return;
  }
  weatherLoading = true;
  setWeatherStatus('Locating…');
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const data = await requestWeather(pos.coords.latitude, pos.coords.longitude);
        renderWeather(data);
        setWeatherStatus(data.stale ? "Couldn't reach Open-Meteo — showing last update." : '');
      } catch (e) {
        if (getCachedWeather()) fallBackToCache("Couldn't refresh.");
        else setWeatherStatus(`Couldn't load weather: ${e.message}`);
      } finally {
        weatherLoading = false;
      }
    },
    (err) => {
      weatherLoading = false;
      const denied = err && err.code === err.PERMISSION_DENIED;
      fallBackToCache(denied
        ? 'Location access denied — enable it, then Refresh.'
        : "Couldn't get your location.");
    },
    { timeout: 10000, maximumAge: 10 * 60 * 1000 }
  );
}

function showWeather() {
  hideAllViews();
  els.tabBar.classList.remove('hidden');
  setActiveTab('weather');
  els.weatherView.classList.remove('hidden');
  const cached = getCachedWeather();
  if (cached) renderWeather(cached); // instant paint while we re-fetch
  refreshWeather();
}

// --- Handlers ---

els.btnWeatherRefresh.addEventListener('click', refreshWeather);
