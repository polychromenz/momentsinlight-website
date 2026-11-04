// Add, change or delete an appointment (a practice shoot, a planning meeting…). It belongs to a
// client; from the calendar you choose which. They still copy to Google Calendar, as in the studio.
// /api/studio/crm/appointment.
import { useState } from 'react';
import { api } from '../api';
import { useNav } from '../nav';
import { toast, Top, useLoad } from '../ui';

type Appt = { id: number; title: string; date: string; start_time: string | null; end_time: string | null; location: string; notes: string };

export function Appointment({ jobId, jobTitle, appt, date }: { jobId?: number; jobTitle?: string; appt?: Appt; date?: string }) {
  const nav = useNav();
  const [f, setF] = useState({ job_id: jobId ? String(jobId) : '', title: appt?.title ?? '', date: appt?.date ?? date ?? '', start_time: appt?.start_time ?? '', end_time: appt?.end_time ?? '', location: appt?.location ?? '', notes: appt?.notes ?? '' });
  const [busy, setBusy] = useState(false);
  // From the calendar: choose the client (open leads and booked first).
  const [jobs] = useLoad(() => (jobId ? Promise.resolve(null) : api<{ jobs: { id: number; title: string; stage: string; event_date: string | null }[] }>('crm/today')), [jobId]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save() {
    if (!f.job_id) { toast('Choose the client.', true); return; }
    if (!f.title.trim() || !f.date) { toast('It needs a title and a date.', true); return; }
    setBusy(true);
    try {
      const body = { ...f, job_id: Number(f.job_id) };
      await (appt ? api('crm/appointment', { method: 'PUT', body: { id: appt.id, ...body } }) : api('crm/appointment', { body }));
      toast(appt ? 'Saved.' : 'Added.');
      nav.pop({ changed: true });
    } catch (e) { toast((e as Error).message, true); setBusy(false); }
  }
  async function remove() {
    if (!appt || !confirm('Delete this appointment? It’s taken off Google Calendar too.')) return;
    try { await api(`crm/appointment?id=${appt.id}`, { method: 'DELETE' }); toast('Deleted.'); nav.pop({ changed: true }); } catch (e) { toast((e as Error).message, true); }
  }
  const choices = (jobs?.jobs ?? []).filter((j) => j.stage !== 'lost').sort((a, b) => Number(a.stage === 'completed') - Number(b.stage === 'completed') || a.title.localeCompare(b.title));
  return (
    <>
      <Top title={appt ? 'Appointment' : 'New appointment'} sub={jobTitle} />
      <section className="card form">
        {!jobId && (
          <label>Client<select value={f.job_id} onChange={set('job_id')}><option value="">Choose…</option>{choices.map((j) => <option key={j.id} value={j.id}>{j.title}{j.stage === 'completed' ? ' (past)' : ''}</option>)}</select></label>
        )}
        <label>What<input value={f.title} onChange={set('title')} placeholder="e.g. Practice shoot" /></label>
        <label>Date<input type="date" value={f.date} onChange={set('date')} /></label>
        <div className="two"><label>Starts<input type="time" value={f.start_time} onChange={set('start_time')} /></label><label>Ends<input type="time" value={f.end_time} onChange={set('end_time')} /></label></div>
        <label>Where<input value={f.location} onChange={set('location')} /></label>
        <label>Notes<textarea value={f.notes} onChange={set('notes')} /></label>
        {appt && <button type="button" className="btn danger" onClick={remove}>Delete appointment</button>}
      </section>
      <div className="bar"><button type="button" className="btn" onClick={() => nav.pop()}>Cancel</button><button type="button" className="btn solid" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></div>
    </>
  );
}
