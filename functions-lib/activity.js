// Who did what on a client (feature ideas, 20 Oct 2026): every change made through the studio's
// client pages is noted with who made it (Tony, Mel…), shown on the client page's Activity card.
// Recorded by functions/api/studio/_middleware.js after a change succeeds.
const WHAT = {
  job: (b, m) => (m === 'DELETE' ? 'Deleted the job' : b.stage && Object.keys(b).length <= 3 ? `Moved them to “${b.stage}”` : 'Changed their details'),
  email: (b) => `Sent an email${b.subject ? `: “${String(b.subject).slice(0, 80)}”` : ''}`,
  send: (b) => `Sent an email${b.subject ? `: “${String(b.subject).slice(0, 80)}”` : ''}`,
  step: (b) => ({ done: 'Marked a step done', skip: 'Skipped a step', reopen: 'Reopened a step' }[b.action] ?? 'Changed a step'),
  invoice: (b) => (b.action === 'paid' ? `Marked an invoice paid (${b.method || 'paid'})` : `Changed an invoice${b.action ? ` (${b.action})` : ''}`),
  appointment: (b, m) => (m === 'DELETE' ? 'Removed an appointment' : m === 'PUT' ? 'Changed an appointment' : `Added an appointment${b.title ? `: ${b.title}` : ''}`),
  quote: (b, m) => (m === 'DELETE' ? 'Withdrew a quote' : m === 'PUT' ? 'Edited a quote' : 'Started a quote'),
  'quote-send': () => 'Sent a quote',
  contract: (b, m) => (m === 'DELETE' ? 'Voided a contract' : 'Made and sent a contract'),
  questionnaire: (b, m) => (m === 'DELETE' ? 'Removed a questionnaire' : 'Added a questionnaire'),
  portal: (b) => (b.action === 'gallery' ? 'Added a gallery link to their portal' : 'Changed their portal'),
};
// For changes that name a step, invoice… rather than the job: which table holds its job.
const TABLE = { step: 'steps', invoice: 'invoices', appointment: 'appointments', quote: 'quotes', 'quote-send': 'quotes', contract: 'contracts', questionnaire: 'questionnaires' };

/** A short name for who's signed in: their name in Settings > People, else from their email. */
export const whoName = (user) => user?.name || (String(user?.email ?? '').split('@')[0].replace(/^\w/, (c) => c.toUpperCase()) || 'Someone');

export async function recordActivity(env, user, path, method, body, url) {
  const kind = path.replace(/^\/api\/studio\/crm\//, '');
  if (!WHAT[kind]) return;
  const db = env.DB;
  let jobId = Number(body.job_id) || (kind === 'job' ? Number(body.id || url.searchParams.get('id')) : 0);
  const ref = Number(body.id || url.searchParams.get('id'));
  if (!jobId && TABLE[kind] && ref) jobId = (await db.prepare(`SELECT job_id FROM ${TABLE[kind]} WHERE id = ?1`).bind(ref).first())?.job_id ?? 0;
  if (!jobId && kind === 'send' && body.step) jobId = (await db.prepare('SELECT job_id FROM steps WHERE id = ?1').bind(Number(body.step)).first())?.job_id ?? 0;
  if (!jobId && kind === 'contract' && body.quote_id) jobId = (await db.prepare('SELECT job_id FROM quotes WHERE id = ?1').bind(Number(body.quote_id)).first())?.job_id ?? 0;
  if (!jobId) return;
  await db.prepare('INSERT INTO activity (job_id, who, email, what, at) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(jobId, whoName(user), user?.email ?? '', WHAT[kind](body, method), new Date().toISOString()).run();
}
