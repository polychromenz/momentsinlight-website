// One contact (a venue or supplier): call, text, email or open their website; edit their details
// and notes; see the emails with them. Without an id, adds a new contact. /api/studio/crm/contacts.
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useNav } from '../nav';
import { Loading, Problem, toast, Top, useLoad, when } from '../ui';

export type ContactRow = { id: number; business: string; type: string; contact_name: string; email: string; phone: string; website: string; notes: string; instagram: string };
type Detail = { contact: ContactRow; messages: { id: number; direction: string; subject: string; sent_at: string }[]; tasks: { id: number; title: string; due_date: string | null; done_at: string | null }[] };
const FIELDS = ['business', 'contact_name', 'type', 'email', 'phone', 'website', 'instagram', 'notes'] as const;
const blank = Object.fromEntries(FIELDS.map((k) => [k, ''])) as Record<(typeof FIELDS)[number], string>;

export function Contact({ id, types }: { id?: number; types: string[] }) {
  const nav = useNav();
  const [data, error, reload] = useLoad(() => (id ? api<Detail>(`crm/contacts?id=${id}`) : Promise.resolve(null)), [id]);
  const pick = () => (data ? Object.fromEntries(FIELDS.map((k) => [k, data.contact[k] ?? ''])) as typeof blank : blank);
  const [f, setF] = useState(pick);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(pick()), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const dirty = JSON.stringify(f) !== JSON.stringify(pick());

  async function save() {
    if (!f.business.trim() && !f.contact_name.trim()) { toast('Give them a name or business.', true); return; }
    setBusy(true);
    try {
      if (id) { await api('crm/contacts', { method: 'PUT', body: { id, ...f } }); toast('Saved.'); reload(); }
      else { await api('crm/contacts', { body: f }); toast('Added.'); nav.pop({ changed: true }); return; }
    } catch (e) { toast((e as Error).message, true); }
    setBusy(false);
  }
  if (id && error) return <><Top title="Contact" /><Problem error={error} retry={reload} /></>;
  if (id && !data) return <><Top title="Contact" /><Loading /></>;
  const c = data?.contact;
  const tel = (c?.phone || '').replace(/[^\d+]/g, '');
  const web = c?.website ? (c.website.startsWith('http') ? c.website : `https://${c.website}`) : '';
  return (
    <>
      <Top title={c ? c.business || c.contact_name : 'New contact'} sub={c ? [c.type, c.business ? c.contact_name : ''].filter(Boolean).join(' · ') : undefined} />
      {c && (
        <div className="actions">
          <a href={tel ? `tel:${tel}` : undefined} className={tel ? '' : 'off'}><span>✆</span>Call</a>
          <a href={tel ? `sms:${tel}` : undefined} className={tel ? '' : 'off'}><span>✉︎</span>Text</a>
          <a href={c.email ? `mailto:${c.email}` : undefined} className={c.email ? '' : 'off'}><span>@</span>Email</a>
          <a href={web || undefined} className={web ? '' : 'off'} target="_blank" rel="noreferrer"><span>⌂</span>Website</a>
        </div>
      )}
      <section className="card form">
        <label>Business<input value={f.business} onChange={set('business')} /></label>
        <label>Contact name<input value={f.contact_name} onChange={set('contact_name')} /></label>
        <label>Type<select value={f.type} onChange={set('type')}><option value="">Choose…</option>{types.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
        <label>Email<input type="email" value={f.email} onChange={set('email')} /></label>
        <label>Phone<input type="tel" value={f.phone} onChange={set('phone')} /></label>
        <label>Website<input value={f.website} onChange={set('website')} /></label>
        <label>Instagram<input value={f.instagram} onChange={set('instagram')} placeholder="@name" /></label>
        <label>Notes<textarea value={f.notes} onChange={set('notes')} /></label>
      </section>
      {data && !!data.messages.length && (
        <section className="card">
          <h2>Emails</h2>
          <ul className="list">{data.messages.map((m) => <li key={m.id} className="row"><span className={`dir ${m.direction}`}>{m.direction === 'in' ? 'From them' : 'Sent'}</span><span className="row-main"><strong>{m.subject || '(no subject)'}</strong><small>{when(m.sent_at)}</small></span></li>)}</ul>
        </section>
      )}
      {data && !!data.tasks.length && (
        <section className="card">
          <h2>Tasks</h2>
          <ul className="list">{data.tasks.map((t) => <li key={t.id} className="row"><span className="row-main"><strong style={{ fontWeight: t.done_at ? 400 : 600 }}>{t.done_at ? '✓ ' : ''}{t.title}</strong>{t.due_date && <small>Due {t.due_date}</small>}</span></li>)}</ul>
        </section>
      )}
      {(dirty || !id) && <div className="bar"><button type="button" className="btn" onClick={() => (id ? setF(pick()) : nav.pop())}>{id ? 'Undo' : 'Cancel'}</button><button type="button" className="btn solid" disabled={busy} onClick={save}>{busy ? 'Saving…' : id ? 'Save' : 'Add contact'}</button></div>}
    </>
  );
}
