'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { wmoToCondition, degToCompass, normalizeWeather } = require('../server/weather');

// A small but representative Open-Meteo `/v1/forecast` response (timezone=auto).
const RAW = {
  timezone: 'Europe/London',
  current: {
    time: '2026-05-20T14:00',
    temperature_2m: 14.3,
    relative_humidity_2m: 78,
    apparent_temperature: 12.6,
    is_day: 1,
    weather_code: 2,
    wind_speed_10m: 11.5,
    wind_direction_10m: 225,
    surface_pressure: 1013.2,
  },
  hourly: {
    time: ['2026-05-20T13:00', '2026-05-20T14:00', '2026-05-20T15:00', '2026-05-20T16:00'],
    temperature_2m: [15.0, 14.3, 16.1, 15.2],
    weather_code: [2, 2, 3, 61],
    precipitation_probability: [0, 10, 20, 60],
    is_day: [1, 1, 1, 1],
  },
  daily: {
    time: ['2026-05-20', '2026-05-21', '2026-05-22'],
    weather_code: [2, 61, 61],
    temperature_2m_max: [17.2, 14.4, 15.1],
    temperature_2m_min: [9.1, 8.3, 7.6],
    precipitation_probability_max: [10, 70, 55],
    sunrise: ['2026-05-20T05:18', '2026-05-21T05:17', '2026-05-22T05:16'],
    sunset: ['2026-05-20T20:46', '2026-05-21T20:48', '2026-05-22T20:49'],
    uv_index_max: [2.1, 3.4, 4.0],
  },
};

test('wmoToCondition maps codes to label + icon, with day/night variants', () => {
  assert.deepStrictEqual(wmoToCondition(0, true), { label: 'Clear', icon: 'clear-day' });
  assert.deepStrictEqual(wmoToCondition(0, false), { label: 'Clear', icon: 'clear-night' });
  assert.strictEqual(wmoToCondition(2, true).icon, 'partly-day');
  assert.strictEqual(wmoToCondition(2, false).icon, 'partly-night');
  assert.strictEqual(wmoToCondition(3, true).icon, 'cloudy');
  assert.strictEqual(wmoToCondition(45, true).icon, 'fog');
  assert.strictEqual(wmoToCondition(61, true).label, 'Rain');
  assert.strictEqual(wmoToCondition(71, true).icon, 'snow');
  assert.strictEqual(wmoToCondition(95, true).icon, 'thunder');
  // Unknown code falls back to cloudy, never throws.
  assert.strictEqual(wmoToCondition(999, true).icon, 'cloudy');
});

test('degToCompass returns 8-point compass labels', () => {
  assert.strictEqual(degToCompass(0), 'N');
  assert.strictEqual(degToCompass(90), 'E');
  assert.strictEqual(degToCompass(180), 'S');
  assert.strictEqual(degToCompass(225), 'SW');
  assert.strictEqual(degToCompass(359), 'N');
});

test('normalizeWeather builds current block with rounded values and today hi/lo', () => {
  const n = normalizeWeather(RAW);
  assert.strictEqual(n.timezone, 'Europe/London');
  assert.strictEqual(n.current.temp, 14);
  assert.strictEqual(n.current.apparentTemp, 13);
  assert.strictEqual(n.current.humidity, 78);
  assert.strictEqual(n.current.windSpeed, 12);
  assert.strictEqual(n.current.windDir, 'SW');
  assert.strictEqual(n.current.pressure, 1013);
  assert.strictEqual(n.current.label, 'Partly Cloudy');
  assert.strictEqual(n.current.icon, 'partly-day');
  assert.strictEqual(n.current.isDay, true);
  assert.strictEqual(n.current.hi, 17); // daily[0] max
  assert.strictEqual(n.current.lo, 9);  // daily[0] min
});

test('normalizeWeather slices hourly from the current hour forward', () => {
  const n = normalizeWeather(RAW);
  // current.time is 14:00, so the 13:00 entry is dropped.
  assert.strictEqual(n.hourly.length, 3);
  assert.strictEqual(n.hourly[0].hour, '14');
  assert.strictEqual(n.hourly[0].temp, 14);
  assert.strictEqual(n.hourly[2].hour, '16');
  assert.strictEqual(n.hourly[2].precipProb, 60);
  assert.strictEqual(n.hourly[2].icon, 'rain');
});

test('normalizeWeather builds 10-day rows and a temp range across days', () => {
  const n = normalizeWeather(RAW);
  assert.strictEqual(n.daily.length, 3);
  assert.strictEqual(n.daily[0].date, '2026-05-20');
  assert.strictEqual(n.daily[0].dayName, 'Wed'); // 2026-05-20 is a Wednesday
  assert.strictEqual(n.daily[0].tempMax, 17);
  assert.strictEqual(n.daily[0].tempMin, 9);
  assert.strictEqual(n.daily[0].sunrise, '05:18');
  assert.strictEqual(n.daily[0].sunset, '20:46');
  assert.strictEqual(n.daily[0].uvIndexMax, 2);
  // range over rounded daily mins/maxes: mins 9,8,8 -> 8; maxes 17,14,15 -> 17
  assert.deepStrictEqual(n.tempRange, { min: 8, max: 17 });
});
