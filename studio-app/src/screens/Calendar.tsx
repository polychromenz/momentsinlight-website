// Calendar: a month at a time as a list of days — wedding and shoot dates (booked filled, leads as
// a ring) and appointments. Tap one to open it; + adds an appointment. /api/studio/crm/calendar.
import { useState, type ReactNode } from 'react';
import { api } from '../api';
import { useNav, useRefresh } from '../nav';
import { Loading, Problem, STAGE, time12, todayIso, useLoad } from '../ui';
import { Appointment } from './Appointment';
import { Client } from './Client';

type Cal = {
  jobs: { id: number; title: string; partner_name: string; job_type: string; stage: string; event_date: string; venue: string; clash: boolean }[];
  appointments: { id: number; job_id: number; title: string; date: string; start_time: string | null; end_time: string | null; location: string; notes: string; job_title: string }[];
};
const pad = (n: number) => String(n).padStart(2, '0');

export function Calendar() {
  const nav = useNav();
  const refresh = useRefresh();
  const today = todayIso();
  const [month, setMonth] = useState(today.slice(0, 7)); // YYYY-MM
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const [data, error, reload] = useLoad(() => api<Cal>(`crm/calendar?from=${month}-01&to=${month}-${pad(last)}`), [month, refresh]);
  const shift = (n: number) => { const d = new Date(y, m - 1 + n, 1); setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); };

  const days: Record<string, { key: string; time: string; node: ReactNode }[]> = {};
  for (const j of data?.jobs ?? []) (days[j.event_date] ??= []).push({ key: `j${j.id}`, time: '', node: (
    <button type="button" className="row" onClick={() => nav.push(<Client id={j.id} />)}>
      <span className={`dot ${j.stage === 'lead' ? 'lead' : ''}`} />
      <span className="row-main"><strong>{j.title}{j.clash ? ' ⚠' : ''}</strong><small>{[j.job_type, j.venue, j.stage === 'booked' ? '' : STAGE[j.stage]].filter(Boolean).join(' · ')}</small></span>
    </button>
  ) });
  for (const a of data?.appointments ?? []) (days[a.date] ??= []).push({ key: `a${a.id}`, time: a.start_time ?? '', node: (
    <button type="button" className="row" onClick={() => nav.push(<Appointment jobId={a.job_id} jobTitle={a.job_title} appt={a} />)}>
      <span className="dot appt" />
      <span className="row-main"><strong>{a.title}</strong><small>{[a.start_time ? `${time12(a.start_time)}${a.end_time ? `–${time12(a.end_time)}` : ''}` : '', a.job_title, a.location].filter(Boolean).join(' · ')}</small></span>
    </button>
  ) });
  const dates = Object.keys(days).sort();
  const label = new Date(y, m - 1, 1).toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' });
  const isThisMonth = month === today.slice(0, 7);

  return (
    <>
      <header className="top">
        <button type="button" className="back" aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
        <div className="top-title" style={{ textAlign: 'center' }}><h1>{label}</h1>{!isThisMonth && <p><button type="button" style={{ border: 0, background: 'none', color: 'var(--green)', padding: 0 }} onClick={() => setMonth(today.slice(0, 7))}>Back to this month</button></p>}</div>
        <button type="button" className="back" aria-label="Next month" style={{ padding: '0 2px 4px 10px' }} onClick={() => shift(1)}>›</button>
      </header>
      {error ? <Problem error={error} retry={reload} /> : !data ? <Loading /> : (
        <section className="card">
          {dates.map((d) => (
            <div key={d}>
              <div className={`day-head${d === today ? ' today' : ''}`}>{new Date(`${d}T12:00:00`).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'short' })}{d === today ? ' · Today' : ''}</div>
              <ul className="list">{days[d].sort((a, b) => a.time.localeCompare(b.time)).map((x) => <li key={x.key}>{x.node}</li>)}</ul>
            </div>
          ))}
          {!dates.length && <p className="empty">Nothing this month.</p>}
        </section>
      )}
      <button type="button" className="fab" aria-label="Add an appointment" onClick={() => nav.push(<Appointment date={isThisMonth ? today : `${month}-01`} />)}>+</button>
    </>
  );
}
