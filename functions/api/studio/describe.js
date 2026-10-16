// A suggested description of a photo (for Google and screen readers), from Cloudflare's image AI.
//   POST /api/studio/describe { src, names?, kind? } -> { description }
// `names` (e.g. "Ellie and Ryan") lets the suggestion use the couple's names.
import { json, IMAGES_HASH } from '../../../functions-lib/studio.js';

export async function onRequestPost({ request, env }) {
  const { src, names, kind } = await request.json().catch(() => ({}));
  if (typeof src !== 'string' || !src.startsWith(`https://imagedelivery.net/${IMAGES_HASH}/`)) return json({ error: 'Not one of your photos.' }, 400);
  if (!env.AI) return json({ error: 'Photo suggestions aren’t switched on yet.' }, 503);
  const img = await fetch(src.replace(/\/[^/]+$/, '/w=640'), { headers: { accept: 'image/jpeg' } });
  if (!img.ok) return json({ error: 'Couldn’t fetch the photo.' }, 502);
  const bytes = [...new Uint8Array(await img.arrayBuffer())];
  const who = names ? ` The people may include ${names}; use their first names where it's clearly them.` : '';
  const what = kind === 'portrait' ? 'portrait session' : kind === 'family' ? 'family photo session' : kind === 'article' ? 'photo' : 'wedding';
  const prompt = `Describe this ${what} photograph in one short sentence of 8 to 16 words, for a website's image description.${who} Say what is happening and where if visible. Don't start with "A photo of" or "The image". Use NZ English.`;
  try {
    const out = await env.AI.run('@cf/llava-hf/llava-1.5-7b-hf', { image: bytes, prompt, max_tokens: 60 });
    let text = String(out?.description ?? out?.response ?? '').trim();
    text = text.replace(/^(the|this) (image|photo|picture|photograph) (shows|features|depicts|captures)\s+/i, '').replace(/\s+/g, ' ');
    text = text.split(/(?<=\.)\s/)[0].replace(/\.$/, '');
    if (!text) return json({ error: 'No suggestion came back. Try again.' }, 502);
    return json({ description: text[0].toUpperCase() + text.slice(1) });
  } catch (e) {
    return json({ error: `The suggestion didn’t work (${e.message}).` }, 502);
  }
}
