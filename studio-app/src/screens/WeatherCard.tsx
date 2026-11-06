// The wedding-day weather card, from 7 days before the wedding to the day: the studio's own card
// (src/studio/weather-card.ts, hour by hour plus rain radar), drawn into this screen.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { drawWeather, type Weather } from '../../../src/studio/weather-card';
import { WEATHER_CSS } from '../../../src/studio/weather-card-css';

let styled = false;
const APP_CSS = `
  .wx-app .card-head { padding: 12px 14px 0; margin: 0; }
  .wx-app .card-head h2 { padding: 0; }
  .wx-app .wx-day, .wx-app .wx-sun, .wx-app .wx-pane, .wx-app .wx-foot, .wx-app > p { margin-left: 14px; margin-right: 14px; }
  .wx-app .wx-foot { margin-bottom: 14px; }
  .wx-app .wx-tabs { width: 100%; }
  .wx-app .wx-tabs button { flex: 1; }
  .wx-app .wx-map { height: 300px; }
`;

export function WeatherCard({ jobId, k }: { jobId: number; k: string }) {
  const box = useRef<HTMLElement>(null);
  const [w, setW] = useState<Weather | null>(null);
  useEffect(() => {
    if (!styled) { const s = document.createElement('style'); s.textContent = WEATHER_CSS + APP_CSS; document.head.append(s); styled = true; }
    let live = true;
    api<Weather>(`crm/weather?job=${jobId}`).then((d) => live && setW(d)).catch(() => {});
    return () => { live = false; };
  }, [jobId, k]);
  useEffect(() => { if (w?.due && box.current) drawWeather(box.current, w); }, [w]);
  if (!w?.due) return null;
  return <section ref={box} className="card wx-card wx-app" />;
}
