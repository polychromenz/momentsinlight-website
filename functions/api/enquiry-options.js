// The enquiry form's choices (job types and lead sources marked "on the form" in the studio
// Settings). Public: names only, nothing private.
//   GET /api/enquiry-options
export async function onRequestGet({ env }) {
  const rows = await env.DB.prepare('SELECT kind, value, label FROM lists WHERE on_form = 1 ORDER BY kind, sort, id').all();
  const pick = (k) => rows.results.filter((r) => r.kind === k).map(({ value, label }) => ({ value, label }));
  return new Response(JSON.stringify({ services: pick('job_type'), sources: pick('lead_source') }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
  });
}
