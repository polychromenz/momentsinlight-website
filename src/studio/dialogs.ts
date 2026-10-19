// Styled pop-ups in place of the browser's own confirm(), alert() and prompt() boxes, matching the
// site (Tony asked, 20 Oct 2026). Each returns a promise:
//   await ask('Delete this?', { ok: 'Delete', danger: true })   -> true / false
//   await tell('Saved.')                                         -> when closed
//   await askText('Section name:', 'Ceremony')                   -> the text, or null if cancelled
// guardLeaving(() => dirty): a styled "unsaved changes" box when a link inside the site is clicked
// (the browser's own box still covers closing the tab or reloading; websites can't restyle that one).
type AskOpts = { ok?: string; cancel?: string; danger?: boolean; title?: string };

const css = `.mdlg{border:0;padding:0;border-radius:24px 0;max-width:min(460px,calc(100vw - 32px));width:100%;box-shadow:0 30px 70px -30px rgb(0 0 0/.55);background:var(--white,#fff);color:var(--ink,#2b2a24)}
.mdlg::backdrop{background:rgb(30 30 20/.45)}
.mdlg form{display:flex;flex-direction:column;gap:14px;padding:22px 24px 20px}
.mdlg h2{margin:0;font-weight:300;font-size:22px;line-height:1.25}
.mdlg p{margin:0;font-size:15px;line-height:1.6;white-space:pre-line;color:#444}
.mdlg input{font:inherit;font-size:15px;padding:9px 12px;border:1px solid #ddd3c4;border-radius:12px 0;background:var(--white,#fff);color:inherit;width:100%;box-sizing:border-box}
.mdlg input:focus{outline:2px solid var(--green,#5a5e3b);outline-offset:1px}
.mdlg .mdlg-acts{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:4px}
.mdlg button{font:inherit;font-size:14px;padding:9px 18px;border-radius:12px 0;border:1px solid var(--green,#5a5e3b);background:var(--white,#fff);color:var(--green,#5a5e3b);cursor:pointer;transition:border-radius .35s,background .2s}
.mdlg button:hover{border-radius:0 12px}
.mdlg button.mdlg-ok{background:var(--green,#5a5e3b);color:#fff}
.mdlg button.mdlg-ok.danger{background:#a8432a;border-color:#a8432a}
.mdlg button.mdlg-cancel{border-color:transparent}
@media (prefers-reduced-motion:reduce){.mdlg button{transition:none}}`;

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function open(html: string, focus: string): Promise<{ ok: boolean; value: string }> {
  if (!document.getElementById('mdlg-css')) { const s = document.createElement('style'); s.id = 'mdlg-css'; s.textContent = css; document.head.append(s); }
  const d = document.createElement('dialog');
  d.className = 'mdlg';
  d.innerHTML = `<form method="dialog">${html}</form>`;
  document.body.append(d);
  return new Promise((done) => {
    let result = { ok: false, value: '' };
    d.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      const ok = (e as SubmitEvent).submitter?.classList.contains('mdlg-ok') ?? true;
      result = { ok, value: d.querySelector('input')?.value ?? '' };
      d.close();
    });
    d.addEventListener('close', () => { d.remove(); done(result); });
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); }); // a click outside = cancel
    d.showModal();
    d.querySelector<HTMLElement>(focus)?.focus();
  });
}

/** Yes or no. */
export async function ask(message: string, o: AskOpts = {}): Promise<boolean> {
  const r = await open(`${o.title ? `<h2>${esc(o.title)}</h2>` : ''}<p>${esc(message)}</p>
    <div class="mdlg-acts"><button type="submit" class="mdlg-cancel">${esc(o.cancel ?? 'Cancel')}</button><button type="submit" class="mdlg-ok${o.danger || /delete|remove|cancel |disconnect|withdraw/i.test(message) ? ' danger' : ''}">${esc(o.ok ?? 'OK')}</button></div>`, '.mdlg-ok');
  return r.ok;
}

/** A message with an OK button. */
export async function tell(message: string, title = ''): Promise<void> {
  await open(`${title ? `<h2>${esc(title)}</h2>` : ''}<p>${esc(message)}</p><div class="mdlg-acts"><button type="submit" class="mdlg-ok">OK</button></div>`, '.mdlg-ok');
}

/** A line of text (null if cancelled). */
export async function askText(message: string, value = '', o: AskOpts = {}): Promise<string | null> {
  const r = await open(`${o.title ? `<h2>${esc(o.title)}</h2>` : ''}<p>${esc(message)}</p><input value="${esc(value)}" />
    <div class="mdlg-acts"><button type="submit" class="mdlg-cancel">${esc(o.cancel ?? 'Cancel')}</button><button type="submit" class="mdlg-ok">${esc(o.ok ?? 'OK')}</button></div>`, 'input');
  return r.ok ? r.value : null;
}

/** "Unsaved changes" when a link inside the site is clicked, and the browser's box for closing the tab. */
export function guardLeaving(isDirty: () => boolean) {
  let leaving = false;
  addEventListener('beforeunload', (e) => { if (isDirty() && !leaving) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('click', async (e) => {
    const a = (e.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null;
    if (!a || !isDirty() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target === '_blank' || a.hasAttribute('download') || a.origin !== location.origin || a.getAttribute('href')!.startsWith('#')) return;
    e.preventDefault();
    if (await ask('You have changes that aren’t saved yet. Leave this page without saving them?', { title: 'Unsaved changes', ok: 'Leave without saving', cancel: 'Stay here', danger: true })) {
      leaving = true;
      location.href = a.href;
    }
  }, true);
}
