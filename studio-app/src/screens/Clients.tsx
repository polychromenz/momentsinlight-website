// Clients: what's due today (to-dos and emails ready to send), then the clients by stage, with
// search. Data from /api/studio/crm/today (the studio's home screen). + adds a client by hand.
import { useMemo, useState } from 'react';
import { api } from '../api';
import { useNav, useRefresh } from '../nav';
import { Loading, Problem, shortDate, todayIso, useLoad } from '../ui';
import { Client } from './Client';
import { NewClient } from './NewClient';

type Job = { id: number; title: string; job_type: string; stage: string; event_date: string | null; venue: string; created_at: string; email: string; phone: string; test: number };
type Step = { id: number; job_id: number; kind: string; title: string; due_at: string; status: string; job_title: string };
type Today = { mode: string; today: Step[]; upcoming: Step[]; jobs: Job[] };

const SEGS = [
  { key: 'booked', label: 'Booked' },
  { key: 'lead', label: 'Leads' },
  { key: 'past', label: 'Past' },
  { key: 'lost', label: 'Not going ahead' },
] as const;

export function Clients() {
  const nav = useNav();
  const refresh = useRefresh();
  const [data, error, reload] = useLoad(() => api<Today>('crm/today'), [refresh]);
  const [seg, setSeg] = useState<(typeof SEGS)[number]['key']>('booked');
  const [q, setQ] = useState('');
  const today = todayIso();

  const list = useMemo(() => {
    const jobs = (data?.jobs ?? []).filter((j) => !j.test);
    const words = q.trim().toLowerCase();
    if (words) return jobs.filter((j) => `${j.title} ${j.email} ${j.phone} ${j.venue}`.toLowerCase().includes(words)).sort((a, b) => (b.event_date ?? '').localeCompare(a.event_date ?? ''));
    const by = (a: Job, b: Job) => (a.event_date || '9999').localeCompare(b.event_date || '9999');
    if (seg === 'booked') return jobs.filter((j) => j.stage === 'booked' && (!j.event_date || j.event_date >= today)).sort(by);
    if (seg === 'lead') return jobs.filter((j) => j.stage === 'lead').sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (seg === 'past') return jobs.filter((j) => j.stage === 'completed' || (j.stage === 'booked' && j.event_date && j.event_date < today)).sort((a, b) => by(b, a));
    return jobs.filter((j) => j.stage === 'lost').sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [data, seg, q, today]);

  const open = (id: number) => nav.push(<Client id={id} />);
  if (error) return <Problem error={error} retry={reload} />;
  if (!data) return <Loading />;
  return (
    <>
      <header className="top"><div className="top-title"><h1>Clients</h1></div></header>
      {data.mode !== 'live' && <p className="test-mode">Test mode: client emails go to you, not to them.</p>}
      {!!data.today.length && !q && (
        <section className="card">
          <h2>To do now</h2>
          <ul className="list">
            {data.today.map((s) => (
              <li key={s.id}><button type="button" className="row" onClick={() => open(s.job_id)}>
                <span className="row-main"><strong>{s.title}</strong><small>{s.job_title}{s.status === 'failed' ? ' · didn’t send' : ''}</small></span>
                <span className="row-side">{s.due_at < '9000' ? shortDate(s.due_at) : 'Ready'}</span>
              </button></li>
            ))}
          </ul>
        </section>
      )}
      <div className="search-wrap"><input className="search" type="search" placeholder="Search clients…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {!q && <div className="seg">{SEGS.map((s) => <button key={s.key} type="button" className={seg === s.key ? 'on' : ''} onClick={() => setSeg(s.key)}>{s.label}</button>)}</div>}
      <section className="card">
        <ul className="list">
          {list.map((j) => (
            <li key={j.id}><button type="button" className="row" onClick={() => open(j.id)}>
              <span className="row-main"><strong>{j.title}</strong><small>{[j.job_type, j.venue].filter(Boolean).join(' · ') || j.email}</small></span>
              <span className="row-side">{j.event_date ? shortDate(j.event_date) : ''}{j.event_date && j.event_date.slice(0, 4) !== today.slice(0, 4) ? <><br />{j.event_date.slice(0, 4)}</> : null}</span>
            </button></li>
          ))}
          {!list.length && <li className="empty">Nobody here.</li>}
        </ul>
      </section>
      <button type="button" className="fab" aria-label="Add a client" onClick={() => nav.push(<NewClient />)}>+</button>
    </>
  );
}
