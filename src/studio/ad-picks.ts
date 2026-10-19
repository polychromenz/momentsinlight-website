import { ask } from './dialogs';
// SEO > Google Ads > Ad picks (src/pages/studio/seo/ads.astro). Photos marked Ad in the
// galleries: the studio suggests crops, Tony nudges them, and Approve makes the files here in the
// browser (from the web-size photo) and queues them for the Ads Script. API: functions/api/studio/ads/picks.js.
type Crop = { x: number; y: number; w: number; h: number };
type Kind = 'wide' | 'square';
const OUT: Record<Kind, [number, number]> = { wide: [1200, 628], square: [1200, 1200] };
const STATUS: Record<string, string> = {
  picked: 'Check the crop, then Approve',
  approved: 'Approved: going into Google Ads on the script’s next run',
  added: 'In Google Ads',
  failed: 'Couldn’t be added',
};

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
function toast(msg: string, error = false) {
  const t = $('.s-toast'); t.textContent = msg; t.classList.toggle('error', error); t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 4000);
}
const post = (body: unknown) => fetch('/api/studio/ads/picks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

let picks: any[] = [];
const editing: Record<number, Kind> = {};

// The web-size photo is 2048 on its long side; a crop must give Google at least its size.
const webWidth = (p: any) => (p.width * 2048) / Math.max(p.width, p.height);
const bigEnough = (p: any, c: Crop, kind: Kind) => webWidth(p) * c.w >= OUT[kind][0] - 1;
const frame = (c: Crop, kind: Kind) => `<div class="pk-frame pk-${kind}" style="left:${c.x * 100}%;top:${c.y * 100}%;width:${c.w * 100}%;height:${c.h * 100}%"><span>${kind}</span></div>`;
const stat = (s: any) => (s ? `${s.impressions} views, ${s.clicks} clicks` : '');

function draw() {
  $('.pk-list').innerHTML = picks.length ? picks.map((p) => {
    const kind = editing[p.id] ?? 'wide';
    const open = p.status === 'picked' || p.status === 'failed';
    const c: Crop = kind === 'square' ? p.crop_square : p.crop_wide;
    const numbers = [stat(p.stats.wide) && `Wide: ${stat(p.stats.wide)}`, stat(p.stats.square) && `Square: ${stat(p.stats.square)}`].filter(Boolean).join(' · ');
    return `<div class="pk" data-pick="${p.id}">
      <div class="pk-img" style="aspect-ratio:${p.width}/${p.height};width:min(100%, ${Math.round((360 * p.width) / p.height)}px)"><img src="${esc(p.thumb)}" alt="" />${frame(p.crop_wide, 'wide')}${p.crop_square ? frame(p.crop_square, 'square') : ''}</div>
      <div class="pk-side">
        <strong>${esc(p.gallery)}</strong> <small class="muted">${esc(p.filename)}</small>
        <p class="pk-st st-${p.status}">${STATUS[p.status] ?? esc(p.status)}${p.error ? ` <small class="warn">${esc(p.error)}</small>` : ''}${p.blocked ? ` <small class="warn">${esc(p.blocked)}</small>` : ''}</p>
        ${p.status === 'added' ? `<p class="muted">${numbers || 'Numbers arrive with the next daily export.'}</p>` : ''}
        ${open ? `<div class="pk-tools">
          <label><input type="checkbox" data-sq ${p.crop_square ? 'checked' : ''} /> Square one too</label>
          ${p.crop_square ? `<span class="seg"><button type="button" data-edit="wide" class="${kind === 'wide' ? 'on' : ''}">Wide</button><button type="button" data-edit="square" class="${kind === 'square' ? 'on' : ''}">Square</button></span>` : ''}
          <span class="nudge"><button type="button" data-n="up" title="Up">↑</button><button type="button" data-n="down" title="Down">↓</button><button type="button" data-n="left" title="Left">←</button><button type="button" data-n="right" title="Right">→</button><button type="button" data-n="in" title="Closer">＋</button><button type="button" data-n="out" title="Wider">－</button></span>
          ${c && !bigEnough(p, c, kind) ? '<small class="warn">Too close for Google’s size: zoom out a little.</small>' : ''}
          <span class="pk-act"><button type="button" class="s-btn s-btn--solid" data-approve ${p.blocked ? 'disabled' : ''}>Approve</button> <button type="button" class="s-btn s-btn--quiet" data-unpick>Remove</button></span>
        </div>` : `<p class="pk-files">${p.files?.wide ? `<a href="${esc(p.files.wide)}" target="_blank" rel="noopener">Wide file</a>` : ''}${p.files?.square ? ` · <a href="${esc(p.files.square)}" target="_blank" rel="noopener">Square file</a>` : ''}</p>`}
      </div></div>`;
  }).join('') : '<p class="muted">None yet. In a gallery’s Photos tab, hover a photo and click <strong>Ad</strong>.</p>';
}

async function load() {
  const r = await fetch('/api/studio/ads/picks');
  if (!r.ok) return;
  const d = await r.json();
  picks = d.picks;
  if (d.campaign) $('.pk-camp').textContent = d.campaign.name;
  $('.pk-count').textContent = d.images ? `The campaign has ${d.images.now} of Google’s ${d.images.limit} images${d.images.waiting ? `, ${d.images.waiting} more on the way` : ''}. Remove weaker ones in Google Ads to make room.` : '';
  draw();
}

const clamp = (c: Crop): Crop => ({ ...c, x: Math.min(Math.max(c.x, 0), 1 - c.w), y: Math.min(Math.max(c.y, 0), 1 - c.h) });
function nudge(p: any, kind: Kind, how: string) {
  let c: Crop = { ...(kind === 'square' ? p.crop_square : p.crop_wide) };
  const step = 0.03;
  if (how === 'up') c.y -= step;
  if (how === 'down') c.y += step;
  if (how === 'left') c.x -= step;
  if (how === 'right') c.x += step;
  if (how === 'in' || how === 'out') {
    // Same shape and centre; never bigger than the photo.
    const k = how === 'in' ? 0.92 : 1 / 0.92;
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    let w = c.w * k, h = c.h * k;
    const f = Math.min(1, 1 / w, 1 / h);
    w *= f; h *= f;
    c = { x: cx - w / 2, y: cy - h / 2, w, h };
  }
  c = clamp(c);
  if (kind === 'square') p.crop_square = c; else p.crop_wide = c;
}
let saving: ReturnType<typeof setTimeout>;
const saveCrop = (p: any) => { clearTimeout(saving); saving = setTimeout(() => post({ action: 'crop', id: p.id, crop_wide: p.crop_wide, crop_square: p.crop_square }), 600); };

function makeFile(img: HTMLImageElement, c: Crop, kind: Kind) {
  const [w, h] = OUT[kind];
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, c.x * img.naturalWidth, c.y * img.naturalHeight, c.w * img.naturalWidth, c.h * img.naturalHeight, 0, 0, w, h);
  return new Promise<Blob>((res) => cv.toBlob((b) => res(b!), 'image/jpeg', 0.9));
}

async function approve(p: any, btn: HTMLButtonElement) {
  const kinds: Kind[] = ['wide', ...(p.crop_square ? ['square' as Kind] : [])];
  for (const k of kinds) if (!bigEnough(p, k === 'wide' ? p.crop_wide : p.crop_square, k)) return toast(`The ${k} crop is too close for Google’s size. Zoom out a little.`, true);
  btn.disabled = true;
  btn.textContent = 'Making the files…';
  try {
    const img = new Image();
    img.src = URL.createObjectURL(await (await fetch(`/api/studio/ads/picks?image=${p.image_id}`)).blob());
    await img.decode();
    await post({ action: 'crop', id: p.id, crop_wide: p.crop_wide, crop_square: p.crop_square });
    for (const k of kinds) {
      const r = await fetch(`/api/studio/ads/picks?id=${p.id}&kind=${k}`, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: await makeFile(img, k === 'wide' ? p.crop_wide : p.crop_square, k) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Couldn’t save the file.');
    }
    const r = await post({ action: 'approve', id: p.id });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Couldn’t approve it.');
    toast(d.swapped ? `Approved. Within the hour the script swaps out ${d.swapped} weak image${d.swapped > 1 ? 's' : ''} and adds this one.` : 'Approved. The script adds it within the hour.');
  } catch (err) {
    toast((err as Error).message, true);
  }
  load();
}

const list = $('.pk-list');
list.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  const box = t.closest<HTMLElement>('[data-pick]');
  if (!box) return;
  const p = picks.find((x) => x.id === Number(box.dataset.pick));
  if (!p) return;
  const kind = editing[p.id] ?? 'wide';
  const ed = t.closest<HTMLElement>('[data-edit]');
  if (ed) { editing[p.id] = ed.dataset.edit as Kind; return draw(); }
  const n = t.closest<HTMLElement>('[data-n]');
  if (n) { nudge(p, kind, n.dataset.n!); saveCrop(p); return draw(); }
  if (t.closest('[data-unpick]')) {
    if (!await ask('Remove this pick? (Nothing changes in Google Ads.)')) return;
    await post({ action: 'remove', id: p.id });
    return load();
  }
  const ap = t.closest<HTMLButtonElement>('[data-approve]');
  if (ap) return approve(p, ap);
});
list.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement;
  if (!t.matches('[data-sq]')) return;
  const p = picks.find((x) => x.id === Number(t.closest<HTMLElement>('[data-pick]')!.dataset.pick));
  p.crop_square = t.checked ? p.square_suggestion : null;
  editing[p.id] = t.checked ? 'square' : 'wide';
  saveCrop(p);
  draw();
});
load();
