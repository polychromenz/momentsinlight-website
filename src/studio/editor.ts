import { ask, askText, guardLeaving } from './dialogs';
// Moments Studio editor (src/pages/studio/edit.astro).
// Opens a post from the repository (via /api/studio/post), lets Tony edit it in place, uploads
// photos straight to Cloudflare Images, and saves it back: Publish puts it live (or schedules it
// when the date is in the future), Save draft keeps it off the site.
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { marked } from 'marked';
import TurndownService from 'turndown';
import Sortable from 'sortablejs';
import { parsePost, writePost, slugify, type PostData, type Photo } from './frontmatter';

// ---------- Helpers ----------
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const field = <T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(name: string) => document.querySelector<T>(`[name="${name}"]`)!;
const today = () => new Date().toISOString().slice(0, 10);
const thumb = (src: string, w = 500) => (src.startsWith('https://imagedelivery.net/') ? src.replace(/\/[^/]+$/, `/w=${w},q=75`) : src);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const presets: Record<string, string> = { top: '50% 0%', upper: '50% 25%', center: '50% 50%', lower: '50% 75%', bottom: '50% 100%' };

const toastEl = $('.s-toast');
let toastTimer = 0;
const toast = (html: string, error = false, ms = 6000) => {
  toastEl.innerHTML = html;
  toastEl.classList.toggle('error', error);
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), ms);
};

async function api(path: string, init: RequestInit = {}) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `Something went wrong (${r.status}).`), { status: r.status, data });
  return data;
}

// ---------- State ----------
const params = new URLSearchParams(location.search);
let id = params.get('id') ?? '';
const isNew = !id;
let sha: string | undefined;
let data: PostData = {
  title: '', description: '', date: today(), author: 'Tony Gorham', categories: ['Wedding'], tags: [], draft: true, gallery: [],
};
let rawMode = false;
let dirty = false;
let meta: { venues: { name: string; tag: string }[]; reviews: { name: string; date: string; start: string }[] } = { venues: [], reviews: [] };

const markDirty = () => {
  dirty = true;
  $('.save-state').textContent = 'Unsaved changes';
};
guardLeaving(() => dirty);

// ---------- Story editor ----------
const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', emDelimiter: '*', strongDelimiter: '**', hr: '---' });
let editor: Editor | null = null;
const storyEl = $('.story');
const rawEl = $<HTMLTextAreaElement>('.story-raw');
const rawPreview = $('.raw-preview');

const needsRaw = (md: string) => /^\s*\|.*\|\s*$/m.test(md) || /<(?!br\b)[a-z][^>]*>/i.test(md);

function startStory(md: string) {
  rawMode = needsRaw(md);
  $('.raw-note').hidden = !rawMode;
  storyEl.hidden = rawMode;
  rawEl.hidden = !rawMode;
  rawPreview.hidden = !rawMode;
  document.querySelectorAll<HTMLButtonElement>('.toolbar button').forEach((b) => { b.disabled = rawMode && b.dataset.cmd !== 'image'; });
  if (rawMode) {
    rawEl.value = md;
    const update = () => { rawPreview.innerHTML = marked.parse(rawEl.value) as string; };
    rawEl.addEventListener('input', () => { update(); markDirty(); });
    update();
    return;
  }
  editor = new Editor({
    element: storyEl,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, codeBlock: false, code: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder: 'Tell the story of the day…' }),
    ],
    content: marked.parse(md) as string,
    onUpdate: () => { markDirty(); updateToolbar(); },
    onSelectionUpdate: () => updateToolbar(),
  });
}
const storyMarkdown = () => (rawMode ? rawEl.value : turndown.turndown(editor?.getHTML() ?? '')).trim();

function updateToolbar() {
  if (!editor) return;
  const on: Record<string, boolean> = {
    h2: editor.isActive('heading', { level: 2 }), h3: editor.isActive('heading', { level: 3 }),
    bold: editor.isActive('bold'), italic: editor.isActive('italic'), link: editor.isActive('link'),
    bullet: editor.isActive('bulletList'), ordered: editor.isActive('orderedList'), quote: editor.isActive('blockquote'),
  };
  document.querySelectorAll<HTMLButtonElement>('.toolbar button').forEach((b) => b.classList.toggle('on', !!on[b.dataset.cmd!]));
}

document.querySelectorAll<HTMLButtonElement>('.toolbar button').forEach((b) =>
  b.addEventListener('click', async () => {
    const cmd = b.dataset.cmd!;
    if (cmd === 'image') { $<HTMLInputElement>('.inline-file').click(); return; }
    if (!editor) return;
    const c = editor.chain().focus();
    if (cmd === 'h2') c.toggleHeading({ level: 2 }).run();
    if (cmd === 'h3') c.toggleHeading({ level: 3 }).run();
    if (cmd === 'bold') c.toggleBold().run();
    if (cmd === 'italic') c.toggleItalic().run();
    if (cmd === 'bullet') c.toggleBulletList().run();
    if (cmd === 'ordered') c.toggleOrderedList().run();
    if (cmd === 'quote') c.toggleBlockquote().run();
    if (cmd === 'undo') c.undo().run();
    if (cmd === 'redo') c.redo().run();
    if (cmd === 'link') {
      const prev = editor.getAttributes('link').href as string | undefined;
      const href = await askText('Link to (a web address, or a page on your site such as /weddings). Leave empty to remove the link.', prev ?? 'https://');
      if (href === null) return;
      if (!href.trim() || href.trim() === 'https://') c.unsetLink().run();
      else c.extendMarkRange('link').setLink({ href: href.trim() }).run();
    }
  }),
);

// A photo inside the story: uploaded like the gallery photos, placed where the cursor is.
$<HTMLInputElement>('.inline-file').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  toast('Uploading the photo…', false, 60000);
  try {
    const p = await uploadPhoto(file, () => {});
    const alt = await askText('A short description of this photo (for Google and screen readers):', '') ?? '';
    const src = p.src.replace(/\/public$/, '/w=1600,q=75');
    if (rawMode) {
      rawEl.setRangeText(`\n\n![${alt}](${src})\n\n`, rawEl.selectionStart, rawEl.selectionEnd, 'end');
      rawEl.dispatchEvent(new Event('input'));
    } else {
      editor?.chain().focus().setImage({ src, alt }).run();
    }
    toast('Photo added to the story.');
  } catch (err) {
    toast(esc((err as Error).message), true);
  }
});

// ---------- Title, eyebrow and Google preview ----------
const titleEl = $<HTMLTextAreaElement>('.title-input');
const growTitle = () => { titleEl.style.height = 'auto'; titleEl.style.height = `${titleEl.scrollHeight}px`; };
titleEl.addEventListener('input', () => { growTitle(); markDirty(); refreshPreview(); if (isNew && !slugTouched) field<HTMLInputElement>('slug').value = slugify(titleEl.value); });

const venueName = () => {
  const v = field<HTMLSelectElement>('venueChoice').value;
  return v === '__other' ? field<HTMLInputElement>('venueOther').value.trim() : v === '' ? '' : meta.venues.find((x) => x.tag === v)?.name ?? '';
};
const kind = () => field<HTMLSelectElement>('kind').value;

function refreshPreview() {
  const k = kind();
  const label = k === 'Wedding' ? '' : k === 'Portrait' ? 'Portrait session' : k === 'Family' ? 'Family session' : 'Wedding planning';
  const d = field<HTMLInputElement>('date').value;
  const month = d ? new Date(d).toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' }) : '';
  $('.eyebrow-preview').textContent = [venueName() || label, month].filter(Boolean).join(' · ');
  const seoT = field<HTMLInputElement>('seoTitle').value || titleEl.value;
  const seoD = field<HTMLTextAreaElement>('description').value;
  $('.serp-title').textContent = seoT || 'Your Google title';
  $('.serp-url').textContent = `momentsinlight.co.nz › blog › ${field<HTMLInputElement>('slug').value || '…'}`;
  $('.serp-desc').textContent = seoD || 'Your Google description appears here.';
  for (const [name, max] of [['seoTitle', 60], ['description', 155]] as const) {
    const n = field<HTMLInputElement>(name).value.length;
    const c = document.querySelector<HTMLElement>(`.count[data-for="${name}"]`)!;
    c.textContent = `${n}/${max}`;
    c.classList.toggle('over', n > max);
  }
  seoChecklist();
  refreshStatus();
}

// The SEO checklist under the Google preview: what helps this post be found, and what's missing.
function seoChecklist() {
  const title = field<HTMLInputElement>('seoTitle').value.trim() || titleEl.value.trim();
  const desc = field<HTMLTextAreaElement>('description').value.trim();
  const venue = venueName();
  const words = (document.querySelector('.ProseMirror')?.textContent ?? '').trim().split(/\s+/).filter(Boolean).length;
  let photos: Tile[] = [];
  try { photos = tiles.filter((t) => t.src); } catch { /* the photos aren't set up yet (first run on page load) */ }
  const noAlt = photos.filter((t) => !t.alt?.trim()).length;
  const slug = field<HTMLInputElement>('slug').value;
  const checks: [boolean, string][] = [
    [title.length >= 30 && title.length <= 60, title.length < 30 ? `Google title is short (${title.length} characters); 30–60 works best` : title.length > 60 ? `Google title is long (${title.length}); Google cuts it after about 60` : 'Google title is a good length'],
    [desc.length >= 70 && desc.length <= 155, !desc ? 'Add a Google description (70–155 characters)' : desc.length < 70 ? 'Google description is short; aim for 70–155 characters' : desc.length > 155 ? 'Google description is long; Google cuts it after about 155' : 'Google description is a good length'],
    [kind() !== 'Wedding' || !!venue, kind() === 'Wedding' && !venue ? 'Choose the venue: it puts the post on the venue’s page, and venue names are what couples search for' : 'Venue chosen'],
    [!venue || (title + ' ' + desc).toLowerCase().includes(venue.toLowerCase().split(' ')[0]), venue ? `Mention ${venue} in the Google title or description` : 'Search words are in the title'],
    [!photos.length || noAlt === 0, noAlt ? `${noAlt} photo${noAlt === 1 ? '' : 's'} without a description (use ✨ Suggest descriptions)` : photos.length ? 'Every photo has a description' : 'No photos yet'],
    [words >= 150, words < 150 ? `The story is short (${words} words); 150+ words helps Google understand the post` : `The story has ${words} words`],
    [slug.length > 0 && slug.length <= 60 && !/\d{4}/.test(slug), !slug ? 'Add a web address' : slug.length > 60 ? 'The web address is long; shorter is better' : /\d{4}/.test(slug) ? 'Leave dates out of the web address so it doesn’t look old' : 'Web address is short and clear'],
  ];
  const ok = checks.filter(([v]) => v).length;
  $('.seo-check').innerHTML = checks.map(([v, t]) => `<li class="${v ? '' : 'todo'}">${esc(t)}</li>`).join('');
  $('.seo-score').textContent = `${ok} of ${checks.length} done`;
}

// ---------- Settings panel ----------
let slugTouched = false;
field<HTMLInputElement>('slug').addEventListener('input', () => { slugTouched = true; refreshPreview(); markDirty(); });
document.querySelectorAll<HTMLElement>('.panel input, .panel select, .panel textarea').forEach((el) =>
  el.addEventListener('input', () => { markDirty(); refreshPreview(); }),
);
field<HTMLSelectElement>('venueChoice').addEventListener('change', () => {
  $('.venue-other').hidden = field<HTMLSelectElement>('venueChoice').value !== '__other';
  // The venue's tag puts the post on that venue's page.
  const tags = new Set(field<HTMLInputElement>('tags').value.split(',').map((t) => t.trim()).filter(Boolean));
  meta.venues.forEach((v) => tags.delete(v.tag));
  const chosen = field<HTMLSelectElement>('venueChoice').value;
  if (chosen && chosen !== '__other') tags.add(chosen);
  field<HTMLInputElement>('tags').value = [...tags].join(', ');
});
$('[data-act="panel"]').addEventListener('click', (e) => {
  const wrap = $('.editor-wrap');
  wrap.classList.toggle('panel-closed');
  (e.currentTarget as HTMLElement).setAttribute('aria-expanded', String(!wrap.classList.contains('panel-closed')));
});

const state = () => (data.draft ? 'draft' : data.date > today() ? 'scheduled' : 'live');
function refreshStatus() {
  const s = isNew && !sha ? 'new' : state();
  const label = { new: 'New post: not saved yet', draft: 'Draft: not on the site', scheduled: `Scheduled for ${data.date}`, live: 'Published' }[s];
  $('.panel-status').innerHTML = `<span class="s-chip s-chip--${s === 'live' ? 'live' : s === 'scheduled' ? 'scheduled' : 'draft'}">${label}</span>`;
  const future = field<HTMLInputElement>('date').value > today();
  $('[data-act="publish"]').textContent = future ? 'Schedule' : s === 'live' ? 'Update' : 'Publish';
  $<HTMLButtonElement>('[data-act="unpublish"]').hidden = s !== 'live' && s !== 'scheduled';
  $<HTMLButtonElement>('[data-act="delete"]').hidden = !sha;
  const live = $<HTMLAnchorElement>('.view-live');
  live.hidden = s !== 'live';
  live.href = `/blog/${id}`;
  refreshShare(s === 'live');
}

// ---------- Share it (shown once the post is live) ----------
const SITE = 'https://www.momentsinlight.co.nz';
function refreshShare(isLive: boolean) {
  $<HTMLFieldSetElement>('.share-box').hidden = !isLive;
  if (!isLive) return;
  const url = `${SITE}/blog/${id}`;
  const cover = coverSrc();
  $<HTMLAnchorElement>('[data-share="facebook"]').href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  const pin = $<HTMLAnchorElement>('[data-share="pinterest"]');
  pin.hidden = !cover;
  pin.href = `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}&media=${encodeURIComponent(thumb(cover, 1500))}&description=${encodeURIComponent(data.title)}`;
}
async function copyText(text: string, done: string) {
  try { await navigator.clipboard.writeText(text); toast(done); }
  catch { await askText('Copy this:', text); }
}
$('[data-share="link"]').addEventListener('click', () => copyText(`${SITE}/blog/${id}`, 'Link copied.'));
// Instagram doesn't take posts from websites, so this copies a caption to paste in the app.
$('[data-share="caption"]').addEventListener('click', () => {
  const caption = [data.title, data.description, `${SITE.replace('https://', '')}/blog/${id}`].filter(Boolean).join('\n\n');
  copyText(caption, 'Caption copied. Paste it into Instagram with your photos.');
});

// ---------- Cover photo and focus point ----------
const coverFrame = $('.cover-frame');
const coverImg = $<HTMLImageElement>('.cover-img');
const dot = $('.focus-dot');
const coverSrc = () => data.thumbnail || data.gallery[0]?.src || '';
function renderCover() {
  const src = coverSrc();
  coverFrame.hidden = !src;
  $('.cover-hint').hidden = !src;
  $('.cover-empty').hidden = !!src;
  if (!src) return;
  coverImg.src = thumb(src, 1500);
  const [x, y] = (presets[data.thumbnailPosition ?? ''] ?? data.thumbnailPosition ?? '50% 50%').split(' ').map((v) => parseFloat(v));
  dot.style.left = `${x}%`;
  dot.style.top = `${y}%`;
}
coverFrame.addEventListener('click', (e) => {
  const r = coverImg.getBoundingClientRect();
  const x = Math.round(((e.clientX - r.left) / r.width) * 100);
  const y = Math.round(((e.clientY - r.top) / r.height) * 100);
  data.thumbnailPosition = `${Math.min(100, Math.max(0, x))}% ${Math.min(100, Math.max(0, y))}%`;
  renderCover();
  markDirty();
});

// ---------- Photos ----------
const grid = $<HTMLUListElement>('.photo-grid');
type Tile = Photo & { key: string; progress?: number };
let tiles: Tile[] = [];
let keySeq = 0;

function renderPhotos() {
  grid.innerHTML = tiles.map((t) => `
    <li data-key="${t.key}">
      <div class="ph">
        ${t.src ? `<img src="${esc(thumb(t.src, 400))}" alt="">` : '<span>Uploading…</span>'}
        ${t.progress !== undefined ? `<span class="bar" style="width:${Math.round(t.progress * 100)}%"></span>` : ''}
        ${t.src ? `<span class="ph-actions">
          <button type="button" class="star ${coverSrc() === t.src ? 'on' : ''}" title="Use as the cover">${coverSrc() === t.src ? '★' : '☆'}</button>
          <button type="button" class="remove" title="Remove from the post">×</button>
        </span>` : ''}
      </div>
      ${t.src ? `<textarea placeholder="Description (for Google and screen readers)">${esc(t.alt ?? '')}</textarea>
      <div class="ph-row"><span>${t.width && t.height ? `${t.width} × ${t.height}` : ''}</span><button type="button" class="suggest">✨ Suggest</button></div>` : ''}
    </li>`).join('');
}
const tileOf = (el: Element) => tiles.find((t) => t.key === (el.closest('li') as HTMLElement)?.dataset.key);
grid.addEventListener('click', async (e) => {
  const btn = (e.target as Element).closest('button');
  const t = btn && tileOf(btn);
  if (!btn || !t) return;
  if (btn.classList.contains('star')) { data.thumbnail = t.src; data.thumbnailPosition = undefined; data.thumbnailAlt = undefined; renderPhotos(); renderCover(); markDirty(); }
  if (btn.classList.contains('remove') && await ask('Remove this photo from the post? (It stays in your photo library.)')) {
    tiles = tiles.filter((x) => x !== t);
    if (data.thumbnail === t.src) data.thumbnail = undefined;
    syncGallery(); renderPhotos(); renderCover(); markDirty();
  }
  if (btn.classList.contains('suggest')) await suggestAlt(t, btn.closest('li')!.querySelector('textarea')!);
});
grid.addEventListener('input', (e) => {
  const ta = e.target as HTMLTextAreaElement;
  const t = tileOf(ta);
  if (t) { t.alt = ta.value; syncGallery(); markDirty(); }
});
Sortable.create(grid, {
  animation: 180,
  filter: 'textarea, button',
  preventOnFilter: false,
  onEnd: () => {
    const order = [...grid.children].map((li) => (li as HTMLElement).dataset.key);
    tiles.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    syncGallery(); renderCover(); markDirty();
  },
});
const syncGallery = () => { data.gallery = tiles.filter((t) => t.src).map(({ src, alt, width, height }) => ({ src, alt: alt ?? '', width, height })); seoChecklist(); };

const names = () => titleEl.value.split(/\s[|–—-]\s/)[0].replace(/&/g, 'and');
const kindKey = () => ({ Wedding: 'wedding', Portrait: 'portrait', Family: 'family' } as Record<string, string>)[kind()] ?? 'article';
async function suggestAlt(t: Tile, ta: HTMLTextAreaElement) {
  ta.placeholder = 'Thinking…';
  try {
    const r = await api('/api/studio/describe', { method: 'POST', body: JSON.stringify({ src: t.src, names: names(), kind: kindKey() }) });
    t.alt = r.description;
    ta.value = r.description;
    syncGallery(); markDirty();
  } catch (err) {
    toast(esc((err as Error).message), true);
  } finally {
    ta.placeholder = 'Description (for Google and screen readers)';
  }
}
$('[data-act="describe-all"]').addEventListener('click', async () => {
  const todo = tiles.filter((t) => t.src && !t.alt?.trim());
  if (!todo.length) { toast('Every photo already has a description.'); return; }
  toast(`Suggesting descriptions for ${todo.length} photo${todo.length === 1 ? '' : 's'}…`, false, 120000);
  for (const t of todo) {
    const ta = grid.querySelector<HTMLTextAreaElement>(`li[data-key="${t.key}"] textarea`);
    if (ta) await suggestAlt(t, ta);
  }
  toast('Done. Have a quick read and tweak any that aren’t quite right.');
});

// Uploading: each photo goes straight from this browser to Cloudflare Images.
async function uploadPhoto(file: File, onProgress: (f: number) => void): Promise<Photo> {
  let width: number | undefined, height: number | undefined;
  try { const bmp = await createImageBitmap(file); width = bmp.width; height = bmp.height; bmp.close(); } catch { /* dimensions unknown */ }
  const folder = `${(field<HTMLInputElement>('date').value || today()).slice(0, 4)}-${field<HTMLInputElement>('slug').value || slugify(titleEl.value) || 'new-post'}`;
  const name = file.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_.-]+/g, '-');
  const { uploadURL, src } = await api('/api/studio/upload', { method: 'POST', body: JSON.stringify({ id: `${folder}/${name}` }) });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadURL);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection.'));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
  return { src, alt: '', width, height };
}

async function addFiles(files: File[]) {
  const images = files.filter((f) => /^image\//.test(f.type)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (!images.length) return;
  const added = images.map((f) => ({ file: f, tile: { key: `n${keySeq++}`, src: '', alt: '', progress: 0 } as Tile }));
  tiles.push(...added.map((a) => a.tile));
  renderPhotos();
  toast(`Uploading ${images.length} photo${images.length === 1 ? '' : 's'}…`, false, 600000);
  let next = 0, failed = 0;
  const worker = async () => {
    while (next < added.length) {
      const a = added[next++];
      try {
        const p = await uploadPhoto(a.file, (f) => { a.tile.progress = f; const bar = grid.querySelector<HTMLElement>(`li[data-key="${a.tile.key}"] .bar`); if (bar) bar.style.width = `${Math.round(f * 100)}%`; });
        Object.assign(a.tile, p, { progress: undefined });
      } catch {
        failed++;
        tiles = tiles.filter((t) => t !== a.tile);
      }
      syncGallery(); renderPhotos(); renderCover(); markDirty();
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  toast(failed ? `${images.length - failed} uploaded, ${failed} didn’t. Try those again.` : `${images.length} photo${images.length === 1 ? '' : 's'} uploaded. Remember to save.`, !!failed);
}

// ---- Photos from a studio gallery (functions/api/studio/blog-photos.js) ----
// Opens the couple's gallery (Blog-marked photos first); ticked photos are copied server side
// into Cloudflare Images like an upload, added to the post, and given descriptions.
{
  const dlg = $<HTMLDialogElement>('dialog.gp');
  const sel = dlg.querySelector<HTMLSelectElement>('.gp-gallery')!;
  const only = dlg.querySelector<HTMLInputElement>('.gp-only input')!;
  const grid2 = dlg.querySelector<HTMLElement>('.gp-grid')!;
  type GP = { id: string; thumb: string; w: number; h: number; section: string; blog: boolean };
  let photos: GP[] = [];
  const picked = new Set<string>();
  const count = () => { dlg.querySelector('.gp-count')!.textContent = picked.size ? `${picked.size} ticked` : ''; dlg.querySelector<HTMLButtonElement>('[data-gp="add"]')!.textContent = picked.size ? `Add ${picked.size} photo${picked.size === 1 ? '' : 's'}` : 'Add photos'; };
  const shown = () => (only.checked ? photos.filter((p) => p.blog) : photos);
  const draw = () => {
    const list = shown();
    const note = dlg.querySelector('.gp-note')!;
    note.textContent = !photos.length ? '' : only.checked && !list.length ? 'No photos in this gallery are marked for the blog yet. Untick “Blog-marked only” to see them all, or mark some with B on the gallery’s Photos tab.' : `${list.length} photo${list.length === 1 ? '' : 's'}. Click to tick; ticked ones are copied into this post.`;
    let last = '';
    grid2.innerHTML = list.map((p) => {
      const head = p.section !== last ? `<p class="gp-sec">${esc(p.section || 'Photos')}</p>` : '';
      last = p.section;
      return `${head}<button type="button" class="gp-ph${picked.has(p.id) ? ' on' : ''}" data-gp-id="${p.id}"><img src="${p.thumb}" alt="" loading="lazy" />${p.blog ? '<span class="gp-b">Blog</span>' : ''}</button>`;
    }).join('');
    count();
  };
  const loadGallery = async () => {
    picked.clear();
    grid2.innerHTML = '<p class="gp-sec">Loading…</p>';
    const d = await api(`/api/studio/blog-photos?gallery=${encodeURIComponent(sel.value)}`);
    photos = d.photos;
    if (only.checked && !photos.some((p) => p.blog)) only.checked = false;
    draw();
  };
  $('[data-act="from-gallery"]').addEventListener('click', async () => {
    try {
      const d = await api('/api/studio/blog-photos');
      if (!d.galleries.length) { toast('There are no studio galleries with photos yet.', true); return; }
      // The couple's gallery if the post's title names them (e.g. "Josh & Paul | …" → "Josh and Paul").
      const who = names().toLowerCase().replace(/[^a-z ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && w !== 'and');
      const best = d.galleries.find((g: any) => who.length && who.every((w) => g.name.toLowerCase().includes(w))) ?? d.galleries.find((g: any) => who.some((w) => g.name.toLowerCase().includes(w)));
      sel.innerHTML = d.galleries.map((g: any) => `<option value="${g.id}">${esc(g.name)}${g.event_date ? ` · ${g.event_date}` : ''} (${g.photos}${g.blog ? `, ${g.blog} for blog` : ''})</option>`).join('');
      if (best) sel.value = best.id;
      only.checked = true;
      dlg.showModal();
      await loadGallery();
    } catch (err) { toast(esc((err as Error).message), true); }
  });
  sel.addEventListener('change', () => loadGallery().catch((err) => toast(esc(err.message), true)));
  only.addEventListener('change', draw);
  grid2.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-gp-id]');
    if (!b) return;
    const id = b.dataset.gpId!;
    if (picked.has(id)) picked.delete(id); else picked.add(id);
    b.classList.toggle('on', picked.has(id));
    count();
  });
  dlg.addEventListener('click', async (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-gp]')?.dataset.gp;
    if (act === 'close') dlg.close();
    if (act === 'all') { shown().forEach((p) => picked.add(p.id)); draw(); }
    if (act !== 'add' || !picked.size) return;
    // In the gallery's order, so the post reads like the day.
    const ids = photos.filter((p) => picked.has(p.id)).map((p) => p.id);
    const gid = sel.value;
    const folder = `${(field<HTMLInputElement>('date').value || today()).slice(0, 4)}-${field<HTMLInputElement>('slug').value || slugify(titleEl.value) || 'new-post'}`;
    dlg.close();
    const added: Tile[] = [];
    let failed = 0;
    toast(`Copying ${ids.length} photo${ids.length === 1 ? '' : 's'} from the gallery…`, false, 600000);
    for (let n = 0; n < ids.length; n += 3) {
      try {
        const r = await api('/api/studio/blog-photos', { method: 'POST', body: JSON.stringify({ action: 'copy', gallery_id: gid, image_ids: ids.slice(n, n + 3), folder }) });
        for (const p of r.photos) {
          if (p.error) { failed++; continue; }
          const t: Tile = { key: `g${keySeq++}`, src: p.src, alt: '', width: p.width, height: p.height };
          tiles.push(t); added.push(t);
        }
      } catch { failed += Math.min(3, ids.length - n); }
      syncGallery(); renderPhotos(); renderCover(); markDirty();
      toast(`Copied ${added.length} of ${ids.length}…`, false, 600000);
    }
    if (!added.length) { toast('Those photos didn’t copy. Try again.', true); return; }
    // Descriptions for Google and screen readers, as for uploads.
    toast(`${added.length} photo${added.length === 1 ? '' : 's'} added${failed ? ` (${failed} didn’t copy)` : ''}. Writing descriptions…`, !!failed, 120000);
    for (const t of added) {
      const ta = grid.querySelector<HTMLTextAreaElement>(`li[data-key="${t.key}"] textarea`);
      if (ta) await suggestAlt(t, ta);
    }
    toast(`${added.length} photo${added.length === 1 ? '' : 's'} added from the gallery${failed ? `, ${failed} didn’t copy` : ''}. Have a quick read of the descriptions, then save.`, !!failed);
  });
}

// Collect files from a drop, including whole folders.
async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean) as FileSystemEntry[];
  if (!entries.length) return [...dt.files];
  const out: File[] = [];
  const walk = async (e: FileSystemEntry): Promise<void> => {
    if (e.isFile) out.push(await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej)));
    else if (e.isDirectory) {
      const reader = (e as FileSystemDirectoryEntry).createReader();
      let batch: FileSystemEntry[];
      do {
        batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        for (const c of batch) await walk(c);
      } while (batch.length);
    }
  };
  for (const e of entries) await walk(e);
  return out;
}
const drop = $('.drop');
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('over')));
drop.addEventListener('drop', async (e) => { e.preventDefault(); addFiles(await filesFromDrop((e as DragEvent).dataTransfer!)); });
$<HTMLInputElement>('.file').addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  addFiles([...(input.files ?? [])]);
  input.value = '';
});

// ---------- Google suggestions ----------
$('[data-act="seo"]').addEventListener('click', async (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = '✨ Thinking…';
  try {
    const r = await api('/api/studio/seo', { method: 'POST', body: JSON.stringify({ title: titleEl.value, kind: kindKey(), venue: venueName(), text: storyMarkdown() }) });
    field<HTMLInputElement>('seoTitle').value = r.seoTitle;
    field<HTMLTextAreaElement>('description').value = r.description;
    refreshPreview(); markDirty();
  } catch (err) {
    toast(esc((err as Error).message), true);
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ Suggest from the post';
  }
});

// ---------- Filling the form from a post, and back ----------
function fillForm() {
  titleEl.value = data.title;
  growTitle();
  const k = ['Wedding', 'Portrait', 'Family'].find((c) => data.categories.includes(c)) ?? 'Info';
  field<HTMLSelectElement>('kind').value = k;
  field<HTMLInputElement>('date').value = data.date;
  field<HTMLInputElement>('updated').value = data.updated ?? '';
  field<HTMLInputElement>('author').value = data.author;
  field<HTMLInputElement>('venueUrl').value = data.venueUrl ?? '';
  field<HTMLInputElement>('seoTitle').value = data.seoTitle ?? '';
  field<HTMLTextAreaElement>('description').value = data.description ?? '';
  field<HTMLSelectElement>('opening').value = data.opening ?? '';
  field<HTMLSelectElement>('galleryStyle').value = data.galleryStyle ?? '';
  field<HTMLInputElement>('tags').value = data.tags.join(', ');
  const slug = field<HTMLInputElement>('slug');
  slug.value = id;
  slug.readOnly = !isNew;
  $('.slug-note').textContent = isNew ? 'Set when the post is first saved; it can’t change after that.' : 'Fixed, so links to this post keep working.';

  const vs = field<HTMLSelectElement>('venueChoice');
  vs.innerHTML = `<option value="">None</option>${meta.venues.map((v) => `<option value="${v.tag}">${esc(v.name)}</option>`).join('')}<option value="__other">Another venue…</option>`;
  const known = meta.venues.find((v) => data.tags.includes(v.tag) || v.name === data.venue);
  vs.value = known ? known.tag : data.venue ? '__other' : '';
  field<HTMLInputElement>('venueOther').value = known ? '' : data.venue ?? '';
  $('.venue-other').hidden = vs.value !== '__other';

  const rs = field<HTMLSelectElement>('review');
  rs.innerHTML = `<option value="">None</option>${[...meta.reviews].sort((a, b) => b.date.localeCompare(a.date)).map((r) => `<option value="${esc(r.name)}">${esc(r.name)} – “${esc(r.start)}…”</option>`).join('')}`;
  rs.value = data.review ?? '';

  tiles = data.gallery.map((g) => ({ ...g, key: `p${keySeq++}` }));
  renderPhotos();
  renderCover();
  refreshPreview();
}

function collect(draft: boolean): PostData {
  const k = kind();
  const venue = venueName();
  return {
    ...data,
    title: titleEl.value.trim(),
    seoTitle: field<HTMLInputElement>('seoTitle').value.trim() || undefined,
    description: field<HTMLTextAreaElement>('description').value.trim(),
    date: field<HTMLInputElement>('date').value || today(),
    updated: field<HTMLInputElement>('updated').value || undefined,
    author: field<HTMLInputElement>('author').value.trim() || 'Tony Gorham',
    venue: venue || undefined,
    venueUrl: field<HTMLInputElement>('venueUrl').value.trim() || undefined,
    categories: [k],
    tags: field<HTMLInputElement>('tags').value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
    review: field<HTMLSelectElement>('review').value || undefined,
    opening: (field<HTMLSelectElement>('opening').value || undefined) as PostData['opening'],
    galleryStyle: (field<HTMLSelectElement>('galleryStyle').value || undefined) as PostData['galleryStyle'],
    draft,
    gallery: tiles.filter((t) => t.src).map(({ src, alt, width, height }) => ({ src, alt: alt ?? '', width, height })),
  };
}

// ---------- Saving ----------
async function save(draft: boolean) {
  if (tiles.some((t) => !t.src)) { toast('Wait for the photos to finish uploading first.', true); return; }
  const next = collect(draft);
  if (!next.title) { toast('Give the post a title first.', true); titleEl.focus(); return; }
  if (!next.description) {
    if (!await ask('There’s no Google description yet. Save anyway? (Use “Suggest from the post” to write one.)')) return;
  }
  if (isNew && !sha) {
    const slug = slugify(field<HTMLInputElement>('slug').value || next.title);
    if (!slug) { toast('Choose a web address for the post (More settings).', true); return; }
    const existing = await api(`/api/studio/post?id=${slug}`).catch(() => ({ exists: false }));
    if (existing.exists) { toast('There’s already a post at that web address. Change it in More settings.', true); return; }
    id = slug;
    field<HTMLInputElement>('slug').value = slug;
  }
  const content = writePost(next, storyMarkdown());
  const verb = draft ? 'Save draft' : next.date > today() ? 'Schedule' : 'Publish';
  $('.save-state').textContent = 'Saving…';
  document.querySelectorAll<HTMLButtonElement>('[data-act="draft"], [data-act="publish"]').forEach((b) => (b.disabled = true));
  try {
    const r = await api('/api/studio/post', { method: 'PUT', body: JSON.stringify({ id, content, sha, message: `Studio: ${verb.toLowerCase()} “${next.title}”` }) });
    sha = r.sha;
    data = next;
    dirty = false;
    $('.save-state').textContent = `Saved ${new Date().toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })}`;
    if (isNew) history.replaceState(null, '', `/studio/edit?id=${id}`);
    // Remember it for the post list until the site has rebuilt.
    const recent = JSON.parse(localStorage.getItem('studio-recent') ?? '[]').filter((p: { id: string }) => p.id !== id);
    recent.unshift({ id, title: next.title, date: next.date, draft: next.draft, categories: next.categories, venue: next.venue ?? '', cover: next.thumbnail ?? next.gallery[0]?.src ?? '', coverPosition: next.thumbnailPosition ?? '', photos: next.gallery.length });
    localStorage.setItem('studio-recent', JSON.stringify(recent.slice(0, 10)));
    const s = state();
    toast(
      s === 'draft' ? 'Draft saved. It’s not on the site.' :
      s === 'scheduled' ? `Scheduled. It will appear on the site on ${next.date}.` :
      `Published. It’ll be live in about a minute: <a href="/blog/${id}" target="_blank" rel="noopener">view it</a>. Then share it from <strong>Share it</strong> in Settings.`,
      false, 10000,
    );
    refreshPreview();
  } catch (err) {
    $('.save-state').textContent = 'Not saved';
    toast(esc((err as Error).message), true, 12000);
  } finally {
    document.querySelectorAll<HTMLButtonElement>('[data-act="draft"], [data-act="publish"]').forEach((b) => (b.disabled = false));
  }
}
$('[data-act="draft"]').addEventListener('click', () => save(true));
$('[data-act="publish"]').addEventListener('click', () => save(false));
$('[data-act="unpublish"]').addEventListener('click', async () => {
  if (await ask('Take this post off the site? It stays here as a draft, and you can publish it again any time.')) save(true);
});
$('[data-act="delete"]').addEventListener('click', async () => {
  if (!sha || !await ask(`Delete “${data.title}” completely? This can’t be undone from the studio. (Its photos stay in your photo library.)`)) return;
  try {
    await api(`/api/studio/post?id=${id}&sha=${sha}`, { method: 'DELETE' });
    dirty = false;
    const recent = JSON.parse(localStorage.getItem('studio-recent') ?? '[]').filter((p: { id: string }) => p.id !== id);
    localStorage.setItem('studio-recent', JSON.stringify(recent));
    location.href = '/studio/blog';
  } catch (err) {
    toast(esc((err as Error).message), true);
  }
});

// ---------- Start ----------
(async () => {
  try {
    meta = await fetch('/studio/posts.json', { cache: 'no-store' }).then((r) => r.json());
  } catch { /* menus fall back to empty */ }
  if (!isNew) {
    try {
      const r = await api(`/api/studio/post?id=${encodeURIComponent(id)}`);
      if (!r.exists) { $('.loading').textContent = 'That post wasn’t found.'; return; }
      sha = r.sha;
      const parsed = parsePost(r.content);
      data = parsed.data;
      $('.loading').remove();
      fillForm();
      startStory(parsed.body);
    } catch (err) {
      $('.loading').textContent = (err as Error).message;
      return;
    }
  } else {
    // Started from the SEO page: ?title=…&kind=Wedding|Info&venue=…&seoTitle=…&description=…&outline=venue
    const p = (k: string) => params.get(k)?.trim() ?? '';
    if (p('title')) data.title = p('title');
    if (['Wedding', 'Portrait', 'Family', 'Info'].includes(p('kind'))) data.categories = [p('kind')];
    if (p('venue')) data.venue = p('venue');
    if (p('seoTitle')) data.seoTitle = p('seoTitle');
    if (p('description')) data.description = p('description');
    $('.loading').remove();
    fillForm();
    if (data.title) field<HTMLInputElement>('slug').value = slugify(data.title);
    const v = data.venue || 'the venue';
    startStory(p('outline') === 'venue'
      ? ['About ' + v, 'The best photo spots', 'Ceremony and reception', 'Light and timing', 'If it rains', 'Real weddings at ' + v].map((h) => '## ' + h + '\n\n').join('')
      : '');
    titleEl.focus();
  }
  dirty = false;
  $('.save-state').textContent = isNew ? '' : 'All changes saved';
})();
