// A picture for a package or product (Settings > Packages & products, and a quote's own packages
// and extras): choose a file, upload it straight to Cloudflare Images, and keep its address.
//   itemImage(src) -> the HTML for the picture box (a hidden data-k="image" input holds the address)
//   clicks on [data-img-pick] / [data-img-clear] inside a box are handled once, here.
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const thumb = (src: string) => src.replace(/\/public$/, '/w=240');

export const itemImage = (src = '', name = '') => `<div class="item-img${src ? ' has' : ''}">
  <input type="hidden" data-k="image"${name ? ` name="${esc(name)}"` : ''} value="${esc(src)}" />
  <span class="item-img-box">${src ? `<img src="${esc(thumb(src))}" alt="" />` : 'No picture'}</span>
  <span class="item-img-acts"><button type="button" class="s-btn s-btn--quiet" data-img-pick>${src ? 'Change picture' : 'Add a picture'}</button><button type="button" class="s-btn s-btn--quiet" data-img-clear${src ? '' : ' hidden'}>Remove</button></span>
</div>`;

function set(box: HTMLElement, src: string) {
  box.outerHTML = itemImage(src, box.querySelector<HTMLInputElement>('[data-k="image"]')!.name);
}

async function upload(file: File) {
  const name = file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 50) || 'photo';
  const r = await fetch('/api/studio/upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: `quotes/${name}-${Date.now().toString(36)}` }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Couldn’t start the upload.');
  const form = new FormData(); form.append('file', file);
  const up = await fetch(d.uploadURL, { method: 'POST', body: form });
  if (!up.ok) throw new Error('The upload didn’t go through.');
  return d.src as string;
}

/** Handle the picture buttons; onChange runs after a picture is added, changed or removed. */
export function watchItemImages(onChange: () => void, onError: (msg: string) => void) {
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const box = t.closest<HTMLElement>('.item-img');
    if (!box) return;
    if (t.closest('[data-img-clear]')) { set(box, ''); onChange(); return; }
    if (!t.closest('[data-img-pick]')) return;
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const btn = box.querySelector<HTMLButtonElement>('[data-img-pick]')!;
      btn.disabled = true; btn.textContent = 'Uploading…';
      try { set(box, await upload(file)); onChange(); }
      catch (err) { onError((err as Error).message); btn.disabled = false; btn.textContent = 'Add a picture'; }
    };
    input.click();
  });
}

const css = document.createElement('style');
css.textContent = `
  .item-img { display: flex; align-items: center; gap: 12px; margin: 6px 0 10px; }
  .item-img-box { width: 84px; height: 84px; flex: none; border-radius: 6px; background: #f3efe8; display: grid; place-items: center; font-size: 11px; color: #999; overflow: hidden; }
  .item-img-box img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .item-img-acts { display: flex; gap: 6px; flex-wrap: wrap; }
`;
document.head.append(css);
