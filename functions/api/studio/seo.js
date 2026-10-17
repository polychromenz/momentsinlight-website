// A suggested Google title and description for a post, from Cloudflare's text AI.
//   POST /api/studio/seo { title, kind, venue, text } -> { seoTitle, description }
import { json } from '../../../functions-lib/studio.js';
import { chat } from '../../../functions-lib/ai.js';
import { VOICE } from '../../../functions-lib/rankings-fix.js';

export async function onRequestPost({ request, env }) {
  const { title = '', kind = 'wedding', venue = '', text = '' } = await request.json().catch(() => ({}));
  if (!env.AI) return json({ error: 'Suggestions aren’t switched on yet.' }, 503);
  const what = { wedding: 'a real wedding (love story) blog post', portrait: 'a portrait session blog post', family: 'a family photo session blog post', article: 'a wedding planning article' }[kind] ?? 'a blog post';
  const messages = [
    { role: 'system', content: `${VOICE} You write search engine titles and descriptions for his blog posts.` },
    {
      role: 'user',
      content: `Write the Google title (at most 60 characters) and meta description (140 to 155 characters) for ${what}.\nPost title: ${title}\nVenue: ${venue || 'not given'}\nPost text (start): ${String(text).slice(0, 1800)}\n\nReply with JSON only: {"seoTitle": "...", "description": "..."}`,
    },
  ];
  try {
    const raw = await chat(env, messages, 220);
    const found = raw.match(/\{[\s\S]*\}/);
    const data = found ? JSON.parse(found[0]) : null;
    if (!data?.seoTitle || !data?.description) return json({ error: 'No suggestion came back. Try again.' }, 502);
    return json({ seoTitle: String(data.seoTitle).trim(), description: String(data.description).trim() });
  } catch (e) {
    return json({ error: `The suggestion didn’t work (${e.message}).` }, 502);
  }
}
