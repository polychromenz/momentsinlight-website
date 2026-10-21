// Social media manager, milestone 1 (docs/social-media-manager-plan.md). Every timer run fills the
// week ahead with drafts (a few at a time), which Tony edits and approves on Studio > Social.
// Nothing is posted anywhere yet: approved posts are copied and downloaded by hand until each
// platform is connected (later milestones), when approved posts publish themselves on time.
//
// Where drafts come from:
//   photos  gallery photos Tony marked Social (photo_picks purpose 'social'), one wedding at a time
//   blog    published wedding blog posts (studio/social-sources.json, built with the site)
//   review  Google reviews, with a photo from that couple's post when there is one
//   tip     Info blog posts (planning tips), and now and then "now booking" dates
// Couples whose contract says no marketing (clients.ads_ok = 0) are never used.
import { webUrl } from './galleries.js';
import { chat } from './ai.js';
import { nzNow } from './schedules.js';

const SITE = 'https://www.momentsinlight.co.nz';

// Shape of each platform's photos (crop ratio width/height; null = as it is) and the files made.
export const PLATFORMS = {
  instagram: { name: 'Instagram', ratio: 0.8, out: [1080, 1350], max: 10, link: false, chars: 2200 },
  facebook: { name: 'Facebook', ratio: null, out: [2048, 2048], max: 10, link: true, chars: 5000 },
  google: { name: 'Google', ratio: 4 / 3, out: [1200, 900], max: 1, link: true, chars: 1500 },
  pinterest: { name: 'Pinterest', ratio: 2 / 3, out: [1000, 1500], max: 1, link: true, chars: 500 },
};

// Tony's rhythm (19 Oct 2026): Instagram and Facebook Mon/Wed/Fri, Google Tuesday, Pinterest weekdays.
// Day 1 = Monday. Instagram and Facebook on the same day share the photos, each with its own caption.
const SLOTS = [
  { platform: 'instagram', days: [1, 3, 5], time: '19:00' },
  { platform: 'facebook', days: [1, 3, 5], time: '19:30' },
  { platform: 'google', days: [2], time: '10:00' },
  { platform: 'pinterest', days: [1, 2, 3, 4, 5], time: '20:30' },
];
const AHEAD_DAYS = 8;
const PER_RUN = 4;

const dayOf = (date) => { const d = new Date(`${date}T12:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; };
const addDays = (date, n) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const weekNo = (date) => Math.floor(Date.parse(`${date}T12:00:00Z`) / (7 * 86400_000));
const couple = (name) => String(name ?? '').replace(/\s+(wedding|gallery)$/i, '').trim();

/** The slots in the next week that don't have a post yet (any status: a skipped slot stays skipped). */
export async function openSlots(db, today = nzNow()) {
  const until = addDays(today.date, AHEAD_DAYS);
  const have = new Set((await db.prepare(`SELECT platform, post_at FROM social_posts WHERE post_at >= ?1 AND post_at <= ?2`)
    .bind(today.date, `${until}T23:59`).all()).results.map((r) => `${r.platform} ${r.post_at.slice(0, 10)}`));
  const out = [];
  for (let n = 0; n <= AHEAD_DAYS; n++) {
    const date = addDays(today.date, n);
    for (const s of SLOTS) {
      if (!s.days.includes(dayOf(date))) continue;
      // Today only if it's still more than a couple of hours away.
      if (n === 0 && Number(s.time.slice(0, 2)) <= today.hour + 2) continue;
      if (!have.has(`${s.platform} ${date}`)) out.push({ platform: s.platform, date, post_at: `${date}T${s.time}` });
    }
  }
  return out;
}

// ---- What there is to post about ----
async function sources(env) {
  const r = await env.ASSETS.fetch(new Request(`${SITE}/studio/social-sources.json`));
  if (!r.ok) throw new Error(`social sources ${r.status}`);
  return r.json();
}
/** Clients who said no to marketing: their names, to keep their blog posts and reviews out too. */
async function noMarketing(db) {
  return (await db.prepare(`SELECT c.first_name, c.last_name, j.partner_name FROM clients c LEFT JOIN jobs j ON j.client_id = c.id WHERE c.ads_ok = 0`).all()).results;
}
const mentions = (text, people) => people.some((p) => {
  const t = String(text ?? '').toLowerCase();
  const first = String(p.first_name ?? '').toLowerCase().trim(), partner = String(p.partner_name ?? '').split(' ')[0].toLowerCase().trim();
  const last = String(p.last_name ?? '').toLowerCase().trim();
  return first && t.includes(first) && ((partner && t.includes(partner)) || (last && t.includes(last)));
});
/** When each source was last used (any platform, or one), so drafts rotate through everything. */
async function lastUsed(db, source, platform = null) {
  const rows = (await db.prepare(`SELECT source_ref, max(post_at) at FROM social_posts WHERE source = ?1 ${platform ? 'AND platform = ?2' : ''} GROUP BY source_ref`)
    .bind(...(platform ? [source, platform] : [source])).all()).results;
  return new Map(rows.map((r) => [r.source_ref, r.at]));
}
const usedSince = (used, ref, date, days) => { const at = used.get(ref); return at && at.slice(0, 10) > addDays(date, -days); };

/** Gallery photos marked Social, by gallery, with the couple's details. */
async function markedPhotos(db) {
  const rows = (await db.prepare(`SELECT p.image_id, p.gallery_id, g.name gallery, i.width, i.height, i.web_crc, j.venue, j.job_type
      FROM photo_picks p JOIN gallery_images i ON i.id = p.image_id JOIN photo_galleries g ON g.id = p.gallery_id
      LEFT JOIN jobs j ON j.id = g.job_id LEFT JOIN clients c ON c.id = COALESCE(g.client_id, j.client_id)
      WHERE p.purpose = 'social' AND i.status = 'ready' AND COALESCE(c.ads_ok, 1) = 1 ORDER BY i.sort_order, i.id`).all()).results;
  const by = new Map();
  for (const r of rows) (by.get(r.gallery_id) ?? by.set(r.gallery_id, { gallery_id: r.gallery_id, name: couple(r.gallery), venue: r.venue ?? '', type: r.job_type ?? 'Wedding', photos: [] }).get(r.gallery_id)).photos.push(r);
  return [...by.values()];
}
const galleryPhoto = (r) => {
  const k = 2048 / Math.max(r.width || 2048, r.height || 2048);
  return { src: webUrl(r.gallery_id, r.image_id, 'web', r.web_crc), w: Math.round((r.width || 2048) * k), h: Math.round((r.height || 1365) * k), image_id: r.image_id, gallery_id: r.gallery_id };
};
const postPhoto = (p) => ({ src: p.src, w: p.w || 2048, h: p.h || 1365, alt: p.alt || '' });
/** How often each photo has been used in the last four months (a day's Instagram and Facebook
 *  posts count once), so drafts spread the photos out rather than repeating favourites. */
async function photoUse(db, date) {
  const rows = (await db.prepare(`SELECT post_at, photos FROM social_posts WHERE status <> 'skipped' AND source <> 'none' AND post_at >= ?1`).bind(addDays(date, -120)).all()).results;
  const seen = new Set(), use = new Map();
  for (const r of rows) for (const p of JSON.parse(r.photos || '[]')) {
    const k = p.image_id || p.src, day = `${r.post_at.slice(0, 10)}|${k}`;
    if (seen.has(day)) continue;
    seen.add(day); use.set(k, (use.get(k) ?? 0) + 1);
  }
  return use;
}
/** The least-used photos of a list (ties: the list's own order), kept in that order. */
const leastUsed = (list, use, count) => list.map((x, i) => ({ x, i, u: use.get(x.image_id || x.src) ?? 0 }))
  .sort((a, b) => a.u - b.u || a.i - b.i).slice(0, count).sort((a, b) => a.i - b.i).map((o) => o.x);

/** One idea for a post: { source, source_ref, label, facts, photos, link }. */
async function idea(env, platform, date, kind, src, blocked, count = null) {
  const db = env.DB;
  const use = await photoUse(db, date);
  const weddings = src.posts.filter((p) => p.categories.includes('Wedding') && p.photos.length && !mentions(p.title, blocked));
  if (kind === 'photos') {
    const galleries = await markedPhotos(db);
    const used = await lastUsed(db, 'photos');
    const pick = galleries.filter((g) => !usedSince(used, g.gallery_id, date, 7)).sort((a, b) => (used.get(a.gallery_id) ?? '').localeCompare(used.get(b.gallery_id) ?? ''))[0];
    if (pick) {
      const photos = leastUsed(pick.photos, use, count ?? 6).map(galleryPhoto);
      const post = weddings.find((p) => p.title.toLowerCase().includes(pick.name.split(/\s+(?:and|&)\s+/i)[0].toLowerCase()));
      return { source: 'photos', source_ref: pick.gallery_id, label: `${pick.name}${pick.venue ? ` at ${pick.venue}` : ''}`, photos, link: post ? `${SITE}${post.url}`
        : null, facts: `Photos from ${pick.name}’s ${pick.type.toLowerCase()}${pick.venue ? ` at ${pick.venue}` : ''}.${post ? ` Their story is on the blog: “${post.title}”. ${post.description}` : ''}` };
    }
    kind = 'blog';
  }
  if (kind === 'blog') {
    const used = await lastUsed(db, 'blog', platform);
    const days = platform === 'google' ? 60 : 30;
    const pick = weddings.filter((p) => !usedSince(used, p.id, date, days)).sort((a, b) => (used.get(a.id) ?? '').localeCompare(used.get(b.id) ?? '') || b.date.localeCompare(a.date))[0];
    if (!pick) return null;
    return { source: 'blog', source_ref: pick.id, label: pick.title, link: `${SITE}${pick.url}`, photos: leastUsed(pick.photos, use, count ?? 8).map(postPhoto),
      facts: `A wedding story on my blog: “${pick.title}”. ${pick.description}${pick.venue ? ` Venue: ${pick.venue}.` : ''}` };
  }
  if (kind === 'review') {
    const used = await lastUsed(db, 'review');
    const ok = src.reviews.filter((r) => r.rating >= 5 && r.text.length >= 100 && !mentions(`${r.name} ${r.text}`, blocked) && !usedSince(used, r.name, date, 120))
      .sort((a, b) => (used.get(a.name) ?? '').localeCompare(used.get(b.name) ?? '') || b.date.localeCompare(a.date));
    for (const r of ok) {
      const post = src.posts.find((p) => p.review === r.name);
      const photos = post ? leastUsed(post.photos, use, 3).map(postPhoto) : r.photos.slice(0, 1).map(postPhoto);
      if (!photos.length) continue;
      return { source: 'review', source_ref: r.name, label: `Review from ${r.name}`, link: post ? `${SITE}${post.url}` : `${SITE}/testimonials`, photos,
        facts: `A 5-star Google review from ${r.name}${post ? ` (their wedding: “${post.title}”)` : ''}. The review: “${r.text}”` };
    }
    kind = 'tip';
  }
  if (kind === 'tip') {
    const used = await lastUsed(db, 'tip');
    // Now and then (every four weeks or so): dates for next year and the year after.
    if (!usedSince(used, 'note:dates', date, 28)) {
      const year = Number(date.slice(0, 4)) + (Number(date.slice(5, 7)) >= 6 ? 1 : 0);
      const photo = leastUsed(weddings.slice(0, 12).flatMap((w) => w.photos), use, 1)[0];
      if (photo) return { source: 'tip', source_ref: 'note:dates', label: `Now booking ${year} weddings`, link: `${SITE}/contact`, photos: [postPhoto(photo)],
        facts: `I’m now taking bookings for ${year} weddings (and the odd ${year + 1} one), and popular summer Saturdays go first. Invite couples to check their date with me through the contact form on my website.` };
    }
    const info = src.posts.filter((p) => p.categories.includes('Info') && p.photos.length && !usedSince(used, `info:${p.id}`, date, 90))
      .sort((a, b) => (used.get(`info:${a.id}`) ?? '').localeCompare(used.get(`info:${b.id}`) ?? '') || b.date.localeCompare(a.date));
    const pick = info[0];
    if (!pick) return null;
    return { source: 'tip', source_ref: `info:${pick.id}`, label: `Tip: ${pick.title}`, link: `${SITE}${pick.url}`, photos: leastUsed(pick.photos, use, 1).map(postPhoto),
      facts: `A planning tip for couples, from my blog post “${pick.title}”: ${pick.description}` };
  }
  return null;
}

/** A pin: one blog photo not pinned before, from the post pinned least lately. */
async function pinIdea(env, date, src, blocked) {
  const db = env.DB;
  const pinned = new Set((await db.prepare(`SELECT source_ref FROM social_posts WHERE platform = 'pinterest'`).all()).results.map((r) => r.source_ref));
  const used = new Map();
  for (const ref of pinned) { const id = String(ref).split('#')[0]; used.set(id, (used.get(id) ?? 0) + 1); }
  const posts = src.posts.filter((p) => p.photos.length && !mentions(p.title, blocked) && p.categories.some((c) => ['Wedding', 'Portrait', 'Info'].includes(c)))
    .sort((a, b) => (used.get(a.id) ?? 0) - (used.get(b.id) ?? 0) || b.date.localeCompare(a.date));
  for (const p of posts) {
    // Upright photos make the best pins; then any.
    const order = p.photos.map((ph, n) => ({ ph, n })).sort((a, b) => (b.ph.h > b.ph.w) - (a.ph.h > a.ph.w));
    const next = order.find(({ n }) => !pinned.has(`${p.id}#${n}`));
    if (next) return { source: p.categories.includes('Info') ? 'tip' : 'blog', source_ref: `${p.id}#${next.n}`, label: p.title.slice(0, 100), link: `${SITE}${p.url}`, photos: [postPhoto(next.ph)],
      facts: `A pin linking to my blog post “${p.title}”: ${p.description}${next.ph.alt ? ` The photo: ${next.ph.alt}.` : ''}` };
  }
  return null;
}

// ---- Captions ----
const VOICE = `You write social media posts for Tony Gorham, a wedding and portrait photographer in West Auckland, New Zealand (Moments in Light).
Voice: warm, relaxed and genuine, first person ("I"), New Zealand English spelling (colour, favourite, organise). Couples' first names only.
Never mention prices. Never make up details that aren't in the facts. At most one emoji. Reply with only the post text, no quotes or headings.`;
const RULES = {
  instagram: 'An Instagram caption: 2 to 4 short paragraphs (under 120 words), then a blank line and 8 to 12 relevant hashtags (e.g. #aucklandweddingphotographer, #nzwedding, the venue as a hashtag). If there is a blog post, say the full story is at the link in my bio.',
  facebook: 'A Facebook page post: 2 or 3 short paragraphs (under 100 words), no hashtags. If there is a link, end with a short line inviting people to read or see more (the link is added after your text).',
  google: 'A Google Business Profile update: under 80 words, plain and friendly, mentioning West Auckland or Auckland naturally. No hashtags, no links (the button carries the link).',
  pinterest: 'A Pinterest pin description: one or two sentences, under 300 characters, with natural search words (e.g. Auckland wedding photography, the venue). No hashtags.',
};
async function caption(env, platform, it) {
  try {
    let text = await chat(env, [{ role: 'system', content: VOICE }, { role: 'user', content: `${RULES[platform]}\n\nFacts: ${it.facts}` }], 400);
    text = text.replace(/^["“']|["”']$/g, '').trim();
    if (platform === 'facebook' && it.link && !text.includes(it.link)) text += `\n\n${it.link}`;
    return { text, ai: 1 };
  } catch (e) {
    // No AI today: a plain start Tony can finish.
    return { text: `${it.label}.${platform === 'facebook' && it.link ? `\n\n${it.link}` : ''}`, ai: 0, error: e.message };
  }
}

// Instagram and Facebook take turns through the kinds of post over the week: Monday gallery photos,
// Wednesday a blog story, review or tip in turn, Friday a slideshow Reel with music (Tony, 21 Oct 2026).
const kindFor = (platform, date) => {
  const d = dayOf(date);
  if (platform === 'google') return weekNo(date) % 2 ? 'review' : 'blog';
  if (d === 1 || d === 5) return 'photos';
  return ['blog', 'review', 'blog', 'tip'][weekNo(date) % 4];
};
const REEL_DAY = 5;
/** The music track used least lately (null if there's none yet). */
async function pickMusic(db) {
  return (await db.prepare(`SELECT m.id FROM social_music m ORDER BY (SELECT max(post_at) FROM social_posts p WHERE p.music_id = m.id) NULLS FIRST, m.id`).first())?.id ?? null;
}

/** Make one draft for a slot (or return why not). */
export async function draftSlot(env, slot, src, blocked, sameDay = null) {
  const db = env.DB;
  let it = sameDay;
  // Friday's Instagram post is a Reel (when there's music to use); Facebook that day follows it.
  const music = it?.format ? it.music_id ?? null : slot.platform === 'instagram' && dayOf(slot.date) === REEL_DAY ? await pickMusic(db) : null;
  const format = it?.format ?? (music ? 'reel' : 'photos');
  if (!it) it = slot.platform === 'pinterest' ? await pinIdea(env, slot.date, src, blocked) : await idea(env, slot.platform, slot.date, kindFor(slot.platform, slot.date), src, blocked, format === 'reel' ? 10 : null);
  if (!it) {
    // Nothing fresh to say: hold the slot as a skipped one so it isn't retried every run.
    await db.prepare(`INSERT INTO social_posts (platform, post_at, status, source, label, created_at) VALUES (?1, ?2, 'skipped', 'none', 'Nothing new to post', ?3)`)
      .bind(slot.platform, slot.post_at, new Date().toISOString()).run();
    return null;
  }
  const max = PLATFORMS[slot.platform].max;
  const c = await caption(env, slot.platform, it);
  await db.prepare(`INSERT INTO social_posts (platform, post_at, status, source, source_ref, label, caption, link, photos, ai, error, created_at, format, music_id)
      VALUES (?1, ?2, 'draft', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`)
    .bind(slot.platform, slot.post_at, it.source, it.source_ref, it.label, c.text, PLATFORMS[slot.platform].link ? it.link : null,
      JSON.stringify(it.photos.slice(0, max)), c.ai, c.error ?? null, new Date().toISOString(), format, format === 'reel' ? music : null).run();
  return it;
}

/** The timer's step: a few drafts per run until the week ahead is full. */
export async function socialTimer(env) {
  const db = env.DB;
  const set = await db.prepare(`SELECT value FROM settings WHERE key = 'social'`).first();
  if (set && JSON.parse(set.value).drafts === false) return 'off';
  const slots = (await openSlots(db)).slice(0, PER_RUN);
  if (!slots.length) return 'full';
  const src = await sources(env);
  const blocked = await noMarketing(db);
  let made = 0;
  for (const s of slots) {
    // Facebook on an Instagram day uses the same photos and story (its own caption).
    let same = null;
    if (s.platform === 'facebook') {
      const ig = await db.prepare(`SELECT * FROM social_posts WHERE platform = 'instagram' AND substr(post_at, 1, 10) = ?1 AND source <> 'none'`).bind(s.date).first();
      if (ig) {
        const facts = await factsFor(env, ig, src);
        same = { source: ig.source, source_ref: ig.source_ref, label: ig.label, link: ig.link ?? facts.link, photos: JSON.parse(ig.photos), facts: facts.facts, format: ig.format ?? 'photos', music_id: ig.music_id ?? null };
      }
    }
    if (await draftSlot(env, s, src, blocked, same)) made++;
  }
  return `${made} draft${made === 1 ? '' : 's'}`;
}

/** The facts behind an existing post (for a sister post's caption, or a new caption). */
export async function factsFor(env, p, src = null) {
  src ??= await sources(env);
  if (p.source === 'blog' || (p.source === 'tip' && String(p.source_ref).startsWith('info:')) || String(p.source_ref).includes('#')) {
    const id = String(p.source_ref).replace(/^info:/, '').split('#')[0];
    const post = src.posts.find((x) => x.id === id);
    if (post) return { link: `${SITE}${post.url}`, facts: `${p.source === 'tip' ? 'A planning tip for couples, from my blog post' : 'A wedding story on my blog:'} “${post.title}”. ${post.description}${post.venue ? ` Venue: ${post.venue}.` : ''}` };
  }
  if (p.source === 'review') {
    const r = src.reviews.find((x) => x.name === p.source_ref);
    if (r) return { link: p.link, facts: `A 5-star Google review from ${r.name}. The review: “${r.text}”` };
  }
  if (p.source === 'photos') return { link: p.link, facts: `Photos from ${p.label}.` };
  return { link: p.link, facts: p.label ?? '' };
}

/** A fresh caption for a post (Tony's "New caption" button). */
export async function recaption(env, p) {
  const f = await factsFor(env, p);
  return caption(env, p.platform, { ...f, label: p.label, link: p.link ?? f.link });
}

/** Swap a draft for a different idea in the same slot. */
export async function swapDraft(env, p) {
  const src = await sources(env);
  const blocked = await noMarketing(env.DB);
  const date = p.post_at.slice(0, 10);
  // Mark this one skipped first, so the new idea isn't the same one again.
  await env.DB.prepare(`UPDATE social_posts SET status = 'skipped' WHERE id = ?1`).bind(p.id).run();
  const kinds = ['photos', 'blog', 'review', 'tip'];
  const start = kinds.indexOf(p.source);
  for (let n = 1; n <= kinds.length; n++) {
    const kind = kinds[(Math.max(start, 0) + n) % kinds.length];
    const it = p.platform === 'pinterest' ? await pinIdea(env, date, src, blocked) : await idea(env, p.platform, date, kind, src, blocked);
    if (it && !(it.source === p.source && it.source_ref === p.source_ref)) {
      await env.DB.prepare(`DELETE FROM social_posts WHERE id = ?1`).bind(p.id).run();
      await draftSlot(env, { platform: p.platform, date, post_at: p.post_at }, src, blocked, it);
      return true;
    }
  }
  await env.DB.prepare(`UPDATE social_posts SET status = 'draft' WHERE id = ?1`).bind(p.id).run();
  return false;
}

/**
 * Different photos for a draft, keeping its story and caption (Tony's "Different photos" button):
 * the same gallery or blog post's other photos, least used first, as many as it has now. Returns the
 * photos, or null if there are no others to use.
 */
export async function freshPhotos(env, p) {
  const db = env.DB;
  const now = JSON.parse(p.photos || '[]');
  const count = Math.max(1, Math.min(now.length || 1, PLATFORMS[p.platform].max));
  const date = p.post_at.slice(0, 10);
  const use = await photoUse(db, date);
  const current = new Set(now.map((x) => x.image_id || x.src));
  const others = (list) => list.filter((x) => !current.has(x.image_id || x.src));
  let pool = [];
  if (p.source === 'photos') {
    const g = (await markedPhotos(db)).find((x) => x.gallery_id === p.source_ref);
    pool = g ? others(g.photos.map(galleryPhoto)) : [];
  } else {
    const src = await sources(env);
    const ref = String(p.source_ref ?? '');
    const post = p.source === 'review' ? src.posts.find((x) => x.review === ref)
      : src.posts.find((x) => x.id === ref.replace(/^info:/, '').split('#')[0]);
    if (post) {
      pool = others(post.photos.map(postPhoto));
      // The couple's gallery: the photos Tony has marked Social there.
      const first = (n) => String(n).split(/\s+(?:and|&)\s+/i)[0].trim().toLowerCase();
      const g = (await markedPhotos(db)).find((x) => first(x.name) && post.title.toLowerCase().includes(first(x.name)));
      // Only the ones Tony flagged Social, when the gallery has any: the blog's photos are the fallback.
      const flagged = g ? others(g.photos.map(galleryPhoto)) : [];
      if (flagged.length) pool = flagged;
    }
    else if (p.source === 'review') pool = others((src.reviews.find((r) => r.name === ref)?.photos ?? []).map(postPhoto));
    else if (ref === 'note:dates') pool = others(src.posts.filter((x) => x.categories.includes('Wedding')).slice(0, 12).flatMap((x) => x.photos).map(postPhoto));
  }
  if (!pool.length) return null;
  // Each click shows something new: shuffled, then the least used first, the gallery photos Tony marked
  // Social before the blog's (they're his fresh picks), and for a pin the upright ones (they pin best).
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const key = (x) => (use.get(x.image_id || x.src) ?? 0) * 4 + (x.image_id ? 0 : 1) * 2 + (p.platform === 'pinterest' && !(x.h > x.w) ? 1 : 0);
  pool.sort((a, b) => key(a) - key(b));
  return pool.slice(0, p.platform === 'pinterest' ? 1 : count);
}

/** Suggestions for the Ideas list: things that happened lately that would make a good post. */
export async function ideas(env) {
  const db = env.DB;
  const out = [];
  const src = await sources(env).catch(() => ({ posts: [], reviews: [] }));
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const usedBlog = await lastUsed(db, 'blog');
  for (const p of src.posts.filter((x) => x.date >= since && x.categories.includes('Wedding') && !usedBlog.has(x.id)))
    out.push({ kind: 'blog', text: `New blog post “${p.title}” hasn’t been shared yet.`, link: `/blog/${p.id}` });
  const usedRev = await lastUsed(db, 'review');
  for (const r of src.reviews.filter((x) => x.date >= since && !usedRev.has(x.name)))
    out.push({ kind: 'review', text: `${r.name} left a review on ${r.date}. It would make a lovely post.` });
  const galleries = (await db.prepare(`SELECT g.id, g.name, (SELECT count(*) FROM photo_picks p WHERE p.gallery_id = g.id AND p.purpose = 'social') marked
      FROM photo_galleries g WHERE g.status = 'online' AND g.updated_at >= ?1`).bind(since).all().catch(() => ({ results: [] }))).results;
  for (const g of galleries) if (!g.marked) out.push({ kind: 'gallery', text: `${couple(g.name)}’s gallery is out: mark a few favourites Social for a sneak peek.`, link: `/studio/gallery?id=${g.id}` });
  const marked = (await db.prepare(`SELECT count(*) n FROM photo_picks WHERE purpose = 'social'`).first()).n;
  if (marked < 12) out.push({ kind: 'photos', text: `Only ${marked} gallery photo${marked === 1 ? '' : 's'} marked Social. Mark more (select them in a gallery, then Social) for Monday’s wedding posts.` });
  return out;
}
