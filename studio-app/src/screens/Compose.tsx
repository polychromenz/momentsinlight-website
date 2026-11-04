// Writing to a client, in the studio's email editor (the website's src/studio/rich-editor.ts, with
// Button and Gallery button). Three ways in:
//   new email or reply  → /api/studio/crm/email   (GET a draft, POST to send)
//   a ready step email  → /api/studio/crm/send     (GET it filled in, POST to send; a gallery email
//                          asks which gallery, and a draft gallery goes online when it's sent)
import { useEffect, useRef, useState } from 'react';
import { attachRich, type Rich } from '../../../src/studio/rich-editor';
import { api } from '../api';
import { useNav } from '../nav';
import { Loading, Problem, toast, Top } from '../ui';

type Doc = { id: number; name: string; size: number };
type Draft = { subject: string; body: string; missing?: string[]; attachments: number[]; documents: Doc[]; templates?: { key: string; name: string }[]; to: string; deliversTo: string; mode: string; gmail: boolean; gallery?: boolean };
type Gallery = { id: string; name: string; status: string; expires_at: string | null; url?: string | null; online?: boolean };
const PASTE = '__paste__';

export function Compose({ jobId, replyTo, step }: { jobId: number; replyTo?: number; step?: { id: number; title: string } }) {
  const nav = useNav();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [template, setTemplate] = useState('');
  const [subject, setSubject] = useState('');
  const [attach, setAttach] = useState<number[]>([]);
  const [galleries, setGalleries] = useState<{ theirs: Gallery[]; others: Gallery[] }>({ theirs: [], others: [] });
  const [pick, setPick] = useState('');
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const rich = useRef<Rich | null>(null);
  const theirs = useRef<Gallery[]>([]);

  // The draft (and their galleries, for the Gallery button and a gallery email).
  useEffect(() => {
    const url = step ? `crm/send?step=${step.id}` : `crm/email?job=${jobId}${replyTo ? `&reply=${replyTo}` : ''}${template ? `&template=${template}` : ''}`;
    Promise.all([api<Draft>(url), api<{ studio_galleries: Gallery[]; unlinked: Gallery[] }>(`crm/portal?job=${jobId}`).catch(() => ({ studio_galleries: [], unlinked: [] }))])
      .then(([d, p]) => {
        setDraft(d);
        setSubject(d.subject);
        setAttach(d.attachments ?? []);
        theirs.current = [...p.studio_galleries].sort((a, b) => Number(b.online) - Number(a.online));
        setGalleries({ theirs: theirs.current, others: p.unlinked });
        if (rich.current) rich.current.set(d.body);
        const usable = (g: Gallery) => g.status === 'draft' || g.online;
        setPick(theirs.current.find(usable)?.id ?? '');
      })
      .catch((e) => setError(e.message));
  }, [jobId, replyTo, step, template]);

  // The editor, once the text box is there.
  useEffect(() => {
    if (!draft || rich.current || !area.current) return;
    rich.current = attachRich(area.current, { minHeight: 260, galleries: () => theirs.current.map((g) => ({ name: g.name, url: g.url ?? null, online: !!g.online })) });
    rich.current.set(draft.body);
  }, [draft]);

  async function send() {
    if (!draft || !rich.current) return;
    const body = rich.current.get();
    if (step && draft.gallery && !pick) { toast('Choose their gallery first.', true); return; }
    setBusy(true);
    try {
      const r = step
        ? await api<{ to: string; redirected: boolean; intended: string }>('crm/send', { body: { step: step.id, subject, body, attachments: attach, ...(draft.gallery ? (pick === PASTE ? { gallery_link: pasted.trim() } : { gallery_id: pick }) : {}) } })
        : await api<{ to: string; redirected: boolean; intended: string }>('crm/email', { body: { job_id: jobId, subject, body, attachments: attach, ...(replyTo ? { reply: replyTo } : {}) } });
      toast(r.redirected ? `Test mode: sent to ${r.to} (not ${r.intended}).` : `Sent to ${r.to}.`);
      nav.pop({ changed: true });
    } catch (e) {
      toast((e as Error).message, true);
      setBusy(false);
    }
  }

  const title = step ? step.title : replyTo ? 'Reply' : 'New email';
  if (error) return <><Top title={title} /><Problem error={error} /></>;
  if (!draft) return <><Top title={title} /><Loading /></>;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
  const usable = (g: Gallery) => g.status === 'draft' || (g.status === 'online' && !(g.expires_at && g.expires_at < today));
  const label = (g: Gallery) => `${g.name}${g.status === 'draft' ? ' (draft: goes online when sent)' : !usable(g) ? ` (${g.status === 'online' ? 'expired' : 'offline'})` : ''}`;
  return (
    <>
      <Top title={title} sub={`To ${draft.to}`} />
      {!draft.gmail && <p className="test-mode">Gmail isn’t connected, so this can’t be sent. Connect it in the studio on a computer.</p>}
      {draft.mode !== 'live' && <p className="test-mode">Test mode: it goes to {draft.deliversTo}, not to them.</p>}
      {!!draft.missing?.length && <p className="test-mode">Fill in the gaps in [square brackets]: {draft.missing.join(', ')}</p>}
      <section className="card form">
        {!step && !replyTo && !!draft.templates?.length && (
          <label>Start from<select value={template} onChange={(e) => { setTemplate(e.target.value); }}><option value="">A blank email</option>{draft.templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}</select></label>
        )}
        {step && draft.gallery && (
          <>
            <label>Their gallery (it goes into the email and onto their portal)
              <select value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Choose a gallery…</option>
                {!!galleries.theirs.length && <optgroup label="Theirs">{galleries.theirs.map((g) => <option key={g.id} value={g.id} disabled={!usable(g)}>{label(g)}</option>)}</optgroup>}
                {!!galleries.others.length && <optgroup label="Other galleries (linked to them when sent)">{galleries.others.map((g) => <option key={g.id} value={g.id} disabled={!usable(g)}>{label(g)}</option>)}</optgroup>}
                <option value={PASTE}>Paste a link instead…</option>
              </select>
            </label>
            {pick === PASTE && <label>Gallery link<input type="url" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="https://…" /></label>}
          </>
        )}
        <label>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
        <div><textarea ref={area} defaultValue={draft.body} /></div>
        {!!draft.documents.length && !!attach.length && (
          <div className="small">
            <span className="muted">Attached:</span>
            {draft.documents.filter((d) => attach.includes(d.id)).map((d) => (
              <label key={d.id} className="check" style={{ marginTop: 6 }}><input type="checkbox" checked onChange={() => setAttach(attach.filter((x) => x !== d.id))} />{d.name}</label>
            ))}
          </div>
        )}
      </section>
      <div className="bar"><button type="button" className="btn" onClick={() => nav.pop()}>Cancel</button><button type="button" className="btn solid" disabled={busy || !draft.gmail} onClick={send}>{busy ? 'Sending…' : 'Send'}</button></div>
    </>
  );
}
