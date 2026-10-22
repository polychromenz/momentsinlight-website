// The notification bars' text for the public website and galleries (functions-lib/notices.js).
//   GET /api/notice -> { site: { text, link, v } | null, gallery: { text, v } | null }
import { notices, version } from '../../functions-lib/notices.js';

export async function onRequestGet({ env }) {
  const n = await notices(env.DB);
  const body = {
    site: n.site.text ? { text: n.site.text, link: n.site.link, v: version(`${n.site.text}|${n.site.link}`) } : null,
    gallery: n.gallery.text ? { text: n.gallery.text, v: version(n.gallery.text) } : null,
  };
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' } });
}
