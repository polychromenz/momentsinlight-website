// Notification bars (Studio > Settings > Notification bars): a slim bar that drops from the top.
//   site     every public page of the website (not the client-only pages), while its text isn't blank;
//            a visitor who dismisses it (or sees it slide away) doesn't see it again until the text changes.
//   gallery  galleries opened from a guest or invited link (friends and family, not the couple or
//            vendors): a gentle nudge to consider Tony for their own photos, linking to the homepage;
//            once a day per visitor.
// Kept in settings ('notices') as { site: { text, link }, gallery: { text } }.

const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanLink = (v) => {
  const s = clean(v, 300);
  if (!s) return '';
  if (s.startsWith('/')) return s;
  try { const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); return u.href; } catch { return ''; }
};

export async function notices(db) {
  const row = await db.prepare(`SELECT value FROM settings WHERE key = 'notices'`).first();
  const v = row ? JSON.parse(row.value) : {};
  return { site: { text: v.site?.text ?? '', link: v.site?.link ?? '' }, gallery: { text: v.gallery?.text ?? '' } };
}

export async function saveNotices(db, d) {
  const value = { site: { text: clean(d?.site?.text, 240), link: cleanLink(d?.site?.link) }, gallery: { text: clean(d?.gallery?.text, 240) } };
  await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('notices', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`)
    .bind(JSON.stringify(value), new Date().toISOString()).run();
  return value;
}

/** A short fingerprint of a bar's text, so a dismissed bar comes back when the text changes. */
export function version(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h.toString(36);
}
