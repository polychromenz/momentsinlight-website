// The wedding-day weather card (client page; the portal later): hour-by-hour forecast for the venue
// from Open-Meteo (free, no key; it picks the best models for NZ), plus sunrise, sunset and golden
// hour worked out from the sun's height. The rain radar is drawn in the browser (RainViewer tiles).
// Forecasts are kept in the edge cache for 30 minutes.

/** NZ date today, as YYYY-MM-DD. */
export const nzToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
/** Days from today (NZ) to the date: 0 = today. */
export const daysUntil = (date) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${nzToday()}T00:00:00Z`)) / 86400000);
/** The card shows from 7 days before the wedding to the day itself. */
export const weatherDue = (date) => !!date && daysUntil(date) >= 0 && daysUntil(date) <= 7;

// WMO weather codes → words and a picture.
const CODES = [
  [[0], 'Clear', '☀️'], [[1], 'Mostly clear', '🌤️'], [[2], 'Partly cloudy', '⛅'], [[3], 'Cloudy', '☁️'],
  [[45, 48], 'Fog', '🌫️'], [[51, 53, 55, 56, 57], 'Drizzle', '🌦️'], [[61, 63, 66, 80, 81], 'Rain', '🌧️'],
  [[65, 67, 82], 'Heavy rain', '🌧️'], [[71, 73, 75, 77, 85, 86], 'Snow', '🌨️'], [[95, 96, 99], 'Thunderstorms', '⛈️'],
];
const describe = (code, night) => {
  const c = CODES.find(([n]) => n.includes(code)) ?? [[], 'Unknown', '·'];
  return { label: c[1], icon: night && code <= 1 ? '🌙' : night && code === 2 ? '☁️' : c[2] };
};

/** The sun's height above the horizon (degrees) at a moment, at a place (NOAA's short formula). */
export function sunElevation(ms, lat, lng) {
  const rad = Math.PI / 180;
  const d = ms / 86400000 - 10957.5; // days from 1 Jan 2000, noon UTC
  const g = (357.529 + 0.98560028 * d) * rad;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;
  const ha = (gmst * 15 + lng) * rad - ra;
  return Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha)) / rad;
}

/** Sunrise, sunset and the golden hours (sun between 6° up and 4° down) on a local date, as HH:MM. */
export function sunTimes(date, lat, lng, offsetSec) {
  const start = Date.parse(`${date}T00:00:00Z`) - offsetSec * 1000;
  const hhmm = (ms) => new Date(ms + offsetSec * 1000).toISOString().slice(11, 16);
  const cross = {};
  let prev = sunElevation(start, lat, lng);
  for (let m = 1; m <= 1440; m++) {
    const t = start + m * 60000;
    const el = sunElevation(t, lat, lng);
    for (const [name, lvl] of [['g', 6], ['r', -0.833], ['b', -4]]) {
      if (prev < lvl && el >= lvl) cross[`${name}Up`] ??= hhmm(t);
      if (prev >= lvl && el < lvl) cross[`${name}Down`] ??= hhmm(t);
    }
    prev = el;
  }
  return {
    sunrise: cross.rUp ?? null, sunset: cross.rDown ?? null,
    morning: cross.bUp && cross.gUp ? [cross.bUp, cross.gUp] : null,
    evening: cross.gDown && cross.bDown ? [cross.gDown, cross.bDown] : null,
  };
}

/** If Google can't place the venue: the town in its address, from Open-Meteo's place names (NZ only).
 *  Tries the parts after the first ("Venue, Kumeu, Auckland" → Kumeu, then Auckland), then the first. */
export async function townOf(text) {
  const parts = String(text ?? '').replace(/,?\s*New Zealand$/i, '').split(',').map((p) => p.replace(/\d+/g, '').trim()).filter((p) => p.length > 2);
  for (const name of [...parts.slice(1), parts[0]].filter(Boolean)) {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&countryCode=NZ&language=en`).catch(() => null);
    const p = r?.ok ? (await r.json()).results?.[0] : null;
    if (p) return { lat: p.latitude, lng: p.longitude, name: p.name };
  }
  return null;
}

/** The forecast for one day at a place: { hours: [...], day: {...}, sun: {...}, updated }. */
export async function forecast(date, lat, lng) {
  const la = lat.toFixed(3); const ln = lng.toFixed(3);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(`https://cache.momentsinlight.internal/weather?d=${date}&la=${la}&ln=${ln}`);
  const hit = await cache?.match(key);
  if (hit) return hit.json();
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.search = new URLSearchParams({
    latitude: la, longitude: ln, timezone: 'Pacific/Auckland', start_date: date, end_date: date, wind_speed_unit: 'kmh',
    hourly: 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,cloud_cover,is_day',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,weather_code,uv_index_max',
  }).toString();
  const r = await fetch(u, { headers: { 'user-agent': 'MomentsInLightStudio/1.0' } });
  if (!r.ok) throw new Error(`The weather service said ${r.status}.`);
  const w = await r.json();
  const h = w.hourly;
  const hours = h.time.map((t, i) => ({
    time: t.slice(11, 16), temp: Math.round(h.temperature_2m[i]), feels: Math.round(h.apparent_temperature[i]),
    rainChance: h.precipitation_probability[i], rain: h.precipitation[i], wind: Math.round(h.wind_speed_10m[i]), gust: Math.round(h.wind_gusts_10m[i]),
    dir: h.wind_direction_10m[i], cloud: h.cloud_cover[i], ...describe(h.weather_code[i], !h.is_day[i]),
  }));
  const dl = w.daily;
  const day = {
    max: Math.round(dl.temperature_2m_max[0]), min: Math.round(dl.temperature_2m_min[0]), rain: dl.precipitation_sum[0],
    rainChance: dl.precipitation_probability_max[0], gust: Math.round(dl.wind_gusts_10m_max[0]), uv: dl.uv_index_max[0], ...describe(dl.weather_code[0], false),
  };
  const out = { hours, day, sun: sunTimes(date, lat, lng, w.utc_offset_seconds), updated: new Date().toISOString() };
  await cache?.put(key, new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=1800' } }));
  return out;
}
