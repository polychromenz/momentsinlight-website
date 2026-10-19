// Address suggestions under an input or textarea as someone types (Google, via the studio:
// functions-lib/places.js). Pick one with a click or the arrow keys and Enter. Typing freely still
// works, so a missing key or a rural address Google doesn't know never gets in the way.
//   attachAddressLookup(input, { endpoint: '/api/studio/address', extra: '', onPick(place) {} })
export type Place = { id?: string; name?: string; address: string; lat?: number | null; lng?: number | null; business?: boolean };
type Opts = { endpoint: string; extra?: string; onPick?: (p: Place, el: HTMLInputElement | HTMLTextAreaElement) => void };

const css = `.al-list{position:absolute;z-index:60;left:0;right:0;top:100%;margin:2px 0 0;padding:4px;list-style:none;background:#fff;border:1px solid #ddd3c4;border-radius:10px 0;box-shadow:0 14px 30px -16px rgb(0 0 0/.4);font-size:14px;line-height:1.35;text-align:left}
.al-list li{padding:7px 10px;border-radius:6px;cursor:pointer;color:#2b2a24}.al-list li small{display:block;color:#888;font-size:12px}
.al-list li.on,.al-list li:hover{background:#eef0e4}.al-list .al-g{padding:2px 10px 0;font-size:10px;color:#aaa;cursor:default;background:none}`;
let styled = false;
const uid = () => (crypto.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^\w-]/g, '').slice(0, 36);
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function attachAddressLookup(el: HTMLInputElement | HTMLTextAreaElement, opts: Opts) {
  if (el.dataset.al) return;
  el.dataset.al = '1';
  if (!styled) { const s = document.createElement('style'); s.textContent = css; document.head.append(s); styled = true; }
  const wrap = el.parentElement!;
  if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
  const list = document.createElement('ul');
  list.className = 'al-list';
  list.hidden = true;
  list.setAttribute('role', 'listbox');
  el.after(list);
  el.setAttribute('autocomplete', 'off');
  let session = uid(), items: { id: string; main: string; rest: string }[] = [], at = -1, timer = 0, seq = 0;
  const url = (p: string) => `${opts.endpoint}?${p}&s=${session}${opts.extra ? `&${opts.extra}` : ''}`;
  const close = () => { list.hidden = true; at = -1; };
  const draw = () => {
    list.innerHTML = items.map((x, n) => `<li role="option" data-n="${n}" class="${n === at ? 'on' : ''}">${esc(x.main)}<small>${esc(x.rest)}</small></li>`).join('') + '<li class="al-g" aria-hidden="true">Suggestions by Google</li>';
    list.hidden = !items.length;
  };
  async function look() {
    const q = el.value.trim();
    if (q.length < 3 || q.includes('\n')) return close();
    const mine = ++seq;
    const r = await fetch(url(`q=${encodeURIComponent(q)}`)).catch(() => null);
    const d = r?.ok ? await r.json().catch(() => null) : null;
    if (mine !== seq || document.activeElement !== el) return;
    items = d?.suggestions ?? [];
    at = -1;
    draw();
  }
  async function pick(n: number) {
    const x = items[n];
    close();
    if (!x) return;
    const r = await fetch(url(`place=${encodeURIComponent(x.id)}`)).catch(() => null);
    const d = r?.ok ? await r.json().catch(() => null) : null;
    session = uid(); // a new lookup from here on
    const place: Place = d?.place ?? { address: [x.main, x.rest].filter(Boolean).join(', ') };
    if (opts.onPick) opts.onPick(place, el);
    else el.value = place.address;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  el.addEventListener('input', (e) => { if (!(e as InputEvent).inputType) return; clearTimeout(timer); timer = window.setTimeout(look, 250); });
  el.addEventListener('keydown', (e) => {
    const k = (e as KeyboardEvent).key;
    if (list.hidden) return;
    if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); at = (at + (k === 'ArrowDown' ? 1 : -1) + items.length) % items.length; draw(); }
    else if (k === 'Enter' && at >= 0) { e.preventDefault(); pick(at); }
    else if (k === 'Escape') close();
  });
  el.addEventListener('blur', () => setTimeout(close, 150));
  list.addEventListener('mousedown', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('[data-n]');
    if (li) { e.preventDefault(); pick(Number(li.dataset.n)); }
  });
}
