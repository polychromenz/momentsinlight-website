// "✉ Write email" in the studio's top bar (StudioLayout): a one-off email to anyone, in the email
// design with Tony's photo signature, sent from his Gmail (functions/api/studio/email.js).
// Made the first time it's opened, so pages that never use it don't load the editor.
import { attachRich } from './rich-editor';
import { attachPicker } from './attach-picker';
import { emailHtml } from '../../functions-lib/email-render.js';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const css = `.cmp{width:min(1100px,calc(100vw - 24px));max-height:calc(100dvh - 24px);border:0;border-radius:28px 0;padding:0;box-shadow:0 30px 60px -30px rgb(0 0 0/.5)}
.cmp::backdrop{background:rgb(30 30 20/.45)}
.cmp form{display:flex;flex-direction:column;gap:12px;padding:22px 24px}
.cmp h2{margin:0;font-weight:300;font-size:24px}
.cmp label{display:flex;flex-direction:column;gap:4px;font-size:14px;color:#444}
.cmp input{font:inherit;font-size:15px;padding:9px 12px;border:1px solid #ddd3c4;border-radius:12px 0;background:#fff}
.cmp .cmp-to{position:relative}
.cmp .cmp-sugg{position:absolute;left:0;right:0;top:100%;z-index:5;margin:2px 0 0;padding:4px;list-style:none;background:#fff;border:1px solid #ddd3c4;border-radius:10px 0;box-shadow:0 14px 30px -16px rgb(0 0 0/.4)}
.cmp .cmp-sugg li{padding:7px 10px;border-radius:6px;cursor:pointer}.cmp .cmp-sugg li:hover,.cmp .cmp-sugg li.on{background:#eef0e4}
.cmp .cmp-sugg small{color:#888;margin-left:6px}
.cmp .cmp-cols{display:grid;gap:14px}@media(min-width:900px){.cmp .cmp-cols{grid-template-columns:1fr 1fr}}
.cmp .cmp-prev{display:flex;flex-direction:column;gap:4px;font-size:14px;color:#444}.cmp .cmp-prev iframe{width:100%;min-height:460px;border:1px solid #eee5d8;border-radius:12px 0;background:#f6f1ea}
.cmp .cmp-note{margin:0;font-size:13px;color:#777}
.cmp .cmp-acts{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}`;

let dlg: HTMLDialogElement | null = null;

export async function openCompose(prefill: { to?: string } = {}) {
  if (!dlg) build();
  const f = dlg!.querySelector('form')!;
  f.reset();
  (f.elements.namedItem('to') as HTMLInputElement).value = prefill.to ?? '';
  rich.set('<p>Hi ,</p><p></p>');
  preview();
  const d = await fetch('/api/studio/email').then((r) => r.json()).catch(() => ({}));
  docs.set(d.documents ?? [], []);
  dlg!.querySelector<HTMLElement>('.cmp-gmail')!.hidden = d.gmail !== false;
  dlg!.showModal();
  (f.elements.namedItem(prefill.to ? 'subject' : 'to') as HTMLInputElement).focus();
}

let rich: ReturnType<typeof attachRich>;
let docs: ReturnType<typeof attachPicker>;
let preview = () => {};

function build() {
  const s = document.createElement('style'); s.textContent = css; document.head.append(s);
  dlg = document.createElement('dialog');
  dlg.className = 'cmp';
  dlg.setAttribute('aria-label', 'Write an email');
  dlg.innerHTML = `<form method="dialog" autocomplete="off">
    <h2>Write an email</h2>
    <p class="cmp-note cmp-gmail" hidden>Connect Gmail first (on the Clients page), so it can send.</p>
    <label class="cmp-to">To<input name="to" type="email" placeholder="Start typing a client or contact, or an email address" autocomplete="off" /><ul class="cmp-sugg" hidden></ul></label>
    <label>Subject<input name="subject" /></label>
    <div class="cmp-cols"><label>Email<textarea name="body" rows="16"></textarea></label><div class="cmp-prev"><span>What they see</span><iframe title="Email preview"></iframe></div></div>
    <div class="cmp-attach"></div>
    <p class="cmp-note">Sent from your Gmail in your email design, with your signature. It goes for real (even in test mode), and it’s kept on their page if they’re a client or contact.</p>
    <div class="cmp-acts"><button type="button" class="s-btn s-btn--quiet" data-cmp="cancel">Cancel</button><button type="button" class="s-btn s-btn--solid" data-cmp="send">Send</button></div>
  </form>`;
  document.body.append(dlg);
  const f = dlg.querySelector('form')!;
  const field = (n: string) => f.elements.namedItem(n) as HTMLInputElement;
  rich = attachRich(f.elements.namedItem('body') as HTMLTextAreaElement, { minHeight: 360 });
  docs = attachPicker(dlg.querySelector<HTMLElement>('.cmp-attach')!);
  const frame = dlg.querySelector('iframe')!;
  preview = () => { frame.srcdoc = emailHtml({ subject: field('subject').value, body: field('body').value }); };
  f.addEventListener('input', preview);

  // Suggestions for the To box: clients and contacts by name or email.
  const sugg = dlg.querySelector<HTMLUListElement>('.cmp-sugg')!;
  let timer = 0, seq = 0;
  field('to').addEventListener('input', () => {
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      const q = field('to').value.trim();
      if (q.length < 2 || q.includes('@') && /\.\w{2,}$/.test(q)) { sugg.hidden = true; return; }
      const mine = ++seq;
      const d = await fetch(`/api/studio/email?q=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => ({ people: [] }));
      if (mine !== seq) return;
      sugg.innerHTML = (d.people ?? []).map((p: any) => `<li data-email="${esc(p.email)}" data-name="${esc(String(p.name).split(' ')[0])}">${esc(p.name)}<small>${esc(p.email)} · ${p.kind === 'client' ? 'client' : 'contact'}</small></li>`).join('');
      sugg.hidden = !d.people?.length;
    }, 200);
  });
  sugg.addEventListener('mousedown', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('[data-email]');
    if (!li) return;
    e.preventDefault();
    field('to').value = li.dataset.email!;
    sugg.hidden = true;
    // Start the greeting with their first name if the body is still the blank one.
    if (/^<p>Hi ,<\/p>(<p><\/p>)?$/.test(field('body').value.replace(/\s/g, ''))) rich.set(`<p>Hi ${esc(li.dataset.name)},</p><p></p>`);
    field('subject').focus();
    preview();
  });
  field('to').addEventListener('blur', () => setTimeout(() => (sugg.hidden = true), 150));

  dlg.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-cmp]');
    if (!b) return;
    if (b.dataset.cmp === 'cancel') { dlg!.close(); return; }
    if (docs.over()) { flash('The attachments are over Gmail’s 25 MB limit. Untick one.', true); return; }
    b.disabled = true; b.textContent = 'Sending…';
    const r = await fetch('/api/studio/email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: field('to').value, subject: field('subject').value, body: field('body').value, attachments: docs.get() }) });
    const d = await r.json().catch(() => ({}));
    b.disabled = false; b.textContent = 'Send';
    if (!r.ok) { flash(d.error || 'That didn’t send.', true); return; }
    dlg!.close();
    flash(`Sent to ${d.to}.${d.kept ? ' It’s on their client page.' : ''}`);
  });
}

function flash(text: string, error = false) {
  let t = document.querySelector<HTMLElement>('.s-toast');
  if (!t) { t = document.createElement('div'); t.className = 's-toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = text; t.classList.toggle('error', error); t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 4500);
}
