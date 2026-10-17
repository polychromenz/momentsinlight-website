// Quotes in the studio.
//   POST /api/studio/crm/quote          { job_id, template? }  make a draft from a quote template
//   GET  /api/studio/crm/quote?id=3     the quote, its job, and the payment schedules to choose from
//   PUT  /api/studio/crm/quote          { id, ...changes }      edit a draft or sent quote
//   DELETE /api/studio/crm/quote?id=3   withdraw it (its link then says it's no longer available)
import { json } from '../../../../functions-lib/studio.js';
import { parseQuote, payments, totalFor } from '../../../../functions-lib/quotes.js';
import { loadJob } from '../../../../functions-lib/crm-send.js';

const token = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
const nzToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
const addDays = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => null);
  const job = d?.job_id && await loadJob(env.DB, Number(d.job_id));
  if (!job) return json({ error: 'Which client?' }, 400);
  const tpl = await env.DB.prepare('SELECT * FROM quote_templates WHERE key = ?1').bind(d.template || 'wedding').first()
    ?? await env.DB.prepare('SELECT * FROM quote_templates WHERE job_type = ?1').bind(job.job_type).first();
  if (!tpl) return json({ error: 'There’s no quote template yet.' }, 400);
  const sched = tpl.schedule_key && await env.DB.prepare('SELECT parts FROM payment_schedules WHERE key = ?1').bind(tpl.schedule_key).first();
  const now = new Date().toISOString();
  const contractKey = (await env.DB.prepare(`SELECT contract_key FROM lists WHERE kind = 'job_type' AND value = ?1`).bind(job.job_type).first())?.contract_key ?? null;
  const r = await env.DB.prepare(
    `INSERT INTO quotes (job_id, token, intro, packages, extras, schedule, notes, valid_until, contract_key, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?10, ?9, ?9) RETURNING id`,
  ).bind(job.id, token(), tpl.intro, tpl.packages, tpl.extras, sched?.parts ?? '[]', tpl.notes, addDays(nzToday(), tpl.valid_days || 30), now, contractKey).first();
  return json({ ok: true, id: r.id });
}

export async function onRequestGet({ request, env }) {
  const id = Number(new URL(request.url).searchParams.get('id'));
  const q = parseQuote(id && await env.DB.prepare('SELECT * FROM quotes WHERE id = ?1').bind(id).first());
  if (!q) return json({ error: 'That quote doesn’t exist.' }, 404);
  const job = await loadJob(env.DB, q.job_id);
  const schedules = await env.DB.prepare('SELECT key, name, parts FROM payment_schedules ORDER BY name').all();
  const contractTemplates = await env.DB.prepare('SELECT key, name FROM contract_templates ORDER BY name').all();
  const contracts = await env.DB.prepare('SELECT id, name, status, sent_at, viewed_at, signed_name, signed_at FROM contracts WHERE quote_id = ?1 ORDER BY id DESC').bind(q.id).all();
  // An example of the payments, for the package marked recommended (or the first).
  const pick = Math.max(0, q.packages.findIndex((p) => p.recommended));
  const total = q.status === 'accepted' ? q.total : totalFor(q, pick, []);
  return json({
    quote: q,
    job: { id: job.id, title: job.title, first_name: job.first_name, partner_name: job.partner_name, email: job.email, event_date: job.event_date, venue: job.venue },
    example: total === null ? null : { package: q.packages[pick]?.name, total, payments: payments(q.schedule, total, job.event_date, q.accepted_at?.slice(0, 10)) },
    schedules: schedules.results.map((s) => ({ ...s, parts: JSON.parse(s.parts) })),
    link: `https://www.momentsinlight.co.nz/quote?t=${q.token}`,
    contractTemplates: contractTemplates.results,
    contracts: contracts.results,
  });
}

export async function onRequestPut({ request, env }) {
  const d = await request.json().catch(() => null);
  const q = parseQuote(d?.id && await env.DB.prepare('SELECT * FROM quotes WHERE id = ?1').bind(Number(d.id)).first());
  if (!q) return json({ error: 'That quote doesn’t exist.' }, 404);
  if (!['draft', 'sent'].includes(q.status)) return json({ error: `This quote is ${q.status} and can’t be changed. Make a new one instead.` }, 409);
  const text = (v, max) => (v ?? '').toString().trim().slice(0, max);
  const cents = (v) => Math.max(0, Math.round(Number(v) || 0));
  const packages = Array.isArray(d.packages) ? d.packages.map((p) => ({ name: text(p.name, 120), subtitle: text(p.subtitle, 120), price: cents(p.price), description: text(p.description, 10000), recommended: !!p.recommended })).filter((p) => p.name) : q.packages;
  const extras = Array.isArray(d.extras) ? d.extras.map((x) => ({ name: text(x.name, 120), price: cents(x.price), description: text(x.description, 2000) })).filter((x) => x.name) : q.extras;
  if (!packages.length) return json({ error: 'A quote needs at least one package.' }, 400);
  let schedule = q.schedule;
  if (d.schedule_key) {
    const s = await env.DB.prepare('SELECT parts FROM payment_schedules WHERE key = ?1').bind(d.schedule_key).first();
    if (s) schedule = JSON.parse(s.parts);
  }
  const validUntil = /^\d{4}-\d{2}-\d{2}$/.test(d.valid_until ?? '') ? d.valid_until : q.valid_until;
  await env.DB.prepare(
    `UPDATE quotes SET intro = ?2, packages = ?3, extras = ?4, discount = ?5, discount_label = ?6, schedule = ?7, notes = ?8, valid_until = ?9, updated_at = ?10, contract_key = ?11 WHERE id = ?1`,
  ).bind(q.id, d.intro !== undefined ? text(d.intro, 5000) : q.intro, JSON.stringify(packages), JSON.stringify(extras),
    d.discount !== undefined ? cents(d.discount) : q.discount, d.discount_label !== undefined ? text(d.discount_label, 120) : q.discount_label,
    JSON.stringify(schedule), d.notes !== undefined ? text(d.notes, 5000) : q.notes, validUntil, new Date().toISOString(), d.contract_key !== undefined ? (d.contract_key || null) : q.contract_key).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const id = Number(new URL(request.url).searchParams.get('id'));
  const r = await env.DB.prepare(`UPDATE quotes SET status = 'withdrawn', updated_at = ?2 WHERE id = ?1 AND status IN ('draft', 'sent')`).bind(id, new Date().toISOString()).run();
  if (!r.meta.changes) return json({ error: 'That quote can’t be withdrawn now.' }, 409);
  return json({ ok: true });
}
