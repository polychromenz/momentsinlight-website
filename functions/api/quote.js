// The couple's private quote page (/quote?t=…) talks to this. Public, but each quote is only
// reachable with its long random token, and it shows nothing beyond that quote.
//   GET  /api/quote?t=…                       the quote (marks it viewed, unless &preview=1)
//   POST /api/quote  { t, package, extras, name }   accept it
// Accepting records their name, the time and their IP address, saves their postal address (and
// phone, if given) to their client record, marks the lead booked (which
// stops the enquiry follow-ups), adds a "Send the contract" to-do for Tony and alerts him.
import { parseQuote, publicQuote, totalFor, payments, money, longDate } from '../../functions-lib/quotes.js';
import { loadJob } from '../../functions-lib/crm-send.js';
import { alertTony } from '../../functions-lib/crm.js';

const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const find = async (env, t) => (/^[a-f0-9]{48}$/.test(t || '') ? parseQuote(await env.DB.prepare('SELECT * FROM quotes WHERE token = ?1').bind(t).first()) : null);

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const q = await find(env, url.searchParams.get('t'));
  if (!q || q.status === 'draft' && !url.searchParams.has('preview') || q.status === 'withdrawn') return reply({ error: 'This quote isn’t available. Please get in touch with Tony.' }, 404);
  const job = await loadJob(env.DB, q.job_id);
  if (!url.searchParams.has('preview') && !q.viewed_at) {
    await env.DB.prepare('UPDATE quotes SET viewed_at = ?2 WHERE id = ?1 AND viewed_at IS NULL').bind(q.id, new Date().toISOString()).run();
  }
  return reply(publicQuote(q, job));
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => null);
  const q = await find(env, d?.t);
  if (!q || q.status === 'withdrawn' || q.status === 'draft') return reply({ error: 'This quote isn’t available. Please get in touch with Tony.' }, 404);
  const job = await loadJob(env.DB, q.job_id);
  const view = publicQuote(q, job);
  if (view.status === 'accepted') return reply({ error: 'You’ve already accepted this quote. Thank you!' }, 409);
  if (view.status === 'expired') return reply({ error: 'This quote has expired. Please get in touch with Tony for an updated one.' }, 409);
  const pkg = Number(d.package);
  const extras = Array.isArray(d.extras) ? [...new Set(d.extras.map(Number).filter((i) => Number.isInteger(i) && q.extras[i]))] : [];
  const name = (d.name ?? '').toString().trim().slice(0, 120);
  const total = totalFor(q, pkg, extras);
  if (total === null) return reply({ error: 'Please choose a package.' }, 400);
  if (name.length < 2) return reply({ error: 'Please type your full name to accept.' }, 400);
  const address = (d.address ?? '').toString().replace(/\r\n/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, 300);
  const phone = (d.phone ?? '').toString().replace(/[^\d +()-]/g, '').trim().slice(0, 40);
  if (address.length < 8) return reply({ error: 'Please add your postal address.' }, 400);

  const now = new Date();
  const at = now.toISOString();
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const r = await env.DB.prepare(
    `UPDATE quotes SET status = 'accepted', chosen_package = ?2, chosen_extras = ?3, total = ?4, accepted_name = ?5, accepted_ip = ?6, accepted_at = ?7, updated_at = ?7
     WHERE id = ?1 AND status = 'sent'`,
  ).bind(q.id, pkg, JSON.stringify(extras), total, name, ip, at).run();
  if (!r.meta.changes) return reply({ error: 'This quote has just changed. Please reload the page.' }, 409);
  await env.DB.batch([
    env.DB.prepare(`UPDATE clients SET address = ?2, phone = CASE WHEN ?3 <> '' THEN ?3 ELSE phone END, updated_at = ?4 WHERE id = ?1`).bind(job.client_id, address, phone, at),
    env.DB.prepare(`UPDATE jobs SET stage = 'booked', booked_at = COALESCE(booked_at, ?2), updated_at = ?2 WHERE id = ?1 AND stage = 'lead'`).bind(job.id, at),
    env.DB.prepare(`UPDATE steps SET status = 'skipped', done_at = ?2, note = 'Stopped: booked' WHERE job_id = ?1 AND status IN ('scheduled', 'due') AND (',' || stop_on || ',') LIKE '%,booked,%'`).bind(job.id, at),
    env.DB.prepare(`INSERT OR IGNORE INTO steps (job_id, step_key, kind, title, due_at, created_at) VALUES (?1, ?2, 'todo', 'Send the contract (quote accepted)', ?3, ?3)`).bind(job.id, `send-contract-${q.id}`, at),
  ]);
  const chosen = q.packages[pkg];
  const plan = payments(q.schedule, total, job.event_date, at.slice(0, 10));
  await alertTony(env, `Quote accepted: ${view.names}`, [
    ['Package', `${chosen.name}${chosen.subtitle ? ` (${chosen.subtitle})` : ''}`],
    ['Extras', extras.map((i) => q.extras[i].name).join(', ')],
    ['Total', `${money(total)} incl. GST`],
    ['Payments', plan.map((p) => `${p.label}: ${money(p.amount)} ${p.onAccept ? 'now' : `by ${longDate(p.due)}`}`).join('\n')],
    ['Accepted by', `${name}, ${now.toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' })}`],
    ['Address', address],
    ['Phone', phone],
    ['Next', 'Send their contract (on your Today list).'],
  ], `https://www.momentsinlight.co.nz/studio/crm/job?id=${job.id}`);
  return reply({ ok: true });
}
