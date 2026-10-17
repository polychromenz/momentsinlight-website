// Every 5 minutes: POST https://www.momentsinlight.co.nz/api/crm/run with the timer's key.
// The website does the work; this only rings the bell. See wrangler.toml.
export default {
  async scheduled(event, env, ctx) {
    const r = await fetch('https://www.momentsinlight.co.nz/api/crm/run', { method: 'POST', headers: { 'x-run-key': env.CRM_CRON_KEY } });
    const text = await r.text();
    if (!r.ok) throw new Error(`crm run: ${r.status} ${text.slice(0, 300)}`);
    console.log('crm run', text.slice(0, 500));
  },
  async fetch() {
    return new Response('Not found', { status: 404 });
  },
};
