// A calendar in the site's style for every date box (input type="date"), instead of the browser's
// own grey one, which pages can't restyle. The box itself is unchanged: dates can still be typed,
// forms read .value as before, and picking a day fires input and change like the browser does.
// Phones and tablets keep their own date wheels, which suit touch better.
// Loaded by StudioLayout, the enquiry form and the booking page; importing it is all it takes.

const fine = matchMedia('(pointer: fine)').matches;
const css = `
@media (pointer: fine) {
  input[type=date]::-webkit-calendar-picker-indicator { opacity: 0; cursor: pointer; }
  input[type=date] { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235a5e3b' stroke-width='1.6' stroke-linecap='round'%3E%3Crect x='3.5' y='5' width='17' height='15.5' rx='2'/%3E%3Cpath d='M3.5 10h17M8 3v4M16 3v4'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; background-size: 18px; padding-right: 36px; cursor: pointer; }
}
.dp { position: fixed; z-index: 2147483000; width: 296px; padding: 14px 14px 10px; background: #fff; color: #1a1a1a; border: 1px solid #ddd3c4; border-radius: 22px 0; box-shadow: 0 24px 50px -24px rgb(0 0 0 / .45); font-family: inherit; font-size: 14px; line-height: 1.2; user-select: none; }
.dp[hidden] { display: none; }
.dp-head { display: flex; align-items: center; gap: 2px; margin-bottom: 8px; }
.dp-title { flex: 1; text-align: center; font-size: 16px; font-weight: 500; color: var(--green, #5a5e3b); }
.dp button { font: inherit; border: 0; background: none; color: inherit; cursor: pointer; }
.dp-nav { width: 30px; height: 30px; border-radius: 10px 0; color: var(--green, #5a5e3b) !important; font-size: 18px !important; line-height: 1; }
.dp-nav:hover { background: #f6f1ea !important; }
.dp-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.dp-wd { text-align: center; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: #8a8c74; font-weight: 600; padding: 4px 0 6px; }
.dp-day { height: 36px; border-radius: 12px 0; font-variant-numeric: tabular-nums; transition: background .15s, color .15s; }
.dp-day:hover:not(:disabled) { background: #f6f1ea !important; }
.dp-day.out { color: #b9b4a8 !important; }
.dp-day.today { box-shadow: inset 0 0 0 1px var(--gold, #b39a6b); }
.dp-day.on, .dp-day.on:hover { background: var(--green, #5a5e3b) !important; color: #fff !important; }
.dp-day:disabled { color: #ddd !important; cursor: default; }
.dp-foot { display: flex; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px solid #f0e9de; }
.dp-foot button { padding: 6px 10px; border-radius: 10px 0; color: var(--green, #5a5e3b) !important; font-size: 13px !important; font-weight: 600; letter-spacing: .04em; }
.dp-foot button:hover { background: #f6f1ea !important; }
`;

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const todayIso = () => { const t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()); };

let box: HTMLDivElement | null = null;
let field: HTMLInputElement | null = null;
let view = { y: 0, m: 0 };

function place() {
  if (!box || !field) return;
  const r = field.getBoundingClientRect();
  const h = box.offsetHeight, w = box.offsetWidth;
  const below = r.bottom + 4 + h <= innerHeight || r.top - 4 - h < 0;
  const top = below ? r.bottom + 4 : r.top - 4 - h, left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
  box.style.top = `${top}px`;
  box.style.left = `${left}px`;
  // Some pop-ups make themselves the frame that fixed positions count from: correct by what landed.
  for (let n = 0; n < 2; n++) {
    const got = box.getBoundingClientRect();
    if (Math.abs(got.top - top) < 0.5 && Math.abs(got.left - left) < 0.5) break;
    box.style.top = `${parseFloat(box.style.top) + top - got.top}px`;
    box.style.left = `${parseFloat(box.style.left) + left - got.left}px`;
  }
}

function draw() {
  if (!box || !field) return;
  const { y, m } = view;
  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7; // Monday first, as in New Zealand
  const start = new Date(y, m, 1 - lead);
  const chosen = field.value, today = todayIso(), min = field.min, max = field.max;
  let days = '';
  for (let n = 0; n < 42; n++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + n);
    const v = iso(d.getFullYear(), d.getMonth(), d.getDate());
    const cls = ['dp-day', d.getMonth() !== m ? 'out' : '', v === today ? 'today' : '', v === chosen ? 'on' : ''].filter(Boolean).join(' ');
    const off = (min && v < min) || (max && v > max);
    days += `<button type="button" class="${cls}" data-v="${v}"${off ? ' disabled' : ''} aria-label="${d.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}">${d.getDate()}</button>`;
  }
  box.innerHTML = `<div class="dp-head">
      <button type="button" class="dp-nav" data-go="-12" aria-label="Previous year">«</button>
      <button type="button" class="dp-nav" data-go="-1" aria-label="Previous month">‹</button>
      <span class="dp-title">${first.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' })}</span>
      <button type="button" class="dp-nav" data-go="1" aria-label="Next month">›</button>
      <button type="button" class="dp-nav" data-go="12" aria-label="Next year">»</button>
    </div>
    <div class="dp-grid">${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((w) => `<span class="dp-wd">${w}</span>`).join('')}${days}</div>
    <div class="dp-foot"><button type="button" data-set="">Clear</button><button type="button" data-set="${today}">Today</button></div>`;
  place();
}

function set(v: string) {
  if (!field) return;
  field.value = v;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
  const f = field;
  close();
  f.focus();
}

function close() {
  box?.remove();
  box = null;
  field = null;
}

function open(input: HTMLInputElement) {
  if (field === input) return;
  close();
  field = input;
  const v = /^\d{4}-\d{2}-\d{2}$/.test(input.value) ? input.value : input.min && todayIso() < input.min ? input.min : todayIso();
  view = { y: Number(v.slice(0, 4)), m: Number(v.slice(5, 7)) - 1 };
  box = document.createElement('div');
  box.className = 'dp';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Choose a date');
  // Inside a pop-up (a <dialog>), the calendar has to live in it too, or the pop-up covers it.
  (input.closest('dialog') ?? document.body).append(box);
  box.addEventListener('mousedown', (e) => e.preventDefault()); // keep the focus in the date box
  box.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b || b.disabled) return;
    e.stopPropagation();
    if (b.dataset.go) { view.m += Number(b.dataset.go); view.y += Math.floor(view.m / 12); view.m = ((view.m % 12) + 12) % 12; draw(); }
    else if (b.dataset.v) set(b.dataset.v);
    else if (b.dataset.set !== undefined) set(b.dataset.set);
  });
  draw();
}

if (fine && !(window as any).__datePicker) {
  (window as any).__datePicker = true;
  const s = document.createElement('style');
  s.textContent = css;
  document.head.append(s);
  const isDate = (t: EventTarget | null): t is HTMLInputElement => t instanceof HTMLInputElement && t.type === 'date' && !t.disabled && !t.readOnly;
  document.addEventListener('click', (e) => {
    if (isDate(e.target)) { e.preventDefault(); open(e.target); return; } // no browser calendar
    if (box && !box.contains(e.target as Node)) close();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (!box) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } // not the pop-up around it
    else if (e.key === 'Tab') close();
  }, true);
  // Typing a date moves the calendar to it.
  document.addEventListener('input', (e) => {
    if (box && e.target === field && /^\d{4}-\d{2}-\d{2}$/.test(field!.value)) { view = { y: Number(field!.value.slice(0, 4)), m: Number(field!.value.slice(5, 7)) - 1 }; draw(); }
  });
  addEventListener('scroll', place, true);
  addEventListener('resize', place);
}
