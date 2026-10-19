// Has this client already left a Google review? Used to stop review requests and reminders
// (workflow steps with stop_on 'reviewed', functions/api/crm/run.js). Names come from the reviews
// on the website (src/data/reviews.json, via studio/social-sources.json) and, with the Google Maps
// key, Google's newest reviews (checked at most every 6 hours; names kept in google_reviewers).
const PLACE = 'ChIJXU4tP3hEf68RuSbX4BL4QgM'; // Moments in Light on Google Maps
const SITE = 'https://www.momentsinlight.co.nz';

async function freshFromGoogle(env) {
  if (!env.GOOGLE_MAPS_KEY) return;
  const db = env.DB;
  const last = await db.prepare(`SELECT value FROM settings WHERE key = 'google_reviews_checked'`).first();
  if (last && Date.now() - Date.parse(JSON.parse(last.value).at) < 6 * 3600_000) return;
  await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('google_reviews_checked', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`)
    .bind(JSON.stringify({ at: new Date().toISOString() }), new Date().toISOString()).run();
  const r = await fetch(`https://places.googleapis.com/v1/places/${PLACE}?languageCode=en`, { headers: { 'X-Goog-Api-Key': env.GOOGLE_MAPS_KEY, 'X-Goog-FieldMask': 'reviews' } });
  if (!r.ok) { console.error('reviewed: google', r.status); return; }
  const names = ((await r.json()).reviews ?? []).map((x) => x.authorAttribution?.displayName).filter(Boolean);
  const now = new Date().toISOString();
  if (names.length) await db.batch(names.map((n) => db.prepare('INSERT OR IGNORE INTO google_reviewers (name, seen_at) VALUES (?1, ?2)').bind(n, now)));
}

const words = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z]+/).filter((w) => w.length > 1);

/** True if a review's name looks like the client's (first and last name) or their partner's (two names). */
export function sameName(reviewer, job) {
  const r = new Set(words(reviewer));
  const has = (list) => list.length >= 2 && list.every((w) => r.has(w));
  return has([...words(job.first_name).slice(0, 1), ...words(job.last_name).slice(-1)]) || has(words(job.partner_name).slice(0, 2));
}

export async function hasReviewed(env, job) {
  await freshFromGoogle(env).catch((e) => console.error('reviewed:', e.message));
  const site = await env.ASSETS.fetch(new Request(`${SITE}/studio/social-sources.json`)).then((r) => (r.ok ? r.json() : { reviews: [] })).catch(() => ({ reviews: [] }));
  const google = (await env.DB.prepare('SELECT name FROM google_reviewers').all()).results.map((r) => r.name);
  return [...site.reviews.map((r) => r.name), ...google].some((n) => sameName(n, job));
}
