// Best times to post (Studio > Social): when Tony's audience is around, by NZ weekday and hour.
//   GET /api/studio/social/timing -> { days, enquiries: [7][24], clicks: [7][24], totals, ads_at }
// Sources: wedding enquiries (when each one arrived) and Google Ads clicks by day and hour (the
// 'by_hour' report from the Ads script, functions-lib/ads-reports.js). Meta (Instagram/Facebook
// follower activity, and Meta ads) can be added as more sources later.
import { json } from '../../../../functions-lib/studio.js';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ADS_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const grid = () => DAYS.map(() => Array(24).fill(0));
const nz = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'short', hour: 'numeric', hourCycle: 'h23' });

export async function onRequestGet({ env }) {
  // Imported enquiries with only a date (midnight UTC) have no time to count.
  const jobs = (await env.DB.prepare(`SELECT created_at FROM jobs WHERE job_type = 'Wedding' AND created_at NOT LIKE '%T00:00:00.000Z'`).all()).results;
  const enquiries = grid();
  for (const j of jobs) {
    const p = Object.fromEntries(nz.formatToParts(new Date(j.created_at)).map((x) => [x.type, x.value]));
    const d = DAYS.indexOf(p.weekday), h = Number(p.hour);
    if (d >= 0 && h >= 0 && h < 24) enquiries[d][h]++;
  }
  const rows = (await env.DB.prepare(`SELECT data, updated_at FROM ads_entity WHERE kind = 'by_hour'`).all()).results;
  const clicks = grid();
  let adsAt = null;
  for (const r of rows) {
    const a = JSON.parse(r.data);
    const d = ADS_DAYS.indexOf(a.day);
    if (d >= 0 && a.hour >= 0 && a.hour < 24) clicks[d][a.hour] += Number(a.clicks) || 0;
    if (!adsAt || r.updated_at > adsAt) adsAt = r.updated_at;
  }
  const sum = (g) => g.flat().reduce((a, b) => a + b, 0);
  return json({ days: DAYS, enquiries, clicks, totals: { enquiries: sum(enquiries), clicks: sum(clicks) }, ads_at: adsAt });
}
