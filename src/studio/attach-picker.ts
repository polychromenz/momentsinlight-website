// Choosing which library documents an email attaches (Settings > email templates, and Review and
// send). Ticked documents are attached; "Add a document" offers the rest of the library. Warns
// when the total is over what Gmail allows in one email.
export type Doc = { id: number; name: string; size: number };

const LIMIT = 24 * 1024 * 1024;
const mb = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function attachPicker(box: HTMLElement, onChange: () => void = () => {}) {
  let docs: Doc[] = [];
  let shown = new Set<number>();
  let ticked = new Set<number>();
  const render = () => {
    const list = docs.filter((d) => shown.has(d.id));
    const rest = docs.filter((d) => !shown.has(d.id));
    const total = docs.filter((d) => ticked.has(d.id)).reduce((a, d) => a + d.size, 0);
    box.innerHTML = `<div class="ap">
      <span class="ap-label">📎 Attachments</span>
      ${list.length ? list.map((d) => `<label class="ap-doc"><input type="checkbox" data-doc="${d.id}"${ticked.has(d.id) ? ' checked' : ''} /> ${esc(d.name)} <small>${mb(d.size)}</small></label>`).join('') : '<span class="ap-none">None</span>'}
      ${rest.length ? `<select class="ap-add"><option value="">+ Add a document</option>${rest.map((d) => `<option value="${d.id}">${esc(d.name)} (${mb(d.size)})</option>`).join('')}</select>` : ''}
      ${total > LIMIT ? `<span class="ap-warn">These come to ${mb(total)}; Gmail allows about 25 MB per email. Untick one.</span>` : ''}
    </div>`;
  };
  box.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    if (t.matches('[data-doc]')) { const id = Number(t.getAttribute('data-doc')); (t as HTMLInputElement).checked ? ticked.add(id) : ticked.delete(id); }
    if (t.matches('.ap-add') && t.value) { const id = Number(t.value); shown.add(id); ticked.add(id); }
    render();
    onChange();
  });
  return {
    /** Show the library, with these documents attached. */
    set(library: Doc[], attached: number[]) { docs = library; ticked = new Set(attached); shown = new Set(attached); render(); },
    /** The ticked document ids. */
    get: () => docs.filter((d) => ticked.has(d.id)).map((d) => d.id),
    over: () => docs.filter((d) => ticked.has(d.id)).reduce((a, d) => a + d.size, 0) > LIMIT,
  };
}
