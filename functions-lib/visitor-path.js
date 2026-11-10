// The path an enquirer took through the site, from the site's own visit log (page_views, sent by
// src/components/Tracking.astro) joined up by the browser id the enquiry form sends (jobs.visitor_id).
// Shown in the new-enquiry email (functions-lib/enquiry.js) and on the client page (crm/job.js).
// Microsoft Clarity's project (the same id as src/data/site.ts tracking.clarity).
const CLARITY = 'z70vge8li0';

const nzTime = (iso) => new Date(iso).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit', timeZone: 'Pacific/Auckland' });
const nzDay = (iso) => new Date(iso).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Pacific/Auckland' });
const dur = (s) => (s < 60 ? `${Math.round(s)} sec` : `${Math.round(s / 60)} min`);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Where a Clarity recording for this browser can be found (filter Recordings by Custom user ID). */
export const clarityLink = () => `https://clarity.microsoft.com/projects/view/${CLARITY}/impressions`;

/** Their page views (up to 30 days before `until`, and a few minutes after it), oldest first. `last`:
 *  the page they sent the enquiry from ({ path, secs }), added if it isn't logged yet. */
export async function visitorPath(db, vid, until, last = null) {
  if (!vid) return [];
  const end = new Date(until);
  const from = new Date(end.valueOf() - 30 * 86400_000).toISOString();
  const to = new Date(end.valueOf() + 15 * 60_000).toISOString();
  const rows = (await db.prepare(`SELECT sid, seq, path, ref, ad, ad_term, secs, scroll, mobile, at FROM page_views WHERE vid = ?1 AND at BETWEEN ?2 AND ?3 ORDER BY at, seq LIMIT 200`)
    .bind(vid, from, to).all().catch(() => ({ results: [] }))).results;
  if (last?.path && !rows.some((r) => r.path === last.path && Math.abs(Date.parse(r.at) - end) < 30 * 60_000)) {
    rows.push({ sid: rows.at(-1)?.sid ?? '', seq: 0, path: last.path, ref: null, ad: 0, ad_term: null, secs: last.secs || 0, scroll: null, mobile: rows.at(-1)?.mobile ?? 0, at: new Date(end.valueOf() - (last.secs || 0) * 1000).toISOString(), here: true });
  }
  rows.sort((a, b) => a.at.localeCompare(b.at));
  return rows.map((r, i) => {
    const prev = rows[i - 1];
    const gap = prev ? (Date.parse(r.at) - Date.parse(prev.at)) / 1000 - (prev.secs || 0) : 0;
    const came = r.seq === 1 ? (r.ad ? `from a Google ad${r.ad_term ? ` (“${r.ad_term}”)` : ''}` : r.ref === 'direct' ? 'typed in or a bookmark' : r.ref ? `from ${r.ref}` : '') : '';
    return {
      path: r.path, secs: r.secs, scroll: r.scroll, mobile: !!r.mobile, at: r.at,
      time: nzTime(r.at), day: nzDay(r.at), newDay: !prev || nzDay(prev.at) !== nzDay(r.at),
      newTab: !!prev && prev.sid !== r.sid && r.seq <= 1 && !r.here, gap: gap > 300 ? dur(gap) : null, came, here: !!r.here,
    };
  });
}

/** The path as an HTML table for the email to Tony. */
export function pathHtml(steps, vid) {
  if (!steps.length) return '';
  const td = 'padding:5px 10px 5px 0;border-bottom:1px solid #ece4d7;vertical-align:top;font-size:14px';
  const rows = steps.map((s) => [
    s.newDay && steps.length > 1 ? `<tr><td colspan="4" style="padding:10px 0 2px;font-size:12px;color:#5a5e3b;font-weight:600">${esc(s.day)}</td></tr>` : '',
    s.gap ? `<tr><td></td><td colspan="3" style="padding:2px 0;font-size:12px;color:#999">… away for ${esc(s.gap)}</td></tr>` : '',
    `<tr><td style="${td};color:#777;white-space:nowrap">${esc(s.time)}</td><td style="${td}"><strong>${esc(s.path)}</strong>${s.came ? `<br><span style="color:#777;font-size:12px">${esc(s.came)}</span>` : ''}${s.newTab ? '<br><span style="color:#777;font-size:12px">new tab or window</span>' : ''}${s.here ? '<br><span style="color:#5a5e3b;font-size:12px">sent the enquiry here</span>' : ''}</td>`
      + `<td style="${td};white-space:nowrap">${s.secs ? esc(dur(s.secs)) : '–'}</td><td style="${td};color:#777;white-space:nowrap">${s.scroll != null ? `${s.scroll}%` : ''}</td></tr>`,
  ].join('')).join('');
  const device = steps.some((s) => s.mobile) ? 'On a phone.' : 'On a computer or tablet.';
  const link = clarityLink();
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse"><tr><td style="font-size:11px;color:#999;padding-bottom:4px">Time</td><td style="font-size:11px;color:#999">Page</td><td style="font-size:11px;color:#999">On screen</td><td style="font-size:11px;color:#999">Scrolled</td></tr>${rows}</table>`
    + `<p style="margin:8px 0 0;font-size:13px;color:#777">${device}${link ? ` <a href="${link}" style="color:#5a5e3b">Watch in Clarity</a>: Recordings, filter by Custom user ID <strong>${esc(vid)}</strong> (or the tag enquiry).` : ''}</p>`;
}
