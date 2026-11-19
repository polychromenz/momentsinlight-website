// One client in the studio (/studio/crm/client?id=…): the person, all their jobs, their portal and
// galleries (per client), and every email with them. Jobs have their own page (job.js).
// Clients and jobs as separate pages: Tony, 2026-11-20 (docs/client-job-split-plan.md).
//   GET /api/studio/crm/client?id=7     the client, their jobs (with where each is at), emails,
//                                       galleries and portal link
//   PUT /api/studio/crm/client          { id, first_name?, last_name?, email?, phone?, address?, notes?,
//                                         ads_ok?, keep?, test? }  change their details
import { json } from '../../../../functions-lib/studio.js';
import { portalToken, portalLink } from '../../../../functions-lib/portal.js';
import { clientGalleries } from '../../../../functions-lib/gallery-access.js';
import { gallerySettings } from '../../../../functions-lib/galleries.js';

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const id = Number(new URL(request.url).searchParams.get('id'));
  const client = id && await db.prepare('SELECT * FROM clients WHERE id = ?1').bind(id).first();
  if (!client) return json({ error: 'That client doesn’t exist (they may have been deleted).' }, 404);
  const [jobs, quotes, contracts, invoices, steps, messages, galleries, gs] = await Promise.all([
    db.prepare(`SELECT id, title, job_type, stage, event_date, event_time, venue, partner_name, created_at, portal_token FROM jobs WHERE client_id = ?1
      ORDER BY COALESCE(event_date, substr(created_at, 1, 10)) DESC, id DESC`).bind(id).all(),
    db.prepare(`SELECT job_id, status, total FROM quotes WHERE job_id IN (SELECT id FROM jobs WHERE client_id = ?1) AND status IN ('sent', 'accepted')`).bind(id).all(),
    db.prepare(`SELECT job_id, status FROM contracts WHERE job_id IN (SELECT id FROM jobs WHERE client_id = ?1) AND status IN ('sent', 'signed')`).bind(id).all(),
    db.prepare(`SELECT job_id, amount, status FROM invoices WHERE job_id IN (SELECT id FROM jobs WHERE client_id = ?1) AND status IN ('scheduled', 'sent', 'paid')`).bind(id).all(),
    db.prepare(`SELECT job_id, title, kind, due_at FROM steps WHERE job_id IN (SELECT id FROM jobs WHERE client_id = ?1) AND status IN ('scheduled', 'due') ORDER BY due_at`).bind(id).all(),
    db.prepare(`SELECT id, job_id, direction, subject, sent_at FROM messages WHERE client_id = ?1 OR job_id IN (SELECT id FROM jobs WHERE client_id = ?1)
      ORDER BY sent_at DESC LIMIT 200`).bind(id).all(),
    clientGalleries(db, id),
    gallerySettings(db),
  ]);
  const of = (rows, jobId) => rows.results.filter((r) => r.job_id === jobId);
  const jobList = jobs.results.map(({ portal_token, ...j }) => {
    const q = of(quotes, j.id), c = of(contracts, j.id), inv = of(invoices, j.id);
    const next = of(steps, j.id)[0];
    return {
      ...j,
      quote: q.some((x) => x.status === 'accepted') ? 'accepted' : q.length ? 'sent' : null,
      total: q.find((x) => x.status === 'accepted')?.total ?? null,
      contract: c.some((x) => x.status === 'signed') ? 'signed' : c.length ? 'sent' : null,
      paid: inv.filter((i) => i.status === 'paid').reduce((a, i) => a + i.amount, 0),
      invoiced: inv.reduce((a, i) => a + i.amount, 0),
      next: next ? { title: next.title, kind: next.kind, due_at: next.due_at } : null,
    };
  });
  // Their portal shows every job, so any job's link will do: the latest one that's going ahead.
  const portalJob = jobs.results.find((j) => j.stage !== 'lost') ?? jobs.results[0];
  const portal = portalJob ? portalLink(await portalToken(db, portalJob.id)) : null;
  const online = galleries.filter((g) => g.online);
  const until = online.reduce((a, g) => (g.expires_at && g.expires_at > a ? g.expires_at : a), '') || null;
  return json({
    client, jobs: jobList, messages: messages.results, portal,
    galleries: galleries.map(({ id: gid, name, status, expires_at, photos, url, online: on, job_id }) => ({ id: gid, name, status, expires_at, photos, url, online: on, job_id })),
    keep: { until, price: gs.extension_price ?? 4900, months: gs.extension_months || 12 },
  });
}

export async function onRequestPut({ request, env }) {
  const d = await request.json().catch(() => null);
  const db = env.DB;
  const c = d?.id && await db.prepare('SELECT * FROM clients WHERE id = ?1').bind(Number(d.id)).first();
  if (!c) return json({ error: 'That client doesn’t exist.' }, 404);
  const text = (v, max) => (v ?? '').toString().trim().slice(0, max);
  const now = new Date().toISOString();
  const first = d.first_name !== undefined ? text(d.first_name, 100) || c.first_name : c.first_name;
  const last = d.last_name !== undefined ? text(d.last_name, 100) : c.last_name;
  const email = d.email !== undefined ? text(d.email, 254).toLowerCase() : c.email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'That email address doesn’t look right.' }, 400);
  const flag = (k) => (d[k] !== undefined ? (d[k] ? 1 : 0) : c[k]);
  const stmts = [
    db.prepare(`UPDATE clients SET first_name = ?2, last_name = ?3, email = ?4, phone = ?5, address = ?6, notes = ?7, ads_ok = ?8, keep = ?9, test = ?10, updated_at = ?11 WHERE id = ?1`)
      .bind(c.id, first, last, email, d.phone !== undefined ? text(d.phone, 40) : c.phone, d.address !== undefined ? text(d.address, 300) : c.address,
        d.notes !== undefined ? text(d.notes, 20000) : c.notes, flag('ads_ok'), flag('keep'), flag('test'), now),
    // Renamed: their jobs still named after them (the usual title) follow, as on the job page.
    db.prepare('UPDATE jobs SET title = ?3 WHERE client_id = ?1 AND (lower(title) = lower(?2) OR lower(title) = lower(?3)) AND title <> ?3')
      .bind(c.id, `${c.first_name} ${c.last_name}`.trim(), `${first} ${last}`.trim()),
  ];
  try {
    await db.batch(stmts);
  } catch (e) {
    if (String(e).includes('UNIQUE')) return json({ error: 'Another client already has that email address.' }, 409);
    throw e;
  }
  return json({ ok: true });
}
