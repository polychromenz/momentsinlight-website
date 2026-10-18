// The page editor (/studio/page-edit?id=…): loads a page's data, shows its Google fields, text
// blocks (edited in place so their styling survives), photos, galleries and buttons, and saves the
// whole page back through /api/studio/page. Everything else in the page's data is kept as it is.
import Sortable from 'sortablejs';

const $ = <T extends HTMLElement = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector<T>(s)!;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const toast = (text: string, error = false) => { const t = $('.s-toast'); t.textContent = text; t.classList.toggle('error', error); t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 5000); };
const thumb = (src: string, w = 480) => src.replace(/\/(public(\.webp)?|w=[^/]*)$/, `/w=${w}`);

const id = new URLSearchParams(location.search).get('id') ?? '';
const isHome = id === 'home';
let data: any = null;
let sha = '';
let dirty = false;

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || `Something went wrong (${r.status}).`), { conflict: d.conflict });
  return d;
}
const markDirty = () => { dirty = true; $<HTMLButtonElement>('[data-save]').disabled = false; $('.pe-state').textContent = 'Unsaved changes'; };
addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

// ---- Google ----
const field = <T extends HTMLElement = HTMLInputElement>(n: string) => document.querySelector<T>(`[name="${n}"]`)!;
function counts() {
  for (const [n, lo, hi] of [['title', 30, 60], ['description', 120, 155]] as const) {
    const v = field<HTMLInputElement>(n).value.trim();
    const c = document.querySelector(`[data-cnt="${n}"]`)!;
    c.textContent = `${v.length} characters (aim for ${lo}–${hi})`;
    c.className = `cnt ${v.length >= lo && v.length <= hi ? 'up' : 'down'}`;
  }
  const t = field('title').value.trim(), d = field<HTMLTextAreaElement>('description').value.trim();
  $('.serp-title').textContent = t.length > 62 ? `${t.slice(0, 60)}…` : t;
  $('.serp-desc').textContent = d.length > 160 ? `${d.slice(0, 158)}…` : d;
}

// ---- Rich text (in place, so the page's own markup and styling stay) ----
const TOOLS: [string, string][] = [['bold', '<b>B</b>'], ['italic', '<i>I</i>'], ['h2', 'Heading'], ['h3', 'Small heading'], ['p', 'Normal'], ['ul', '• List'], ['link', 'Link']];
let linkRange: Range | null = null;
function richBlock(html: string, key: string) {
  return `<div class="rich-wrap"><div class="tb" role="toolbar" aria-label="Text formatting">${TOOLS.map(([c, l]) => `<button type="button" data-cmd="${c}">${l}</button>`).join('')}</div>
    <div class="rich" contenteditable="true" data-rich="${key}">${html}</div></div>`;
}
document.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('.tb button')) e.preventDefault(); }); // keep the selection
document.addEventListener('click', async (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.tb [data-cmd]');
  if (!b) return;
  const cmd = b.dataset.cmd!;
  const box = b.closest('.rich-wrap')!.querySelector<HTMLElement>('.rich')!;
  box.focus();
  if (cmd === 'bold' || cmd === 'italic') document.execCommand(cmd);
  else if (cmd === 'h2' || cmd === 'h3' || cmd === 'p') document.execCommand('formatBlock', false, cmd);
  else if (cmd === 'ul') document.execCommand('insertUnorderedList');
  else if (cmd === 'link') {
    const sel = getSelection();
    linkRange = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const dlg = $<HTMLDialogElement>('dialog.pe-link');
    const cur = (sel?.anchorNode?.parentElement?.closest('a') as HTMLAnchorElement | null)?.getAttribute('href') ?? '';
    $<HTMLInputElement>('[name=href]', dlg).value = cur;
    dlg.showModal();
    dlg.onclose = () => {
      box.focus();
      if (linkRange) { const s = getSelection()!; s.removeAllRanges(); s.addRange(linkRange); }
      const href = $<HTMLInputElement>('[name=href]', dlg).value.trim();
      if (dlg.returnValue === 'remove') document.execCommand('unlink');
      else if (dlg.returnValue === 'ok' && href) document.execCommand('createLink', false, href);
      markDirty();
    };
    return;
  }
  markDirty();
});
document.addEventListener('input', (e) => { if ((e.target as HTMLElement).closest('.rich, .pe input, .pe textarea')) { markDirty(); counts(); } });

// ---- Photos ----
async function upload(file: File): Promise<{ src: string; width?: number; height?: number }> {
  let width: number | undefined, height: number | undefined;
  try { const bmp = await createImageBitmap(file); width = bmp.width; height = bmp.height; bmp.close(); } catch { /* unknown */ }
  const name = file.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_.-]+/g, '-');
  const { uploadURL, src } = await api('/api/studio/upload', { method: 'POST', body: JSON.stringify({ id: `pages/${id}/${name}-${Date.now().toString(36)}` }) });
  const form = new FormData(); form.append('file', file);
  const r = await fetch(uploadURL, { method: 'POST', body: form });
  if (!r.ok) throw new Error(`Upload failed (${r.status}).`);
  return { src, width, height };
}
async function suggest(src: string): Promise<string> {
  const d = await api('/api/studio/describe', { method: 'POST', body: JSON.stringify({ src, kind: /portrait|family|headshot|lifestyle/.test(id) ? 'portrait' : 'wedding' }) });
  return d.description;
}
const photoRow = (img: any, key: string) => `<div class="photo-row" data-photo="${key}"><img src="${esc(thumb(img.src))}" alt="">
  <div class="fields"><label>Photo description <textarea rows="2" maxlength="250" data-alt="${key}" placeholder="What’s in the photo, in a sentence">${esc(img.alt ?? '')}</textarea></label>
  <div class="acts"><button type="button" class="s-btn s-btn--quiet" data-suggest="${key}">✨ Suggest</button><label class="s-btn s-btn--quiet">Replace photo<input type="file" accept="image/*" hidden data-replace="${key}"></label></div></div></div>`;
const galItem = (img: any, si: number, n: number) => `<li data-gi="${n}"><img src="${esc(thumb(img.src, 360))}" alt="">
  <textarea rows="2" maxlength="250" data-galt placeholder="Photo description">${esc(img.alt ?? '')}</textarea>
  <div class="acts"><button type="button" class="s-btn s-btn--quiet" data-gsuggest>✨</button><button type="button" class="rm" data-grm>Remove</button></div></li>`;

// ---- The page's blocks ----
const OTHER: Record<string, string> = { embed: 'an embedded form', unknown: 'a design block', summary: 'a list of posts', guideSignup: 'the photo guide sign-up', reviews: 'your reviews' };
function draw() {
  const box = $('.pe-sections');
  if (isHome) { box.innerHTML = ''; return; }
  box.innerHTML = data.sections.map((s: any, si: number) => {
    if (s.kind === 'gallery') {
      return `<section class="card" data-section="${si}"><h3>Photo gallery · ${s.images.length} photos</h3><p class="hint">Drag to reorder.</p>
        <ul class="gal" data-gal="${si}">${s.images.map((img: any, n: number) => galItem(img, si, n)).join('')}</ul>
        <div class="acts"><label class="s-btn s-btn--quiet">+ Add photos<input type="file" accept="image/*" multiple hidden data-gadd="${si}"></label> <span class="uploading" hidden></span></div></section>`;
    }
    const blocks = (s.blocks ?? []).map((b: any, bi: number) => {
      const key = `${si}.${bi}`;
      if (b.type === 'text') return `<div class="blk"><h3>Text</h3>${richBlock(b.html ?? '', key)}</div>`;
      if (b.type === 'image' && b.image?.src) return `<div class="blk"><h3>Photo</h3>${photoRow(b.image, key)}</div>`;
      if (b.type === 'button') return `<div class="blk"><h3>Button</h3><div class="two"><label>Button words <input data-btext="${key}" value="${esc(b.text)}"></label><label>Goes to <input data-bhref="${key}" value="${esc(b.href ?? '')}"></label></div></div>`;
      return `<p class="other">Here: ${OTHER[b.type] ?? 'part of the page design'} (ask Claude to change it).</p>`;
    }).join('');
    const bg = s.bgImage?.src ? `<div class="blk"><h3>Background photo</h3>${photoRow(s.bgImage, `${si}.bg`)}</div>` : '';
    return blocks || bg ? `<section class="card" data-section="${si}">${bg}${blocks}</section>` : '';
  }).join('');
  document.querySelectorAll<HTMLElement>('[data-gal]').forEach((ul) => Sortable.create(ul, { animation: 180, filter: 'textarea, button', preventOnFilter: false, onEnd: () => { readGalleries(); markDirty(); } }));
}
const imgAt = (key: string) => { const [si, bi] = key.split('.'); const s = data.sections[Number(si)]; return bi === 'bg' ? s.bgImage : s.blocks[Number(bi)].image; };
/** Gallery order and descriptions from the screen into the data. */
function readGalleries() {
  document.querySelectorAll<HTMLElement>('[data-gal]').forEach((ul) => {
    const s = data.sections[Number(ul.dataset.gal)];
    const old = s.images;
    s.images = [...ul.querySelectorAll<HTMLElement>('li')].map((li) => ({ ...old[Number(li.dataset.gi)], alt: li.querySelector<HTMLTextAreaElement>('[data-galt]')!.value.trim() }));
    ul.querySelectorAll<HTMLElement>('li').forEach((li, n) => { li.dataset.gi = String(n); });
  });
}

document.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  const sg = t.closest<HTMLButtonElement>('[data-suggest]');
  if (sg) {
    const key = sg.dataset.suggest!; sg.disabled = true; sg.textContent = 'Looking…';
    try { const d = await suggest(imgAt(key).src); document.querySelector<HTMLTextAreaElement>(`[data-alt="${key}"]`)!.value = d; markDirty(); } catch (err) { toast((err as Error).message, true); }
    sg.disabled = false; sg.textContent = '✨ Suggest'; return;
  }
  const gs = t.closest<HTMLButtonElement>('[data-gsuggest]');
  if (gs) {
    readGalleries();
    const li = gs.closest<HTMLElement>('li')!; const s = data.sections[Number(li.closest<HTMLElement>('[data-gal]')!.dataset.gal)];
    gs.disabled = true; gs.textContent = '…';
    try { li.querySelector<HTMLTextAreaElement>('[data-galt]')!.value = await suggest(s.images[Number(li.dataset.gi)].src); markDirty(); } catch (err) { toast((err as Error).message, true); }
    gs.disabled = false; gs.textContent = '✨'; return;
  }
  const rm = t.closest<HTMLButtonElement>('[data-grm]');
  if (rm) { if (confirm('Remove this photo from the gallery?')) { rm.closest('li')!.remove(); readGalleries(); markDirty(); } return; }
  if (t.closest('[data-save]')) { await save(); }
});
document.addEventListener('change', async (e) => {
  const inp = e.target as HTMLInputElement;
  if (inp.dataset.replace && inp.files?.[0]) {
    const key = inp.dataset.replace; const row = inp.closest<HTMLElement>('.photo-row')!;
    row.querySelector('img')!.style.opacity = '0.4';
    try {
      const up = await upload(inp.files[0]);
      Object.assign(imgAt(key), { src: up.src, ...(up.width ? { width: up.width, height: up.height } : {}), alt: '' });
      row.querySelector('img')!.src = thumb(up.src);
      row.querySelector<HTMLTextAreaElement>('[data-alt]')!.value = '';
      markDirty(); toast('Photo replaced. Give it a description, then Save.');
    } catch (err) { toast((err as Error).message, true); }
    row.querySelector('img')!.style.opacity = ''; return;
  }
  if (inp.dataset.gadd && inp.files?.length) {
    readGalleries();
    const s = data.sections[Number(inp.dataset.gadd)];
    const status = inp.closest('.acts')!.querySelector<HTMLElement>('.uploading')!;
    const files = [...inp.files].filter((f) => /^image\//.test(f.type));
    for (const [n, f] of files.entries()) {
      status.hidden = false; status.textContent = `Uploading ${n + 1} of ${files.length}…`;
      try { const up = await upload(f); s.images.push({ src: up.src, alt: '', width: up.width, height: up.height, focal: [0.5, 0.5], href: null, title: null }); } catch (err) { toast((err as Error).message, true); }
    }
    status.hidden = true; markDirty(); draw();
  }
});

// ---- Load and save ----
function collect() {
  const next = structuredClone(data);
  next.title = field('title').value.trim();
  next.description = field<HTMLTextAreaElement>('description').value.trim();
  if (isHome) {
    next.eyebrow = field('eyebrow').value.trim();
    next.h1 = field('h1').value.trim();
    next.intro = field<HTMLTextAreaElement>('intro').value.trim();
    return next;
  }
  readGalleries();
  next.sections = structuredClone(data.sections);
  document.querySelectorAll<HTMLElement>('[data-rich]').forEach((el) => { const [si, bi] = el.dataset.rich!.split('.').map(Number); next.sections[si].blocks[bi].html = el.innerHTML.replace(/<br>$/, ''); });
  document.querySelectorAll<HTMLTextAreaElement>('[data-alt]').forEach((ta) => {
    const [si, bi] = ta.dataset.alt!.split('.');
    const s = next.sections[Number(si)];
    (bi === 'bg' ? s.bgImage : s.blocks[Number(bi)].image).alt = ta.value.trim();
  });
  document.querySelectorAll<HTMLInputElement>('[data-btext]').forEach((i) => { const [si, bi] = i.dataset.btext!.split('.').map(Number); next.sections[si].blocks[bi].text = i.value.trim(); });
  document.querySelectorAll<HTMLInputElement>('[data-bhref]').forEach((i) => { const [si, bi] = i.dataset.bhref!.split('.').map(Number); next.sections[si].blocks[bi].href = i.value.trim() || null; });
  return next;
}
async function save() {
  const btn = $<HTMLButtonElement>('[data-save]');
  const next = collect();
  if (!next.title) { toast('The page needs a Google title.', true); return; }
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const r = await api('/api/studio/page', { method: 'PUT', body: JSON.stringify({ id, data: next, sha, message: `Studio: update ${isHome ? 'the home page' : `page ${data.path}`}` }) });
    sha = r.sha; data = next; dirty = false;
    $('.pe-state').textContent = 'Saved. The website updates in about 2 minutes.';
    btn.textContent = 'Save';
  } catch (err) {
    btn.disabled = false; btn.textContent = 'Save';
    toast((err as Error).message, true);
  }
}

(async () => {
  try {
    const r = await api(`/api/studio/page?id=${encodeURIComponent(id)}`);
    data = r.data; sha = r.sha;
  } catch (err) { $('.pe-title').textContent = (err as Error).message; return; }
  const path = isHome ? '/' : data.path;
  $('.pe-title').textContent = isHome ? 'Home page' : String(data.title).replace(/\s*\|\s*Moments In Light\s*$/i, '');
  $('.pe-path').textContent = path;
  $<HTMLAnchorElement>('.pe-view').href = path;
  document.title = `${$('.pe-title').textContent} · Moments Studio`;
  $('.serp-url').textContent = `momentsinlight.co.nz${path === '/' ? '' : path.replace(/\//g, ' › ')}`;
  field('title').value = data.title ?? '';
  field<HTMLTextAreaElement>('description').value = data.description ?? '';
  if (isHome) {
    $('.home-only').hidden = false;
    field('eyebrow').value = data.eyebrow ?? '';
    field('h1').value = data.h1 ?? '';
    field<HTMLTextAreaElement>('intro').value = data.intro ?? '';
  }
  counts();
  draw();
})();
