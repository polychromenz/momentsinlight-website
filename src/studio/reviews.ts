// Moments Studio: reviews (src/pages/studio/reviews.astro). Reads and saves src/data/reviews.json
// through /api/studio/reviews; review photos upload straight to Cloudflare Images.
import { slugify } from './frontmatter';

type Photo = { src: string; alt?: string; width?: number; height?: number };
type Review = { name: string; date: string; rating: number; text: string; photos: Photo[]; reply?: string; url?: string };

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const toastEl = $('.s-toast');
let toastTimer = 0;
const toast = (html: string, error = false, ms = 7000) => {
  toastEl.innerHTML = html;
  toastEl.classList.toggle('error', error);
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), ms);
};
async function api(path: string, init: RequestInit = {}) {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Something went wrong (${r.status}).`);
  return data;
}

let file: { reviews: Review[]; [k: string]: unknown } = { reviews: [] };
let sha = '';
let editing: number | null = null; // index in file.reviews, or null for a new review
let photos: Photo[] = [];
let uploading = 0;

const list = $<HTMLUListElement>('.list');
const sheet = $<HTMLDialogElement>('.sheet');
const field = <T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(n: string) => sheet.querySelector<T>(`[name="${n}"]`)!;

function render() {
  $('.status').textContent = `${file.reviews.length} reviews`;
  list.innerHTML = file.reviews.map((r, i) => `
    <li>
      <span><span class="who">${esc(r.name)}</span><span class="when">${new Date(r.date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}</span></span>
      <span class="stars">${'★'.repeat(r.rating)}</span>
      <p class="text">${esc(r.text)}</p>
      <span class="tags">${[r.photos.length ? `${r.photos.length} photo${r.photos.length === 1 ? '' : 's'}` : '', r.reply ? 'your reply' : ''].filter(Boolean).join(' · ')}</span>
      <button type="button" class="s-btn s-btn--quiet edit" data-i="${i}">Edit</button>
    </li>`).join('');
}

const thumb = (src: string) => src.replace(/\/[^/]+$/, '/w=200,q=75');
function renderThumbs() {
  $('.thumbs').innerHTML = photos.map((p, i) => `<li><img src="${esc(thumb(p.src))}" alt=""><button type="button" data-rm="${i}" title="Remove">×</button></li>`).join('')
    + (uploading ? `<li style="display:grid;place-items:center;font-size:12px;color:#777">Uploading ${uploading}…</li>` : '');
}
$('.thumbs').addEventListener('click', (e) => {
  const b = (e.target as Element).closest<HTMLButtonElement>('[data-rm]');
  if (b) { photos.splice(Number(b.dataset.rm), 1); renderThumbs(); }
});

function open(i: number | null) {
  editing = i;
  const r: Review = i === null ? { name: '', date: new Date().toISOString().slice(0, 10), rating: 5, text: '', photos: [] } : file.reviews[i];
  $('.form-title').textContent = i === null ? 'New review' : `${r.name}’s review`;
  field<HTMLInputElement>('name').value = r.name;
  field<HTMLInputElement>('date').value = r.date;
  field<HTMLSelectElement>('rating').value = String(r.rating);
  field<HTMLTextAreaElement>('text').value = r.text;
  field<HTMLTextAreaElement>('reply').value = r.reply ?? '';
  field<HTMLInputElement>('url').value = r.url ?? '';
  photos = [...r.photos];
  renderThumbs();
  $<HTMLButtonElement>('[data-act="remove"]').hidden = i === null;
  sheet.showModal();
  field<HTMLInputElement>('name').focus();
}
$('[data-act="add"]').addEventListener('click', () => open(null));
list.addEventListener('click', (e) => {
  const b = (e.target as Element).closest<HTMLButtonElement>('.edit');
  if (b) open(Number(b.dataset.i));
});
$('[data-act="cancel"]').addEventListener('click', () => sheet.close());

// Review photos go straight to Cloudflare Images, named reviews/<date>-<name>-<n>.
sheet.querySelector<HTMLInputElement>('.add-photos input')!.addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = '';
  const base = `reviews/${field<HTMLInputElement>('date').value || 'review'}-${slugify(field<HTMLInputElement>('name').value) || 'review'}`;
  for (const f of files) {
    uploading++; renderThumbs();
    try {
      let width: number | undefined, height: number | undefined;
      try { const bmp = await createImageBitmap(f); width = bmp.width; height = bmp.height; bmp.close(); } catch { /* unknown */ }
      const { uploadURL, src } = await api('/api/studio/upload', { method: 'POST', body: JSON.stringify({ id: `${base}-${photos.length + 1}` }) });
      const form = new FormData();
      form.append('file', f);
      const up = await fetch(uploadURL, { method: 'POST', body: form });
      if (!up.ok) throw new Error('The photo didn’t upload.');
      photos.push({ src, width, height });
    } catch (err) {
      toast(esc((err as Error).message), true);
    } finally {
      uploading--; renderThumbs();
    }
  }
});

async function save(message: string) {
  const r = await api('/api/studio/reviews', { method: 'PUT', body: JSON.stringify({ data: file, sha, message }) });
  sha = r.sha;
  file.reviews.sort((a, b) => b.date.localeCompare(a.date));
  render();
}

$('[data-act="save"]').addEventListener('click', async () => {
  if (uploading) { toast('Wait for the photos to finish uploading.', true); return; }
  const r: Review = {
    name: field<HTMLInputElement>('name').value.trim(),
    date: field<HTMLInputElement>('date').value,
    rating: Number(field<HTMLSelectElement>('rating').value),
    text: field<HTMLTextAreaElement>('text').value.trim(),
    photos,
  };
  const reply = field<HTMLTextAreaElement>('reply').value.trim();
  const url = field<HTMLInputElement>('url').value.trim();
  if (reply) r.reply = reply;
  if (url) r.url = url;
  if (!r.name || !r.date || !r.text) { toast('Add their name, the date and the review text.', true); return; }
  const before = JSON.stringify(file.reviews);
  if (editing === null) file.reviews.push(r);
  else file.reviews[editing] = r;
  try {
    await save(editing === null ? `Studio: add ${r.name}'s review` : `Studio: update ${r.name}'s review`);
    sheet.close();
    toast('Saved. Your reviews page and carousels update in about a minute.');
  } catch (err) {
    file.reviews = JSON.parse(before);
    toast(esc((err as Error).message), true);
  }
});

$('[data-act="remove"]').addEventListener('click', async () => {
  if (editing === null) return;
  const r = file.reviews[editing];
  if (!confirm(`Remove ${r.name}’s review from your website? (It stays on Google.)`)) return;
  const before = JSON.stringify(file.reviews);
  file.reviews.splice(editing, 1);
  try {
    await save(`Studio: remove ${r.name}'s review`);
    sheet.close();
    toast('Removed.');
  } catch (err) {
    file.reviews = JSON.parse(before);
    toast(esc((err as Error).message), true);
  }
});

api('/api/studio/reviews')
  .then((r) => { sha = r.sha; file = r.data; render(); })
  .catch((err) => { $('.status').textContent = (err as Error).message; });
