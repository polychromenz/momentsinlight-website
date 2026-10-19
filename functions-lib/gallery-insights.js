// Gallery activity, like Pic-Time's daily report and dashboard (20 Oct 2026): who's viewing and
// downloading. From gallery_events ('view' each time someone opens a gallery, 'download' for a
// photo or a ZIP) and gallery_viewers (each person, with their name and email when the link asks).
// Used by the morning email (functions-lib/digest.js), the studio home page and the Galleries pages.
const nzDayStart = (date) => {
  const guess = new Date(`${date}T00:00:00Z`);
  const nz = new Date(guess.toLocaleString('en-US', { timeZone: 'Pacific/Auckland' }));
  const utc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess.valueOf() - (nz - utc)).toISOString();
};
export const nzToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const photosIn = (e) => (e.image_id ? 1 : Number(JSON.parse(e.meta || '{}').n) || 0);

/** Activity per gallery between two NZ dates (from inclusive, to exclusive). */
export async function activityBetween(db, fromDate, toDate) {
  const from = nzDayStart(fromDate), to = nzDayStart(toDate);
  const [events, guests] = await Promise.all([
    db.prepare(`SELECT e.gallery_id, e.viewer_id, e.type, e.image_id, e.meta, g.name FROM gallery_events e JOIN photo_galleries g ON g.id = e.gallery_id WHERE e.at >= ?1 AND e.at < ?2`).bind(from, to).all(),
    db.prepare(`SELECT v.gallery_id, v.name, v.email, v.role, v.consent_marketing, g.name gallery FROM gallery_viewers v JOIN photo_galleries g ON g.id = v.gallery_id
      WHERE v.first_seen >= ?1 AND v.first_seen < ?2 AND v.role NOT IN ('main_client') ORDER BY v.first_seen`).bind(from, to).all(),
  ]);
  const by = new Map();
  const row = (id, name) => by.get(id) ?? by.set(id, { gallery_id: id, name, views: 0, visitors: new Set(), downloads: 0, photos: 0, zips: 0, guests: [] }).get(id);
  for (const e of events.results) {
    const r = row(e.gallery_id, e.name);
    if (e.type === 'view') { r.views++; if (e.viewer_id) r.visitors.add(e.viewer_id); }
    if (e.type === 'download') { r.downloads++; r.photos += photosIn(e); if (!e.image_id) r.zips++; if (e.viewer_id) r.visitors.add(e.viewer_id); }
  }
  for (const v of guests.results) row(v.gallery_id, v.gallery).guests.push({ name: v.name, email: v.email, marketing: !!v.consent_marketing });
  return [...by.values()].map((r) => ({ ...r, visitors: r.visitors.size })).sort((a, b) => b.views + b.downloads - (a.views + a.downloads));
}

/** Yesterday (NZ), for the morning email. */
export const yesterday = (db) => { const t = nzToday(); return activityBetween(db, addDays(t, -1), t); };

/** This year so far, like Pic-Time's dashboard: galleries delivered, views, people, downloads. */
export async function yearSummary(db) {
  const start = nzDayStart(`${nzToday().slice(0, 4)}-01-01`);
  const [g, v, d] = await Promise.all([
    db.prepare(`SELECT count(*) n, COALESCE(sum((SELECT count(*) FROM gallery_images i WHERE i.gallery_id = g.id AND i.status = 'ready')), 0) photos FROM photo_galleries g WHERE g.status = 'online'`).first(),
    db.prepare(`SELECT count(*) views, count(DISTINCT viewer_id) people FROM gallery_events WHERE type = 'view' AND at >= ?1`).bind(start).first(),
    db.prepare(`SELECT count(*) n, count(DISTINCT gallery_id) galleries, COALESCE(sum(CASE WHEN image_id IS NOT NULL THEN 1 ELSE CAST(COALESCE(json_extract(meta, '$.n'), 0) AS INTEGER) END), 0) photos FROM gallery_events WHERE type = 'download' AND at >= ?1`).bind(start).first(),
  ]);
  return { galleries: g.n, photos: g.photos, views: v.views, people: v.people, downloads: d.photos, download_galleries: d.galleries };
}

/** One gallery: everyone who has visited (with views and downloads), and the latest events. */
export async function galleryActivity(db, galleryId) {
  const [people, recent] = await Promise.all([
    db.prepare(`SELECT v.id, v.name, v.email, v.role, v.consent_marketing, v.first_seen, v.last_seen, l.name link_name,
        (SELECT count(*) FROM gallery_events e WHERE e.viewer_id = v.id AND e.type = 'view') views,
        (SELECT COALESCE(sum(CASE WHEN e.image_id IS NOT NULL THEN 1 ELSE CAST(COALESCE(json_extract(e.meta, '$.n'), 0) AS INTEGER) END), 0) FROM gallery_events e WHERE e.viewer_id = v.id AND e.type = 'download') photos
      FROM gallery_viewers v LEFT JOIN gallery_links l ON l.id = v.link_id WHERE v.gallery_id = ?1 ORDER BY v.last_seen DESC LIMIT 200`).bind(galleryId).all(),
    db.prepare(`SELECT e.type, e.image_id, e.meta, e.at, v.name, v.email FROM gallery_events e LEFT JOIN gallery_viewers v ON v.id = e.viewer_id WHERE e.gallery_id = ?1 ORDER BY e.at DESC LIMIT 40`).bind(galleryId).all(),
  ]);
  return {
    people: people.results.map((p) => ({ ...p, marketing: !!p.consent_marketing })),
    recent: recent.results.map((e) => ({ type: e.type, at: e.at, who: e.name || e.email || 'Someone', photos: e.type === 'download' ? photosIn(e) : 0, size: JSON.parse(e.meta || '{}').size ?? null })),
  };
}

/** One line per gallery for the morning email. */
export const activityLine = (r) => [
  `${r.views} view${r.views === 1 ? '' : 's'}${r.visitors ? ` by ${r.visitors} ${r.visitors === 1 ? 'person' : 'people'}` : ''}`,
  r.photos && `${r.photos} photo${r.photos === 1 ? '' : 's'} downloaded${r.zips ? ` (${r.zips} ZIP${r.zips === 1 ? '' : 's'})` : ''}`,
  r.guests.length && `new: ${r.guests.map((g) => `${g.name || g.email}${g.name && g.email ? ` (${g.email})` : ''}${g.marketing ? ' ✓ marketing' : ''}`).join(', ')}`,
].filter(Boolean).join(' · ');
