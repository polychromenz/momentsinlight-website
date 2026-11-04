// One email in full (from Gmail, through /api/studio/crm/email?message=…), with Reply.
import { api } from '../api';
import { useNav } from '../nav';
import { Loading, Problem, Top, useLoad, when } from '../ui';
import { Compose } from './Compose';

type Full = { subject: string; from?: string; to?: string; at: string; html?: string; text?: string; body?: string; direction: string };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
// Shown in a sandboxed frame: no scripts, links open outside the app.
const page = (inner: string) => `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><base target="_blank"><style>body{margin:0;padding:14px 16px;font:16px/1.5 system-ui,sans-serif;color:#2b2a24;word-wrap:break-word}img{max-width:100%;height:auto}table{max-width:100%!important}pre{white-space:pre-wrap}</style>${inner}`;

export function EmailView({ jobId, message }: { jobId: number; message: { id: number; subject: string; direction: string; body: string; sent_at: string } }) {
  const nav = useNav();
  const [full, error, reload] = useLoad(() => api<Full>(`crm/email?message=${message.id}`), [message.id]);
  // Gmail can't always find an email (e.g. deleted): show what the studio kept instead.
  const html = full ? (full.html || (full.text ? `<pre>${esc(full.text)}</pre>` : full.body || '')) : error ? `<p>${esc(message.body)}</p>` : '';
  return (
    <>
      <Top title={message.subject || '(no subject)'} sub={`${message.direction === 'in' ? 'From them' : 'Sent'} · ${when(message.sent_at)}`} />
      {error && <Problem error={`Couldn’t open the whole email: ${error}`} retry={reload} />}
      {!full && !error ? <Loading /> : <div className="card"><iframe className="mail-frame" title="Email" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" srcDoc={page(html)} onLoad={(e) => { const f = e.currentTarget; const h = f.contentDocument?.documentElement.scrollHeight; if (h) f.style.height = `${h + 20}px`; }} /></div>}
      <div className="bar"><button type="button" className="btn solid" onClick={() => nav.push(<Compose jobId={jobId} replyTo={message.id} />)}>Reply</button></div>
    </>
  );
}
