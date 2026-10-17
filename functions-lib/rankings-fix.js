// "✨ Suggest fix" on the Rankings page: a before-and-after for one fix on the page that should rank
// for a search, which Tony can edit and then apply (saved by functions-lib/seo-fix.js).
// Suggestions come from Cloudflare's AI; nothing changes until "Apply fix".
//
// Each suggestion is a list of items:
//   { type: 'title' | 'description', path, before, after }          Google title / description
//   { type: 'h1', path, before, after }                              the main heading
//   { type: 'text', path, label, before, show, after }               a paragraph, reworded as little as possible
//   { type: 'photo', path, src, before, after }                      a photo description
//   { type: 'append', path, label, before, after }                   a linking sentence added to another post
import { readRepoFile, IMAGES_HASH } from './studio.js';
import { builtPosts } from './schedules.js';
import { readPage, stems } from './rankings.js';
import { fileFor, split, getField, jsonStrings } from './seo-fix.js';
import { chat, see } from './ai.js';

const SITE = 'https://www.momentsinlight.co.nz';
const decode = (t) => String(t ?? '').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
const plain = (t) => decode(String(t ?? '').replace(/<[^>]+>/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_#>`]/g, '')).replace(/\s+/g, ' ').trim();
const same = (a, b) => plain(a).toLowerCase().replace(/[’']/g, "'").slice(0, 60) === plain(b).toLowerCase().replace(/[’']/g, "'").slice(0, 60);

async function ai(env, system, user, max = 200) {
  return chat(env, [{ role: 'system', content: system }, { role: 'user', content: user }], max);
}
// Tony's voice: romantic, warm and timeless, never corporate.
export const VOICE = [
  'You write for Moments in Light, the website of Tony Gorham, a wedding and portrait photographer in Auckland, New Zealand.',
  'His voice is romantic, warm, calm and timeless: love stories, feeling, light, the moments in between. Gentle and heartfelt, never salesy.',
  'Examples of his own words: "Timeless, refined wedding photography that captures the feeling of your day"; "I photograph weddings across Auckland and beyond, capturing the day with a calm, considered approach"; "I don’t just go through the motions; I go through the emotions with you."',
  'Never use corporate or technical words: services, solutions, professional, affordable, high-quality, top-rated, best, leading, expert, packages, specialist, book now. No hype, no exclamation marks, no emojis, no clichés like "your special day" or "capture memories".',
  'Use NZ English. Never invent facts. Keep the search words natural: they can be woven into a phrase or follow a dash, and small changes in word order are fine.',
].join(' ');
/** Three suggestions to choose from (the first is shown in the box). */
async function options(env, prompt, max) {
  const raw = await ai(env, VOICE, `${prompt}\n\nGive three different options. Reply with JSON only: {"options": ["...", "...", "..."]}`, max * 3 + 40);
  try { const o = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]).options.map((x) => clean(x)).filter(Boolean); if (o.length) return o.slice(0, 3); } catch { /* one plain answer */ }
  return [clean(raw)];
}
const clean = (t) => String(t).split('\n').filter(Boolean)[0]?.replace(/^["“']|["”']$/g, '').replace(/^(title|description|heading)\s*:\s*/i, '').trim() ?? '';

async function builtPage(env, path) {
  const r = await env.ASSETS.fetch(new Request(`${SITE}${path}`));
  if (!r.ok) throw new Error(`Couldn’t read ${path}.`);
  return { html: await r.text() };
}
async function source(env, path) {
  const file = fileFor(path);
  if (!file) return null;
  const f = await readRepoFile(env, file);
  return f.exists ? { file, content: f.content } : null;
}
function titleOf(src) {
  if (!src) return null;
  if (src.file.endsWith('.md')) { const fm = split(src.content).fm; return getField(fm, 'seoTitle') || getField(fm, 'title') || ''; }
  return JSON.parse(src.content).title ?? '';
}
const notHere = (why) => ({ items: [], note: why });
const CODE = 'This page is built into the site’s code, so it can’t be changed from here. Ask Claude to change it.';

export async function suggestFix(env, { keyword, key, target, pages = [] }) {
  const { html } = await builtPage(env, target);
  const page = readPage(html);
  const src = await source(env, target);
  const about = `Search: "${keyword}"\nPage: ${target}\nGoogle title now: ${page.title}\nMain heading: ${page.h1}\nOpening: ${page.intro.slice(0, 400)}`;

  if (key === 'title') {
    if (!src) return notHere(CODE);
    const opts = await options(env, `${about}\n\nWrite a Google title for this page, at most 60 characters, with "${keyword}" (or very close wording) near the start, and a romantic, timeless feel. End with " | Moments In Light" only if it still fits in 60 characters.`, 60);
    return { items: [{ type: 'title', path: target, before: titleOf(src), after: opts[0], options: opts, ctx: { title: page.title, description: page.desc } }] };
  }
  if (key === 'desc') {
    if (!src) return notHere(CODE);
    const before = src.file.endsWith('.md') ? getField(split(src.content).fm, 'description') : JSON.parse(src.content).description;
    const opts = await options(env, `${about}\n\nWrite the Google description for this page: 140 to 155 characters, using "${keyword}" naturally, in his warm, romantic voice, giving a couple a reason to click.`, 120);
    return { items: [{ type: 'description', path: target, before: before ?? '', after: opts[0], options: opts, ctx: { title: page.title, description: page.desc } }] };
  }
  if (key === 'h1') {
    if (!src) return notHere(CODE);
    let before;
    if (src.file.endsWith('home.json')) before = JSON.parse(src.content).h1;
    else if (src.file.endsWith('.md')) before = getField(split(src.content).fm, 'title');
    else before = jsonStrings(src.content).find((s) => plain(s) === plain(page.h1) && s.length < 200);
    if (!before) return notHere('Couldn’t find where this heading is written. Ask Claude to change it.');
    const opts = await options(env, `${about}\n\nRewrite the main heading so it keeps the romantic feeling of the current one ("${plain(before)}") and also includes "${keyword}" naturally, for example as a short phrase before or after a dash. At most 80 characters.`, 60);
    const after = opts[0];
    const note = src.file.endsWith('.md') ? 'For a blog post, the main heading comes from the post’s title, so this changes the title too.' : undefined;
    return { items: [{ type: 'h1', path: target, before: plain(before), raw: before, after, options: opts }], note };
  }
  if (key === 'intro') {
    if (!src) return notHere(CODE);
    let raw;
    if (src.file.endsWith('home.json')) raw = JSON.parse(src.content).intro;
    else if (src.file.endsWith('.md')) raw = split(src.content).rest.split(/\n\s*\n/).map((p) => p.trim()).find((p) => same(p, page.intro));
    else {
      for (const s of jsonStrings(src.content)) {
        const ps = s.match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)?.map((p) => p.replace(/^<p\b[^>]*>|<\/p>$/gi, '')) ?? [s];
        raw = ps.find((p) => same(p, page.intro));
        if (raw) break;
      }
    }
    if (!raw) return notHere('Couldn’t find where this paragraph is written. Ask Claude to change it.');
    const after = (await ai(env, VOICE, `Here is the opening paragraph of a page:\n\n${raw}\n\nRewrite it changing as few words as possible so that it naturally includes the phrase "${keyword}" (small changes in word order are fine). Keep his voice and everything else exactly as it is, including any links or formatting. Reply with the paragraph only.`, 300)).replace(/^["“]|["”]$/g, '').trim();
    return { items: [{ type: 'text', path: target, label: 'Opening paragraph', before: raw, show: plain(raw), after }] };
  }
  if (key === 'alt') {
    const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]).filter((t) => !/display:\s*none|width="1"/i.test(t) && !/\balt="[^"]+"/i.test(t));
    const srcs = [...new Set(imgs.map((t) => (t.match(/\b(?:data-)?src="(https:\/\/imagedelivery[^"]+)"/) || [])[1]).filter(Boolean))].slice(0, 6);
    const items = [];
    for (const s of srcs) items.push({ type: 'photo', path: target, src: s, before: '', after: await describe(env, s, keyword) });
    return items.length ? { items } : notHere('Every photo on this page has a description now. The next check will tick this off.');
  }
  if (key === 'compete') {
    const items = [];
    for (const p of pages.slice(0, 5)) {
      const s = await source(env, p);
      if (!s) continue;
      const before = titleOf(s);
      const pg = readPage((await builtPage(env, p)).html);
      const after = clean(await ai(env, VOICE, `Page: ${p}\nGoogle title now: ${before}\nMain heading: ${pg.h1}\nOpening: ${pg.intro.slice(0, 300)}\n\nThis page's Google title competes with another page for the search "${keyword}". Write a more specific Google title (at most 60 characters) that describes what THIS page is about (the couple, the venue, the topic) in his warm voice, and doesn't use the phrase "${keyword}".`, 60));
      items.push({ type: 'title', path: p, before, after, ctx: { title: pg.title, description: pg.desc } });
    }
    return items.length ? { items } : notHere('Those pages are built into the site’s code. Ask Claude to change their titles.');
  }
  if (key === 'inlinks') {
    const { posts = [] } = await builtPosts(env).catch(() => ({}));
    const want = new Set(stems(keyword));
    const tPage = target.replace(/^\/blog\//, '');
    const scored = posts.filter((p) => !p.draft && p.id !== tPage)
      .map((p) => ({ p, n: stems(`${p.title} ${p.venue} ${(p.tags ?? []).join(' ')}`).filter((w) => want.has(w)).length }))
      .filter((x) => x.n).sort((a, b) => b.n - a.n || b.p.date.localeCompare(a.p.date)).slice(0, 6);
    const items = [];
    for (const { p } of scored) {
      if (items.length >= 3) break;
      const s = await readRepoFile(env, `src/content/blog/${p.id}.md`).catch(() => null);
      if (!s?.exists || s.content.includes(`](${target})`) || s.content.includes(`](${SITE}${target})`)) continue;
      let after = clean(await ai(env, VOICE, `Write one short, natural closing sentence for the end of a blog post titled "${p.title}" that points readers to a page about "${keyword}". It must contain exactly one markdown link written as [${keyword}](${target}).`, 80));
      if (!after.includes(`](${target})`)) after = `Planning your own day? Have a look at my [${keyword}](${target}) page.`;
      items.push({ type: 'append', path: `/blog/${p.id}`, label: `Add to “${p.title}”`, before: '(the end of the post)', after });
    }
    return items.length ? { items } : notHere('No related posts found that don’t already link here. Link to it from your next post about this.');
  }
  return notHere('There’s no automatic fix for this one; it needs you.');
}

async function describe(env, src, keyword) {
  if (!src.startsWith(`https://imagedelivery.net/${IMAGES_HASH}/`) || !env.AI) return '';
  try {
    const img = await fetch(src.replace(/\/[^/]+$/, '/w=640'), { headers: { accept: 'image/jpeg' } });
    if (!img.ok) return '';
    const out = { description: await see(env, [...new Uint8Array(await img.arrayBuffer())], `Describe this photograph in one short sentence of 8 to 16 words, for a website's image description. It is on a page about "${keyword}"; mention the place only if it fits. Describe people neutrally ("the couple", "guests") and never assume genders. Don't start with "A photo of" or "The image". Use NZ English.`) };
    let t = String(out?.description ?? out?.response ?? '').trim().replace(/^(the|this) (image|photo|picture|photograph) (shows|features|depicts|captures)\s+/i, '').split(/(?<=\.)\s/)[0].replace(/\.$/, '');
    return t ? t[0].toUpperCase() + t.slice(1) : '';
  } catch { return ''; }
}

/** Items from the pop-up (as edited) to the saver's changes. */
export const toChanges = (items) => items.filter((i) => String(i.after ?? '').trim()).map((i) =>
  i.type === 'title' ? { path: i.path, title: i.after }
    : i.type === 'description' ? { path: i.path, description: i.after }
      : i.type === 'h1' ? { path: i.path, h1: { before: i.raw ?? i.before, after: i.after } }
        : i.type === 'text' ? { path: i.path, text: { before: i.before, after: i.after } }
          : i.type === 'photo' ? { path: i.path, src: i.src, alt: i.after }
            : i.type === 'append' ? { path: i.path, append: i.after } : null).filter(Boolean);
