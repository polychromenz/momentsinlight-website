// Gallery activity for the studio (functions-lib/gallery-insights.js), like Pic-Time's dashboard.
//   GET /api/studio/galleries/insights                -> { year, week, yesterday }   (home page and Galleries page)
//   GET /api/studio/galleries/insights?gallery=<id>   -> { people, recent }           (a gallery's Activity tab)
import { json } from '../../../../functions-lib/studio.js';
import { yearSummary, activityBetween, galleryActivity, nzToday } from '../../../../functions-lib/gallery-insights.js';

const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get('gallery');
  if (id) return json(await galleryActivity(env.DB, id));
  const today = nzToday();
  const [year, week, yesterday] = await Promise.all([
    yearSummary(env.DB),
    activityBetween(env.DB, addDays(today, -6), addDays(today, 1)),
    activityBetween(env.DB, addDays(today, -1), today),
  ]);
  return json({ year, week, yesterday });
}
