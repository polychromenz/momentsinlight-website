// The page editor for pages in the refreshed design (most of them): the page as one flowing
// document, like a blog post. Each part is a section of the page, in order:
//   text     words (headings, paragraphs, lists, links) with an optional photo beside them,
//            buttons, and any special block (a form, reviews, a post list) shown in place
//   hero     a photo with a heading over it
//   gallery  the full-width photo slideshow
// Parts can be added between, moved and removed. Saved through /api/studio/page; everything
// else in the page's data (layout settings, ids) is kept as it was.
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Sortable from 'sortablejs';

const $ = <T extends HTMLElement = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector<T>(s)!;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const toast = (text: string, error = false) => { const t = $('.s-toast'); t.textContent = text; t.classList.toggle('error', error); t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 5000); };
const thumb = (src: string, w = 900) => src.replace(/\/(public(\.webp)?|w=[^/]*)$/, `/w=${w}`);
const rid = () => Math.random().toString(16).slice(2, 14) + Date.now().toString(16).slice(-8);
const isTestimonials = (h: string) => /what some of my clients have said/i.test(h.replace(/<[^>]+>/g, ''));

const id = new URLSearchParams(location.search).get('id') ?? '';
let data: any = null;
let sha = '';
let dirty = false;
const editors = new Map<number, Editor>(); // section index -> its text editor
let lastEditor: Editor | null = null;

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Something went wrong (${r.status}).`);
  return d;
}
const markDirty = () => { dirty = true; $<HTMLButtonElement>('[data-save]').disabled = false; $('.pe-state').textContent = 'Unsaved changes'; };
addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

async function upload(file: File) {
  let width: number | undefined, height: number | undefined;
  try { const bmp = await createImageBitmap(file); width = bmp.width; height = bmp.height; bmp.close(); } catch { /* unknown */ }
  const name = file.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_.-]+/g, '-');
  const { uploadURL, src } = await api('/api/studio/upload', { method: 'POST', body: JSON.stringify({ id: `pages/${id}/${name}-${Date.now().toString(36)}` }) });
  const form = new FormData(); form.append('file', file);
  const r = await fetch(uploadURL, { method: 'POST', body: form });
  if (!r.ok) throw new Error(`Upload failed (${r.status}).`);
  return { src, alt: '', width, height, focal: [0.5, 0.5] };
}
const describe = async (src: string) => (await api('/api/studio/describe', { method: 'POST', body: JSON.stringify({ src, kind: /portrait|family|headshot|lifestyle/.test(id) ? 'portrait' : 'wedding' }) })).description as string;
const pickFiles = (multiple = false) => new Promise<File[]>((resolve) => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = multiple; i.onchange = () => resolve([...(i.files ?? [])]); i.click(); });

// ---- Drawing the page ----
const OTHER: Record<string, string> = { embed: 'Your enquiry form', unknown: 'A design block', summary: 'A list of your posts', guideSignup: 'The photo guide sign-up', reviews: 'Your reviews' };
const photoHtml = (img: any, where: string, cls = '') => `<figure class="fl-photo ${cls}" data-photo="${where}"><img src="${esc(thumb(img.src))}" alt="${esc(img.alt ?? '')}">
  <figcaption><textarea rows="2" maxlength="250" data-alt="${where}" placeholder="Photo description (for Google and screen readers)">${esc(img.alt ?? '')}</textarea>
  <span class="acts"><button type="button" data-describe="${where}">✨ Suggest</button><button type="button" data-replace="${where}">Replace</button>${where.endsWith('.beside') ? `<button type="button" class="rm" data-unbeside="${where}">Remove</button>` : ''}</span></figcaption></figure>`;

function partHtml(s: any, si: number) {
  const controls = `<div class="part-ctl"><button type="button" data-move="${si}:-1" title="Move up">↑</button><button type="button" data-move="${si}:1" title="Move down">↓</button><button type="button" class="rm" data-delpart="${si}" title="Remove this part">✕</button></div>`;
  if (s.kind === 'gallery') {
    if (s.fromTag) return `<section class="part" data-part="${si}">${controls}<p class="locked">Photo slideshow: the photos from your “${esc(s.fromTag)}” love stories (they update by themselves).</p></section>`;
    return `<section class="part gallery-part" data-part="${si}">${controls}<p class="part-label">Photo slideshow · ${s.images.length} photos · drag to reorder</p>
      <ul class="fl-gal" data-gal="${si}">${s.images.map((img: any, n: number) => `<li data-gi="${n}"><img src="${esc(thumb(img.src, 360))}" alt=""><textarea rows="2" maxlength="250" data-galt placeholder="Photo description">${esc(img.alt ?? '')}</textarea><span class="acts"><button type="button" data-gdescribe>✨</button><button type="button" class="rm" data-grm>Remove</button></span></li>`).join('')}</ul>
      <button type="button" class="s-btn s-btn--quiet" data-gadd="${si}">+ Add photos</button> <span class="uploading" hidden></span></section>`;
  }
  if (s.bgImage?.src) {
    return `<section class="part hero-part" data-part="${si}">${controls}<p class="part-label">Photo with a heading over it</p>${photoHtml(s.bgImage, `${si}.bg`, 'wide')}<div class="fl-text" data-text="${si}"></div></section>`;
  }
  const blocks: any[] = s.blocks ?? [];
  const imgIdx = blocks.findIndex((b) => b.type === 'image' && b.image?.src);
  const others = blocks.map((b, bi) => ({ b, bi })).filter(({ b }) => b.type !== 'text' && b.type !== 'image');
  const hasText = blocks.some((b) => b.type === 'text' && !isTestimonials(b.html ?? ''));
  return `<section class="part" data-part="${si}">${controls}
    ${imgIdx >= 0 ? (hasText ? photoHtml(blocks[imgIdx].image, `${si}.${imgIdx}.beside`, 'beside') : photoHtml(blocks[imgIdx].image, `${si}.${imgIdx}`, 'wide')) : ''}
    ${hasText || imgIdx < 0 ? `<div class="fl-text" data-text="${si}"></div>` : ''}
    ${hasText && imgIdx < 0 ? `<button type="button" class="add-beside" data-addbeside="${si}">+ Photo beside this</button>` : ''}
    ${others.map(({ b, bi }) => b.type === 'button'
      ? `<div class="fl-button"><input data-btext="${si}.${bi}" value="${esc(b.text)}" aria-label="Button words"><input data-bhref="${si}.${bi}" value="${esc(b.href ?? '')}" aria-label="Button link" placeholder="/contact"></div>`
      : `<p class="locked">${OTHER[b.type] ?? 'Part of the page design'} appears here (ask Claude to change it).</p>`).join('')}
    <div class="clear"></div></section>`;
}
const inserter = (at: number) => `<div class="inserter"><span>Add here:</span><button type="button" data-insert="${at}:text">+ Text</button><button type="button" data-insert="${at}:photo">+ Photo</button><button type="button" data-insert="${at}:gallery">+ Slideshow</button></div>`;

function textHtmlOf(s: any) {
  return (s.blocks ?? []).filter((b: any) => b.type === 'text' && !isTestimonials(b.html ?? '')).map((b: any) => b.html).join('')
    .replace(/\s*style="text-align:\s*[a-z]+;?"/g, '').replace(/<span class="sqsrte-[^"]*">([\s\S]*?)<\/span>/g, '$1');
}
function draw() {
  readAll();
  editors.forEach((e) => e.destroy()); editors.clear(); lastEditor = null;
  const box = $('.flow');
  box.innerHTML = data.sections.map((s: any, si: number) => inserter(si) + partHtml(s, si)).join('') + inserter(data.sections.length);
  box.querySelectorAll<HTMLElement>('[data-text]').forEach((el) => {
    const si = Number(el.dataset.text);
    const ed = new Editor({
      element: el,
      // Links keep their own target/rel (and new ones get none, so links within the site stay normal links).
      extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }), Link.configure({ openOnClick: false, HTMLAttributes: { target: null, rel: null } }), Placeholder.configure({ placeholder: 'Write here…' })],
      content: textHtmlOf(data.sections[si]),
      onUpdate: () => markDirty(),
      onFocus: ({ editor }) => { lastEditor = editor; },
    });
    editors.set(si, ed);
  });
  box.querySelectorAll<HTMLElement>('[data-gal]').forEach((ul) => Sortable.create(ul, { animation: 180, filter: 'textarea, button', preventOnFilter: false, onEnd: () => { readGalleries(); markDirty(); } }));
}

// ---- Reading the screen back into the data ----
const imgOf = (where: string) => {
  const [si, bi] = where.split('.');
  const s = data.sections[Number(si)];
  return bi === 'bg' ? s.bgImage : s.blocks[Number(bi)].image;
};
function readGalleries() {
  document.querySelectorAll<HTMLElement>('[data-gal]').forEach((ul) => {
    const s = data.sections[Number(ul.dataset.gal)];
    const old = s.images;
    s.images = [...ul.querySelectorAll<HTMLElement>('li')].map((li) => ({ ...old[Number(li.dataset.gi)], alt: li.querySelector<HTMLTextAreaElement>('[data-galt]')!.value.trim() }));
    ul.querySelectorAll<HTMLElement>('li').forEach((li, n) => { li.dataset.gi = String(n); });
  });
}
function readAll() {
  if (!data) return;
  readGalleries();
  editors.forEach((ed, si) => {
    const s = data.sections[si];
    const html = ed.isEmpty ? '' : ed.getHTML();
    const blocks: any[] = s.blocks ?? (s.blocks = []);
    const first = blocks.findIndex((b) => b.type === 'text' && !isTestimonials(b.html ?? ''));
    if (first >= 0) blocks[first].html = html;
    else if (html) blocks.push({ id: rid(), type: 'text', html, area: { m: '1/2/7/10', zm: 1, d: '1/2/19/26', zd: 1 }, valign: { m: 'flex-start', d: 'flex-start' } });
  });
  document.querySelectorAll<HTMLTextAreaElement>('[data-alt]').forEach((ta) => { const img = imgOf(ta.dataset.alt!.replace('.beside', '')); if (img) img.alt = ta.value.trim(); });
  document.querySelectorAll<HTMLInputElement>('[data-btext]').forEach((i) => { const [si, bi] = i.dataset.btext!.split('.').map(Number); data.sections[si].blocks[bi].text = i.value.trim(); });
  document.querySelectorAll<HTMLInputElement>('[data-bhref]').forEach((i) => { const [si, bi] = i.dataset.bhref!.split('.').map(Number); data.sections[si].blocks[bi].href = i.value.trim() || null; });
  data.title = $<HTMLInputElement>('[name=title]').value.trim();
  data.description = $<HTMLTextAreaElement>('[name=description]').value.trim();
}

// ---- New parts ----
function newSection(kind: 'text' | 'photo' | 'gallery', img?: any) {
  const like = data.sections.find((s: any) => s.kind === 'fluid' && !s.bgImage) ?? {};
  const base = { id: rid(), bg: 'rgb(255, 255, 255)', bgImage: null, bgOverlay: null, headingColor: like.headingColor ?? null, textColor: like.textColor ?? null, divider: null, pad: like.pad ?? { d: [1.4, 1.4], m: [0.9, 0.9] }, height: { d: 700, m: 700 } };
  const area = { m: '1/2/7/10', zm: 1, d: '1/2/19/26', zd: 1 }, valign = { m: 'flex-start', d: 'flex-start' };
  if (kind === 'gallery') return { ...base, kind: 'gallery', design: 'showcase', images: [] };
  if (kind === 'photo') return { ...base, kind: 'fluid', grid: like.grid, blocks: [{ id: rid(), type: 'image', image: img, fit: 'cover', radius: '0px', href: null, caption: null, area, valign }] };
  return { ...base, kind: 'fluid', grid: like.grid, blocks: [{ id: rid(), type: 'text', html: '<h2>A new heading</h2><p>Write here.</p>', area, valign }] };
}

// ---- Toolbar (acts on the text you're in) ----
document.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('.fl-toolbar button')) e.preventDefault(); });
$('.fl-toolbar').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-cmd]');
  if (!b) return;
  const ed = lastEditor ?? [...editors.values()][0];
  if (!ed) return;
  const c = ed.chain().focus();
  const cmd = b.dataset.cmd!;
  if (cmd === 'bold') c.toggleBold().run();
  else if (cmd === 'italic') c.toggleItalic().run();
  else if (cmd === 'h1') c.toggleHeading({ level: 1 }).run();
  else if (cmd === 'h2') c.toggleHeading({ level: 2 }).run();
  else if (cmd === 'h3') c.toggleHeading({ level: 3 }).run();
  else if (cmd === 'p') c.setParagraph().run();
  else if (cmd === 'ul') c.toggleBulletList().run();
  else if (cmd === 'link') {
    const cur = ed.getAttributes('link').href ?? '';
    const href = prompt('Link to (e.g. /contact or https://…). Leave empty to remove the link.', cur);
    if (href === null) return;
    if (href.trim()) c.extendMarkRange('link').setLink({ href: href.trim() }).run(); else c.extendMarkRange('link').unsetLink().run();
  }
  markDirty();
});

// ---- Clicks ----
document.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  const mv = t.closest<HTMLButtonElement>('[data-move]');
  if (mv) { const [si, d] = mv.dataset.move!.split(':').map(Number); const to = si + d; if (to < 0 || to >= data.sections.length) return; readAll(); const [s] = data.sections.splice(si, 1); data.sections.splice(to, 0, s); draw(); markDirty(); return; }
  const dp = t.closest<HTMLButtonElement>('[data-delpart]');
  if (dp) { if (!confirm('Remove this part of the page?')) return; readAll(); data.sections.splice(Number(dp.dataset.delpart), 1); draw(); markDirty(); return; }
  const ins = t.closest<HTMLButtonElement>('[data-insert]');
  if (ins) {
    const [at, kind] = ins.dataset.insert!.split(':');
    readAll();
    if (kind === 'photo') {
      const [f] = await pickFiles(); if (!f) return;
      ins.textContent = 'Uploading…';
      try { data.sections.splice(Number(at), 0, newSection('photo', await upload(f))); } catch (err) { toast((err as Error).message, true); }
    } else data.sections.splice(Number(at), 0, newSection(kind as 'text' | 'gallery'));
    draw(); markDirty(); return;
  }
  const ab = t.closest<HTMLButtonElement>('[data-addbeside]');
  if (ab) {
    const [f] = await pickFiles(); if (!f) return;
    ab.textContent = 'Uploading…';
    try { readAll(); const s = data.sections[Number(ab.dataset.addbeside)]; s.blocks.push({ id: rid(), type: 'image', image: await upload(f), fit: 'cover', radius: '0px', href: null, caption: null, area: { m: '1/2/7/10', zm: 1, d: '1/14/19/26', zd: 1 }, valign: { m: 'center', d: 'center' } }); draw(); markDirty(); } catch (err) { toast((err as Error).message, true); ab.textContent = '+ Photo beside this'; }
    return;
  }
  const ub = t.closest<HTMLButtonElement>('[data-unbeside]');
  if (ub) { if (!confirm('Remove this photo from the page?')) return; readAll(); const [si, bi] = ub.dataset.unbeside!.split('.').map(Number); data.sections[si].blocks.splice(bi, 1); draw(); markDirty(); return; }
  const ds = t.closest<HTMLButtonElement>('[data-describe]');
  if (ds) { const where = ds.dataset.describe!; ds.disabled = true; ds.textContent = 'Looking…'; try { const v = await describe(imgOf(where.replace('.beside', '')).src); document.querySelector<HTMLTextAreaElement>(`[data-alt="${where}"]`)!.value = v; markDirty(); } catch (err) { toast((err as Error).message, true); } ds.disabled = false; ds.textContent = '✨ Suggest'; return; }
  const rp = t.closest<HTMLButtonElement>('[data-replace]');
  if (rp) {
    const [f] = await pickFiles(); if (!f) return;
    rp.textContent = 'Uploading…';
    try { readAll(); const up = await upload(f); Object.assign(imgOf(rp.dataset.replace!.replace('.beside', '')), { src: up.src, alt: '', ...(up.width ? { width: up.width, height: up.height } : {}) }); draw(); markDirty(); toast('Photo replaced. Give it a description.'); } catch (err) { toast((err as Error).message, true); rp.textContent = 'Replace'; }
    return;
  }
  const gd = t.closest<HTMLButtonElement>('[data-gdescribe]');
  if (gd) { readGalleries(); const li = gd.closest<HTMLElement>('li')!; const s = data.sections[Number(li.closest<HTMLElement>('[data-gal]')!.dataset.gal)]; gd.disabled = true; try { li.querySelector<HTMLTextAreaElement>('[data-galt]')!.value = await describe(s.images[Number(li.dataset.gi)].src); markDirty(); } catch (err) { toast((err as Error).message, true); } gd.disabled = false; return; }
  const gr = t.closest<HTMLButtonElement>('[data-grm]');
  if (gr) { if (confirm('Remove this photo from the slideshow?')) { gr.closest('li')!.remove(); readGalleries(); markDirty(); } return; }
  const ga = t.closest<HTMLButtonElement>('[data-gadd]');
  if (ga) {
    const files = await pickFiles(true); if (!files.length) return;
    readAll();
    const s = data.sections[Number(ga.dataset.gadd)];
    const st = ga.parentElement!.querySelector<HTMLElement>('.uploading')!;
    for (const [n, f] of files.entries()) { st.hidden = false; st.textContent = `Uploading ${n + 1} of ${files.length}…`; try { s.images.push({ ...(await upload(f)), href: null, title: null }); } catch (err) { toast((err as Error).message, true); } }
    draw(); markDirty(); return;
  }
  if (t.closest('[data-phone]')) { document.body.classList.toggle('fl-phone'); t.closest('[data-phone]')!.classList.toggle('on'); return; }
  if (t.closest('[data-save]')) await save();
});
document.addEventListener('input', (e) => { const el = e.target as HTMLElement; if (el.closest('.flow textarea, .flow input, .side input, .side textarea')) { markDirty(); counts(); } });

// ---- Google side panel ----
function counts() {
  for (const [n, lo, hi] of [['title', 30, 60], ['description', 120, 155]] as const) {
    const v = $<HTMLInputElement>(`[name=${n}]`).value.trim();
    const c = $(`[data-cnt="${n}"]`); c.textContent = `${v.length} (aim for ${lo}–${hi})`; c.className = `cnt ${v.length >= lo && v.length <= hi ? 'up' : 'down'}`;
  }
  const t = $<HTMLInputElement>('[name=title]').value.trim(), d = $<HTMLTextAreaElement>('[name=description]').value.trim();
  $('.serp-title').textContent = t.length > 62 ? `${t.slice(0, 60)}…` : t;
  $('.serp-desc').textContent = d.length > 160 ? `${d.slice(0, 158)}…` : d;
}

async function save() {
  readAll();
  if (!data.title) { toast('The page needs a Google title.', true); return; }
  const btn = $<HTMLButtonElement>('[data-save]');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const r = await api('/api/studio/page', { method: 'PUT', body: JSON.stringify({ id, data, sha, message: `Studio: update page ${data.path}` }) });
    sha = r.sha; dirty = false;
    $('.pe-state').textContent = 'Saved. The website updates in about 2 minutes.';
  } catch (err) { btn.disabled = false; toast((err as Error).message, true); }
  btn.textContent = 'Save';
}

export async function startFlow() {
  try { const r = await api(`/api/studio/page?id=${encodeURIComponent(id)}`); data = r.data; sha = r.sha; } catch (err) { $('.pe-title').textContent = (err as Error).message; return; }
  // The site shows a section's text blocks joined together; join them once here so each section
  // has one text to edit (and block positions don't shift while editing).
  for (const sec of data.sections) {
    const blocks: any[] = sec.blocks ?? [];
    const first = blocks.findIndex((b) => b.type === 'text' && !isTestimonials(b.html ?? ''));
    if (first < 0) continue;
    blocks[first].html = textHtmlOf(sec);
    sec.blocks = blocks.filter((b, i) => i === first || b.type !== 'text' || isTestimonials(b.html ?? ''));
  }
  $('.pe-title').textContent = String(data.title).replace(/\s*\|\s*Moments In Light\s*$/i, '');
  $('.pe-path').textContent = data.path;
  $<HTMLAnchorElement>('.pe-view').href = data.path;
  document.title = `${$('.pe-title').textContent} · Moments Studio`;
  $('.serp-url').textContent = `momentsinlight.co.nz${data.path.replace(/\//g, ' › ')}`;
  $<HTMLInputElement>('[name=title]').value = data.title ?? '';
  $<HTMLTextAreaElement>('[name=description]').value = data.description ?? '';
  counts();
  draw();
  dirty = false; $<HTMLButtonElement>('[data-save]').disabled = true; $('.pe-state').textContent = '';
  if (new URLSearchParams(location.search).get('new')) toast('Your new page is made. Write it here and Save; it appears on the website about 2 minutes after each save.');
}
