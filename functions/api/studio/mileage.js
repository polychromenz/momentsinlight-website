// Studio > Mileage (functions-lib/mileage.js).
//   GET  /api/studio/mileage?from=YYYY-MM-DD&to=YYYY-MM-DD        -> { trips, settings, totals, maps, vehicles }
//   GET  /api/studio/mileage?from=…&to=…&export=journal|log       a CSV: Xero manual journal, or the trip log
//   GET  /api/studio/mileage?from=…&to=…&preview=journal          the journal's lines, to check before downloading
//   POST /api/studio/mileage { action: 'settings', base, vehicle, debit, credit, tax, tier1_km }
//   POST /api/studio/mileage { action: 'add', date, purpose, destination, km? }
//   POST /api/studio/mileage { action: 'edit', id, km?, skip?, note?, purpose?, destination?, date? }
//   POST /api/studio/mileage { action: 'recalc', id }      work the km out again from Google
//   POST /api/studio/mileage { action: 'delete', id }      only trips added by hand
import { json } from '../../../functions-lib/studio.js';
import { mapsReady } from '../../../functions-lib/places.js';
import { syncTrips, fillDistances, pricedTrips, mileageSettings, saveSettings, journal, journalCsv, logCsv, VEHICLES } from '../../../functions-lib/mileage.js';

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '');

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  const from = q.get('from'), to = q.get('to');
  if (!isDate(from) || !isDate(to) || from > to) return json({ error: 'Which dates?' }, 400);
  const s = await mileageSettings(env.DB);
  if (q.get('preview') === 'journal') return json(journal(await pricedTrips(env.DB, from, to, s), s, from, to));
  const kind = q.get('export');
  if (kind) {
    const trips = await pricedTrips(env.DB, from, to, s);
    if (kind === 'journal' && (!s.debit || !s.credit)) return json({ error: 'Add your Xero account codes in the settings first.' }, 400);
    const body = kind === 'journal' ? journalCsv(trips, s, from, to) : logCsv(trips, s);
    const name = `${kind === 'journal' ? 'xero-mileage-journal' : 'mileage-log'}-${from}-to-${to}.csv`;
    return new Response(body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' } });
  }
  await syncTrips(env, from, to);
  const trips = await pricedTrips(env.DB, from, to, s);
  const claim = trips.filter((t) => !t.skip && t.amount > 0);
  return json({
    trips, settings: s, maps: mapsReady(env), vehicles: VEHICLES,
    totals: { trips: claim.length, km: Math.round(claim.reduce((a, t) => a + t.km, 0) * 10) / 10, amount: claim.reduce((a, t) => a + Math.round(t.amount * 100), 0) / 100,
      waiting: trips.filter((t) => !t.skip && t.km == null).length, provisional: trips.some((t) => t.provisional && t.amount > 0) },
  });
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const db = env.DB;
  const now = new Date().toISOString();
  const text = (v, n) => String(v ?? '').trim().slice(0, n);
  const km = (v) => (v === '' || v == null ? null : Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) < 5000 ? Math.round(Number(v) * 10) / 10 : undefined);
  if (d.action === 'settings') return json({ settings: await saveSettings(db, d) });
  if (d.action === 'add') {
    if (!isDate(d.date)) return json({ error: 'Which day was the trip?' }, 400);
    if (!text(d.destination, 300)) return json({ error: 'Where did you go?' }, 400);
    const k = km(d.km);
    if (k === undefined) return json({ error: 'The km should be a number.' }, 400);
    const r = await db.prepare(`INSERT INTO mileage_trips (date, purpose, destination, km, km_edited, note, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`)
      .bind(d.date, text(d.purpose, 200) || 'Business trip', text(d.destination, 300), k, k == null ? 0 : 1, text(d.note, 300), now).run();
    if (k == null) await fillDistances(env, d.date, d.date);
    return json({ id: r.meta.last_row_id });
  }
  const t = await db.prepare('SELECT * FROM mileage_trips WHERE id = ?1').bind(Number(d.id)).first();
  if (!t) return json({ error: 'That trip isn’t here any more.' }, 404);
  if (d.action === 'edit') {
    const k = d.km !== undefined ? km(d.km) : t.km;
    if (k === undefined) return json({ error: 'The km should be a number.' }, 400);
    const dest = d.destination !== undefined ? text(d.destination, 300) : t.destination;
    const typed = d.km !== undefined && k != null;
    await db.prepare(`UPDATE mileage_trips SET km = ?2, km_edited = ?3, skip = ?4, note = ?5, purpose = ?6, destination = ?7, date = ?8, error = ?9, updated_at = ?10 WHERE id = ?1`)
      .bind(t.id, dest !== t.destination && !typed ? null : k, typed ? 1 : d.km !== undefined ? 0 : t.km_edited, d.skip !== undefined ? (d.skip ? 1 : 0) : t.skip,
        d.note !== undefined ? text(d.note, 300) : t.note, d.purpose !== undefined ? text(d.purpose, 200) || t.purpose : t.purpose, dest,
        isDate(d.date) ? d.date : t.date, typed ? null : dest !== t.destination ? null : t.error, now).run();
    if (!typed) await fillDistances(env, t.date, t.date);
    return json({ ok: true });
  }
  if (d.action === 'recalc') {
    await db.prepare(`UPDATE mileage_trips SET km = NULL, km_edited = 0, error = NULL WHERE id = ?1`).bind(t.id).run();
    await fillDistances(env, t.date, t.date);
    return json({ ok: true });
  }
  if (d.action === 'delete') {
    if (t.key) return json({ error: 'That trip comes from a job or appointment: skip it instead.' }, 400);
    await db.prepare('DELETE FROM mileage_trips WHERE id = ?1').bind(t.id).run();
    return json({ ok: true });
  }
  return json({ error: 'What should happen?' }, 400);
}
