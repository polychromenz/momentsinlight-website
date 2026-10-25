// Studio > Social (src/pages/studio/social.astro): two weeks of drafts by day, and the editor where
// Tony crops the photos, edits the caption and approves. Facebook and Instagram, once connected
// (functions-lib/meta.js), publish approved posts themselves at their time: approving makes the photo
// files here (his crop, the platform's size) and uploads them. Other platforms: he copies the caption
// and downloads the photos to post them himself.
type Crop = { x: number; y: number; w: number; h: number };
type Photo = { src: string; w: number; h: number; image_id?: string; gallery_id?: string; alt?: string; crop?: Crop };
type Post = { id: number; shape?: string | null; format?: string; music_id?: number | null; platform: string; post_at: string; status: string; source: string; label: string; caption: string; link: string | null; photos: Photo[]; ai: number; error: string | null; media: string | null; remote_url: string | null; tags?: string | null; tag_ids?: number[]; board?: string | null };
let pinBoards: Record<string, string> = {};
// Venues and suppliers to tag (Contacts with an Instagram or Facebook): functions-lib/social-tags.js.
type Contact = { id: number; business: string; type: string; instagram: string; facebook: string };
let contacts: Contact[] = [];
type Meta = { ready: boolean; connection: null | { page_id: string; page_name: string; ig_id: string | null; ig_username: string | null; pages: { id: string; name: string; ig_username: string | null }[]; connected_at: string } };
type Platform = { name: string; ratio: number | null; out: [number, number]; max: number; link: boolean; chars: number };

import { ask } from './dialogs';
import { makeReel } from './reel';
type Track = { id: number; name: string; mood: string; seconds: number | null; used?: number };
let music: Track[] = [];
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
let busy = false; // an action (Approve, Save…) is under way
let meta: Meta = { ready: false, connection: null };
type Pin = { ready: boolean; connection: null | { username: string; boards: { id: string; name: string }[]; board_id: string | null; board_name: string | null; connected_at: string } };
let pin: Pin = { ready: false, connection: null };
/** Does this platform post itself (connected)? */
const auto = (platform: string) => (platform === 'pinterest' ? true : !!meta.connection && ((platform === 'facebook' && !!meta.connection.page_id) || (platform === 'instagram' && !!meta.connection.ig_id)));

function monday(d: Date) { const m = new Date(d.getFullYear(), d.getMonth(), d.getDate()); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m; }

async function load() {
  const end = new Date(start); end.setDate(end.getDate() + 13);
  const r = await fetch(`/api/studio/social?from=${iso(start)}&to=${iso(end)}`);
  const d = await r.json().catch(() => null);
  if (!r.ok || !d) { $('.so-weeks').innerHTML = `<p class="muted">${esc(d?.error || 'Couldn’t load the drafts.')}</p>`; return; }
  posts = d.posts; platforms = d.platforms; meta = d.meta; music = d.music ?? []; pin = d.pinterest ?? pin; contacts = d.contacts ?? []; pinBoards = d.pin_boards ?? {};
  drawMeta();
  drawPin();
  drawMusic();
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

// The Pinterest connection card.
const FEED = 'https://www.momentsinlight.co.nz/feeds/pinterest';
function drawPin() {
  const box = $('.so-pin-body');
  const c = pin.connection;
  // Until the Pinterest app is approved and connected, pins go out through the RSS feed.
  const feed = `<p>Approved pins go out through your Pinterest RSS feed: at a pin’s time it joins the feed, and Pinterest picks it up within about a day. Set up once in Pinterest: <strong>Settings › Bulk create Pins › Auto-publish › Connect RSS feed</strong>, paste this address and choose your weddings board.</p>
    <p class="so-feed"><code>${FEED}</code> <button type="button" class="s-btn s-btn--quiet" data-copy-feed>Copy</button></p>
    <p>Themed boards: make each board in Pinterest with exactly this name, then connect its feed to it the same way (each pin's board is in its editor).</p>
    <ul class="so-boards">${Object.entries(pinBoards).filter(([k]) => k !== 'weddings').map(([k, n]) => `<li><strong>${esc(n)}</strong> <code>${FEED}?board=${k}</code> <button type="button" class="s-btn s-btn--quiet" data-copy-text="${FEED}?board=${k}">Copy</button></li>`).join('')}</ul>`;
  if (!c?.board_id) {
    box.innerHTML = feed + (pin.ready ? `<p class="muted">The Pinterest app: ${c ? 'connected; choose a board to post through it instead.' : 'once Pinterest approves it, you can connect it here instead.'}</p>${c ? '' : '<a class="s-btn s-btn--quiet" href="/api/studio/pinterest/connect">Connect Pinterest app</a>'}` : '');
    if (!c) return;
  }
  box.innerHTML = (c.board_id ? '' : box.innerHTML) + `<p><strong>Pinterest app:</strong> ${c.username ? `@${esc(c.username)}` : 'connected'}</p>
    <label>Board <select data-pin-board><option value="">Choose a board…</option>${c.boards.map((b) => `<option value="${esc(b.id)}"${b.id === c.board_id ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
    <p class="muted">${c.board_id ? 'Approved pins go out on their own at their time.' : 'Choose the board pins go to, and approved pins go out on their own.'} Until Pinterest gives the app Standard access (Upgrade, on the app’s page at developers.pinterest.com), pins go out through the website’s feed instead, which Pinterest picks up within a day.</p>
    <a class="s-btn s-btn--quiet" href="/api/studio/pinterest/connect">Reconnect</a> <button type="button" class="s-btn s-btn--quiet" data-pin-off>Disconnect</button>${c.board_id ? ' <button type="button" class="s-btn s-btn--quiet" data-pin-test title="For Pinterest’s Standard access video: makes a pin in Pinterest’s sandbox (test area)">Make a test pin</button>' : ''}
    <p class="so-pin-test muted" hidden></p>
    <details class="so-feeds"><summary>RSS feeds (used until the app has Standard access)</summary>${feed}</details>`;
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
/** "Whole photo": nothing cut off; each photo sits on a white 4:5 page instead. */
const whole = (p: Post) => p.platform === 'instagram' && p.shape === 'whole';
const reel = (p: Post) => p.format === 'reel';
const cropOf = (p: Photo) => { const ratio = whole(open!) || reel(open!) ? null : ratioOf(open!); return ratio ? (p.crop ??= suggest(p, ratio)) : null; };
const SHAPE_TEXT: Record<string, string> = { '4:5': '4:5 portrait', '1:1': 'square', original: 'the first photo’s own shape', whole: '4:5' };

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
  // Pinterest: the themed board it goes to.
  $('.ed-board').hidden = p.platform !== 'pinterest';
  (form.elements.namedItem('board') as HTMLSelectElement).innerHTML = Object.entries(pinBoards).map(([k, n]) => `<option value="${k}"${(p.board ?? 'weddings') === k ? ' selected' : ''}>${esc(n)}</option>`).join('');
  field<HTMLInputElement>('link').value = p.link ?? '';
  (form.elements.namedItem('shape') as HTMLSelectElement).value = p.shape ?? '4:5';
  (form.elements.namedItem('format') as HTMLSelectElement).value = p.format ?? 'photos';
  (form.elements.namedItem('music_id') as HTMLSelectElement).innerHTML = music.map((m) => `<option value="${m.id}">${esc(m.name)}${m.mood ? ` (${esc(m.mood)})` : ''}</option>`).join('') || '<option value="">Add music first (below the calendar)</option>';
  (form.elements.namedItem('music_id') as HTMLSelectElement).value = String(p.music_id ?? music[0]?.id ?? '');
  const v = $<HTMLVideoElement>('.ed-video'); v.hidden = true; v.removeAttribute('src');
  $('.ed-link').hidden = !pf.link;
  $('.ed-ai').hidden = !p.ai;
  drawTags();
  count();
  drawEditor();
  if (!ed.open) ed.showModal();
}
/** The Tag list (Instagram and Facebook posts), and what it adds when the post goes out. */
function drawTags() {
  const p = open!;
  const on = ['instagram', 'facebook'].includes(p.platform) && contacts.length > 0;
  $('.ed-tags').hidden = !on;
  if (!on) return;
  const ids = new Set(p.tag_ids ?? []);
  const lock = !(p.status === 'draft' || p.status === 'approved');
  $('.ed-tag-list').innerHTML = contacts.map((c) => `<label><input type="checkbox" data-tag="${c.id}"${ids.has(c.id) ? ' checked' : ''}${lock ? ' disabled' : ''} /> ${esc(c.business)}${p.platform === 'instagram' ? (c.instagram ? ` <small class="muted">@${esc(c.instagram)}</small>` : ' <small class="muted">(no Instagram)</small>') : ''}</label>`).join('');
  const tagged = contacts.filter((c) => ids.has(c.id));
  const line = tagged.map((c) => `${c.type && c.type !== 'Other' ? `${c.type}: ` : ''}${p.platform === 'instagram' && c.instagram ? `@${c.instagram}` : c.business}`).join(' · ');
  $('.ed-credit').textContent = line ? `Added when it goes out: “${line}”${p.platform === 'instagram' && tagged.some((c) => c.instagram) ? ', and tagged on the first photo' : ''}.${p.platform === 'facebook' ? ' (Facebook doesn’t let apps tag Pages, so it’s their name.)' : ''}` : 'No one tagged.';
}
form.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement;
  if (!t.matches('[data-tag]') || !open) return;
  const ids = new Set(open.tag_ids ?? []);
  t.checked ? ids.add(Number(t.dataset.tag)) : ids.delete(Number(t.dataset.tag));
  open.tag_ids = [...ids];
  drawTags();
});
function count() {
  const n = field<HTMLTextAreaElement>('caption').value.length;
  $('.ed-count').textContent = `${n} / ${platforms[open!.platform].chars}`;
}
function drawEditor() {
  const p = open!;
  const pf = platforms[p.platform];
  const editable = p.status === 'draft' || p.status === 'approved';
  // Instagram's shape; a Reel instead (Instagram and Facebook), with its music and a preview.
  $('.ed-shape').hidden = p.platform !== 'instagram' || reel(p);
  $('.ed-reel').hidden = !['instagram', 'facebook'].includes(p.platform);
  $('.ed-music').hidden = !reel(p);
  $('.ed-reel-prev').hidden = !reel(p);
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
  if (p.status === 'draft') acts.push(b('approve', 'Approve', 's-btn--solid'), b('save', 'Save'), b('recaption', 'New caption'), b('rephoto', 'Different photos'), b('swap', 'Different idea'), b('skip', 'Skip', 's-btn--quiet'));
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
    : p.status === 'draft' ? `  ${reel(p) ? `A Reel: the photos as a slideshow (3 seconds each, about ${p.photos.length * 3 + 1} seconds) with the music. Watch it before approving; it’s made on this PC when you approve. ` : whole(p) ? 'Each photo is shown whole on a white 4:5 page: nothing is cut off. ' : ratioOf(p) ? `Photos are cropped to ${p.platform === 'instagram' ? SHAPE_TEXT[p.shape ?? '4:5'] : p.platform === 'pinterest' ? '2:3 tall' : '4:3'} for ${pf.name}: click a photo, then drag the frame with the mouse (the scroll wheel zooms). ` : ''}${p.platform === 'instagram' && p.photos.length > 1 ? 'Instagram gives every photo in a carousel the first one’s shape. ' : ''}Edits are kept when you Save or Approve.` : '';
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

// Drag the frame with the mouse (or a finger); the scroll wheel over the photo zooms in and out.
let drag: { sx: number; sy: number; c: Crop; w: number; h: number } | null = null;
const bigBox = $('.ed-big');
bigBox.addEventListener('pointerdown', (e) => {
  const fr = (e.target as HTMLElement).closest<HTMLElement>('.ed-frame');
  if (!fr || !open || !(open.status === 'draft' || open.status === 'approved')) return;
  const r = bigBox.getBoundingClientRect();
  drag = { sx: e.clientX, sy: e.clientY, c: { ...cropOf(open.photos[at])! }, w: r.width, h: r.height };
  fr.setPointerCapture(e.pointerId);
  fr.classList.add('dragging');
  e.preventDefault();
});
bigBox.addEventListener('pointermove', (e) => {
  if (!drag || !open) return;
  const c = clamp({ ...drag.c, x: drag.c.x + (e.clientX - drag.sx) / drag.w, y: drag.c.y + (e.clientY - drag.sy) / drag.h });
  open.photos[at].crop = c;
  const fr = $('.ed-frame', bigBox);
  fr.style.left = `${c.x * 100}%`; fr.style.top = `${c.y * 100}%`;
});
const endDrag = () => { if (!drag) return; drag = null; $('.ed-frame', bigBox)?.classList.remove('dragging'); };
bigBox.addEventListener('pointerup', endDrag);
bigBox.addEventListener('pointercancel', endDrag);
bigBox.addEventListener('wheel', (e) => {
  if (!open || !$('.ed-frame', bigBox) || !(open.status === 'draft' || open.status === 'approved')) return;
  e.preventDefault();
  nudge(e.deltaY < 0 ? 'in' : 'out');
}, { passive: false });

async function save() {
  const p = open!;
  p.photos.forEach((x) => cropOf(x));
  const d = await api({ action: 'save', id: p.id, caption: field('caption').value, post_at: field('post_at').value, link: field('link').value || null, label: field('label').value, photos: p.photos, shape: p.shape ?? null, format: p.format ?? 'photos', music_id: p.music_id ?? null, tags: p.tag_ids ?? [], board: (form.elements.namedItem('board') as HTMLSelectElement).value || null });
  replace(d.post);
  return d.post as Post;
}
/** Make the photo files and upload them, for a platform that posts itself. */
async function upload(p: Post) {
  const pf = platforms[p.platform];
  const fd = new FormData();
  fd.append('id', String(p.id));
  if (reel(p)) fd.append('video', await reelFor(p), 'reel.mp4');
  else for (let n = 0; n < p.photos.length; n++) fd.append('files', await photoFile(p.photos[n], pf, ratioOf(p), whole(p)), `${n + 1}.jpg`);
  const r = await fetch('/api/studio/social/media', { method: 'POST', body: fd });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'The photos didn’t upload.');
}
function replace(p: Post) {
  // A post back from the server has its tags (if set) but not the venue worked out for it.
  posts = posts.map((x) => (x.id === p.id ? { ...p, tag_ids: p.tags != null ? JSON.parse(p.tags) : x.tag_ids } : x));
  p = posts.find((x) => x.id === p.id) ?? p;
  if (open?.id === p.id) { open = structuredClone(p); drawEditor(); }
  draw();
}

// The photo files, at the platform's size and crop.
/** A photo at full size: gallery photos' 2048px copy; site photos from Cloudflare Images at full width
 *  (its "public" copy is only 768px high, which made small Instagram files). */
const fullSrc = (p: Photo) => (p.image_id ? `/api/studio/ads/picks?image=${encodeURIComponent(p.image_id)}` : p.src.replace(/(imagedelivery\.net\/[^/]+\/.+)\/[^/]+$/, '$1/w=2560'));

// ---- Reels ----
/** The Reel video for a post, made once for each set of photos and music (kept while the page is open). */
const reels = new Map<string, Blob>();
let onReelProgress: (share: number) => void = () => {};
async function reelFor(p: Post): Promise<Blob> {
  if (!p.music_id) throw new Error('Choose the music for the Reel first.');
  const key = JSON.stringify([p.photos.map((x) => x.image_id || x.src), p.music_id]);
  const have = reels.get(key);
  if (have) return have;
  const mp3 = await (await fetch(`/api/studio/social/music?play=${p.music_id}`)).arrayBuffer();
  const blob = await makeReel(p.photos.map(fullSrc), mp3, (s) => onReelProgress(s));
  reels.set(key, blob);
  return blob;
}

async function photoFile(p: Photo, pf: Platform, ratio: number | null, padded = false): Promise<Blob> {
  const blob = await (await fetch(fullSrc(p), { mode: 'cors' })).blob();
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  await img.decode();
  if (padded) {
    // The whole photo, centred on a white page of the post's shape (1080 wide).
    const W = 1080, H = Math.round(1080 / (ratio ?? 0.8));
    const k = Math.min(W / img.naturalWidth, H / img.naturalHeight);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingQuality = 'high';
    const w = img.naturalWidth * k, h = img.naturalHeight * k;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    URL.revokeObjectURL(img.src);
    return new Promise((res) => cv.toBlob((b) => res(b!), 'image/jpeg', 0.92));
  }
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
  if (reel(p)) {
    const url = URL.createObjectURL(await reelFor(p));
    const a = document.createElement('a');
    a.href = url; a.download = `${p.post_at.slice(0, 10)}-${p.platform}-reel.mp4`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return;
  }
  for (let n = 0; n < p.photos.length; n++) {
    const url = URL.createObjectURL(await photoFile(p.photos[n], pf, ratioOf(p), whole(p)));
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
  const pv = t.closest<HTMLButtonElement>('[data-reel-preview]');
  if (pv) {
    pv.disabled = true;
    onReelProgress = (s) => (pv.textContent = `Making the video… ${Math.round(s * 100)}%`);
    try {
      const v = $<HTMLVideoElement>('.ed-video');
      v.src = URL.createObjectURL(await reelFor(open));
      v.hidden = false;
      v.play().catch(() => {});
    } catch (err) { toast((err as Error).message, true); }
    pv.disabled = false; pv.textContent = 'Watch the Reel';
    return;
  }
  const act = t.closest<HTMLButtonElement>('[data-act]');
  if (!act) return;
  onReelProgress = (s) => (act.textContent = `Making the video… ${Math.round(s * 100)}%`);
  const a = act.dataset.act!;
  // One thing at a time: Approve can take a while (the photos or video are made first), and the
  // buttons are redrawn part-way through, so a second click would start it again.
  if (busy) return;
  busy = true; ed.classList.add('busy');
  act.disabled = true;
  try {
    if (a === 'save') {
      const p = await save();
      if (p.status === 'approved' && auto(p.platform)) { act.textContent = reel(p) ? 'Making the video…' : 'Making the photos…'; await upload({ ...p, photos: open.photos }); }
      toast('Saved.');
    }
    if (a === 'approve') {
      const p = await save();
      if (auto(p.platform)) { act.textContent = reel(p) ? 'Making the video…' : 'Making the photos…'; await upload({ ...p, photos: open.photos }); }
      replace((await api({ action: 'approve', id: open.id })).post);
      toast(auto(p.platform) ? 'Approved: it goes out on its own at its time.' : 'Approved.');
    }
    if (a === 'post_now') {
      // Approved before Facebook/Instagram was connected: make its photo files first.
      if (!open.media || open.media === '[]' || (reel(open) && !open.media.includes('.mp4'))) { act.textContent = reel(open) ? 'Making the video…' : 'Making the photos…'; await upload(open); }
      act.textContent = 'Posting…';
      try { replace((await api({ action: 'post_now', id: open.id })).post); toast(`Posted to ${platforms[open.platform].name}.`); }
      catch (err) { await load(); const p = posts.find((x) => x.id === open!.id); if (p) openPost(p); throw err; }
    }
    if (a === 'unapprove' || a === 'skip' || a === 'restore' || a === 'posted') {
      replace((await api({ action: a, id: open.id })).post);
      toast({ unapprove: 'Back to draft.', skip: 'Skipped.', restore: 'Back as a draft.', posted: 'Marked as posted.' }[a]!);
      if (a === 'skip' || a === 'posted') ed.close();
    }
    if (a === 'rephoto') {
      act.textContent = 'Finding photos…';
      // Keep any caption or note edits: save them first, then swap the photos.
      await save();
      replace((await api({ action: 'rephoto', id: open.id })).post);
      at = 0;
      reels.clear();
      toast('Different photos. The caption is kept.');
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
  busy = false; ed.classList.remove('busy');
  if (ed.open && open) drawEditor();
});
document.addEventListener('keydown', (e) => {
  const th = (e.target as HTMLElement).closest?.('[data-at], [data-post]');
  if (th && (e.key === 'Enter' || e.key === ' ') && !(e.target as HTMLElement).matches('button')) { e.preventDefault(); (th as HTMLElement).click(); }
});
form.addEventListener('input', (e) => { if ((e.target as HTMLElement).matches('[name=caption]')) count(); });
// Photos or a Reel, and the Reel's music.
form.addEventListener('change', (e) => {
  const el = e.target as HTMLSelectElement;
  if (!open) return;
  if (el.matches('[name=format]')) {
    open.format = el.value;
    if (el.value === 'reel' && !open.music_id) open.music_id = music[0]?.id ?? null;
    if (el.value === 'reel' && !music.length) toast('Add some music first (Music for Reels, below the calendar).', true);
    return drawEditor();
  }
  if (el.matches('[name=music_id]')) { open.music_id = Number(el.value) || null; $('.ed-video').hidden = true; return; }
});
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
document.addEventListener('click', async (e) => {
  if (!(e.target as HTMLElement).closest('[data-copy-feed]')) return;
  try { await navigator.clipboard.writeText(FEED); toast('Feed address copied.'); } catch { toast('Couldn’t copy: select the address instead.', true); }
});
document.addEventListener('change', async (e) => {
  const sel = (e.target as HTMLElement).closest<HTMLSelectElement>('[data-pin-board]');
  if (!sel || !sel.value) return;
  const r = await fetch('/api/studio/pinterest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'board', id: sel.value }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { toast(d.error || 'That didn’t change.', true); return; }
  pin = d; drawPin(); draw(); toast('Board chosen.');
});
document.addEventListener('click', async (e) => {
  const ct = (e.target as HTMLElement).closest<HTMLElement>('[data-copy-text]');
  if (ct) { await navigator.clipboard.writeText(ct.dataset.copyText!); toast('Copied.'); }
});
document.addEventListener('click', async (e) => {
  if (!(e.target as HTMLElement).closest('[data-pin-off]')) return;
  if (!await ask('Disconnect Pinterest? Approved pins will wait for you to post them yourself.')) return;
  const r = await fetch('/api/studio/pinterest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'disconnect' }) });
  if (r.ok) { pin = await r.json(); drawPin(); draw(); toast('Disconnected.'); }
});
// A test pin in Pinterest's sandbox, for the Standard access video.
document.addEventListener('click', async (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-pin-test]');
  if (!b) return;
  const out = $('.so-pin-test');
  b.disabled = true; b.textContent = 'Making a test pin…';
  const r = await fetch('/api/studio/pinterest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'test' }) });
  const d = await r.json().catch(() => ({}));
  b.disabled = false; b.textContent = 'Make a test pin';
  out.hidden = false;
  out.textContent = r.ok
    ? `✓ Test pin made in Pinterest’s sandbox: “${d.pin.title}” on “${d.pin.board}” (pin ${d.pin.id}${d.pin.created_at ? `, ${new Date(d.pin.created_at).toLocaleString('en-NZ')}` : ''}).`
    : `The test pin didn’t work: ${d.error || r.status}`;
});
// Back from Pinterest's login.
{
  const m = new URLSearchParams(location.search).get('pinterest');
  if (m) {
    toast(m === 'connected' ? 'Pinterest is connected. Choose the board pins go to.' : m === 'cancelled' ? 'Connecting was cancelled.' : m === 'expired' ? 'That took too long. Please try Connect again.' : `Connecting didn’t work. ${m.replace(/^failed:/, '')}`, m !== 'connected');
    history.replaceState(null, '', location.pathname);
  }
}
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

// ---- Music for Reels ----
const mmss = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');
function drawMusic() {
  $('.music-list').innerHTML = music.length ? music.map((m) => `<li><strong>${esc(m.name)}${m.mood ? `<span class="muted">${esc(m.mood)}</span>` : ''}</strong>
    <span class="muted">${mmss(m.seconds)}</span><audio controls preload="none" src="/api/studio/social/music?play=${m.id}"></audio>
    <button type="button" class="s-btn s-btn--quiet" data-music-del="${m.id}">Remove</button></li>`).join('')
    : '<li class="muted">No music yet. Add a few tracks so Friday’s Reels have something to use.</li>';
}
// The name from the file: "alex-productions-romantic-wedding-piano-123456.mp3" -> "Romantic wedding piano".
$<HTMLInputElement>('.music-add [name=file]').addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const words = file.name.replace(/\.mp3$/i, '').replace(/[_-]+/g, ' ').replace(/\b\d{3,}\b/g, '').replace(/\s+/g, ' ').trim();
  $<HTMLInputElement>('.music-add [name=name]').value = words ? words[0].toUpperCase() + words.slice(1) : '';
});
$<HTMLFormElement>('.music-add').addEventListener('submit', async (e) => {
  e.preventDefault();
  const mf = e.target as HTMLFormElement;
  const file = (mf.elements.namedItem('file') as HTMLInputElement).files?.[0];
  if (!file) return;
  const btn = mf.querySelector('button')!;
  btn.disabled = true; btn.textContent = 'Adding…';
  try {
    // Its length, from the browser, for the list.
    const seconds = await new Promise<number>((res) => { const a = new Audio(URL.createObjectURL(file)); a.onloadedmetadata = () => res(a.duration); a.onerror = () => res(0); });
    const fd = new FormData(mf);
    fd.set('seconds', String(seconds || ''));
    const r = await fetch('/api/studio/social/music', { method: 'POST', body: fd });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'That didn’t upload.');
    mf.reset();
    toast('Track added.');
    await load();
  } catch (err) { toast((err as Error).message, true); }
  btn.disabled = false; btn.textContent = 'Add track';
});
document.addEventListener('click', async (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-music-del]');
  if (!b) return;
  if (!await ask('Remove this track? Draft Reels using it go back to photo posts.')) return;
  const r = await fetch('/api/studio/social/music', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: Number(b.dataset.musicDel) }) });
  if (!r.ok) return toast('That didn’t remove.', true);
  toast('Removed.');
  load();
});
