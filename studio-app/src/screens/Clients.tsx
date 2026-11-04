// Clients: what's due today (to-dos and emails ready to send), then the clients by stage, with
// search. Leads and booked come from /api/studio/crm/today (the studio's home screen); past and
// not going ahead from /api/studio/crm/people, loaded when first needed. + adds a client by hand.
import { useEffect, useMemo, useState } from 'react';
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
  const [older, setOlder] = useState<{ past?: Job[]; lost?: Job[] }>({});
  const today = todayIso();
  // Past and not going ahead: loaded the first time their tab (or a search) needs them.
  useEffect(() => { setOlder({}); }, [refresh]);
  useEffect(() => {
    const want = (['past', 'lost'] as const).filter((v) => !older[v] && (seg === v || q.trim()));
    for (const v of want) api<{ rows: Job[] }>(`crm/people?view=${v}`).then((d) => setOlder((o) => ({ ...o, [v]: d.rows }))).catch(() => setOlder((o) => ({ ...o, [v]: [] })));
  }, [seg, q, older]);

  const list = useMemo(() => {
    const current = (data?.jobs ?? []).filter((j) => !j.test);
    const past = (older.past ?? []).filter((j) => !j.test);
    const lost = (older.lost ?? []).filter((j) => !j.test);
    const words = q.trim().toLowerCase();
    const by = (a: Job, b: Job) => (a.event_date || '9999').localeCompare(b.event_date || '9999');
    if (words) return [...current, ...past, ...lost].filter((j) => `${j.title} ${j.email} ${j.phone ?? ''} ${j.venue}`.toLowerCase().includes(words)).sort((a, b) => (b.event_date ?? '').localeCompare(a.event_date ?? ''));
    if (seg === 'booked') return current.filter((j) => j.stage === 'booked' && (!j.event_date || j.event_date >= today)).sort(by);
    if (seg === 'lead') return current.filter((j) => j.stage === 'lead').sort((a, b) => b.created_at.localeCompare(a.created_at));
    // Past: completed jobs, and booked ones whose date has gone by (not marked completed yet).
    if (seg === 'past') return [...current.filter((j) => j.stage === 'booked' && j.event_date && j.event_date < today), ...past].sort((a, b) => by(b, a));
    return lost.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [data, older, seg, q, today]);
  const waiting = !q && (seg === 'past' || seg === 'lost') && !older[seg];

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
          {!list.length && <li className="empty">{waiting ? 'Loading…' : 'Nobody here.'}</li>}
        </ul>
      </section>
      <button type="button" className="fab" aria-label="Add a client" onClick={() => nav.push(<NewClient />)}>+</button>
    </>
  );
}
