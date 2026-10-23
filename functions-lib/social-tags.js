// Tagging venues and suppliers (Contacts, with their Instagram and Facebook) in social posts.
// A post's tags are contact ids (social_posts.tags); until Tony changes them, the wedding's venue
// is tagged when it matches a contact. When a post goes out:
//   Instagram: "Venue: @their_handle" before the hashtags (an @mention notifies them), and the
//              first photo tagged with them too (it shows in their Tagged tab).
//   Facebook:  "Venue: Their Business" (apps can't tag other Pages on Facebook any more).
import { sources } from './social.js';

const TAGGABLE = ['instagram', 'facebook'];

/** Contacts with an Instagram or Facebook, for the post editor's Tag list. */
export const socialContacts = async (db) => (await db.prepare(`SELECT id, business, type, instagram, facebook FROM contacts
  WHERE instagram <> '' OR facebook <> '' ORDER BY type = 'Venue' DESC, lower(business)`).all()).results;

/** The venue behind a post: its gallery's couple's venue, or the blog post's. */
async function venueOf(db, p, src) {
  const photos = JSON.parse(p.photos || '[]');
  const gid = photos.find((x) => x.gallery_id)?.gallery_id ?? (p.source === 'photos' ? p.source_ref : null);
  if (gid) {
    const g = await db.prepare(`SELECT COALESCE(NULLIF(g.venue, ''), j.venue, '') venue FROM photo_galleries g LEFT JOIN jobs j ON j.id = g.job_id WHERE g.id = ?1`).bind(gid).first();
    if (g?.venue) return g.venue;
  }
  if (src && p.source_ref) {
    const id = String(p.source_ref).replace(/^info:/, '').split('#')[0];
    return src.posts.find((x) => x.id === id)?.venue ?? '';
  }
  return '';
}

/** Tag ids for each post: its own, or (never set) the venue when it matches a contact. */
export async function tagIds(env, posts, contacts) {
  const out = new Map();
  let src = null;
  for (const p of posts) {
    if (p.tags != null) { out.set(p.id, JSON.parse(p.tags)); continue; }
    if (!TAGGABLE.includes(p.platform)) { out.set(p.id, []); continue; }
    if (!src && p.source !== 'photos') src = await sources(env).catch(() => ({ posts: [] }));
    const venue = (await venueOf(env.DB, p, src)).toLowerCase();
    out.set(p.id, venue ? contacts.filter((c) => c.business.length >= 4 && venue.includes(c.business.toLowerCase())).map((c) => c.id) : []);
  }
  return out;
}

/** The credit line for a platform, e.g. "Venue: @settlersmanor · Flowers: @bloom". */
export function creditLine(platform, tagged) {
  const bits = tagged.map((c) => {
    const who = platform === 'instagram' ? (c.instagram ? `@${c.instagram}` : c.business) : c.business;
    return `${c.type && c.type !== 'Other' ? `${c.type}: ` : ''}${who}`;
  });
  return bits.join(' · ');
}

/** The caption with the credit line added, just before a closing block of hashtags (else at the end). */
export function withCredits(caption, line) {
  const text = String(caption ?? '').trim();
  if (!line || text.includes(line)) return text;
  const parts = text.split(/\n\s*\n/);
  const last = parts[parts.length - 1];
  if (parts.length > 1 && /^\s*#/.test(last) && !last.replace(/#[\p{L}\p{N}_]+/gu, '').trim()) {
    return [...parts.slice(0, -1), line, last].join('\n\n');
  }
  return `${text}\n\n${line}`;
}

/** A post ready to go out: its caption with credits, and the Instagram handles to tag on the photo. */
export async function tagged(env, p) {
  if (!TAGGABLE.includes(p.platform)) return { caption: p.caption, handles: [] };
  const contacts = await socialContacts(env.DB);
  const ids = (await tagIds(env, [p], contacts)).get(p.id) ?? [];
  const list = ids.map((id) => contacts.find((c) => c.id === id)).filter(Boolean);
  return { caption: withCredits(p.caption, creditLine(p.platform, list)), handles: list.map((c) => c.instagram).filter(Boolean) };
}
