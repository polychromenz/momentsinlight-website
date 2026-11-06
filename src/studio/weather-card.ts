// The wedding-day weather card: hour by hour at the venue, sunrise / golden hour / sunset, and a
// rain radar (RainViewer's last two hours over OpenStreetMap, animated). Data from
// functions-lib/weather.js. Used on the client page; written to be reused on the portal later.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Hour = { time: string; temp: number; feels: number; rainChance: number; rain: number; wind: number; gust: number; dir: number; cloud: number; label: string; icon: string };
export type Weather = {
  due: boolean; error?: string; date: string; days: number; event_time: string | null;
  place: { name: string; lat: number; lng: number };
  hours: Hour[]; day: { max: number; min: number; rain: number; rainChance: number; gust: number; uv: number; label: string; icon: string };
  sun: { sunrise: string | null; sunset: string | null; morning: [string, string] | null; evening: [string, string] | null };
  updated: string;
};

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const ampm = (hhmm: string | null) => {
  if (!hhmm) return '–';
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
};
const mins = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const inRange = (hour: string, r: [string, string] | null) => !!r && mins(hour) + 59 >= mins(r[0]) && mins(hour) <= mins(r[1]);
const compass = (deg: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
const when = (days: number) => (days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`);

/** Draw the card into `el` from the weather data. Returns nothing; the radar starts when its tab opens. */
export function drawWeather(el: HTMLElement, w: Weather, { couple = false }: { couple?: boolean } = {}) {
  if (w.error) { el.innerHTML = `<div class="card-head"><h2>Wedding-day weather</h2></div><p class="wx-note">${esc(w.error)}</p>`; return; }
  const dayName = new Date(`${w.date}T12:00:00Z`).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const eventHour = w.event_time ? `${w.event_time.slice(0, 2)}:00` : null;
  // From 6am (or an hour before an early start) to 11pm.
  const from = Math.min(6, eventHour ? Number(eventHour.slice(0, 2)) - 1 : 6);
  const hours = w.hours.filter((h) => Number(h.time.slice(0, 2)) >= from);
  const maxRain = Math.max(1, ...hours.map((h) => h.rain));
  el.innerHTML = `
    <div class="card-head wx-head">
      <div><h2>Wedding-day weather</h2><p class="wx-sub">${when(w.days)} · ${esc(dayName)} · ${esc(w.place.name)}</p></div>
      <div class="wx-tabs" role="tablist">
        <button type="button" role="tab" aria-selected="true" data-wx="hours">Hour by hour</button>
        <button type="button" role="tab" aria-selected="false" data-wx="radar">Rain radar</button>
      </div>
    </div>
    <div class="wx-day">
      <span class="wx-big">${w.day.icon}</span>
      <div><strong>${esc(w.day.label)}</strong><span>${w.day.max}° / ${w.day.min}°</span></div>
      <div><strong>${w.day.rainChance ?? 0}%</strong><span>chance of rain${w.day.rain ? ` · ${w.day.rain} mm` : ''}</span></div>
      <div><strong>${w.day.gust} km/h</strong><span>strongest gusts</span></div>
      <div><strong>UV ${Math.round(w.day.uv ?? 0)}</strong><span>highest</span></div>
    </div>
    <div class="wx-sun">
      <span>🌅 Sunrise <b>${ampm(w.sun.sunrise)}</b></span>
      ${w.sun.morning ? `<span class="wx-gold">Golden hour <b>${ampm(w.sun.morning[0])}–${ampm(w.sun.morning[1])}</b></span>` : ''}
      ${w.sun.evening ? `<span class="wx-gold">Golden hour <b>${ampm(w.sun.evening[0])}–${ampm(w.sun.evening[1])}</b></span>` : ''}
      <span>🌇 Sunset <b>${ampm(w.sun.sunset)}</b></span>
    </div>
    <div class="wx-pane" data-pane="hours">
      <div class="wx-hours">${hours.map((h) => `
        <div class="wx-h${h.time === eventHour ? ' is-event' : ''}${inRange(h.time, w.sun.evening) || inRange(h.time, w.sun.morning) ? ' is-gold' : ''}" title="${esc(h.label)} · feels like ${h.feels}° · cloud ${h.cloud}% · wind ${h.wind} km/h from the ${compass(h.dir)}, gusts ${h.gust}">
          <span class="wx-t">${h.time === eventHour ? 'Start' : ampm(h.time)}</span>
          <span class="wx-i">${h.icon}</span>
          <span class="wx-temp">${h.temp}°</span>
          <span class="wx-bar"><i style="height:${Math.round((h.rain / maxRain) * 100)}%"></i></span>
          <span class="wx-pop${h.rainChance >= 50 ? ' hi' : ''}">${h.rainChance ?? 0}%</span>
          <span class="wx-mm">${h.rain ? `${h.rain} mm` : ''}</span>
          <span class="wx-wind">${h.wind}<small>${compass(h.dir)}</small></span>
        </div>`).join('')}
      </div>
      <p class="wx-key"><span class="k-gold"></span> golden hour${eventHour ? ` <span class="k-event"></span> ${couple ? 'your' : 'their'} start time` : ''} · rain chance %, rain mm, wind km/h</p>
    </div>
    <div class="wx-pane" data-pane="radar" hidden>
      <div class="wx-map"></div>
      <div class="wx-radar-bar"><button type="button" class="wx-play" data-wx-play>❚❚ Pause</button><span class="wx-frame-time"></span><span class="wx-note">Last 2 hours, every 10 minutes</span></div>
    </div>
    <p class="wx-foot">Forecast from Open-Meteo, checked ${new Date(w.updated).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit', timeZone: 'Pacific/Auckland' })}.${w.days > 3 ? ' More than 3 days out, it can still change a lot.' : ''}</p>`;

  let radar: { stop: () => void } | null = null;
  el.querySelector('.wx-tabs')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-wx]');
    if (!b) return;
    el.querySelectorAll<HTMLElement>('[data-wx]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    el.querySelectorAll<HTMLElement>('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.wx; });
    if (b.dataset.wx === 'radar' && !radar) radar = startRadar(el, w.place);
  });
}

/** The radar map: OpenStreetMap with RainViewer's recent frames on top, played on a loop. */
function startRadar(el: HTMLElement, place: Weather['place']) {
  const box = el.querySelector<HTMLElement>('.wx-map')!;
  const label = el.querySelector<HTMLElement>('.wx-frame-time')!;
  const playBtn = el.querySelector<HTMLButtonElement>('[data-wx-play]')!;
  const map = L.map(box, { zoomControl: true, attributionControl: true, minZoom: 5, maxZoom: 11 }).setView([place.lat, place.lng], 8);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 11, attribution: '© OpenStreetMap' }).addTo(map);
  L.circleMarker([place.lat, place.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#5a5e3b', fillOpacity: 1 }).addTo(map).bindTooltip(place.name);
  map.attributionControl.addAttribution('Radar © RainViewer');
  let timer = 0; let playing = true; let i = 0;
  const layers: L.TileLayer[] = [];
  fetch('https://api.rainviewer.com/public/weather-maps.json').then((r) => r.json()).then((d) => {
    const frames: { time: number; path: string }[] = [...(d.radar?.past ?? []), ...(d.radar?.nowcast ?? [])];
    if (!frames.length) { label.textContent = 'No radar right now.'; return; }
    for (const f of frames) {
      // RainViewer serves radar up to zoom 7; closer in, the zoom-7 picture is enlarged.
      layers.push(L.tileLayer(`${d.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`, { opacity: 0, maxNativeZoom: 7, maxZoom: 11, zIndex: 10 }).addTo(map));
    }
    const show = (n: number) => {
      layers.forEach((l, k) => l.setOpacity(k === n ? 0.75 : 0));
      label.textContent = new Date(frames[n].time * 1000).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit', timeZone: 'Pacific/Auckland' });
    };
    i = frames.length - 1; show(i);
    const tick = () => { i = (i + 1) % frames.length; show(i); timer = window.setTimeout(tick, i === frames.length - 1 ? 1800 : 600); };
    timer = window.setTimeout(tick, 1200);
    playBtn.addEventListener('click', () => {
      playing = !playing; playBtn.textContent = playing ? '❚❚ Pause' : '▶ Play';
      if (playing) tick(); else { clearTimeout(timer); i = frames.length - 1; show(i); }
    });
  }).catch(() => { label.textContent = 'The radar isn’t available right now.'; });
  setTimeout(() => map.invalidateSize(), 50);
  return { stop: () => { clearTimeout(timer); map.remove(); } };
}
