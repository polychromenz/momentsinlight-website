// Pinterest's RSS feed of Tony's pins (Studio > Social): Pinterest business accounts can "auto-publish"
// from an RSS feed, so pins go out without the Pinterest API app (which Pinterest hasn't approved).
// Set up once in Pinterest: Settings > Bulk create Pins > Auto-publish > Connect RSS feed, with this
// address and the board. When an approved pin's time comes, the timer marks it posted
// (functions-lib/meta.js publish) and it appears here; Pinterest reads the feed about once a day and
// makes a pin from each new item (its image, title, description and link).
//   GET /feeds/pinterest   (public: Pinterest fetches it)
const SITE = 'https://www.momentsinlight.co.nz';
const x = (s) => String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

export async function onRequestGet({ env }) {
  const rows = (await env.DB.prepare(`SELECT id, label, caption, link, media, posted_at FROM social_posts
      WHERE platform = 'pinterest' AND status = 'posted' AND media IS NOT NULL AND media <> '[]' ORDER BY posted_at DESC LIMIT 50`).all()).results;
  const items = rows.map((p) => {
    const img = JSON.parse(p.media)[0];
    const when = new Date(p.posted_at || Date.now()).toUTCString();
    return `<item>
  <title>${x(String(p.label || 'Moments in Light').slice(0, 100))}</title>
  <link>${x(p.link || SITE)}</link>
  <description>${x(String(p.caption || '').slice(0, 500))}</description>
  <guid isPermaLink="false">momentsinlight-pin-${p.id}</guid>
  <pubDate>${when}</pubDate>
  <enclosure url="${x(img)}" type="image/jpeg" length="0" />
  <media:content url="${x(img)}" medium="image" type="image/jpeg" />
</item>`;
  });
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
  <title>Moments in Light: wedding photography, Auckland</title>
  <link>${SITE}</link>
  <description>Wedding photos and stories from Moments in Light, Auckland, New Zealand.</description>
  <language>en-nz</language>
${items.join('\n')}
</channel>
</rss>`;
  return new Response(body, { headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=600' } });
}
