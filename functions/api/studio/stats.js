// Visitor numbers from Cloudflare Web Analytics, for the studio's Stats page.
//   GET /api/studio/stats?days=7|30|90
// Needs CF_ANALYTICS_TOKEN: a Cloudflare API token with Account > Account Analytics > Read.
import { json } from '../../../functions-lib/studio.js';

const HOST = 'www.momentsinlight.co.nz';
const day = (d) => d.toISOString().slice(0, 10);

export async function onRequestGet({ request, env }) {
  if (!env.CF_ANALYTICS_TOKEN) return json({ error: 'Stats aren’t connected yet: the CF_ANALYTICS_TOKEN setting is missing.', setup: true }, 503);
  const days = Math.min(90, Math.max(1, Number(new URL(request.url).searchParams.get('days')) || 30));
  const to = new Date();
  const from = new Date(Date.now() - (days - 1) * 86400_000);
  const filter = { AND: [{ date_geq: day(from), date_leq: day(to) }, { requestHost: HOST }] };
  const group = (dims, limit, order = 'count_DESC') =>
    `rumPageloadEventsAdaptiveGroups(filter: $filter, limit: ${limit}, orderBy: [${order}]) { count sum { visits } dimensions { ${dims} } }`;
  const query = `query Stats($account: string!, $filter: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject!) {
    viewer { accounts(filter: { accountTag: $account }) {
      totals: rumPageloadEventsAdaptiveGroups(filter: $filter, limit: 1) { count sum { visits } }
      daily: ${group('date', days + 1, 'date_ASC')}
      pages: ${group('requestPath', 60)}
      referrers: ${group('refererHost', 15)}
      countries: ${group('countryName', 10)}
      devices: ${group('deviceType', 5)}
    } }
  }`;
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables: { account: env.CF_ACCOUNT_ID, filter } }),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || d?.errors?.length) {
    const msg = d?.errors?.[0]?.message ?? `Cloudflare ${r.status}`;
    return json({ error: `Couldn’t get the stats (${msg}).`, setup: /auth|permission|token/i.test(msg) }, 502);
  }
  const a = d?.data?.viewer?.accounts?.[0] ?? {};
  const rows = (list, key) => (list ?? []).map((g) => ({ key: g.dimensions?.[key] || '', views: g.count, visits: g.sum?.visits ?? 0 }));
  return json({
    days,
    from: day(from),
    to: day(to),
    views: a.totals?.[0]?.count ?? 0,
    visits: a.totals?.[0]?.sum?.visits ?? 0,
    daily: rows(a.daily, 'date'),
    pages: rows(a.pages, 'requestPath'),
    referrers: rows(a.referrers, 'refererHost'),
    countries: rows(a.countries, 'countryName'),
    devices: rows(a.devices, 'deviceType'),
  });
}
