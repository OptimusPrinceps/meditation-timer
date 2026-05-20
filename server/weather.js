'use strict';
// ============================================================================
// Weather — fetches Open-Meteo (keyless) and normalizes its response into the
// shape the Weather tab renders. Pure helpers (wmoToCondition, degToCompass,
// normalizeWeather) are unit-tested; fetchWeather is the only networked part.
// No dependencies (Node's built-in global `fetch`).
// ============================================================================

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

const CURRENT_FIELDS = [
  'temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day',
  'weather_code', 'wind_speed_10m', 'wind_direction_10m', 'surface_pressure',
];
const HOURLY_FIELDS = ['temperature_2m', 'weather_code', 'precipitation_probability', 'is_day'];
const DAILY_FIELDS = [
  'weather_code', 'temperature_2m_max', 'temperature_2m_min',
  'precipitation_probability_max', 'sunrise', 'sunset', 'uv_index_max',
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// WMO weather code -> { label, icon }. Icon keys are resolved to SVG client-side.
// Day/night only differ for clear and partly-cloudy skies.
function wmoToCondition(code, isDay) {
  const dn = (day, night) => (isDay ? day : night);
  switch (code) {
    case 0: return { label: 'Clear', icon: dn('clear-day', 'clear-night') };
    case 1: return { label: 'Mainly Clear', icon: dn('partly-day', 'partly-night') };
    case 2: return { label: 'Partly Cloudy', icon: dn('partly-day', 'partly-night') };
    case 3: return { label: 'Cloudy', icon: 'cloudy' };
    case 45: case 48: return { label: 'Fog', icon: 'fog' };
    case 51: case 53: case 55: return { label: 'Drizzle', icon: 'drizzle' };
    case 56: case 57: return { label: 'Freezing Drizzle', icon: 'drizzle' };
    case 61: case 63: case 65: return { label: 'Rain', icon: 'rain' };
    case 66: case 67: return { label: 'Freezing Rain', icon: 'rain' };
    case 71: case 73: case 75: case 77: return { label: 'Snow', icon: 'snow' };
    case 80: case 81: case 82: return { label: 'Showers', icon: 'rain' };
    case 85: case 86: return { label: 'Snow Showers', icon: 'snow' };
    case 95: return { label: 'Thunderstorm', icon: 'thunder' };
    case 96: case 99: return { label: 'Thunderstorm', icon: 'thunder' };
    default: return { label: 'Cloudy', icon: 'cloudy' };
  }
}

function degToCompass(deg) {
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return COMPASS[idx];
}

// 'YYYY-MM-DD' -> local Date (mirrors the browser charts; never UTC).
function parseDateLocal(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const hourOf = (iso) => String(iso).slice(11, 13);   // '2026-05-20T14:00' -> '14'
const hhmm = (iso) => String(iso).slice(11, 16);     // -> '14:00'
const round = (v) => Math.round(Number(v));

// Open-Meteo raw response -> the shape the Weather tab renders. Pure.
function normalizeWeather(raw) {
  const c = raw.current || {};
  const h = raw.hourly || {};
  const d = raw.daily || {};

  const dailyMax = (d.temperature_2m_max || []).map(round);
  const dailyMin = (d.temperature_2m_min || []).map(round);

  const daily = (d.time || []).map((date, i) => {
    const cond = wmoToCondition(d.weather_code[i], true);
    return {
      date,
      dayName: WEEKDAYS[parseDateLocal(date).getDay()],
      code: d.weather_code[i],
      icon: cond.icon,
      label: cond.label,
      tempMax: dailyMax[i],
      tempMin: dailyMin[i],
      precipProb: round(d.precipitation_probability_max[i]),
      sunrise: hhmm(d.sunrise[i]),
      sunset: hhmm(d.sunset[i]),
      uvIndexMax: round(d.uv_index_max[i]),
    };
  });

  // Hourly from the current hour forward (drop already-past hours), capped at 24.
  const times = h.time || [];
  let start = times.findIndex((t) => t >= c.time);
  if (start < 0) start = 0;
  const hourly = [];
  for (let i = start; i < times.length && hourly.length < 24; i++) {
    const cond = wmoToCondition(h.weather_code[i], h.is_day ? !!h.is_day[i] : true);
    hourly.push({
      hour: hourOf(times[i]),
      temp: round(h.temperature_2m[i]),
      code: h.weather_code[i],
      icon: cond.icon,
      label: cond.label,
      precipProb: round(h.precipitation_probability[i]),
    });
  }

  const currentCond = wmoToCondition(c.weather_code, !!c.is_day);
  const today = daily[0] || {};
  const current = {
    temp: round(c.temperature_2m),
    apparentTemp: round(c.apparent_temperature),
    code: c.weather_code,
    icon: currentCond.icon,
    label: currentCond.label,
    isDay: !!c.is_day,
    humidity: round(c.relative_humidity_2m),
    windSpeed: round(c.wind_speed_10m),
    windDir: degToCompass(c.wind_direction_10m),
    pressure: round(c.surface_pressure),
    hi: today.tempMax ?? null,
    lo: today.tempMin ?? null,
  };

  const tempRange = dailyMin.length
    ? { min: Math.min(...dailyMin), max: Math.max(...dailyMax) }
    : { min: 0, max: 0 };

  return {
    timezone: raw.timezone,
    current,
    hourly,
    daily,
    tempRange,
    units: { temp: '°', wind: 'km/h' },
  };
}

// Networked: fetch + normalize. Throws on non-OK or transport error.
async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: CURRENT_FIELDS.join(','),
    hourly: HOURLY_FIELDS.join(','),
    daily: DAILY_FIELDS.join(','),
    timezone: 'auto',
    forecast_days: '10',
    wind_speed_unit: 'kmh',
  });
  const res = await fetch(`${OPEN_METEO_URL}?${params}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);
  const raw = await res.json();
  return normalizeWeather(raw);
}

module.exports = { wmoToCondition, degToCompass, normalizeWeather, fetchWeather };
