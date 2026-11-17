// The gallery's guided tour (gallery-view.astro): a spotlight moves over the real buttons, an animated
// hand taps them, and a card explains each one, using the couple's own photos. Only the steps their
// link allows are shown. It shows itself the first time someone opens a gallery on a device
// (remembered in localStorage) and runs again from the gallery's "?" button. It only demonstrates:
// nothing in the gallery changes.
type Step = { target?: () => Element | null; title: string; text: string; art?: () => string; tap?: boolean };
export type TourOptions = { lists: boolean; zip: boolean; couple: boolean; multi: boolean; thumbs: string[]; cover?: string; names: string };

const SEEN = 'mil-gallery-tour';
export const tourSeen = () => { try { return !!localStorage.getItem(SEEN); } catch { return true; } };
const markSeen = () => { try { localStorage.setItem(SEEN, '1'); } catch { /* fine */ } };
const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const shown = (el: Element | null) => !!el && !(el as HTMLElement).hidden && (el as HTMLElement).offsetParent !== null && el.getBoundingClientRect().width > 0;

// Where the visitor was when the tour began (kept if the tour is started again while it's open).
let openFrom: number | null = null;

export function startTour(o: TourOptions) {
  if (!document.querySelector('.tour')) openFrom = null;
  document.querySelector('.tour')?.remove();
  const t = (i: number) => o.thumbs[i % Math.max(1, o.thumbs.length)] ?? '';
  const img = (i: number, cls = '') => (t(i) ? `<img class="${cls}" src="${esc(t(i))}" alt="" />` : `<span class="${cls} blank"></span>`);
  const firstPhoto = () => document.querySelector('.g-main .ph');
  const all: (Step & { when?: boolean })[] = [
    { title: `Welcome, ${o.names}`, text: 'These are your photos. Here’s a quick look at how to enjoy them, share them and keep your favourites. It takes less than a minute.',
      art: () => (o.cover ? `<img class="tour-cover" src="${esc(o.cover)}" alt="" />` : '') },
    { when: o.multi, target: () => document.querySelector('.g-sections'), title: 'Every part of the day', text: 'Jump straight to any part of the day from the menu along the top. Scroll down and it follows you.' },
    { target: firstPhoto, tap: true, title: 'See every photo big', text: 'Tap any photo to open it full screen. Swipe (or use the arrow keys) to move through them, or press Slideshow to sit back and watch.' },
    { when: o.lists, target: firstPhoto, title: 'Keep your favourites', text: 'Tap the heart on any photo you love. Your favourites are kept together, ready to come back to.',
      art: () => `<div class="tour-fav">${img(0, 'tour-ph')}<span class="tour-heart">♥</span></div>` },
    { when: o.lists, target: () => document.querySelector('[data-lists]'), tap: true, title: 'Make lists', text: 'Your favourites and lists live here. Make a list for anything: photos for Mum, album picks, prints for the wall.',
      art: () => `<div class="tour-lists"><span class="tour-chip">♥ Favourites <b>12</b></span><span class="tour-chip d1">For Mum <b>8</b></span><span class="tour-chip d2">Album picks <b>40</b></span></div>` },
    { when: o.lists, target: () => document.querySelector('[data-select]'), tap: true, title: 'Choose several at once', text: 'Press Select, tap the photos you want, then save them to a list in one go' + (o.zip ? ' or download just those.' : '.'),
      art: () => `<div class="tour-sel">${[0, 1, 2, 3].map((i) => `<span class="tour-t${i < 3 ? ' on' : ''}" style="--d:${i * 0.35}s">${img(i + 1)}<i>✓</i></span>`).join('')}</div>` },
    { when: o.lists, target: () => document.querySelector('[data-lists]'), title: 'Share a list', text: 'Open your lists and press Share next to one. Family see just the photos in that list, which is perfect for choosing album or print photos together.',
      art: () => `<div class="tour-share"><div class="tour-row">${img(4, 'tour-mini')}<span>For Mum <small>8 photos</small></span><span class="tour-btn">Share</span></div><span class="tour-copied">Link copied ✓</span></div>` },
    { when: o.zip, target: () => document.querySelector('[data-dl]'), tap: true, title: 'Download your photos', text: 'Download the whole gallery, a section, or just a list. Keep a copy somewhere safe: your gallery won’t be online forever.' },
    { when: o.couple, target: () => document.querySelector('[data-share-family]'), tap: true, title: 'Share with family and friends', text: 'Get a link to send to family and friends so they can enjoy the photos too (they can’t download unless you’ve asked me to allow it).' },
    { title: 'That’s it, enjoy!', text: 'You can watch this again any time from the ? button at the top.', target: () => document.querySelector('[data-tour]') },
  ];
  const steps = all.filter((s) => s.when !== false);

  const root = document.createElement('div');
  root.className = 'tour';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'How to use your gallery');
  root.innerHTML = `<div class="tour-spot"></div><div class="tour-hand" aria-hidden="true"><svg viewBox="0 0 48 48" width="44" height="44"><circle class="ring" cx="16" cy="12" r="10"/><path d="M16 6c2 0 3 1.4 3 3v12l1-.6c1.6-1 3.6-.5 4.4 1l.1.2 1.3-.7c1.6-.8 3.5-.2 4.3 1.3l1.2-.5c1.7-.6 3.5.3 4.1 2l2.6 8c1.7 5.4-1.3 11-6.7 12.6L29 45c-4 1.2-8.3-.3-10.6-3.7L9.3 28.4c-1-1.4-.6-3.4.8-4.3 1.3-.8 3-.5 4 .6L13 22.5V9c0-1.6 1.4-3 3-3Z" fill="#fff" stroke="#2b2d1f" stroke-width="2" stroke-linejoin="round"/></svg></div>
    <div class="tour-card" aria-live="polite"><div class="tour-art"></div><h2></h2><p></p>
    <div class="tour-foot"><span class="tour-dots"></span><span class="tour-btns"><button type="button" class="tour-skip">Skip</button><button type="button" class="tour-back">Back</button><button type="button" class="tour-next">Next</button></span></div></div>`;
  document.body.append(root);
  document.body.classList.add('touring');
  const spot = root.querySelector<HTMLElement>('.tour-spot')!;
  const hand = root.querySelector<HTMLElement>('.tour-hand')!;
  const card = root.querySelector<HTMLElement>('.tour-card')!;
  let at = 0;

  const place = () => {
    const s = steps[at];
    const el = s.target?.();
    const vw = innerWidth, vh = innerHeight;
    if (!el || !shown(el)) {
      spot.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0`;
      hand.style.opacity = '0';
      card.style.cssText = `left:50%;top:50%;transform:translate(-50%,-50%)`;
      return;
    }
    const r = el.getBoundingClientRect();
    const pad = 8;
    const big = r.height > vh * 0.5; // a photo bigger than half the screen: show only the top part
    const h = big ? Math.min(r.height, vh * 0.45) : r.height;
    spot.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${h + pad * 2}px`;
    hand.style.opacity = s.tap ? '1' : '0';
    hand.style.left = `${r.left + Math.min(r.width / 2, 60)}px`;
    hand.style.top = `${r.top + Math.min(h / 2, 50)}px`;
    // The card below the spotlight if it fits, else above, else in the middle.
    const cw = Math.min(380, vw - 24);
    const left = Math.max(12, Math.min(vw - cw - 12, r.left + r.width / 2 - cw / 2));
    const below = r.top + h + pad + 16;
    card.style.cssText = `left:${left}px;width:${cw}px;`;
    const ch = card.offsetHeight;
    const midTop = Math.max(12, Math.min(vh - ch - 12, r.top + h / 2 - ch / 2));
    if (below + ch < vh - 12) card.style.top = `${below}px`;
    else if (r.top - pad - 16 - ch > 12) card.style.top = `${r.top - pad - 16 - ch}px`;
    // Beside it (a tall photo), on whichever side has room.
    else if (r.right + pad + 16 + cw < vw - 12) { card.style.left = `${r.right + pad + 16}px`; card.style.top = `${midTop}px`; }
    else if (r.left - pad - 16 - cw > 12) { card.style.left = `${r.left - pad - 16 - cw}px`; card.style.top = `${midTop}px`; }
    else card.style.top = `${vh - ch - 12}px`; // a phone: at the bottom, over the lower part of the photo
  };

  const show = (n: number) => {
    at = Math.max(0, Math.min(steps.length - 1, n));
    const s = steps[at];
    card.querySelector('h2')!.textContent = s.title;
    card.querySelector('p')!.textContent = s.text;
    card.querySelector<HTMLElement>('.tour-art')!.innerHTML = s.art?.() ?? '';
    card.querySelector('.tour-dots')!.innerHTML = steps.map((_, i) => `<i class="${i === at ? 'on' : ''}"></i>`).join('');
    root.querySelector<HTMLButtonElement>('.tour-back')!.hidden = at === 0;
    root.querySelector<HTMLButtonElement>('.tour-next')!.textContent = at === steps.length - 1 ? 'Done' : 'Next';
    card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
    const el = s.target?.();
    if (el && shown(el)) {
      // Buttons in the top bar are always on screen (it's sticky); scroll their row sideways on phones.
      // Anything else (a photo): scroll it to just under the bar, leaving room for the card below it.
      const inBar = !!(el as HTMLElement).closest('.g-bar');
      if (inBar) (el as HTMLElement).scrollIntoView({ inline: 'nearest', block: 'nearest' });
      else {
        const r = el.getBoundingClientRect();
        const bar = document.querySelector('.g-bar')?.getBoundingClientRect().bottom ?? 0;
        if (r.top < bar + 12 || r.top > innerHeight * 0.4) scrollTo({ top: scrollY + r.top - bar - 24 });
      }
      requestAnimationFrame(place);
    }
    place();
  };
  const close = () => {
    markSeen();
    openFrom = null;
    scrollTo({ top: startY }); // back to where they were (e.g. the cover)
    removeEventListener('resize', place);
    removeEventListener('scroll', place, true);
    removeEventListener('keydown', key);
    document.body.classList.remove('touring');
    root.classList.add('out');
    setTimeout(() => root.remove(), 250);
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); at === steps.length - 1 ? close() : show(at + 1); }
    else if (e.key === 'ArrowLeft') show(at - 1);
  };
  root.querySelector('.tour-next')!.addEventListener('click', () => (at === steps.length - 1 ? close() : show(at + 1)));
  root.querySelector('.tour-back')!.addEventListener('click', () => show(at - 1));
  root.querySelector('.tour-skip')!.addEventListener('click', close);
  addEventListener('resize', place);
  addEventListener('scroll', place, true);
  addEventListener('keydown', key);
  // Start past the cover, with the photos showing and the top bar stuck at the top of the screen.
  const startY = openFrom ?? scrollY;
  openFrom = startY;
  const photos = document.querySelector<HTMLElement>('#photos');
  if (photos && photos.getBoundingClientRect().top > 0) scrollTo({ top: scrollY + photos.getBoundingClientRect().top });
  show(0);
  (root.querySelector('.tour-next') as HTMLButtonElement).focus();
}
