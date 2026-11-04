// Adding a client by hand (an enquiry by phone, Facebook or in person), as in the studio:
// POST /api/studio/crm/job. Nothing is sent unless "Start the workflow" is ticked.
import { useState } from 'react';
import { api } from '../api';
import { useNav } from '../nav';
import { toast, Top, useLoad } from '../ui';
import { Client } from './Client';

type Lists = { job_type: { value: string; workflow: string | null }[]; lead_source: { value: string }[]; workflows: { key: string; name: string }[] };

export function NewClient() {
  const nav = useNav();
  const [lists] = useLoad(() => api<Lists>('crm/settings'), []);
  const [f, setF] = useState({ first_name: '', last_name: '', partner_name: '', email: '', phone: '', job_type: 'Wedding', event_date: '', event_time: '', venue: '', lead_source: '', notes: '', stage: 'lead' });
  const [workflow, setWorkflow] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const type = lists?.job_type.find((t) => t.value === f.job_type);
  const flow = lists?.workflows.find((w) => w.key === type?.workflow);

  async function save() {
    if (!f.first_name.trim()) { toast('It needs at least a first name.', true); return; }
    setBusy(true);
    try {
      const r = await api<{ id: number; clashes?: { title: string }[] }>('crm/job', { body: { ...f, workflow: workflow && !!flow } });
      if (r.clashes?.length) toast(`Added. Same date as ${r.clashes.map((c) => c.title).join(', ')}.`);
      else toast('Added.');
      nav.pop({ changed: true });
      nav.push(<Client id={r.id} />);
    } catch (e) { toast((e as Error).message, true); setBusy(false); }
  }
  return (
    <>
      <Top title="Add a client" sub="An enquiry by phone, Facebook or in person" />
      <section className="card form">
        <div className="two"><label>First name<input value={f.first_name} onChange={set('first_name')} /></label><label>Last name<input value={f.last_name} onChange={set('last_name')} /></label></div>
        <label>Partner<input value={f.partner_name} onChange={set('partner_name')} /></label>
        <label>Email<input type="email" value={f.email} onChange={set('email')} /></label>
        <label>Phone<input type="tel" value={f.phone} onChange={set('phone')} /></label>
        <div className="two">
          <label>Type<select value={f.job_type} onChange={set('job_type')}>{(lists?.job_type ?? [{ value: 'Wedding' }]).map((t) => <option key={t.value}>{t.value}</option>)}</select></label>
          <label>Stage<select value={f.stage} onChange={set('stage')}><option value="lead">Lead</option><option value="booked">Booked</option></select></label>
        </div>
        <div className="two"><label>Date<input type="date" value={f.event_date} onChange={set('event_date')} /></label><label>Time<input type="time" value={f.event_time} onChange={set('event_time')} /></label></div>
        <label>Venue<input value={f.venue} onChange={set('venue')} /></label>
        <label>Found us through<select value={f.lead_source} onChange={set('lead_source')}><option value="">Choose…</option>{(lists?.lead_source ?? []).map((s) => <option key={s.value}>{s.value}</option>)}</select></label>
        <label>Notes<textarea value={f.notes} onChange={set('notes')} /></label>
        {flow && <label className="check"><input type="checkbox" checked={workflow} onChange={(e) => setWorkflow(e.target.checked)} />Start the “{flow.name}” workflow (its emails go out)</label>}
      </section>
      <div className="bar"><button type="button" className="btn" onClick={() => nav.pop()}>Cancel</button><button type="button" className="btn solid" disabled={busy} onClick={save}>{busy ? 'Adding…' : 'Add client'}</button></div>
    </>
  );
}
