// The gallery activity card (home page and Galleries page): this year's totals like Pic-Time's
// dashboard, and the last 7 days by gallery (views, people, downloads, new guests).
// Data: functions/api/studio/galleries/insights.js.
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const n = (x: number) => Number(x || 0).toLocaleString('en-NZ');

const css = `.gi h2{margin:0 0 10px;font-weight:300;font-size:22px}.gi-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:14px}
.gi-tile{display:flex;flex-direction:column;gap:2px}.gi-tile strong{font-size:26px;font-weight:400;font-variant-numeric:tabular-nums}.gi-tile span{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--green);font-weight:600}.gi-tile small{color:#888;font-size:12px}
.gi-wrap{overflow-x:auto}.gi table{width:100%;border-collapse:collapse;font-size:14px;min-width:520px}.gi th{text-align:left;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--green);padding:6px 8px;border-bottom:1px solid #ece4d7}
.gi td{padding:7px 8px;border-bottom:1px solid #f3eee6;vertical-align:top}.gi .r{text-align:right;font-variant-numeric:tabular-nums}.gi .muted{color:#888;font-size:14px}.gi small{color:#888}`;

export async function drawGalleryInsights(el: HTMLElement) {
  if (!document.getElementById('gi-css')) { const s = document.createElement('style'); s.id = 'gi-css'; s.textContent = css; document.head.append(s); }
  el.classList.add('gi');
  const r = await fetch('/api/studio/galleries/insights').catch(() => null);
  const d = r?.ok ? await r.json().catch(() => null) : null;
  if (!d) { el.innerHTML = '<h2>Gallery activity</h2><p class="muted">Couldn’t load the gallery activity.</p>'; return; }
  const y = d.year;
  const rows = d.week.map((g: any) => `<tr><td><a href="/studio/gallery?id=${esc(g.gallery_id)}&tab=activity">${esc(g.name)}</a></td><td class="r">${g.views}</td><td class="r">${g.visitors}</td><td class="r">${g.photos || '–'}${g.zips ? ` <small>(${g.zips} ZIP${g.zips > 1 ? 's' : ''})</small>` : ''}</td>
    <td>${g.guests.length ? g.guests.map((x: any) => `${esc(x.name || x.email)}${x.marketing ? ' <small>✓ marketing</small>' : ''}`).join(', ') : '<span class="muted">–</span>'}</td></tr>`).join('');
  el.innerHTML = `<h2>Gallery activity</h2>
    <div class="gi-tiles">
      <div class="gi-tile"><span>Galleries online</span><strong>${n(y.galleries)}</strong><small>${n(y.photos)} photos</small></div>
      <div class="gi-tile"><span>Gallery views this year</span><strong>${n(y.views)}</strong><small>${n(y.people)} people</small></div>
      <div class="gi-tile"><span>Photos downloaded this year</span><strong>${n(y.downloads)}</strong><small>from ${n(y.download_galleries)} galler${y.download_galleries === 1 ? 'y' : 'ies'}</small></div>
    </div>
    <p class="muted" style="margin:0 0 6px">Last 7 days${d.yesterday.length ? '' : ' (nothing yesterday)'}:</p>
    ${rows ? `<div class="gi-wrap"><table><thead><tr><th>Gallery</th><th class="r">Views</th><th class="r">People</th><th class="r">Photos downloaded</th><th>New guests</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : '<p class="muted">No one has opened a gallery in the last week. Activity shows here once galleries are online and shared.</p>'}`;
}
