// Mileage log and the Xero journal for Tony's kilometre-rate claim (migrations/0036_mileage.sql,
// Studio > Mileage). Each wedding, shoot and appointment with a place becomes a return trip from
// Tony's base (private, in settings 'mileage'), with Google's driving distance; he can add, change
// or skip trips. Rates are IRD's kilometre rates: tier 1 for the first business km of the income
// year (up to the settings' tier-1 limit, 14,000 km by default), tier 2 after that.
import { drivingKm, mapsReady } from './places.js';

// IRD kilometre rates by income year (the year ending 31 March), per km. IRD publishes each year's
// rates after it ends (2025–26 came out in June 2026), so the newest year uses the latest published
// rates until then. Source: ird.govt.nz "Kilometre rates" pages.
export const RATES = {
  2025: { petrol: [1.17, 0.37] },
  2026: { petrol: [1.2, 0.37], diesel: [1.3, 0.38], hybrid: [0.9, 0.24], electric: [1.22, 0.23] },
};
export const VEHICLES = { petrol: 'Petrol', diesel: 'Diesel', hybrid: 'Petrol hybrid', electric: 'Electric' };
const DEFAULTS = { base: '', vehicle: 'petrol', debit: '', credit: '', tax: 'No GST', tier1_km: 14000 };

/** The income year a date is in, named by the year it ends (1 Apr 2026 to 31 Mar 2027 is 2027). */
export const incomeYear = (date) => Number(date.slice(0, 4)) + (Number(date.slice(5, 7)) >= 4 ? 1 : 0);
export const yearStart = (date) => `${incomeYear(date) - 1}-04-01`;

/** The rate for a trip: { rates: [tier1, tier2], year, provisional }. */
export function ratesFor(date, vehicle) {
  const y = incomeYear(date);
  const years = Object.keys(RATES).map(Number).sort((a, b) => b - a);
  const exact = RATES[y]?.[vehicle];
  if (exact) return { rates: exact, year: y, provisional: false };
  const latest = years.find((k) => k <= y && RATES[k][vehicle]) ?? years.find((k) => RATES[k][vehicle]);
  return { rates: RATES[latest][vehicle], year: latest, provisional: true };
}

export async function mileageSettings(db) {
  const r = await db.prepare(`SELECT value FROM settings WHERE key = 'mileage'`).first();
  return { ...DEFAULTS, ...(r ? JSON.parse(r.value) : {}) };
}
export async function saveSettings(db, s) {
  const before = await mileageSettings(db);
  const next = {
    base: String(s.base ?? before.base).trim().slice(0, 300),
    vehicle: VEHICLES[s.vehicle] ? s.vehicle : before.vehicle,
    debit: String(s.debit ?? before.debit).trim().slice(0, 20),
    credit: String(s.credit ?? before.credit).trim().slice(0, 20),
    tax: String(s.tax ?? before.tax).trim().slice(0, 60) || 'No GST',
    tier1_km: Math.max(0, Math.min(14000, Math.round(Number(s.tier1_km ?? before.tier1_km)) || 0)),
  };
  await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('mileage', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`)
    .bind(JSON.stringify(next), new Date().toISOString()).run();
  // A new base: every trip's distance is worked out again (except ones Tony typed in).
  if (next.base !== before.base) await db.prepare(`UPDATE mileage_trips SET km = NULL, error = NULL WHERE km_edited = 0`).run();
  return next;
}

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });

/** Make or update the trips for jobs and appointments between two dates (up to today). */
export async function syncTrips(env, from, to) {
  const db = env.DB;
  const until = to < today() ? to : today();
  const now = new Date().toISOString();
  const jobs = (await db.prepare(`SELECT id, title, job_type, event_date, venue, venue_address FROM jobs
      WHERE stage IN ('booked', 'completed') AND event_date BETWEEN ?1 AND ?2 AND (venue <> '' OR venue_address <> '')`).bind(from, until).all()).results;
  const appts = (await db.prepare(`SELECT a.id, a.title, a.date, a.location, a.job_id, j.title job_title FROM appointments a JOIN jobs j ON j.id = a.job_id
      WHERE a.date BETWEEN ?1 AND ?2 AND a.location <> '' AND j.stage <> 'lost'`).bind(from, until).all()).results;
  const upsert = (key, date, jobId, purpose, dest) => db.prepare(`INSERT INTO mileage_trips (key, date, job_id, purpose, destination, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
      ON CONFLICT (key) DO UPDATE SET date = excluded.date, purpose = excluded.purpose,
        km = CASE WHEN mileage_trips.km_edited = 1 OR mileage_trips.destination = excluded.destination THEN mileage_trips.km ELSE NULL END,
        error = CASE WHEN mileage_trips.destination = excluded.destination THEN mileage_trips.error ELSE NULL END,
        destination = excluded.destination, updated_at = ?6`).bind(key, date, jobId, purpose, dest, now);
  const stmts = [
    ...jobs.map((j) => upsert(`job:${j.id}`, j.event_date, j.id, `${j.job_type || 'Shoot'}: ${j.title}`, j.venue_address || j.venue)),
    ...appts.map((a) => upsert(`appt:${a.id}`, a.date, a.job_id, `${a.title}: ${a.job_title}`, a.location)),
    // Jobs that are no longer booked (or appointments that went) lose their trip, unless Tony changed it.
    db.prepare(`DELETE FROM mileage_trips WHERE km_edited = 0 AND note = '' AND key LIKE 'job:%' AND CAST(substr(key, 5) AS INTEGER) NOT IN (SELECT id FROM jobs WHERE stage IN ('booked', 'completed'))`),
    db.prepare(`DELETE FROM mileage_trips WHERE km_edited = 0 AND note = '' AND key LIKE 'appt:%' AND CAST(substr(key, 6) AS INTEGER) NOT IN (SELECT id FROM appointments)`),
  ];
  for (let n = 0; n < stmts.length; n += 50) await db.batch(stmts.slice(n, n + 50));
  await fillDistances(env, from, to);
}

/** Work out the km for trips that don't have them yet (a few at a time). */
export async function fillDistances(env, from, to, limit = 15) {
  const db = env.DB;
  const s = await mileageSettings(db);
  if (!s.base || !mapsReady(env)) return;
  const todo = (await db.prepare(`SELECT id, destination FROM mileage_trips WHERE km IS NULL AND error IS NULL AND skip = 0 AND destination <> '' AND date BETWEEN ?1 AND ?2 ORDER BY date LIMIT ?3`)
    .bind(from, to, limit).all()).results;
  for (const t of todo) {
    const one = await drivingKm(env, s.base, t.destination).catch(() => null);
    await db.prepare(`UPDATE mileage_trips SET km = ?2, error = ?3 WHERE id = ?1`)
      .bind(t.id, one == null ? null : Math.round(one * 20) / 10, one == null ? 'Google couldn’t find a route there. Type the km, or fix the place.' : null).run();
  }
}

/**
 * Trips between two dates with what each claims. Tier 1 runs from the start of each income year,
 * so earlier trips in the same year are counted first.
 */
export async function pricedTrips(db, from, to, s) {
  const all = (await db.prepare(`SELECT * FROM mileage_trips WHERE date BETWEEN ?1 AND ?2 ORDER BY date, id`).bind(yearStart(from), to).all()).results;
  const used = {}; // business km so far, by income year
  const out = [];
  for (const t of all) {
    const y = incomeYear(t.date);
    const r = ratesFor(t.date, s.vehicle);
    let amount = 0, tier = '';
    if (!t.skip && t.km > 0) {
      const before = used[y] ?? 0;
      const t1 = Math.max(0, Math.min(t.km, s.tier1_km - before));
      const t2 = t.km - t1;
      amount = Math.round((t1 * r.rates[0] + t2 * r.rates[1]) * 100) / 100;
      tier = t2 && t1 ? 'Tiers 1 and 2' : t2 ? 'Tier 2' : 'Tier 1';
      used[y] = before + t.km;
    }
    if (t.date >= from) out.push({ ...t, rate: r.rates[t.km && tier === 'Tier 2' ? 1 : 0], tier, amount, rate_year: r.year, provisional: r.provisional, year_km: used[y] ?? 0 });
  }
  return out;
}

// ---- Exports ----
const csv = (rows) => rows.map((r) => r.map((v) => { const x = String(v ?? ''); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; }).join(',')).join('\r\n') + '\r\n';
const nzDate = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const longDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Xero's manual journal import file: one debit line per trip, one credit line for the total. */
export function journalCsv(trips, s, from, to) {
  const claim = trips.filter((t) => !t.skip && t.amount > 0);
  const narration = `Mileage claim ${longDate(from)} to ${longDate(to)} (IRD kilometre rate, ${VEHICLES[s.vehicle].toLowerCase()})`;
  const date = nzDate(to);
  const rows = [['*Narration', '*Date', 'Description', '*AccountCode', '*TaxRate', '*Amount', 'TrackingName1', 'TrackingOption1', 'TrackingName2', 'TrackingOption2']];
  for (const t of claim) rows.push([narration, date, `${longDate(t.date)}: ${t.purpose} (${t.destination}), ${t.km} km, ${t.tier}`, s.debit, s.tax, t.amount.toFixed(2), '', '', '', '']);
  const total = claim.reduce((a, t) => a + Math.round(t.amount * 100), 0) / 100;
  rows.push([narration, date, `Mileage claim: ${claim.length} trip${claim.length === 1 ? '' : 's'}, ${Math.round(claim.reduce((a, t) => a + t.km, 0) * 10) / 10} km`, s.credit, s.tax, (-total).toFixed(2), '', '', '', '']);
  return csv(rows);
}

/** The trip log to keep as the IRD record. */
export function logCsv(trips, s) {
  const rows = [['Date', 'Purpose', 'From', 'To', 'Km (return)', 'Rate per km', 'Tier', 'Claim', 'Note']];
  for (const t of trips.filter((x) => !x.skip)) rows.push([t.date, t.purpose, s.base || 'Base', t.destination, t.km ?? '', t.rate ? t.rate.toFixed(2) : '', t.tier, t.amount ? t.amount.toFixed(2) : '', t.note]);
  return csv(rows);
}
