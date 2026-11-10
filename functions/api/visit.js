// The site's own visit log (src/components/Tracking.astro sends it; Studio > SEO > Visits reads it):
//   POST /api/visit { sid, vid, seq, path, ref, ad, term, secs, scroll, mobile }
// Sent when a page is hidden or left, and again if they come back to it (the longer time is kept).
// Nothing personal: a random id per browser tab (sid) and per browser (vid), the page, and how long
// it was on screen.
const ok = () => new Response(null, { status: 204 });

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => null);
  if (!d || typeof d.sid !== 'string' || !/^[a-z0-9]{8,32}$/.test(d.sid) || !env.DB) return ok();
  const seq = Math.max(1, Math.min(200, Number(d.seq) | 0));
  const path = String(d.path || '/').split('?')[0].slice(0, 200);
  if (!path.startsWith('/') || path.startsWith('/studio') || path.startsWith('/api')) return ok();
  const secs = Math.max(0, Math.min(1800, Math.round(Number(d.secs) || 0)));
  const scroll = Math.max(0, Math.min(100, Math.round(Number(d.scroll) || 0)));
  await env.DB.prepare(`INSERT INTO page_views (sid, seq, path, ref, ad, ad_term, secs, scroll, mobile, at, vid) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
    ON CONFLICT (sid, seq) DO UPDATE SET secs = max(secs, excluded.secs), scroll = max(scroll, excluded.scroll)`)
    .bind(String(d.sid), seq, path, String(d.ref || '').slice(0, 40) || null, d.ad ? 1 : 0, String(d.term || '').slice(0, 100) || null,
      secs, scroll, d.mobile ? 1 : 0, new Date().toISOString(), /^[a-z0-9]{8,32}$/.test(String(d.vid ?? '')) ? d.vid : null).run().catch((e) => console.error('visit', e.message));
  return ok();
}
