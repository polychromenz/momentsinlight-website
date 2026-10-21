// Studio > Social (src/pages/studio/social.astro): two weeks of drafts by day, and the editor where
// Tony crops the photos, edits the caption and approves. Facebook and Instagram, once connected
// (functions-lib/meta.js), publish approved posts themselves at their time: approving makes the photo
// files here (his crop, the platform's size) and uploads them. Other platforms: he copies the caption
// and downloads the photos to post them himself.
type Crop = { x: number; y: number; w: number; h: number };
type Photo = { src: string; w: number; h: number; image_id?: string; gallery_id?: string; alt?: string; crop?: Crop };
type Post = { id: number; shape?: string | null; platform: string; post_at: string; status: string; source: string; label: string; caption: string; link: string | null; photos: Photo[]; ai: number; error: string | null; media: string | null; remote_url: string | null };
type Meta = { ready: boolean; connection: null | { page_id: string; page_name: string; ig_id: string | null; ig_username: string | null; pages: { id: string; name: string; ig_username: string | null }[]; connected_at: string } };
type Platform = { name: string; ratio: number | null; out: [number, number]; max: number; link: boolean; chars: number };

import { ask } from './dialogs';
const $ = <T extends HTMLElement = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector<T>(s)!;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
function toast(msg: string, error = false) {
  const t = $('.s-toast'); t.textContent = msg; t.classList.toggle('error', error); t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 4500);
}
const api = async (body: unknown) => {
  const r = await fetch('/api/studio/social', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'That didn’t work. Are you still signed in?');
  return d;
};
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = iso(new Date());
const STATUS: Record<string, string> = { draft: 'Draft', approved: 'Approved', posted: 'Posted', skipped: 'Skipped', failed: 'Didn’t post', posting: 'Posting…' };
const SHORT: Record<string, string> = { instagram: 'IG', facebook: 'FB', google: 'G', pinterest: 'P' };
// Small copies for the calendar and strip: gallery photos have a 600px copy; Cloudflare Images a variant.
const small = (p: Photo) => (p.image_id ? p.src.replace(/_2048\.jpg/, '_600.jpg') : p.src);

let start = monday(new Date());
let posts: Post[] = [];
let platforms: Record<string, Platform> = {};
let open: Post | null = null;
let at = 0; // the photo being cropped in the editor
let meta: Meta = { ready: false, connection: null };
/** Does this platform post itself (connected)? */
const auto = (platform: string) => !!meta.connection && ((platform === 'facebook' && !!meta.connection.page_id) || (platform === 'instagram' && !!meta.connection.ig_id));

function monday(d: Date) { const m = new Date(d.getFullYear(), d.getMonth(), d.getDate()); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m; }

async function load() {
  const end = new Date(start); end.setDate(end.getDate() + 13);
  const r = await fetch(`/api/studio/social?from=${iso(start)}&to=${iso(end)}`);
  const d = await r.json().catch(() => null);
  if (!r.ok || !d) { $('.so-weeks').innerHTML = `<p class="muted">${esc(d?.error || 'Couldn’t load the drafts.')}</p>`; return; }
  posts = d.posts; platforms = d.platforms; meta = d.meta;
  drawMeta();
  $<HTMLInputElement>('[data-auto]').checked = d.drafts_on;
  $('.idea-list').innerHTML = d.ideas.length ? d.ideas.map((i: any) => `<li>${esc(i.text)}${i.link ? ` <a href="${esc(i.link)}">Open</a>` : ''}</li>`).join('') : '<li class="muted">Nothing new right now.</li>';
  $('.so-marked').textContent = `${d.marked} gallery photo${d.marked === 1 ? '' : 's'} marked Social. In a gallery’s Photos tab, select photos (or a whole section) and click Social.`;
  draw();
}

// The Facebook and Instagram connection card.
function drawMeta() {
  const box = $('.so-meta-body');
  const c = meta.connection;
  if (!meta.ready) { box.innerHTML = '<p class="muted">Not set up yet: the Meta app’s ID and secret need adding in Cloudflare (META_APP_ID, META_APP_SECRET).</p>'; return; }
  if (!c) { box.innerHTML = '<p>Connect your Facebook Page and Instagram, and approved posts go out on their own at their time.</p><a class="s-btn s-btn--solid" href="/api/studio/meta/connect">Connect Facebook and Instagram</a>'; return; }
  box.innerHTML = `<p><strong>Facebook:</strong> ${esc(c.page_name)} · <strong>Instagram:</strong> ${c.ig_username ? `@${esc(c.ig_username)}` : '<span class="warn">none linked to this Page</span> (link them in Instagram’s settings, then Reconnect)'}</p>
    ${c.pages.length > 1 ? `<label>Page <select data-meta-page>${c.pages.map((p) => `<option value="${esc(p.id)}"${p.id === c.page_id ? ' selected' : ''}>${esc(p.name)}${p.ig_username ? ` (@${esc(p.ig_username)})` : ''}</option>`).join('')}</select></label>` : ''}
    <p class="muted">Approved Facebook and Instagram posts go out on their own at their time. Nothing goes without your approval.</p>
    <a class="s-btn s-btn--quiet" href="/api/studio/meta/connect">Reconnect</a> <button type="button" class="s-btn s-btn--quiet" data-meta-off>Disconnect</button>`;
}

function draw() {
  const weeks: string[] = [];
  for (let w = 0; w < 2; w++) {
    const days: string[] = [];
    let first = '';
    for (let n = 0; n < 7; n++) {
      const d = new Date(start); d.setDate(d.getDate() + w * 7 + n);
      const key = iso(d);
      if (!n) first = d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long' });
      const list = posts.filter((p) => p.post_at.slice(0, 10) === key);
      days.push(`<div class="so-day${key < today ? ' past' : ''}${key === today ? ' today' : ''}${list.length ? '' : ' empty'}"><span class="so-dn">${d.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric' })}</span>${list.map(card).join('')}</div>`);
    }
    weeks.push(`<div class="so-week"><h3>Week of ${first}</h3><div class="so-days">${days.join('')}</div></div>`);
  }
  $('.so-weeks').innerHTML = weeks.join('');
}
const time = (p: Post) => new Date(`2000-01-01T${p.post_at.slice(11)}:00`).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' }).replace(':00', '');
const card = (p: Post) => `<button type="button" class="post st-${p.status}" data-post="${p.id}" title="${esc(`${platforms[p.platform]?.name}: ${STATUS[p.status] ?? p.status}`)}">
  ${p.photos[0] ? `<img src="${esc(small(p.photos[0]))}" alt="" loading="lazy" />` : ''}<span class="pf pf-${p.platform}">${SHORT[p.platform]}</span><span class="t">${time(p)} · ${STATUS[p.status] ?? esc(p.status)}</span><span class="l">${esc(p.label)}</span></button>`;

// ---- The editor ----
const ed = $<HTMLDialogElement>('.so-ed');
const form = $<HTMLFormElement>('.ed-form');
const field = <T extends HTMLInputElement | HTMLTextAreaElement>(n: string) => form.elements.namedItem(n) as T;

/** As much of the photo as fits the shape, a little above centre (faces sit high in most frames). */
function suggest(p: Photo, ratio: number): Crop {
  const r = p.w / p.h;
  if (r > ratio) { const w = ratio / r; return { x: (1 - w) / 2, y: 0, w, h: 1 }; }
  const h = r / ratio;
  return { x: 0, y: (1 - h) * (r < 1 ? 0.25 : 0.3), w: 1, h };
}
/** The post's photo shape (width / height). Instagram's is Tony's choice per post: 4:5 (the default),
 *  square, or the first photo's own shape, kept within what Instagram allows (4:5 tall to 1.91:1 wide);
 *  a carousel's photos all share the first one's shape. Other platforms have a fixed one (or none). */
function ratioOf(p: Post): number | null {
  if (p.platform !== 'instagram') return platforms[p.platform].ratio;
  if (p.shape === '1:1') return 1;
  if (p.shape === 'original' && p.photos[0]) return Math.min(1.91, Math.max(0.8, p.photos[0].w / p.photos[0].h));
  return 0.8;
}
const cropOf = (p: Photo) => { const ratio = ratioOf(open!); return ratio ? (p.crop ??= suggest(p, ratio)) : null; };
const SHAPE_TEXT: Record<string, string> = { '4:5': '4:5 portrait', '1:1': 'square', original: 'the first photo’s own shape' };

function openPost(p: Post) {
  open = structuredClone(p);
  at = 0;
  const pf = platforms[p.platform];
  $('.ed-title').textContent = `${pf.name} · ${new Date(`${p.post_at}:00`).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })}`;
  field<HTMLInputElement>('post_at').value = p.post_at;
  field<HTMLInputElement>('label').value = p.label ?? '';
  $('.ed-label').firstChild!.textContent = p.platform === 'pinterest' ? 'Pin title ' : 'Note (only you see this) ';
  field<HTMLTextAreaElement>('caption').value = p.caption;
  field<HTMLTextAreaElement>('caption').maxLength = pf.chars;
  field<HTMLInputElement>('link').value = p.link ?? '';
  $('.ed-shape').hidden = p.platform !== 'instagram';
  (form.elements.namedItem('shape') as HTMLSelectElement).value = p.shape ?? '4:5';
  $('.ed-link').hidden = !pf.link;
  $('.ed-ai').hidden = !p.ai;
  count();
  drawEditor();
  if (!ed.open) ed.showModal();
}
function count() {
  const n = field<HTMLTextAreaElement>('caption').value.length;
  $('.ed-count').textContent = `${n} / ${platforms[open!.platform].chars}`;
}
function drawEditor() {
  const p = open!;
  const pf = platforms[p.platform];
  const editable = p.status === 'draft' || p.status === 'approved';
  $('.ed-status').className = `chip ed-status st-${p.status}`;
  $('.ed-status').textContent = STATUS[p.status] ?? p.status;
  const ph = p.photos[at] ?? p.photos[0];
  const c = ph ? cropOf(ph) : null;
  const big = $('.ed-big');
  if (ph) {
    const maxH = 460;
    big.style.aspectRatio = `${ph.w}/${ph.h}`;
    big.style.width = `min(100%, ${Math.round((maxH * ph.w) / ph.h)}px)`;
    big.innerHTML = `<img src="${esc(ph.src)}" alt="" />${c ? `<div class="ed-frame" style="left:${c.x * 100}%;top:${c.y * 100}%;width:${c.w * 100}%;height:${c.h * 100}%"></div>` : ''}`;
  } else big.innerHTML = '<p class="muted">No photo.</p>';
  $('.ed-nudge').hidden = !c || !editable;
  $('.ed-strip').innerHTML = p.photos.map((x, n) => `<div class="ed-th${n === at ? ' on' : ''}" data-at="${n}" role="button" tabindex="0"><img src="${esc(small(x))}" alt="" />${editable && p.photos.length > 1 ? `<button type="button" class="x" data-drop="${n}" title="Leave this photo out">×</button>${n ? `<button type="button" class="mv" data-first="${n}" title="Make it the first photo">↑</button>` : ''}` : ''}</div>`).join('');
  const b = (act: string, text: string, cls = '') => `<button type="button" class="s-btn ${cls}" data-act="${act}">${text}</button>`;
  const acts: string[] = [];
  if (p.status === 'draft') acts.push(b('approve', 'Approve', 's-btn--solid'), b('save', 'Save'), b('recaption', 'New caption'), b('swap', 'Different idea'), b('skip', 'Skip', 's-btn--quiet'));
  const self = auto(p.platform);
  if (p.status === 'approved' && self) acts.push(b('post_now', 'Post now', 's-btn--solid'), b('save', 'Save changes'), b('unapprove', 'Back to draft', 's-btn--quiet'));
  else if (p.status === 'approved') acts.push(b('copy', 'Copy caption', 's-btn--solid'), b('download', `Download photo${p.photos.length > 1 ? 's' : ''}`), b('posted', 'I’ve posted it'), b('save', 'Save changes'), b('unapprove', 'Back to draft', 's-btn--quiet'));
  if (p.status === 'failed') acts.push(...(self ? [b('post_now', 'Try again', 's-btn--solid')] : []), b('unapprove', 'Back to draft'), b('posted', 'I posted it myself', 's-btn--quiet'), b('copy', 'Copy caption'), b('download', 'Download photos'));
  if (p.status === 'posted') acts.push(...(p.remote_url ? [`<a class="s-btn s-btn--solid" href="${esc(p.remote_url)}" target="_blank" rel="noopener">See it on ${esc(pf.name)}</a>`] : []), b('copy', 'Copy caption'), b('download', 'Download photos'));
  if (p.status === 'skipped') acts.push(b('restore', 'Bring it back'));
  $('.ed-acts').innerHTML = acts.join('');
  $('.ed-how').textContent = p.status === 'failed' ? `It didn’t post: ${p.error ?? 'no reason given'}`
    : p.status === 'approved' && self ? `It goes out on its own on ${new Date(`${p.post_at}:00`).toLocaleString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })}, or click Post now. Change something? Save changes (the photos are made again).`
    : p.status === 'approved' ? `${pf.name} isn’t connected yet, so post it yourself: copy the caption, download the photo${p.photos.length > 1 ? 's' : ''}, post${p.link && pf.link ? ' with the link' : ''}, then click “I’ve posted it”. Once ${pf.name} is connected, approved posts go out on their own at their time.`
    : p.status === 'draft' ? `${ratioOf(p) ? `Photos are cropped to ${p.platform === 'instagram' ? SHAPE_TEXT[p.shape ?? '4:5'] : p.platform === 'pinterest' ? '2:3 tall' : '4:3'} for ${pf.name}: click a photo, then nudge the frame. ` : ''}${p.platform === 'instagram' && p.photos.length > 1 ? 'Instagram gives every photo in a carousel the first one’s shape. ' : ''}Edits are kept when you Save or Approve.` : '';
  form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select').forEach((el) => (el.disabled = !editable));
}

const clamp = (c: Crop): Crop => ({ ...c, x: Math.min(Math.max(c.x, 0), 1 - c.w), y: Math.min(Math.max(c.y, 0), 1 - c.h) });
function nudge(how: string) {
  const ph = open!.photos[at];
  let c = { ...cropOf(ph)! };
  const step = 0.03;
  if (how === 'up') c.y -= step;
  if (how === 'down') c.y += step;
  if (how === 'left') c.x -= step;
  if (how === 'right') c.x += step;
  if (how === 'in' || how === 'out') {
    const k = how === 'in' ? 0.92 : 1 / 0.92;
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    let w = c.w * k, h = c.h * k;
    const f = Math.min(1, 1 / w, 1 / h);
    w *= f; h *= f;
    c = { x: cx - w / 2, y: cy - h / 2, w, h };
  }
  ph.crop = clamp(c);
  drawEditor();
}

async function save() {
  const p = open!;
  p.photos.forEach((x) => cropOf(x));
  const d = await api({ action: 'save', id: p.id, caption: field('caption').value, post_at: field('post_at').value, link: field('link').value || null, label: field('label').value, photos: p.photos, shape: p.shape ?? null });
  replace(d.post);
  return d.post as Post;
}
/** Make the photo files and upload them, for a platform that posts itself. */
async function upload(p: Post) {
  const pf = platforms[p.platform];
  const fd = new FormData();
  fd.append('id', String(p.id));
  for (let n = 0; n < p.photos.length; n++) fd.append('files', await photoFile(p.photos[n], pf, ratioOf(p)), `${n + 1}.jpg`);
  const r = await fetch('/api/studio/social/media', { method: 'POST', body: fd });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'The photos didn’t upload.');
}
function replace(p: Post) {
  posts = posts.map((x) => (x.id === p.id ? p : x));
  if (open?.id === p.id) { open = structuredClone(p); drawEditor(); }
  draw();
}

// The photo files, at the platform's size and crop.
async function photoFile(p: Photo, pf: Platform, ratio: number | null): Promise<Blob> {
  // Full size: gallery photos' 2048px copy; site photos from Cloudflare Images at full width (its
  // "public" copy is only 768px high, which made small Instagram files).
  const src = p.image_id ? `/api/studio/ads/picks?image=${encodeURIComponent(p.image_id)}` : p.src.replace(/(imagedelivery\.net\/[^/]+\/.+)\/[^/]+$/, '$1/w=2560');
  const blob = await (await fetch(src, { mode: 'cors' })).blob();
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  await img.decode();
  const c = ratio ? (p.crop ?? suggest(p, ratio)) : { x: 0, y: 0, w: 1, h: 1 };
  const sw = c.w * img.naturalWidth, sh = c.h * img.naturalHeight;
  // Instagram: 1080 wide whatever the shape (1080×1350 for 4:5); others their fixed size.
  const out = pf.name === 'Instagram' && ratio ? [1080, Math.round(1080 / ratio)] : pf.out;
  const k = Math.min(1, out[0] / sw, out[1] / sh);
  const cv = document.createElement('canvas');
  cv.width = Math.round(sw * k); cv.height = Math.round(sh * k);
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, c.x * img.naturalWidth, c.y * img.naturalHeight, sw, sh, 0, 0, cv.width, cv.height);
  URL.revokeObjectURL(img.src);
  return new Promise((res) => cv.toBlob((b) => res(b!), 'image/jpeg', 0.92));
}
async function download(p: Post) {
  const pf = platforms[p.platform];
  for (let n = 0; n < p.photos.length; n++) {
    const url = URL.createObjectURL(await photoFile(p.photos[n], pf, ratioOf(p)));
    const a = document.createElement('a');
    a.href = url; a.download = `${p.post_at.slice(0, 10)}-${p.platform}-${n + 1}.jpg`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    await new Promise((r) => setTimeout(r, 300));
  }
}

document.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  const mv = t.closest<HTMLElement>('[data-move]');
  if (mv) { const n = Number(mv.dataset.move); if (n) start.setDate(start.getDate() + n); else start = monday(new Date()); return load(); }
  const pc = t.closest<HTMLElement>('[data-post]');
  if (pc) { const p = posts.find((x) => x.id === Number(pc.dataset.post)); if (p) openPost(p); return; }
  if (t.closest('[data-draft-now]')) {
    const btn = t.closest<HTMLButtonElement>('[data-draft-now]')!;
    btn.disabled = true; btn.textContent = 'Making drafts…';
    try { const d = await api({ action: 'draft_now' }); toast(d.result === 'full' ? 'The week ahead is already full.' : d.result === 'off' ? 'Automatic drafts are paused (tick the box below).' : `Made ${d.result}. Click again for more.`); load(); }
    catch (err) { toast((err as Error).message, true); }
    btn.disabled = false; btn.textContent = 'Make drafts now';
    return;
  }
  if (!open || !ed.contains(t)) return;
  if (t.closest('[data-close]')) return ed.close();
  const drop = t.closest<HTMLElement>('[data-drop]');
  if (drop) { open.photos.splice(Number(drop.dataset.drop), 1); at = Math.min(at, open.photos.length - 1); return drawEditor(); }
  const first = t.closest<HTMLElement>('[data-first]');
  if (first) { const [x] = open.photos.splice(Number(first.dataset.first), 1); open.photos.unshift(x); at = 0; return drawEditor(); }
  const th = t.closest<HTMLElement>('[data-at]');
  if (th) { at = Number(th.dataset.at); return drawEditor(); }
  const n = t.closest<HTMLElement>('[data-n]');
  if (n) return nudge(n.dataset.n!);
  const act = t.closest<HTMLButtonElement>('[data-act]');
  if (!act) return;
  const a = act.dataset.act!;
  act.disabled = true;
  try {
    if (a === 'save') {
      const p = await save();
      if (p.status === 'approved' && auto(p.platform)) { act.textContent = 'Making the photos…'; await upload({ ...p, photos: open.photos }); }
      toast('Saved.');
    }
    if (a === 'approve') {
      const p = await save();
      if (auto(p.platform)) { act.textContent = 'Making the photos…'; await upload({ ...p, photos: open.photos }); }
      replace((await api({ action: 'approve', id: open.id })).post);
      toast(auto(p.platform) ? 'Approved: it goes out on its own at its time.' : 'Approved.');
    }
    if (a === 'post_now') {
      // Approved before Facebook/Instagram was connected: make its photo files first.
      if (!open.media || open.media === '[]') { act.textContent = 'Making the photos…'; await upload(open); }
      act.textContent = 'Posting…';
      try { replace((await api({ action: 'post_now', id: open.id })).post); toast(`Posted to ${platforms[open.platform].name}.`); }
      catch (err) { await load(); const p = posts.find((x) => x.id === open!.id); if (p) openPost(p); throw err; }
    }
    if (a === 'unapprove' || a === 'skip' || a === 'restore' || a === 'posted') {
      replace((await api({ action: a, id: open.id })).post);
      toast({ unapprove: 'Back to draft.', skip: 'Skipped.', restore: 'Back as a draft.', posted: 'Marked as posted.' }[a]!);
      if (a === 'skip' || a === 'posted') ed.close();
    }
    if (a === 'recaption') {
      act.textContent = 'Writing…';
      const d = await api({ action: 'recaption', id: open.id });
      field<HTMLTextAreaElement>('caption').value = d.text; count();
      $('.ed-ai').hidden = !d.ai;
      toast(d.ai ? 'A new caption (not saved until you Save or Approve).' : `The AI didn’t answer (${d.error ?? 'try again'}).`, !d.ai);
    }
    if (a === 'swap') {
      act.textContent = 'Finding another…';
      const d = await api({ action: 'swap', id: open.id });
      ed.close();
      await load();
      const fresh = posts.find((x) => x.platform === open!.platform && x.post_at === open!.post_at && x.status === 'draft');
      if (d.swapped && fresh) openPost(fresh); else toast('No other idea for that day just now.', true);
    }
    if (a === 'copy') { await navigator.clipboard.writeText(field('caption').value); toast('Caption copied.'); }
    if (a === 'download') { act.textContent = 'Making the files…'; await download(open); toast('Downloaded.'); }
  } catch (err) {
    toast((err as Error).message, true);
  }
  if (document.contains(act)) drawEditor();
});
document.addEventListener('keydown', (e) => {
  const th = (e.target as HTMLElement).closest?.('[data-at], [data-post]');
  if (th && (e.key === 'Enter' || e.key === ' ') && !(e.target as HTMLElement).matches('button')) { e.preventDefault(); (th as HTMLElement).click(); }
});
form.addEventListener('input', (e) => { if ((e.target as HTMLElement).matches('[name=caption]')) count(); });
// A new Instagram shape: every photo's frame starts again at the new shape.
form.addEventListener('change', (e) => {
  const el = e.target as HTMLSelectElement;
  if (!el.matches('[name=shape]') || !open) return;
  open.shape = el.value;
  open.photos.forEach((x) => delete x.crop);
  drawEditor();
});
document.addEventListener('change', async (e) => {
  const sel = (e.target as HTMLElement).closest<HTMLSelectElement>('[data-meta-page]');
  if (!sel) return;
  const r = await fetch('/api/studio/meta', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'page', id: sel.value }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { toast(d.error || 'That didn’t change.', true); return; }
  meta = d; drawMeta(); toast('Page changed.');
});
document.addEventListener('click', async (e) => {
  if (!(e.target as HTMLElement).closest('[data-meta-off]')) return;
  if (!await ask('Disconnect Facebook and Instagram? Approved posts will wait for you to post them yourself.')) return;
  const r = await fetch('/api/studio/meta', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'disconnect' }) });
  if (r.ok) { meta = await r.json(); drawMeta(); draw(); toast('Disconnected.'); }
});
// Back from Facebook's login.
{
  const m = new URLSearchParams(location.search).get('meta');
  if (m) {
    toast(m === 'connected' ? 'Facebook and Instagram are connected.' : m === 'cancelled' ? 'Connecting was cancelled.' : m === 'expired' ? 'That took too long. Please try Connect again.' : `Connecting didn’t work. ${m.replace(/^failed:/, '')}`, m !== 'connected');
    history.replaceState(null, '', location.pathname);
  }
}
$<HTMLInputElement>('[data-auto]').addEventListener('change', async (e) => {
  const on = (e.target as HTMLInputElement).checked;
  try { await api({ action: 'drafts', on }); toast(on ? 'Drafts are made automatically again.' : 'Automatic drafts paused. Existing drafts stay.'); }
  catch (err) { toast((err as Error).message, true); }
});
load();
export {};
