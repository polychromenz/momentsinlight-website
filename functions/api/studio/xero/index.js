// Studio > Payments > Xero (functions-lib/xero.js).
//   GET  /api/studio/xero                 -> { ready, connection, settings, kinds, queue, recent, payouts, choices? }
//   POST /api/studio/xero { action: 'settings', start, sales_code, sales_tax, bank_code, clearing_code, fees_code, fees_tax, auto }
//   POST /api/studio/xero { action: 'approve', ids }   send these on the next run (or now)
//   POST /api/studio/xero { action: 'skip', id }       never send this one (e.g. already in Xero)
//   POST /api/studio/xero { action: 'retry', id }      a failed one back to waiting
//   POST /api/studio/xero { action: 'run' }            look for new ones and send approved ones now
//   POST /api/studio/xero { action: 'disconnect' }
import { json } from '../../../../functions-lib/studio.js';
import { xeroReady, xeroConnection, xeroSettings, saveXeroSettings, KINDS, queueNew, processQueue, checkPaidInXero, xeroChoices, disconnect } from '../../../../functions-lib/xero.js';

export async function onRequestGet({ env }) {
  const db = env.DB;
  const conn = await xeroConnection(db);
  const connected = !!conn?.refresh && xeroReady(env);
  const [settings, queue, recent, payouts, choices] = await Promise.all([
    xeroSettings(db),
    db.prepare(`SELECT * FROM xero_queue WHERE status IN ('pending', 'approved', 'failed') ORDER BY id`).all(),
    db.prepare(`SELECT * FROM xero_queue WHERE status IN ('done', 'skipped') ORDER BY COALESCE(done_at, created_at) DESC LIMIT 30`).all(),
    db.prepare(`SELECT * FROM stripe_payouts ORDER BY arrival_date DESC LIMIT 12`).all(),
    connected ? xeroChoices(env).catch((e) => ({ error: e.message })) : null,
  ]);
  // Each payout's invoices (gross) and fees, for matching its BNZ line in Xero.
  const parts = payouts.results.length ? (await db.prepare(`SELECT number, amount, stripe_fee, stripe_payout FROM invoices WHERE stripe_payout IN (SELECT value FROM json_each(?1)) ORDER BY number`)
    .bind(JSON.stringify(payouts.results.map((p) => p.id))).all()).results : [];
  for (const p of payouts.results) p.invoices = parts.filter((i) => i.stripe_payout === p.id);
  return json({
    ready: xeroReady(env),
    connection: conn ? { tenant_name: conn.tenant_name, connected_at: conn.connected_at, expired: !conn.refresh ? conn.expired ?? true : null } : null,
    settings, kinds: KINDS, queue: queue.results, recent: recent.results, payouts: payouts.results, choices,
  });
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const db = env.DB;
  const now = new Date().toISOString();
  try {
    if (d.action === 'settings') return json({ settings: await saveXeroSettings(db, d) });
    if (d.action === 'disconnect') { await disconnect(db); return json({ ok: true }); }
    if (d.action === 'approve') {
      const ids = (d.ids ?? []).map(Number).filter(Boolean).slice(0, 200);
      for (const id of ids) await db.prepare(`UPDATE xero_queue SET status = 'approved', approved_at = ?2 WHERE id = ?1 AND status IN ('pending', 'failed')`).bind(id, now).run();
      return json({ result: await processQueue(env, 25) });
    }
    if (d.action === 'skip') { await db.prepare(`UPDATE xero_queue SET status = 'skipped', done_at = ?2 WHERE id = ?1 AND status <> 'done'`).bind(Number(d.id), now).run(); return json({ ok: true }); }
    if (d.action === 'retry') { await db.prepare(`UPDATE xero_queue SET status = 'pending', error = NULL WHERE id = ?1 AND status = 'failed'`).bind(Number(d.id)).run(); return json({ ok: true }); }
    if (d.action === 'run') {
      const queued = await queueNew(env);
      const paid = await checkPaidInXero(env).catch(() => 0);
      return json({ queued, paid, result: await processQueue(env, 25) });
    }
    return json({ error: 'What should happen?' }, 400);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
