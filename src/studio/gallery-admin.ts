// The studio's gallery page (src/pages/studio/gallery.astro): photos, adding photos, details, sharing.
import { plan, run, type Plan } from './gallery-import';

const $ = <T extends HTMLElement = HTMLElement>(s: string, el: ParentNode = document) => el.querySelector<T>(s)!;
const $$ = <T extends HTMLElement = HTMLElement>(s: string, el: ParentNode = document) => [...el.querySelectorAll<T>(s)];
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const day = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const id = new URLSearchParams(location.search).get('id') ?? '';
let d: any = null; // { gallery, sections, images, url, types }
let links: any[] = [];
let codeUrl = '';
const selected = new Set<string>();
let lastClicked = '';

function toast(msg: string, error = false) {
  const t = $('.s-toast'); t.textContent = msg; t.classList.toggle('error', error); t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 4500);
}
async function api(url: string, method = 'GET', body?: unknown) {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Something went wrong (${r.status}).`);
  return j;
}
const tryApi = async (url: string, method: string, body?: unknown) => { try { return await api(url, method, body); } catch (e) { toast((e as Error).message, true); return null; } };

// ---- Tabs ----
function tab(name: string) {
  $$('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  $$('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== name));
  const u = new URL(location.href); u.searchParams.set('tab', name); history.replaceState(null, '', u);
  if (name === 'sharing') loadLinks();
  if (name === 'lists') loadLists();
}

// ---- Lists (favourites, lists and selections the couple and guests make) ----
const KIND: Record<string, string> = { favourites: 'Favourites', custom: 'List', selection_request: 'Selection request' };
async function loadLists() {
  const [r, l] = await Promise.all([tryApi(`/api/studio/galleries/lists?gallery_id=${id}`, 'GET'), tryApi(`/api/studio/galleries/links?gallery_id=${id}`, 'GET')]);
  if (!r || !l) return;
  const f = $<HTMLFormElement>('[data-request]');
  $<HTMLSelectElement>('[name="link_id"]', f).innerHTML = l.links.filter((x: any) => ['main_client', 'invited'].includes(x.kind)).map((x: any) => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  $<HTMLSelectElement>('[name="purpose"]', f).innerHTML = Object.entries(r.purposes).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  const thumbOf = (pid: string) => d.images.find((i: any) => i.id === pid)?.thumb;
  $('.ga-lists').innerHTML = r.lists.map((x: any) => {
    const names = x.photos.map((p: any) => (p.filename || '').replace(/\.jpe?g$/i, ''));
    const req = x.kind === 'selection_request';
    return `<div class="card ga-list" data-list="${x.id}">
      <div class="top"><span><span class="kind" style="font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--green)">${KIND[x.kind] ?? x.kind}</span> <strong>${esc(x.name)}</strong> <small>${esc(x.owner)}</small></span>
        <span>${x.photos.length} photo${x.photos.length === 1 ? '' : 's'}${x.status === 'submitted' ? ` · <strong>sent ${day(x.submitted_at)}</strong>` : ''}</span></div>
      <p class="meta">${[x.purpose ? r.purposes[x.purpose] : '', req && (x.min_count || x.max_count) ? `${x.min_count ?? 0} to ${x.max_count ?? 'any'}` : '', x.deadline ? `by ${day(x.deadline)}` : '', x.instructions].filter(Boolean).map(esc).join(' · ')}</p>
      ${x.note ? `<p class="note">${esc(x.note)}</p>` : ''}
      ${x.photos.length ? `<div class="strip">${x.photos.slice(0, 40).map((p: any) => thumbOf(p.id) ? `<img src="${esc(thumbOf(p.id))}" alt="" loading="lazy" title="${esc(p.filename)}" />` : '').join('')}</div>
      <p class="names">${names.map(esc).join(', ')}</p>` : ''}
      <div class="btns">${names.length ? `<button type="button" class="s-btn" data-copy="${esc(names.join(' '))}">Copy file names for Lightroom</button>` : ''}
        ${x.status !== 'open' ? '<button type="button" class="s-btn s-btn--quiet" data-reopen>Reopen so they can change it</button>' : ''}
        <button type="button" class="s-btn s-btn--quiet" data-del-list>Delete</button></div></div>`;
  }).join('') || '<div class="card"><p>No favourites or lists yet. They appear here as the couple and guests make them.</p></div>';
}
$('[data-request]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = { gallery_id: id, action: 'request', ...Object.fromEntries(new FormData(e.target as HTMLFormElement)) };
  if (await tryApi('/api/studio/galleries/lists', 'POST', body)) { toast('Added. They’ll see it in their Favourites & lists.'); loadLists(); }
});
document.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  const card = t.closest<HTMLElement>('[data-list]');
  if (!card) return;
  const lid = Number(card.dataset.list);
  if (t.closest('[data-reopen]') && (await tryApi('/api/studio/galleries/lists', 'POST', { gallery_id: id, action: 'reopen', id: lid }))) { toast('Reopened.'); loadLists(); }
  if (t.closest('[data-del-list]') && confirm('Delete this list? The photos stay in the gallery.') && (await tryApi('/api/studio/galleries/lists', 'DELETE', { gallery_id: id, id: lid }))) loadLists();
});

// ---- Loading and the header ----
async function load() {
  try { d = await api(`/api/studio/galleries/gallery?id=${id}`); } catch (e) { $('h1').textContent = (e as Error).message; return; }
  const g = d.gallery;
  document.title = `${g.name} · Moments Studio`;
  $('h1').textContent = g.name;
  const ready = d.images.filter((i: any) => i.status === 'ready').length;
  const status = g.status === 'online' && g.expires_at && g.expires_at < new Date().toLocaleDateString('en-CA') ? 'expired' : g.status;
  $('.ga-sub').innerHTML = [esc(g.type), g.event_date ? day(g.event_date) : '', `<span class="st st--${status}">${{ online: 'Online', draft: 'Draft', offline: 'Offline', expired: 'Expired' }[status as string]}</span>`, `${ready} photo${ready === 1 ? '' : 's'}${d.images.length > ready ? ` (+${d.images.length - ready} not finished)` : ''}`].filter(Boolean).join(' · ');
  $<HTMLAnchorElement>('[data-preview]').href = `/g/${g.slug}?preview=1`;
  $('[data-online]').hidden = g.status === 'online';
  drawPhotos();
  fillDetails();
  fillInto();
}

// ---- Photos ----
const sorted = () => [...d.sections].sort((a: any, b: any) => a.sort_order - b.sort_order || a.id - b.id);
const inSection = (sid: number) => d.images.filter((i: any) => i.section_id === sid).sort((a: any, b: any) => a.sort_order - b.sort_order);
const flat = () => sorted().flatMap((s: any) => inSection(s.id));

function thumb(i: any) {
  const w = Math.round((120 * (i.width || 3)) / (i.height || 2));
  const cover = d.gallery.cover_image_id === i.id;
  if (i.status !== 'ready') return `<div class="th wait" data-id="${i.id}" draggable="true">not finished</div>`;
  return `<div class="th${i.is_hero ? ' hero' : ''}${i.hidden ? ' hid' : ''}${selected.has(i.id) ? ' sel' : ''}" data-id="${i.id}" draggable="true" style="width:${w}px" title="${esc(i.filename)}">
    <img src="${esc(i.thumb)}" alt="" loading="lazy" />
    <span class="marks">${i.is_hero ? '<span class="hero-mark">★</span>' : ''}${cover ? '<span>Cover</span>' : ''}${i.hidden ? '<span>Hidden</span>' : ''}</span>
    <span class="tools"><button type="button" class="star" data-t="hero" title="${i.is_hero ? 'Not a highlight' : 'Highlight (a row of its own)'}">${i.is_hero ? '☆' : '★'}</button><button type="button" data-t="cover" title="Use as the cover">◎</button><button type="button" data-t="hide" title="${i.hidden ? 'Show' : 'Hide'}">${i.hidden ? '◉' : '⊘'}</button></span></div>`;
}
function drawPhotos() {
  const secs = sorted();
  $('.sec-order').hidden = secs.length < 2;
  $('.ga-sections').innerHTML = secs.map((s: any, n: number) => {
    const list = inSection(s.id);
    return `<div class="ga-sec${s.hidden ? ' hidden-sec' : ''}" data-sec="${s.id}">
      <div class="sec-head"><input class="sec-name" value="${esc(s.name)}" aria-label="Section name" /><small>${list.length} photo${list.length === 1 ? '' : 's'}</small><span class="sp"></span>
        <label><input type="checkbox" data-bw ${s.is_bw ? 'checked' : ''}/> B+W</label>
        <label><input type="checkbox" data-hidesec ${s.hidden ? 'checked' : ''}/> Hidden</label>
        <button type="button" data-up ${n === 0 ? 'disabled' : ''} title="Move up">↑</button><button type="button" data-down ${n === secs.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
        <button type="button" data-delsec title="Delete this section">Delete</button></div>
      <div class="thumbs" data-drop="${s.id}">${list.map(thumb).join('') || '<small class="hint">No photos. Drag some here, or add photos.</small>'}</div></div>`;
  }).join('') || '<div class="card"><p>No photos yet. Use <strong>Add photos</strong> to bring in a Pic-Time download.</p></div>';
  // Photos in no section (shouldn't happen) are shown so they can be moved.
  const loose = d.images.filter((i: any) => !d.sections.some((s: any) => s.id === i.section_id));
  if (loose.length) $('.ga-sections').insertAdjacentHTML('beforeend', `<div class="ga-sec"><div class="sec-head"><strong>Not in a section</strong></div><div class="thumbs">${loose.map(thumb).join('')}</div></div>`);
  selbar();
}
function selbar() {
  const n = selected.size;
  $('.ga-selbar').hidden = !n;
  $('.sel-n').textContent = `${n} selected`;
  $<HTMLSelectElement>('[data-move]').innerHTML = `<option value="">a section…</option>${sorted().map((s: any) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}`;
}
async function patch(ids: string[], set: Record<string, unknown>) {
  if (!(await tryApi('/api/studio/galleries/photos', 'PATCH', { gallery_id: id, ids, set }))) return;
  for (const i of d.images) if (ids.includes(i.id)) Object.assign(i, set);
  drawPhotos();
}

// Reorder sections: a pop-up list with drag handles (pointer events, so mouse and touch both work).
function orderDialog() {
  const dlg = $<HTMLDialogElement>('[data-order-dlg]');
  $('.order-list', dlg).innerHTML = sorted().map((s: any) => `<li data-oid="${s.id}"><span class="grip" aria-hidden="true">⋮⋮</span><span class="oname">${esc(s.name)}</span><small>${inSection(s.id).length}</small>
    <span class="omove"><button type="button" data-omove="-1" aria-label="Move up">↑</button><button type="button" data-omove="1" aria-label="Move down">↓</button></span></li>`).join('');
  dlg.showModal();
}
let grabbed: HTMLElement | null = null;
document.addEventListener('pointerdown', (e) => {
  const grip = (e.target as HTMLElement).closest<HTMLElement>('.order-list .grip, .order-list .oname');
  if (!grip) return;
  grabbed = grip.closest('li');
  grabbed!.classList.add('dragging');
  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  e.preventDefault();
});
document.addEventListener('pointermove', (e) => {
  if (!grabbed) return;
  const list = grabbed.parentElement!;
  const items = [...list.children].filter((x) => x !== grabbed) as HTMLElement[];
  const after = items.find((x) => { const r = x.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
  if (after) list.insertBefore(grabbed, after); else list.appendChild(grabbed);
  // Keep scrolling when dragging near the edges of a long list.
  const box = list.closest('.order-box')!.getBoundingClientRect();
  if (e.clientY < box.top + 40) list.closest('.order-box')!.scrollBy(0, -12);
  if (e.clientY > box.bottom - 40) list.closest('.order-box')!.scrollBy(0, 12);
});
const drop = () => { grabbed?.classList.remove('dragging'); grabbed = null; };
document.addEventListener('pointerup', drop);
document.addEventListener('pointercancel', drop);
document.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('[data-order-open]')) return orderDialog();
  const mv = t.closest<HTMLElement>('[data-omove]');
  if (mv) {
    const li = mv.closest('li')!;
    if (mv.dataset.omove === '-1' && li.previousElementSibling) li.parentElement!.insertBefore(li, li.previousElementSibling);
    if (mv.dataset.omove === '1' && li.nextElementSibling) li.parentElement!.insertBefore(li.nextElementSibling, li);
    return;
  }
  if (t.closest('[data-order-save]')) {
    const order = $$('.order-list li').map((li) => Number(li.dataset.oid));
    if (await tryApi('/api/studio/galleries/sections', 'PUT', { gallery_id: id, order })) {
      order.forEach((sid: number, k: number) => (d.sections.find((x: any) => x.id === sid).sort_order = k));
      $<HTMLDialogElement>('[data-order-dlg]').close();
      drawPhotos();
      toast('Section order saved.');
    }
  }
});

// Dragging photos (the selection, if the dragged photo is in it).
let dragging: string[] = [];
document.addEventListener('dragstart', (e) => {
  const th = (e.target as HTMLElement).closest<HTMLElement>('.th');
  if (!th) return;
  dragging = selected.has(th.dataset.id!) ? flat().filter((i: any) => selected.has(i.id)).map((i: any) => i.id) : [th.dataset.id!];
  e.dataTransfer!.effectAllowed = 'move';
  e.dataTransfer!.setData('text/plain', dragging.join(','));
});
const clearMarks = () => $$('.drop-before, .drop-after, .over').forEach((x) => x.classList.remove('drop-before', 'drop-after', 'over'));
document.addEventListener('dragover', (e) => {
  const zone = (e.target as HTMLElement).closest<HTMLElement>('[data-drop]');
  if (!zone || !dragging.length) return;
  e.preventDefault();
  clearMarks();
  zone.classList.add('over');
  const th = (e.target as HTMLElement).closest<HTMLElement>('.th');
  if (th && !dragging.includes(th.dataset.id!)) {
    const r = th.getBoundingClientRect();
    th.classList.add(e.clientX < r.left + r.width / 2 ? 'drop-before' : 'drop-after');
  }
});
document.addEventListener('dragend', () => { clearMarks(); dragging = []; });
document.addEventListener('drop', async (e) => {
  const zone = (e.target as HTMLElement).closest<HTMLElement>('[data-drop]');
  if (!zone || !dragging.length) return;
  e.preventDefault();
  const sid = Number(zone.dataset.drop);
  const mark = zone.querySelector<HTMLElement>('.drop-before, .drop-after');
  clearMarks();
  const order = inSection(sid).map((i: any) => i.id).filter((x: string) => !dragging.includes(x));
  let at = order.length;
  if (mark) at = order.indexOf(mark.dataset.id!) + (mark.classList.contains('drop-after') ? 1 : 0);
  order.splice(at, 0, ...dragging);
  const moved = dragging;
  dragging = [];
  if (!(await tryApi('/api/studio/galleries/photos', 'PATCH', { gallery_id: id, section_id: sid, order }))) return;
  order.forEach((x: string, n: number) => { const i = d.images.find((y: any) => y.id === x); i.section_id = sid; i.sort_order = n; });
  drawPhotos();
  if (moved.length > 1) toast(`Moved ${moved.length} photos.`);
});

// ---- Add photos ----
function fillInto() {
  $<HTMLSelectElement>('[data-into]').innerHTML = sorted().map((s: any) => `<option>${esc(s.name)}</option>`).join('') || '<option>Photos</option>';
}
let current: { files: File[]; into?: string } | null = null;
let busy = false;
let stop = false;
const skippedNote = (list: string[]) => {
  const web = list.find((x) => /web or social copies/.test(x));
  const other = list.filter((x) => x !== web).length;
  const bits = [other ? (other === 1 ? '1 file that isn’t a JPEG' : `${other} files that aren’t JPEGs`) : '', web ?? ''].filter(Boolean);
  return bits.length ? `<p class="hint">Skipped ${bits.join(' and ')}.</p>` : '';
};
function showPlan(p: Plan) {
  const box = $('.ga-plan');
  box.hidden = false;
  const todo = p.jobs.length;
  const mb = Math.round(p.jobs.reduce((a, j) => a + j.file.size, 0) / 1e6);
  box.innerHTML = `<h2>Ready to add</h2>
    <table><thead><tr><th>Section</th><th>Photos</th><th>Already here</th><th></th></tr></thead><tbody>
    ${p.sections.map((s) => `<tr><td>${esc(s.name)}</td><td>${s.files}</td><td>${s.done}</td><td>${s.is_bw ? 'B+W' : ''}</td></tr>`).join('')}</tbody></table>
    ${skippedNote(p.skipped)}
    <p>${todo ? `${todo} photo${todo === 1 ? '' : 's'} to send (${mb.toLocaleString('en-NZ')} MB).` : 'Everything here is already in the gallery.'}</p>
    <div class="bar"><span></span></div><p class="prog hint"></p><div class="fails"></div>
    ${todo ? '<button type="button" class="s-btn s-btn--solid" data-start>Start</button> <button type="button" class="s-btn" data-stop hidden>Stop</button>' : ''}`;
}
function choose(files: File[], into?: string) {
  current = { files, into };
  showPlan(plan(files, d, into));
}
async function start() {
  if (!current || busy) return;
  busy = true; stop = false;
  const p = plan(current.files, d, current.into);
  $('[data-start]').hidden = true; $('[data-stop]').hidden = false;
  const t0 = Date.now();
  const res = await run(id, p, d, (pr) => {
    $<HTMLElement>('.bar span').style.width = `${pr.total ? (pr.done / pr.total) * 100 : 100}%`;
    const secs = (Date.now() - t0) / 1000;
    const rate = pr.bytes / 1e6 / Math.max(1, secs);
    const left = pr.done ? ((pr.total - pr.done) * secs) / pr.done : 0;
    $('.prog').textContent = `${pr.done} of ${pr.total} · ${rate.toFixed(1)} MB/s${pr.done && pr.done < pr.total ? ` · about ${Math.ceil(left / 60)} min left` : ''}${pr.current && pr.done < pr.total ? ` · ${pr.current}` : ''}`;
    $('.fails').innerHTML = pr.failed.length ? `<p>${pr.failed.length} didn’t go:</p><ul>${pr.failed.slice(0, 20).map((f) => `<li>${esc(f.name)}: ${esc(f.error)}</li>`).join('')}</ul>` : '';
  }, () => stop).catch((e) => { toast((e as Error).message, true); return null; });
  busy = false;
  await load();
  if (res) {
    toast(stop ? 'Stopped. Choose the same folder again to carry on.' : res.failed.length ? `Done, but ${res.failed.length} didn’t go. Choose the folder again to retry them.` : 'All photos added.');
    showPlan(plan(current.files, d, current.into));
    if (!res.failed.length && !stop) $('.prog').textContent = 'All done. See them on the Photos tab.';
  }
}
addEventListener('beforeunload', (e) => { if (busy) e.preventDefault(); });

// ---- Details ----
function fillDetails() {
  const g = d.gallery;
  const f = $<HTMLFormElement>('[data-details]');
  const set = (n: string, v: unknown) => { const el = f.elements.namedItem(n) as HTMLInputElement; if (el) el.value = String(v ?? ''); };
  $<HTMLSelectElement>('[name="type"]', f).innerHTML = d.types.map((t: string) => `<option>${t}</option>`).join('');
  for (const k of ['name', 'type', 'spouse_a', 'spouse_b', 'family_name', 'event_date', 'venue', 'description', 'slug', 'expires_at']) set(k, g[k]);
  set('ext_mode', g.extension_price === null ? 'default' : g.extension_price === 0 ? 'free' : 'custom');
  set('ext_price', g.extension_price ? g.extension_price / 100 : '');
  $('.ext-custom').hidden = !(g.extension_price > 0);
  $('.addr-base').textContent = 'galleries.momentsinlight.co.nz/';
  $('.ga-form .state').innerHTML = g.status === 'online' ? `Online${g.expires_at ? ` until <strong>${day(g.expires_at)}</strong>` : ''}.` : g.status === 'draft' ? 'A draft: only you can see it (Preview). <strong>Put online</strong> when it’s ready; the expiry date is set then.' : 'Offline: nobody can see it.';
  $('[data-offline]').hidden = g.status !== 'online';
}
$('[data-details]').addEventListener('change', (e) => {
  if ((e.target as HTMLElement).getAttribute('name') === 'ext_mode') $('.ext-custom').hidden = (e.target as HTMLSelectElement).value !== 'custom';
});
$('[data-details]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target as HTMLFormElement);
  const body: Record<string, unknown> = { id };
  for (const k of ['name', 'type', 'spouse_a', 'spouse_b', 'family_name', 'event_date', 'venue', 'description', 'slug', 'expires_at']) body[k] = f.get(k);
  const mode = f.get('ext_mode');
  body.extension_price = mode === 'default' ? null : mode === 'free' ? 0 : Math.round(Number(f.get('ext_price')) * 100);
  if (await tryApi('/api/studio/galleries/gallery', 'PUT', body)) { toast('Saved.'); load(); }
});

// ---- Sharing ----
const DL: Record<string, string> = { highres: 'Full size and web size downloads', web: 'Web size downloads', none: 'No downloads' };
async function loadLinks() {
  const r = await tryApi(`/api/studio/galleries/links?gallery_id=${id}`, 'GET');
  if (!r) return;
  links = r.links; codeUrl = r.code_url;
  const a = $<HTMLAnchorElement>('.code-url'); a.href = codeUrl; a.textContent = codeUrl.replace('https://', '');
  const secName = (sid: number) => d.sections.find((s: any) => s.id === sid)?.name;
  $('.ga-links').innerHTML = links.map((l) => `<div class="card ga-link" data-link="${l.id}">
    <div class="top"><span><span class="kind">${esc(r.kinds[l.kind] ?? l.kind)}</span> <strong>${esc(l.name)}</strong>${l.email ? ` <small>${esc(l.email)}</small>` : ''}</span>
      <span><a class="s-btn s-btn--quiet" href="/g/${esc(d.gallery.slug)}?preview=1&link=${l.id}" target="_blank" rel="noopener">Preview as this</a> <button type="button" class="s-btn" data-edit-link="${l.id}">Change</button></span></div>
    <div class="url"><code>${esc(l.url)}</code><button type="button" class="s-btn s-btn--quiet" data-copy="${esc(l.url)}">Copy link</button>${l.access_code ? `<span>Code: <code>${esc(l.access_code)}</code> <button type="button" class="s-btn s-btn--quiet" data-copy="${esc(l.access_code)}">Copy</button></span>` : ''}</div>
    <div class="facts">${[DL[l.downloads], l.watermark ? 'Monogram on photos' : '', l.require_email ? 'Name and email first' : '', l.visible_section_ids?.length ? `Only: ${l.visible_section_ids.map(secName).filter(Boolean).map(esc).join(', ')}` : 'All sections', l.expires_at ? `Until ${day(l.expires_at)}` : '', `${l.visitors} visitor${l.visitors === 1 ? '' : 's'}${l.last_seen ? `, last ${day(l.last_seen)}` : ''}`].filter(Boolean).join(' · ')}</div></div>`).join('');
}
function editLink(l: any) {
  const f = $<HTMLFormElement>('[data-link-form]');
  f.dataset.id = String(l.id);
  $('h2', f).textContent = l.name || 'Link';
  for (const k of ['name', 'email', 'access_code', 'downloads', 'expires_at']) (f.elements.namedItem(k) as HTMLInputElement).value = l[k] ?? '';
  (f.elements.namedItem('watermark') as HTMLInputElement).checked = !!l.watermark;
  (f.elements.namedItem('require_email') as HTMLInputElement).checked = !!l.require_email;
  const only: number[] | null = l.visible_section_ids?.length ? l.visible_section_ids : null;
  $('.secs', f).innerHTML = sorted().map((s: any) => `<label class="check"><input type="checkbox" value="${s.id}" ${!only || only.includes(s.id) ? 'checked' : ''}/> ${esc(s.name)}</label>`).join('') || '<small class="hint">No sections yet.</small>';
  $('.err', f).hidden = true;
  $<HTMLDialogElement>('[data-link-dlg]').showModal();
}
$('[data-link-form]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const f = new FormData(form);
  const boxes = $$<HTMLInputElement>('.secs input', form);
  const chosen = boxes.filter((b) => b.checked).map((b) => Number(b.value));
  if (boxes.length && !chosen.length) { const p = $('.err', form); p.hidden = false; p.textContent = 'Choose at least one section.'; return; }
  const body = { id: Number(form.dataset.id), name: f.get('name'), email: f.get('email'), access_code: f.get('access_code'), downloads: f.get('downloads'), expires_at: f.get('expires_at'),
    watermark: !!f.get('watermark'), require_email: !!f.get('require_email'), visible_section_ids: chosen.length === boxes.length ? null : chosen };
  try { await api('/api/studio/galleries/links', 'PUT', body); } catch (err) { const p = $('.err', form); p.hidden = false; p.textContent = (err as Error).message; return; }
  $<HTMLDialogElement>('[data-link-dlg]').close();
  loadLinks();
});

// ---- Clicks ----
document.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  const tb = t.closest<HTMLElement>('[data-tab]');
  if (tb) return tab(tb.dataset.tab!);

  // A photo's own buttons
  const tool = t.closest<HTMLElement>('[data-t]');
  if (tool) {
    const iid = tool.closest<HTMLElement>('.th')!.dataset.id!;
    const i = d.images.find((x: any) => x.id === iid);
    if (tool.dataset.t === 'hero') return patch([iid], { is_hero: i.is_hero ? 0 : 1 });
    if (tool.dataset.t === 'hide') return patch([iid], { hidden: i.hidden ? 0 : 1 });
    if (tool.dataset.t === 'cover' && (await tryApi('/api/studio/galleries/gallery', 'PUT', { id, cover_image_id: iid }))) { d.gallery.cover_image_id = iid; drawPhotos(); toast('Cover chosen.'); }
    return;
  }
  // Selecting photos
  const th = t.closest<HTMLElement>('.th');
  if (th) {
    const iid = th.dataset.id!;
    if ((e as MouseEvent).shiftKey && lastClicked) {
      const ids = flat().map((i: any) => i.id);
      const [a, b] = [ids.indexOf(lastClicked), ids.indexOf(iid)].sort((x, y) => x - y);
      ids.slice(a, b + 1).forEach((x: string) => selected.add(x));
    } else selected.has(iid) ? selected.delete(iid) : selected.add(iid);
    lastClicked = iid;
    return drawPhotos();
  }
  const sel = t.closest<HTMLElement>('[data-sel]');
  if (sel) {
    const ids = [...selected];
    const k = sel.dataset.sel;
    if (k === 'none') { selected.clear(); return drawPhotos(); }
    if (k === 'hero' || k === 'unhero') return patch(ids, { is_hero: k === 'hero' ? 1 : 0 });
    if (k === 'hide' || k === 'show') return patch(ids, { hidden: k === 'hide' ? 1 : 0 });
    if (k === 'delete') {
      if (!confirm(`Delete ${ids.length} photo${ids.length === 1 ? '' : 's'} (all sizes)? This can’t be undone.`)) return;
      if (await tryApi('/api/studio/galleries/photos', 'DELETE', { gallery_id: id, ids })) { selected.clear(); toast('Deleted.'); load(); }
    }
    return;
  }
  // Sections
  const sec = t.closest<HTMLElement>('.ga-sec[data-sec]');
  if (sec && t.closest('[data-up], [data-down]')) {
    const order = sorted().map((s: any) => s.id);
    const n = order.indexOf(Number(sec.dataset.sec));
    const m = n + (t.closest('[data-up]') ? -1 : 1);
    [order[n], order[m]] = [order[m], order[n]];
    if (await tryApi('/api/studio/galleries/sections', 'PUT', { gallery_id: id, order })) { order.forEach((sid: number, k: number) => (d.sections.find((s: any) => s.id === sid).sort_order = k)); drawPhotos(); }
    return;
  }
  if (sec && t.closest('[data-delsec]')) {
    const n = inSection(Number(sec.dataset.sec)).length;
    if (!confirm(n ? `Delete this section and its ${n} photo${n === 1 ? '' : 's'}? To keep the photos, move them to another section first.` : 'Delete this empty section?')) return;
    if (await tryApi('/api/studio/galleries/sections', 'DELETE', { gallery_id: id, id: Number(sec.dataset.sec) })) load();
    return;
  }
  if (t.closest('[data-add-section]')) {
    const name = prompt('Section name:');
    if (name?.trim() && (await tryApi('/api/studio/galleries/photos', 'POST', { action: 'section', gallery_id: id, name: name.trim(), is_bw: / b\+?w$|mono$/i.test(name.trim()) }))) load();
    return;
  }
  // Add photos
  if (t.closest('[data-start]')) return start();
  if (t.closest('[data-stop]')) { stop = true; (t as HTMLButtonElement).disabled = true; return; }
  // Online / offline / delete
  if (t.closest('[data-online]')) {
    if (!d.images.some((i: any) => i.status === 'ready')) return toast('Add some photos first.', true);
    const r = await tryApi('/api/studio/galleries/gallery', 'POST', { id, action: 'online' });
    if (r) { toast(r.expires_at ? `Online until ${day(r.expires_at)}.` : 'Online.'); load(); }
    return;
  }
  if (t.closest('[data-offline]')) {
    if (confirm('Take this gallery offline? Nobody will be able to see it until you put it online again.') && (await tryApi('/api/studio/galleries/gallery', 'POST', { id, action: 'offline' }))) { toast('Offline.'); load(); }
    return;
  }
  if (t.closest('[data-delete]')) {
    const name = prompt(`This deletes every photo in “${d.gallery.name}”. Type the gallery’s name to confirm:`);
    if (name === null) return;
    if (await tryApi('/api/studio/galleries/gallery', 'DELETE', { id, confirm: name })) location.href = '/studio/galleries';
    return;
  }
  // Sharing
  const nl = t.closest<HTMLElement>('[data-new-link]');
  if (nl) {
    const r = await tryApi('/api/studio/galleries/links', 'POST', { gallery_id: id, kind: nl.dataset.newLink });
    if (r) { await loadLinks(); editLink(links.find((l) => l.id === r.id)); }
    return;
  }
  const el = t.closest<HTMLElement>('[data-edit-link]');
  if (el) return editLink(links.find((l) => l.id === Number(el.dataset.editLink)));
  if (t.closest('[data-del-link]')) {
    const lid = Number($<HTMLFormElement>('[data-link-form]').dataset.id);
    if (!confirm('Remove this link? Anyone using it won’t be able to open the gallery any more.')) return;
    if (await tryApi('/api/studio/galleries/links', 'DELETE', { id: lid })) { $<HTMLDialogElement>('[data-link-dlg]').close(); loadLinks(); }
    return;
  }
  if (t.closest('[data-gen]')) {
    const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    ($<HTMLInputElement>('[data-link-form] [name="access_code"]')).value = [...crypto.getRandomValues(new Uint8Array(6))].map((b) => abc[b % abc.length]).join('');
    return;
  }
  const cp = t.closest<HTMLElement>('[data-copy]');
  if (cp) { await navigator.clipboard.writeText(cp.dataset.copy!); toast('Copied.'); return; }
  if (t.closest('[data-close]')) (t.closest('dialog') as HTMLDialogElement).close();
});

document.addEventListener('change', async (e) => {
  const t = e.target as HTMLInputElement;
  const sec = t.closest<HTMLElement>('.ga-sec[data-sec]');
  if (sec) {
    const sid = Number(sec.dataset.sec);
    const s = d.sections.find((x: any) => x.id === sid);
    const body: Record<string, unknown> = { gallery_id: id, id: sid };
    if (t.classList.contains('sec-name')) body.name = t.value;
    else if (t.matches('[data-bw]')) body.is_bw = t.checked;
    else if (t.matches('[data-hidesec]')) body.hidden = t.checked;
    else return;
    if (await tryApi('/api/studio/galleries/sections', 'PUT', body)) {
      if ('name' in body) s.name = String(body.name).trim();
      if ('is_bw' in body) s.is_bw = body.is_bw ? 1 : 0;
      if ('hidden' in body) { s.hidden = body.hidden ? 1 : 0; drawPhotos(); }
      fillInto();
    }
    return;
  }
  if (t.matches('[data-move]') && t.value) {
    const ids = flat().filter((i: any) => selected.has(i.id)).map((i: any) => i.id);
    if (await tryApi('/api/studio/galleries/photos', 'PATCH', { gallery_id: id, ids, set: { section_id: Number(t.value) } })) { selected.clear(); toast(`Moved ${ids.length} photo${ids.length === 1 ? '' : 's'}.`); load(); }
    return;
  }
  if (t.matches('[data-folder]') && t.files?.length) { choose([...t.files]); t.value = ''; return; }
  if (t.matches('[data-files]') && t.files?.length) { choose([...t.files], $<HTMLSelectElement>('[data-into]').value || 'Photos'); t.value = ''; }
});

load().then(() => tab(new URLSearchParams(location.search).get('tab') ?? 'photos'));
