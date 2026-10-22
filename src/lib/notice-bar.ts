// A slim notification bar that drops down from the top of the page, then slides away after a few
// seconds or when the visitor clicks Dismiss. Used by the website (BaseLayout) and the client
// galleries (gallery-view); the text comes from Studio > Settings > Notification bars (/api/notice).

const css = `
.nb { position: fixed; top: 0; left: 0; right: 0; z-index: 2147482000; display: flex; justify-content: center; pointer-events: none; transform: translateY(-110%); transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1); }
.nb.in { transform: none; }
.nb-box { pointer-events: auto; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; justify-content: center; margin: 0 12px; max-width: 920px; padding: 10px 14px 10px 20px; background: #5a5e3b; color: #fff; font: 400 14px/1.5 Raleway, system-ui, sans-serif; border-radius: 0 0 14px 14px; box-shadow: 0 10px 30px -14px rgb(0 0 0 / 0.45); }
.nb-box a { color: #fff; font-weight: 600; text-underline-offset: 3px; white-space: nowrap; }
.nb-x { border: 0; background: rgb(255 255 255 / 0.16); color: #fff; font: inherit; font-size: 13px; padding: 4px 12px; border-radius: 999px; cursor: pointer; }
.nb-x:hover { background: rgb(255 255 255 / 0.28); }
@media (prefers-reduced-motion: reduce) { .nb { transition: none; } }
`;

export function showNoticeBar(opts: { text: string; link?: string; linkText?: string; seconds?: number; onDone?: () => void }) {
  if (document.querySelector('.nb')) return;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
  const bar = document.createElement('div');
  bar.className = 'nb';
  bar.setAttribute('role', 'status');
  const box = document.createElement('div');
  box.className = 'nb-box';
  const p = document.createElement('span');
  p.textContent = opts.text;
  box.append(p);
  if (opts.link) {
    const a = document.createElement('a');
    a.href = opts.link;
    a.textContent = opts.linkText ?? 'Find out more';
    box.append(a);
  }
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'nb-x';
  x.textContent = 'Dismiss';
  box.append(x);
  bar.append(box);
  document.body.append(bar);
  let done = false;
  const close = () => {
    if (done) return;
    done = true;
    bar.classList.remove('in');
    setTimeout(() => bar.remove(), 600);
    opts.onDone?.();
  };
  x.addEventListener('click', close);
  // Hovering (or touching) keeps it open while they read.
  let timer = 0;
  const start = () => { timer = window.setTimeout(close, (opts.seconds ?? 8) * 1000); };
  box.addEventListener('mouseenter', () => clearTimeout(timer));
  box.addEventListener('mouseleave', start);
  requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add('in')));
  start();
}

/** localStorage that never throws (private windows, blocked storage). */
export const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* fine */ } },
};
