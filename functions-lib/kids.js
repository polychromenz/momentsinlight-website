// Children-only photos stay out of social posts and pins (Tony, 27 Oct 2026). The studio's image AI
// looks at each photo once and the answer is kept (photo_flags); Tony can overrule it either way
// from Studio > Social. A photo's key is its gallery image id, or its address for a blog photo.
import { see } from './ai.js';

export const photoKey = (p) => p.image_id || p.src;

/** Keys of photos flagged children-only (by the AI and not overruled, or by Tony). */
export async function kidsKeys(db) {
  return new Set((await db.prepare(`SELECT key FROM photo_flags WHERE kids = 1`).all()).results.map((r) => r.key));
}

// A small copy is plenty to see who's in it: the 600px gallery copy, or a 640px Cloudflare Images one.
const smallUrl = (src) => (src.includes('imagedelivery.net/') ? src.replace(/\/[^/]+$/, '/w=640') : src.replace(/_2048\.jpg/, '_600.jpg'));

const PROMPT = 'Look at the people in this photograph. Answer with exactly one word: CHILDREN if every person in it is a child (under about 13), ADULTS if at least one adult is in it, or NONE if there are no people.';

/** Is this photo children-only? Asks the AI the first time, then remembers. Unknown (AI unavailable) = no. */
export async function isKidsOnly(env, photo, label = '') {
  const db = env.DB;
  const key = photoKey(photo);
  const known = await db.prepare(`SELECT kids FROM photo_flags WHERE key = ?1`).bind(key).first();
  if (known) return known.kids === 1;
  try {
    const img = await fetch(smallUrl(photo.src), { headers: { accept: 'image/jpeg' } });
    if (!img.ok) return false;
    const answer = (await see(env, [...new Uint8Array(await img.arrayBuffer())], PROMPT, 5)).toUpperCase();
    const kids = /CHILDREN/.test(answer) && !/ADULT/.test(answer) ? 1 : 0;
    await db.prepare(`INSERT INTO photo_flags (key, src, kids, manual, label, checked_at) VALUES (?1, ?2, ?3, 0, ?4, ?5)
      ON CONFLICT (key) DO NOTHING`).bind(key, photo.src, kids, String(label).slice(0, 200), new Date().toISOString()).run();
    return kids === 1;
  } catch (e) {
    console.error('kids: check', e.message);
    return false;
  }
}

/** The photos that aren't children-only (each checked the first time it's seen). */
export async function withoutKids(env, photos, label = '') {
  const out = [];
  for (const p of photos) if (!(await isKidsOnly(env, p, label))) out.push(p);
  return out;
}

/** The timer's step: check a few photos that could be posted and haven't been checked yet. */
export async function kidsScan(env, candidates, max = 8) {
  const done = new Set((await env.DB.prepare(`SELECT key FROM photo_flags`).all()).results.map((r) => r.key));
  const todo = candidates.filter((c) => !done.has(photoKey(c.photo))).slice(0, max);
  let kids = 0;
  for (const c of todo) if (await isKidsOnly(env, c.photo, c.label)) kids++;
  return { checked: todo.length, kids, left: candidates.filter((c) => !done.has(photoKey(c.photo))).length - todo.length };
}
