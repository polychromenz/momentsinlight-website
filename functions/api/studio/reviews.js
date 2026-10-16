// Your Google reviews (src/data/reviews.json), shown on /testimonials and in the review
// carousels. Elfsight's feed is gone, so new reviews are added here.
//   GET /api/studio/reviews            -> { sha, data }
//   PUT /api/studio/reviews { data, sha, message } -> { sha }
import { json, readRepoFile, writeRepoFile } from '../../../functions-lib/studio.js';

const PATH = 'src/data/reviews.json';

export async function onRequestGet({ env }) {
  try {
    const r = await readRepoFile(env, PATH);
    if (!r.exists) return json({ error: 'The reviews file is missing.' }, 404);
    return json({ sha: r.sha, data: JSON.parse(r.content) });
  } catch (e) {
    return json({ error: `Couldn’t open your reviews (${e.message}).` }, 502);
  }
}

const valid = (d) =>
  d && Array.isArray(d.reviews) &&
  d.reviews.every((r) => typeof r.name === 'string' && r.name.trim() && /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
    Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5 && typeof r.text === 'string' && Array.isArray(r.photos));

export async function onRequestPut({ request, env }) {
  const { data, sha, message } = await request.json().catch(() => ({}));
  if (!valid(data)) return json({ error: 'Each review needs a name, a date, 1–5 stars and its text.' }, 400);
  data.reviews.sort((a, b) => b.date.localeCompare(a.date));
  const r = await writeRepoFile(env, PATH, JSON.stringify(data, null, 2) + '\n', sha, message || 'Studio: update reviews');
  if (r.status === 409 || r.status === 422) return json({ error: 'Your reviews were changed somewhere else since you opened them. Reload to get the latest.', conflict: true }, 409);
  if (!r.ok) return json({ error: `Couldn’t save (GitHub ${r.status}: ${r.data?.message ?? ''}).` }, 502);
  return json({ sha: r.data.content.sha });
}
