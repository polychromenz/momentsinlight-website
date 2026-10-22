// Studio > Payments > Reconcile (functions-lib/recon.js): plan a period's bank reconciliation from
// Tony's BNZ and Stripe exports, let him check and approve it, then create the matching
// transactions in Xero so its Reconcile screen just needs OK on each line.
//   GET  /api/studio/reconcile                    -> { runs: [...], accounts, banks, settings }
//   GET  /api/studio/reconcile?id=…               -> { run }
//   POST /api/studio/reconcile { action: 'plan', from, to, bank_csv, stripe_csv? }   -> { run }
//   POST /api/studio/reconcile { action: 'choose', id, n, code?, tax?, contact?, skip? }  one line's coding
//   POST /api/studio/reconcile { action: 'send', id }    the next few approved lines into Xero -> { run, left }
//   POST /api/studio/reconcile { action: 'undo', id }    take back what the run made
//   POST /api/studio/reconcile { action: 'clearing', id: accountId }   the Stripe clearing bank account
import { json } from '../../../functions-lib/studio.js';
import { readBank, readStripe, buildPlan, sendLine, undoMade } from '../../../functions-lib/recon.js';
import { xeroSettings, saveXeroSettings, xeroChoices, xeroConnection } from '../../../functions-lib/xero.js';

const load = async (db, id) => {
  const r = await db.prepare('SELECT id, period_from, period_to, status, plan, result, created_at, updated_at FROM recon_runs WHERE id = ?1').bind(Number(id)).first();
  return r && { ...r, plan: JSON.parse(r.plan || '{}'), result: JSON.parse(r.result || '{}') };
};
const save = (db, run) => db.prepare('UPDATE recon_runs SET plan = ?2, result = ?3, status = ?4, updated_at = ?5 WHERE id = ?1')
  .bind(run.id, JSON.stringify(run.plan), JSON.stringify(run.result), run.status, new Date().toISOString()).run();

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const id = new URL(request.url).searchParams.get('id');
  if (id) {
    const run = await load(db, id);
    return run ? json({ run }) : json({ error: 'That run isn’t here.' }, 404);
  }
  const runs = (await db.prepare('SELECT id, period_from, period_to, status, created_at, json_extract(plan, \'$.summary\') summary FROM recon_runs ORDER BY id DESC LIMIT 20').all()).results
    .map((r) => ({ ...r, summary: JSON.parse(r.summary || 'null') }));
  const c = await xeroConnection(db);
  let banks = [];
  if (c?.refresh) banks = (await xeroChoices(env).catch(() => ({ accounts: [] }))).accounts.filter((a) => a.bank);
  const s = await xeroSettings(db);
  return json({ runs, banks, connected: !!c?.refresh && c.tenant_name, settings: { bank: s.bank_code, clearing: s.clearing_code, fees: s.fees_code } });
}

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const d = await request.json().catch(() => ({}));
  try {
    if (d.action === 'clearing') {
      await saveXeroSettings(db, { clearing_code: String(d.id ?? '') });
      return json({ ok: true });
    }
    if (d.action === 'plan') {
      const ok = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x ?? '');
      if (!ok(d.from) || !ok(d.to) || d.from > d.to) return json({ error: 'Which dates?' }, 400);
      if (!d.bank_csv) return json({ error: 'Add the bank export (CSV).' }, 400);
      const s = await xeroSettings(db);
      if (!s.bank_code) return json({ error: 'Choose your bank account on the Xero page first.' }, 400);
      const bank = readBank(d.bank_csv);
      const stripe = d.stripe_csv ? readStripe(d.stripe_csv) : [];
      const plan = await buildPlan(env, { from: d.from, to: d.to, bank, stripe });
      const now = new Date().toISOString();
      const r = await db.prepare(`INSERT INTO recon_runs (period_from, period_to, status, bank_csv, stripe_csv, plan, result, created_at, updated_at) VALUES (?1, ?2, 'plan', ?3, ?4, ?5, '{}', ?6, ?6)`)
        .bind(d.from, d.to, d.bank_csv, d.stripe_csv ?? null, JSON.stringify(plan), now).run();
      return json({ run: await load(db, r.meta.last_row_id) });
    }
    const run = await load(db, d.id);
    if (!run) return json({ error: 'That run isn’t here.' }, 404);
    if (d.action === 'choose') {
      const line = run.plan.lines.find((l) => l.n === Number(d.n));
      if (!line) return json({ error: 'Which line?' }, 400);
      if (line.sent) return json({ error: 'That line is already in Xero.' }, 400);
      if (d.skip !== undefined) line.skipped = !!d.skip;
      if (line.choice && (d.code !== undefined || d.tax !== undefined || d.contact !== undefined)) {
        line.choice = { code: d.code ?? line.choice.code, tax: d.tax ?? line.choice.tax, contact: d.contact ?? line.choice.contact };
        if (line.choice.code && line.status === 'check') { line.status = 'ready'; line.note = 'Coded by you.'; }
      }
      await save(db, run);
      return json({ run });
    }
    if (d.action === 'send') {
      const s = await xeroSettings(db);
      const todo = run.plan.lines.filter((l) => l.status === 'ready' && !l.skipped && !l.sent && !l.error);
      for (const line of todo.slice(0, 8)) {
        try {
          line.sent = await sendLine(env, line, s, run.id);
          line.sent_at = new Date().toISOString();
        } catch (e) { line.error = e.message; }
        run.result.made = [...(run.result.made ?? []), ...(line.sent ?? []).map((m) => ({ ...m, n: line.n }))];
      }
      const left = run.plan.lines.filter((l) => l.status === 'ready' && !l.skipped && !l.sent && !l.error).length;
      if (!left) run.status = 'sent';
      await save(db, run);
      return json({ run, left });
    }
    if (d.action === 'retry') {
      for (const l of run.plan.lines) delete l.error;
      await save(db, run);
      return json({ run });
    }
    if (d.action === 'undo') {
      const left = await undoMade(env, run.result.made ?? []);
      // A line whose entries couldn't all be taken out of Xero stays sent, so it can't be sent twice.
      const stuck = new Set(left.map((m) => m.n));
      for (const l of run.plan.lines) if (!stuck.has(l.n)) { delete l.sent; delete l.sent_at; delete l.error; }
      run.result = { undone_at: new Date().toISOString(), left, made: (run.result.made ?? []).filter((m) => stuck.has(m.n)) };
      run.status = 'plan';
      await save(db, run);
      return json({ run, left });
    }
    return json({ error: 'What should happen?' }, 400);
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}
