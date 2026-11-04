// One client (a job): call, text, email or map them, and four tabs — Details (editable, with their
// appointments), Emails (read and reply), To-dos (tick off, or review and send a ready email) and
// Money (quotes, contracts and invoices, to look at). Data from /api/studio/crm/job.
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useNav, useRefresh } from '../nav';
import { Loading, longDate, money, Problem, shortDate, STAGE, time12, toast, Top, useLoad, when } from '../ui';
import { Appointment } from './Appointment';
import { Compose } from './Compose';
import { EmailView } from './EmailView';
import { PdfView } from './PdfView';

export type JobData = {
  mode: string;
  job: Record<string, any> & { id: number; title: string; stage: string; job_type: string; first_name: string; last_name: string; email: string; phone: string; partner_name: string; event_date: string | null; event_time: string | null; venue: string; venue_address: string; notes: string };
  steps: { id: number; kind: string; title: string; template_key: string | null; due_at: string; status: string; done_at: string | null; note: string }[];
  messages: { id: number; direction: string; subject: string; body: string; sent_at: string; attachments: string | null }[];
  quotes: { id: number; status: string; total: number; sent_at: string | null; accepted_at: string | null; created_at: string }[];
  contracts: { id: number; name: string; status: string; signed_name: string | null; signed_at: string | null }[];
  invoices: { id: number; number: string; label: string; amount: number; due_date: string; status: string; paid_at: string | null; paid_method: string | null }[];
  appointments: { id: number; title: string; date: string; start_time: string | null; end_time: string | null; location: string; notes: string }[];
};
const OPEN = ['scheduled', 'due', 'failed'];
const TABS = ['Details', 'Emails', 'To-dos', 'Money'] as const;

export function Client({ id }: { id: number }) {
  const nav = useNav();
  const refresh = useRefresh();
  const [data, error, reload] = useLoad(() => api<JobData>(`crm/job?id=${id}`), [id, refresh]);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Details');
  if (error) return <><Top title="Client" /><Problem error={error} retry={reload} /></>;
  if (!data) return <><Top title="Client" /><Loading /></>;
  const j = data.job;
  const tel = (j.phone || '').replace(/[^\d+]/g, '');
  const place = j.venue_address || j.venue;
  const openSteps = data.steps.filter((s) => OPEN.includes(s.status)).length;
  return (
    <>
      <Top title={j.title} sub={[j.job_type, j.event_date ? longDate(j.event_date) : '', STAGE[j.stage]].filter(Boolean).join(' · ')} />
      <div className="actions">
        <a href={tel ? `tel:${tel}` : undefined} className={tel ? '' : 'off'}><span>✆</span>Call</a>
        <a href={tel ? `sms:${tel}` : undefined} className={tel ? '' : 'off'}><span>✉︎</span>Text</a>
        <button type="button" onClick={() => nav.push(<Compose jobId={id} />)}><span>✎</span>Email</button>
        <a href={place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` : undefined} className={place ? '' : 'off'} target="_blank" rel="noreferrer"><span>⌖</span>Map</a>
      </div>
      <div className="seg" style={{ paddingTop: 0 }}>
        {TABS.map((t) => <button key={t} type="button" className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}{t === 'To-dos' && openSteps ? ` (${openSteps})` : ''}</button>)}
      </div>
      {tab === 'Details' && <Details data={data} saved={reload} />}
      {tab === 'Emails' && <Emails data={data} />}
      {tab === 'To-dos' && <Todos data={data} changed={reload} />}
      {tab === 'Money' && <Money data={data} />}
    </>
  );
}

function Details({ data, saved }: { data: JobData; saved: () => void }) {
  const nav = useNav();
  const j = data.job;
  const pick = () => ({ first_name: j.first_name ?? '', last_name: j.last_name ?? '', partner_name: j.partner_name ?? '', email: j.email ?? '', phone: j.phone ?? '', stage: j.stage, event_date: j.event_date ?? '', event_time: j.event_time ?? '', venue: j.venue ?? '', venue_address: j.venue_address ?? '', notes: j.notes ?? '' });
  const [f, setF] = useState(pick);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(pick()), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(f) !== JSON.stringify(pick());
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  async function save() {
    setBusy(true);
    try {
      await api('crm/job', { method: 'PUT', body: { id: j.id, ...f } });
      toast('Saved.');
      saved();
    } catch (e) { toast((e as Error).message, true); }
    setBusy(false);
  }
  return (
    <>
      <section className="card">
        <h2>Appointments</h2>
        <ul className="list">
          {data.appointments.map((a) => (
            <li key={a.id}><button type="button" className="row" onClick={() => nav.push(<Appointment jobId={j.id} jobTitle={j.title} appt={a} />)}>
              <span className="row-main"><strong>{a.title}</strong><small>{longDate(a.date)}{a.start_time ? ` · ${time12(a.start_time)}` : ''}{a.location ? ` · ${a.location}` : ''}</small></span><span className="chev">›</span>
            </button></li>
          ))}
          <li><button type="button" className="row" onClick={() => nav.push(<Appointment jobId={j.id} jobTitle={j.title} />)}><span className="row-main" style={{ color: 'var(--green)', fontWeight: 600 }}>+ Add an appointment</span></button></li>
        </ul>
      </section>
      <section className="card form">
        <label>Stage<select value={f.stage} onChange={set('stage')}>{Object.entries(STAGE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <div className="two"><label>First name<input value={f.first_name} onChange={set('first_name')} /></label><label>Last name<input value={f.last_name} onChange={set('last_name')} /></label></div>
        <label>Partner<input value={f.partner_name} onChange={set('partner_name')} /></label>
        <label>Email<input type="email" value={f.email} onChange={set('email')} /></label>
        <label>Phone<input type="tel" value={f.phone} onChange={set('phone')} /></label>
        <div className="two"><label>Date<input type="date" value={f.event_date} onChange={set('event_date')} /></label><label>Time<input type="time" value={f.event_time} onChange={set('event_time')} /></label></div>
        <label>Venue<input value={f.venue} onChange={set('venue')} /></label>
        <label>Venue address<input value={f.venue_address} onChange={set('venue_address')} /></label>
        <label>Notes<textarea value={f.notes} onChange={set('notes')} /></label>
      </section>
      {dirty && <div className="bar"><button type="button" className="btn" onClick={() => setF(pick())}>Undo</button><button type="button" className="btn solid" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></div>}
    </>
  );
}

function Emails({ data }: { data: JobData }) {
  const nav = useNav();
  return (
    <section className="card">
      <ul className="list">
        <li><button type="button" className="row" onClick={() => nav.push(<Compose jobId={data.job.id} />)}><span className="row-main" style={{ color: 'var(--green)', fontWeight: 600 }}>✎ Write an email</span></button></li>
        {data.messages.map((m) => (
          <li key={m.id}><button type="button" className="row" onClick={() => nav.push(<EmailView jobId={data.job.id} message={m} />)}>
            <span className={`dir ${m.direction}`}>{m.direction === 'in' ? 'From them' : 'Sent'}</span>
            <span className="row-main"><strong>{m.subject || '(no subject)'}</strong><small>{when(m.sent_at)}</small></span>
          </button></li>
        ))}
        {!data.messages.length && <li className="empty">No emails yet.</li>}
      </ul>
    </section>
  );
}

function Todos({ data, changed }: { data: JobData; changed: () => void }) {
  const nav = useNav();
  const open = data.steps.filter((s) => OPEN.includes(s.status)).sort((a, b) => a.due_at.localeCompare(b.due_at));
  const done = data.steps.filter((s) => !OPEN.includes(s.status) && s.status !== 'sending').sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''));
  async function act(id: number, action: 'done' | 'reopen') {
    try { await api('crm/step', { body: { id, action } }); changed(); } catch (e) { toast((e as Error).message, true); }
  }
  const due = (s: { due_at: string }) => (s.due_at >= '9000' ? 'When ready' : shortDate(s.due_at));
  return (
    <>
      <section className="card">
        <h2>Coming up</h2>
        <ul className="list">
          {open.map((s) => (
            <li key={s.id} className="row">
              {s.kind === 'todo'
                ? <input type="checkbox" aria-label="Done" style={{ width: 24, height: 24, accentColor: 'var(--green)' }} onChange={() => act(s.id, 'done')} />
                : <span style={{ width: 24, textAlign: 'center' }}>✉︎</span>}
              <span className="row-main"><strong>{s.title}</strong><small>{due(s)}{s.status === 'failed' ? ` · didn’t send${s.note ? `: ${s.note}` : ''}` : ''}</small></span>
              {s.template_key && <button type="button" className="btn" style={{ minHeight: 36, padding: '4px 12px' }} onClick={() => nav.push(<Compose jobId={data.job.id} step={s} />)}>Send…</button>}
            </li>
          ))}
          {!open.length && <li className="empty">Nothing planned.</li>}
        </ul>
      </section>
      {!!done.length && (
        <section className="card">
          <h2>Done</h2>
          <ul className="list">
            {done.map((s) => (
              <li key={s.id} className="row">
                <span className="row-main"><strong style={{ fontWeight: 400 }}>{s.title}</strong><small>{s.status === 'skipped' ? 'Skipped' : 'Done'} {shortDate(s.done_at)}{s.note ? ` · ${s.note}` : ''}</small></span>
                {s.kind === 'todo' && <button type="button" className="btn" style={{ minHeight: 34, padding: '2px 10px', fontWeight: 400 }} onClick={() => act(s.id, 'reopen')}>Undo</button>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Money({ data }: { data: JobData }) {
  const nav = useNav();
  const who = data.job.title;
  const owing = data.invoices.filter((i) => i.status !== 'paid' && i.status !== 'void').reduce((n, i) => n + Number(i.amount || 0), 0);
  const paid = data.invoices.filter((i) => i.status === 'paid').reduce((n, i) => n + Number(i.amount || 0), 0);
  // Tap one to see its PDF (the same one the studio makes); a paid invoice also has its receipt.
  const pdf = (title: string, path: string, fileName: string) => nav.push(<PdfView title={title} sub={who} path={path} fileName={fileName} />);
  const slim = { minHeight: 34, padding: '2px 10px', fontWeight: 400 };
  return (
    <>
      <section className="card pad"><strong>{money(paid)}</strong> paid · <strong>{money(owing)}</strong> to come<p className="small muted" style={{ margin: '4px 0 0' }}>Tap one to see it. To change money, use the studio on a computer.</p></section>
      <section className="card">
        <h2>Invoices</h2>
        <ul className="list">
          {data.invoices.map((i) => (
            <li key={i.id} className="row">
              <button type="button" className="row-main" style={{ border: 0, background: 'none', padding: 0, textAlign: 'left' }} onClick={() => pdf(`Invoice ${i.number}`, `crm/invoice?id=${i.id}&pdf=1`, `Invoice ${i.number}.pdf`)}>
                <strong>{i.label || `Invoice ${i.number}`}</strong><small>{i.status === 'paid' ? `Paid ${shortDate(i.paid_at)}${i.paid_method ? ` · ${i.paid_method}` : ''}` : `Due ${longDate(i.due_date)} · ${i.status}`}</small>
              </button>
              <span className="row-side">{money(i.amount)}</span>
              {i.status === 'paid' && <button type="button" className="btn" style={slim} onClick={() => pdf(`Receipt ${i.number}`, `crm/invoice?id=${i.id}&pdf=1&receipt=1`, `Receipt ${i.number}.pdf`)}>Receipt</button>}
            </li>
          ))}
          {!data.invoices.length && <li className="empty">No invoices.</li>}
        </ul>
      </section>
      <section className="card">
        <h2>Quotes and contracts</h2>
        <ul className="list">
          {data.quotes.map((q) => (
            <li key={`q${q.id}`}><button type="button" className="row" onClick={() => pdf('Quote', `crm/contract?quote=${q.id}&pdf=1`, `Quote ${q.id}.pdf`)}>
              <span className="row-main"><strong>Quote</strong><small>{q.accepted_at ? `Accepted ${shortDate(q.accepted_at)}` : q.sent_at ? `Sent ${shortDate(q.sent_at)}` : q.status}</small></span><span className="row-side">{money(q.total)}</span><span className="chev">›</span>
            </button></li>
          ))}
          {data.contracts.map((c) => (
            <li key={`c${c.id}`}><button type="button" className="row" onClick={() => pdf(c.name || 'Contract', `crm/contract?id=${c.id}&pdf=1`, `${(c.name || 'Contract').replace(/[\/:*?"<>|]/g, '')}${c.signed_at ? ' (signed)' : ''}.pdf`)}>
              <span className="row-main"><strong>{c.name || 'Contract'}</strong><small>{c.signed_at ? `Signed by ${c.signed_name} ${shortDate(c.signed_at)}` : c.status}</small></span><span className="chev">›</span>
            </button></li>
          ))}
          {!data.quotes.length && !data.contracts.length && <li className="empty">None yet.</li>}
        </ul>
      </section>
    </>
  );
}
