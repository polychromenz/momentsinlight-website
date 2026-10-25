// Pinterest's RSS feed of Tony's pins (Studio > Social): Pinterest business accounts can "auto-publish"
// from an RSS feed, so pins go out without the Pinterest API app (which Pinterest hasn't approved).
// Set up once in Pinterest: Settings > Bulk create Pins > Auto-publish > Connect RSS feed, with this
// address and the board. When an approved pin's time comes, the timer marks it posted
// (functions-lib/meta.js publish) and it appears here; Pinterest reads the feed about once a day and
// makes a pin from each new item (its image, title, description and link).
//   GET /feeds/pinterest              every pin, for the main board (Moments In Light Weddings): nothing is
//                                     missed while a themed board's feed isn't connected yet
//   GET /feeds/pinterest?board=bw     one themed board's pins (PIN_BOARDS in functions-lib/social.js), each
//                                     connected in Pinterest to its own board (Pinterest only connects a
//                                     feed once it has a pin, so each is connected after its first one)
// Pins the Pinterest app posted itself (remote_id set, once it has Standard access) are left out, so
// they aren't made twice.
import { PIN_BOARDS } from '../../functions-lib/social.js';

const SITE = 'https://www.momentsinlight.co.nz';
const x = (s) => String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

export async function onRequestGet({ request, env }) {
  const board = new URL(request.url).searchParams.get('board') || 'weddings';
  if (!PIN_BOARDS[board]) return new Response('No such board.', { status: 404 });
  const rows = (await env.DB.prepare(`SELECT id, label, caption, link, media, posted_at FROM social_posts
      WHERE platform = 'pinterest' AND status = 'posted' AND media IS NOT NULL AND media <> '[]' AND remote_id IS NULL
        AND (?1 = 'weddings' OR board = ?1) ORDER BY posted_at DESC LIMIT 50`).bind(board).all()).results;
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
  <title>Moments in Light: ${x(PIN_BOARDS[board])}</title>
  <link>${SITE}</link>
  <description>Wedding photos and stories from Moments in Light, Auckland, New Zealand.</description>
  <language>en-nz</language>
${items.join('\n')}
</channel>
</rss>`;
  return new Response(body, { headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=600' } });
}
