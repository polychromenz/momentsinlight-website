// The studio's link to Xero (docs: Studio money plan, Oct 2026; Studio > Payments > Xero).
// The studio stays the place invoices are made and sent; it copies each one into Xero. How payments
// are reconciled is settings.style:
//   'match' (default, Tony's accountant's way): Tony reconciles in Xero as before. On a Stripe payout's
//            BNZ line he uses Find & Match on the invoices it covers and adds the total Stripe fee as a
//            bank fee adjustment (500 Stripe Fees, No GST); bank transfers match their invoice. The
//            studio only sends invoices, shows which invoices and fees make up each payout, and marks
//            invoices paid in the studio when Xero shows them paid.
//   'clearing': the studio also records payments, fees and payouts through a Stripe account in Xero:
//   invoice       a sales invoice (same number, GST inclusive) for the couple's contact
//   payment       the invoice paid: card payments into the Stripe account in Xero, bank transfers into the bank account
//   fee           Stripe's fee, spent from the Stripe account
//   payout        a transfer from the Stripe account to the bank account, the exact amount Stripe paid out
//   paid_in_xero  a bank transfer Tony reconciled in Xero: the studio marks the invoice paid (sends the receipt)
// Every one waits in xero_queue for Tony's approval until he ticks "send without asking" for that kind.
// Needs the Cloudflare secrets XERO_CLIENT_ID and XERO_CLIENT_SECRET (a Xero app at developer.xero.com
// with the redirect address below); then Tony clicks Connect. Jobs on hold (the Studio Ninja import) are left out.
import { money, markPaid } from './invoices.js';

export const SITE = 'https://www.momentsinlight.co.nz';
export const REDIRECT = `${SITE}/api/studio/xero/callback`;
// Xero's granular scopes (apps made from March 2026).
export const SCOPES = ['offline_access', 'accounting.invoices', 'accounting.payments', 'accounting.banktransactions', 'accounting.contacts', 'accounting.settings.read', 'accounting.manualjournals'];
export const KINDS = { invoice: 'Invoices', payment: 'Payments', fee: 'Stripe fees', payout: 'Stripe payouts', paid_in_xero: 'Paid in Xero' };
const API = 'https://api.xero.com/api.xro/2.0';

export const xeroReady = (env) => !!(env.XERO_CLIENT_ID && env.XERO_CLIENT_SECRET);

// ---- Settings ----
const DEFAULTS = {
  style: 'match',          // 'match' (reconcile in Xero, the accountant's way) or 'clearing' (see above)
  start: '',               // only invoices sent from this date (YYYY-MM-DD) go to Xero
  sales_code: '200', sales_tax: 'OUTPUT2', // Sales, 15% GST on income
  bank_code: '',           // your business bank account in Xero
  clearing_code: '',       // a bank account in Xero called "Stripe" (money held at Stripe)
  fees_code: '500', fees_tax: 'NONE',      // 500 Stripe Fees, No GST (Tony's accountant)
  auto: { invoice: false, payment: false, fee: false, payout: false, paid_in_xero: false },
};
export async function xeroSettings(db) {
  const r = await db.prepare(`SELECT value FROM settings WHERE key = 'xero'`).first();
  const v = r ? JSON.parse(r.value) : {};
  return { ...DEFAULTS, ...v, auto: { ...DEFAULTS.auto, ...(v.auto ?? {}) } };
}
export async function saveXeroSettings(db, d) {
  const s = await xeroSettings(db);
  const code = (v, was) => (v === undefined ? was : String(v).trim().slice(0, 40)); // (account ids are 36 characters)
  const next = {
    style: ['match', 'clearing'].includes(d.style) ? d.style : s.style,
    start: /^\d{4}-\d{2}-\d{2}$/.test(d.start ?? '') ? d.start : s.start,
    sales_code: code(d.sales_code, s.sales_code), sales_tax: code(d.sales_tax, s.sales_tax),
    bank_code: code(d.bank_code, s.bank_code), clearing_code: code(d.clearing_code, s.clearing_code),
    fees_code: code(d.fees_code, s.fees_code), fees_tax: code(d.fees_tax, s.fees_tax),
    auto: Object.fromEntries(Object.keys(DEFAULTS.auto).map((k) => [k, d.auto?.[k] !== undefined ? !!d.auto[k] : s.auto[k]])),
  };
  await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('xero', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`)
    .bind(JSON.stringify(next), new Date().toISOString()).run();
  return next;
}

// ---- The connection (refresh token kept encrypted; Xero gives a new one each refresh) ----
const enc = new TextEncoder();
const b64 = (u) => { let s = ''; for (const c of new Uint8Array(u)) s += String.fromCharCode(c); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function key(env) {
  const base = await crypto.subtle.importKey('raw', enc.encode(env.XERO_CLIENT_SECRET), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('moments-studio-xero'), info: enc.encode('refresh-token') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function seal(env, text) { const iv = crypto.getRandomValues(new Uint8Array(12)); return `${b64(iv)}.${b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(env), enc.encode(text)))}`; }
async function open(env, v) { const [iv, d] = v.split('.'); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await key(env), unb64(d))); }

export async function xeroConnection(db) {
  const r = await db.prepare(`SELECT value FROM settings WHERE key = 'xero_conn'`).first();
  return r ? JSON.parse(r.value) : null;
}
async function saveConn(db, v) {
  if (!v) return db.prepare(`DELETE FROM settings WHERE key = 'xero_conn'`).run();
  await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('xero_conn', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`)
    .bind(JSON.stringify(v), new Date().toISOString()).run();
}
export const disconnect = (db) => saveConn(db, null);

/** Connected to Xero's Demo Company (for safety testing): Stripe test payments count too. */
export async function isDemo(db) {
  return /^demo company/i.test((await xeroConnection(db))?.tenant_name ?? '');
}

/** A different Xero organisation: forget everything sent to the last one, so nothing is skipped as "already in Xero". */
async function forgetOtherOrg(db) {
  await db.batch([
    db.prepare('DELETE FROM xero_queue'),
    db.prepare('UPDATE invoices SET xero_invoice_id = NULL, xero_payment_id = NULL WHERE xero_invoice_id IS NOT NULL OR xero_payment_id IS NOT NULL'),
    db.prepare('UPDATE stripe_payouts SET xero_transfer_id = NULL WHERE xero_transfer_id IS NOT NULL'),
    db.prepare(`UPDATE settings SET value = json_set(value, '$.start', '') WHERE key = 'xero'`),
  ]);
}

const basic = (env) => `Basic ${btoa(`${env.XERO_CLIENT_ID}:${env.XERO_CLIENT_SECRET}`)}`;
/** After Tony allows the studio in Xero: swap the code for tokens and pick his organisation. */
export async function finishConnect(env, code) {
  const r = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST', headers: { authorization: basic(env), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.refresh_token) throw new Error(`Xero said ${r.status}: ${d.error ?? ''}`);
  const orgs = await (await fetch('https://api.xero.com/connections', { headers: { authorization: `Bearer ${d.access_token}` } })).json().catch(() => []);
  // With both the Demo Company and the real books allowed, the real ones win.
  const all = (orgs ?? []).filter((o) => o.tenantType === 'ORGANISATION');
  const org = all.find((o) => !/^demo company/i.test(o.tenantName ?? '')) ?? all[0] ?? orgs?.[0];
  if (!org) throw new Error('No Xero organisation was shared with the studio.');
  const before = await xeroConnection(env.DB);
  if (before?.tenant_id && before.tenant_id !== org.tenantId) await forgetOtherOrg(env.DB);
  await saveConn(env.DB, { refresh: await seal(env, d.refresh_token), tenant_id: org.tenantId, tenant_name: org.tenantName, connected_at: new Date().toISOString() });
  cached = { token: d.access_token, until: Date.now() + (d.expires_in - 120) * 1000 };
  return org.tenantName;
}

let cached = { token: '', until: 0 };
async function token(env) {
  if (cached.token && Date.now() < cached.until) return cached.token;
  const c = await xeroConnection(env.DB);
  if (!c?.refresh) throw new Error('Xero isn’t connected.');
  const r = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST', headers: { authorization: basic(env), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: await open(env, c.refresh) }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (d.error === 'invalid_grant') { await saveConn(env.DB, { ...c, refresh: null, expired: new Date().toISOString() }); throw new Error('The Xero connection has expired (60 days unused, or disconnected in Xero). Click Connect again.'); }
    throw new Error(`Xero sign-in said ${r.status}: ${d.error ?? ''}`);
  }
  await saveConn(env.DB, { ...c, refresh: await seal(env, d.refresh_token), refreshed_at: new Date().toISOString() });
  cached = { token: d.access_token, until: Date.now() + (d.expires_in - 120) * 1000 };
  return cached.token;
}

/** A Xero Accounting API call. Throws with Xero's own validation messages. */
export async function xero(env, method, path, body) {
  const c = await xeroConnection(env.DB);
  const r = await fetch(`${API}${path}`, {
    method, headers: { authorization: `Bearer ${await token(env)}`, 'xero-tenant-id': c.tenant_id, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) throw new Error('Xero didn’t allow that: click Connect on the Xero page again and allow everything it asks for (journals were added later).');
  if (!r.ok) {
    const errs = [d.Message, ...(d.Elements ?? []).flatMap((e) => (e.ValidationErrors ?? []).map((v) => v.Message))].filter(Boolean);
    throw new Error(`Xero: ${errs.join(' ') || r.status}`);
  }
  return d;
}

// ---- What's waiting ----
const day = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });

/** Add anything new to the queue. */
export async function queueNew(env) {
  const db = env.DB;
  const s = await xeroSettings(db);
  if (!s.start) return 0;
  // The start date is a NZ date; invoice times are stored in UTC.
  const nzMidnight = (() => { const g = new Date(`${s.start}T00:00:00Z`); const nz = new Date(g.toLocaleString('en-US', { timeZone: 'Pacific/Auckland' })); const utc = new Date(g.toLocaleString('en-US', { timeZone: 'UTC' })); return new Date(g.valueOf() - (nz - utc)).toISOString(); })();
  const now = new Date().toISOString();
  const add = (kind, ref, summary) => db.prepare(`INSERT OR IGNORE INTO xero_queue (kind, ref, summary, created_at) VALUES (?1, ?2, ?3, ?4)`).bind(kind, String(ref), summary, now);
  const base = `FROM invoices i JOIN jobs j ON j.id = i.job_id JOIN clients c ON c.id = j.client_id WHERE COALESCE(j.hold, 0) = 0 AND c.test = 0 AND COALESCE(i.sent_at, i.paid_at, i.created_at) >= ?1`; // (an invoice paid before it was emailed has no sent_at)
  const name = (r) => `${r.first_name} ${r.last_name}`.trim();
  // Real card payments only, except while testing with Xero's Demo Company.
  const live = (await isDemo(db)) ? '1 = 1' : 'i.stripe_live = 1';
  const inv = (await db.prepare(`SELECT i.id, i.number, i.label, i.amount, c.first_name, c.last_name ${base} AND i.status IN ('sent', 'paid') AND i.xero_invoice_id IS NULL`).bind(nzMidnight).all()).results;
  const pay = (await db.prepare(`SELECT i.id, i.number, i.amount, i.paid_method, c.first_name, c.last_name ${base} AND i.status = 'paid' AND i.xero_invoice_id IS NOT NULL AND i.xero_payment_id IS NULL
      AND (i.paid_method <> 'card' OR ${live})`).bind(nzMidnight).all()).results;
  const fee = (await db.prepare(`SELECT i.id, i.number, i.stripe_fee ${base} AND i.paid_method = 'card' AND ${live} AND i.stripe_fee > 0 AND i.xero_payment_id IS NOT NULL`).bind(nzMidnight).all()).results;
  const out = (await db.prepare(`SELECT * FROM stripe_payouts WHERE xero_transfer_id IS NULL AND arrival_date >= ?1`).bind(s.start).all()).results;
  // The accountant's way: Tony reconciles payments in Xero himself, so only invoices go.
  if (s.style !== 'clearing') { pay.length = 0; fee.length = 0; out.length = 0; }
  const stmts = [
    ...inv.map((r) => add('invoice', r.id, `Invoice ${r.number}: ${r.label}, ${money(r.amount)} to ${name(r)}`)),
    ...pay.map((r) => add('payment', r.id, `${r.number} paid ${money(r.amount)} by ${r.paid_method === 'card' ? 'card, into the Stripe account' : 'bank transfer, into the bank account'} (${name(r)})`)),
    ...fee.map((r) => add('fee', r.id, `Stripe fee ${money(r.stripe_fee)} on ${r.number}`)),
    ...out.map((p) => add('payout', p.id, `Stripe payout ${money(p.amount)} to the bank on ${p.arrival_date} (${p.payments} payment${p.payments === 1 ? '' : 's'}, ${money(p.fees)} fees${p.other ? `, ${money(p.other)} other` : ''})${p.unmatched ? `: ${p.unmatched} payment${p.unmatched === 1 ? '' : 's'} not from a studio invoice` : ''}`)),
  ];
  // Ticked as a test client after they were queued: take them off the list.
  stmts.push(db.prepare(`DELETE FROM xero_queue WHERE status <> 'done' AND kind IN ('invoice', 'payment', 'fee', 'paid_in_xero')
    AND CAST(ref AS INTEGER) IN (SELECT i.id FROM invoices i JOIN jobs j ON j.id = i.job_id JOIN clients c ON c.id = j.client_id WHERE c.test = 1)`));
  for (let n = 0; n < stmts.length; n += 50) await db.batch(stmts.slice(n, n + 50));
  return stmts.length - 1;
}

/** Invoices Tony reconciled in Xero (bank transfers): queue "mark paid in the studio". Hourly. */
/**
 * Which of a Xero invoice's open studio instalments Xero shows as paid. Studio Ninja put the whole
 * booking on one Xero invoice, paid in parts; the studio has an invoice per instalment. What Xero says
 * is still owing belongs to the latest instalments, so the earlier ones are the paid ones.
 * rows: the open (sent/scheduled) studio invoices linked to it; x: Xero's invoice (Status, AmountDue).
 */
export function settledShare(rows, x) {
  if (x.Status === 'PAID') return rows;
  if (rows.length < 2) return []; // its own Xero invoice: only paid once Xero says PAID
  let owing = Math.round((x.AmountDue ?? 0) * 100);
  const latestFirst = [...rows].sort((a, b) => String(b.due_date ?? b.send_at ?? '').localeCompare(String(a.due_date ?? a.send_at ?? '')) || b.id - a.id);
  const paid = [];
  for (const r of latestFirst) {
    if (owing >= r.amount) owing -= r.amount;
    else paid.push(r);
  }
  return paid;
}

export async function checkPaidInXero(env) {
  const db = env.DB;
  const open = (await db.prepare(`SELECT id, number, amount, due_date, send_at, status, xero_invoice_id FROM invoices WHERE status IN ('sent', 'scheduled') AND xero_invoice_id IS NOT NULL AND xero_invoice_id <> 'xero' LIMIT 60`).all()).results;
  if (!open.length) return 0;
  const ids = [...new Set(open.map((i) => i.xero_invoice_id))].slice(0, 40);
  const d = await xero(env, 'GET', `/Invoices?IDs=${ids.join(',')}&summaryOnly=true`);
  const now = new Date().toISOString();
  let n = 0;
  for (const x of d.Invoices ?? []) {
    for (const i of settledShare(open.filter((o) => o.xero_invoice_id === x.InvoiceID), x)) {
      if (i.status !== 'sent') continue; // a scheduled one paid early waits until it's sent
      n++;
      await db.prepare(`INSERT OR IGNORE INTO xero_queue (kind, ref, summary, created_at) VALUES ('paid_in_xero', ?1, ?2, ?3)`)
        .bind(String(i.id), `Xero shows ${i.number} (${money(i.amount)}) paid: mark it paid in the studio and send the receipt`, now).run();
    }
  }
  return n;
}

// ---- Doing each one ----
// Bank accounts in Xero often have no code, so they're kept by Xero's account id.
const acct = (v) => (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(v) ? { AccountID: v } : { Code: v });
async function contactFor(env, inv) {
  const email = String(inv.email ?? '').trim();
  const name = `${inv.first_name} ${inv.last_name}`.trim() || email;
  if (email) {
    const found = await xero(env, 'GET', `/Contacts?where=${encodeURIComponent(`EmailAddress=="${email.replace(/"/g, '')}"`)}`);
    if (found.Contacts?.[0]) return found.Contacts[0].ContactID;
  }
  const make = async (n) => (await xero(env, 'PUT', '/Contacts', { Contacts: [{ Name: n, FirstName: inv.first_name, LastName: inv.last_name, EmailAddress: email, ...(inv.address ? { Addresses: [{ AddressType: 'POBOX', AddressLine1: String(inv.address).replace(/\s*\n\s*/g, ', ').slice(0, 500) }] } : {}) }] })).Contacts[0].ContactID;
  try { return await make(name); } catch (e) {
    // Xero contact names must be unique: another person with the same name.
    if (/already/i.test(e.message)) return make(`${name} (${email})`);
    throw e;
  }
}

async function doItem(env, q, s) {
  const db = env.DB;
  if (q.kind === 'payout') {
    const p = await db.prepare('SELECT * FROM stripe_payouts WHERE id = ?1').bind(q.ref).first();
    if (!s.clearing_code || !s.bank_code) throw new Error('Choose the Stripe and bank accounts in the Xero settings first.');
    const d = await xero(env, 'PUT', '/BankTransfers', { BankTransfers: [{ FromBankAccount: acct(s.clearing_code), ToBankAccount: acct(s.bank_code), Amount: p.amount / 100, Date: p.arrival_date, Reference: `Stripe payout ${p.id}` }] });
    const id = d.BankTransfers[0].BankTransferID;
    await db.prepare('UPDATE stripe_payouts SET xero_transfer_id = ?2 WHERE id = ?1').bind(p.id, id).run();
    return id;
  }
  const inv = await db.prepare(`SELECT i.*, j.title job_title, c.first_name, c.last_name, c.email, c.address, c.test FROM invoices i JOIN jobs j ON j.id = i.job_id JOIN clients c ON c.id = j.client_id WHERE i.id = ?1`).bind(Number(q.ref)).first();
  if (!inv) throw new Error('That invoice isn’t in the studio any more.');
  if (inv.test) throw new Error('A test client: never sent to Xero.');
  if (q.kind === 'invoice') {
    if (inv.xero_invoice_id) return inv.xero_invoice_id;
    // Already in Xero (made by hand, or an earlier try that timed out)? Link to it rather than make a second.
    const have = await xero(env, 'GET', `/Invoices?InvoiceNumbers=${encodeURIComponent(inv.number)}&summaryOnly=true`);
    let id = have.Invoices?.find((x) => x.Status !== 'DELETED' && x.Status !== 'VOIDED')?.InvoiceID;
    if (!id) {
      const contact = await contactFor(env, inv);
      const d = await xero(env, 'PUT', '/Invoices', { Invoices: [{
        Type: 'ACCREC', Contact: { ContactID: contact }, InvoiceNumber: inv.number, Reference: inv.job_title,
        Date: day(inv.sent_at ?? inv.paid_at ?? inv.created_at), DueDate: inv.due_date, LineAmountTypes: 'Inclusive', Status: 'AUTHORISED',
        LineItems: [{ Description: [inv.label, inv.description].filter(Boolean).join(': '), Quantity: 1, UnitAmount: inv.amount / 100, AccountCode: s.sales_code, TaxType: s.sales_tax }],
      }] });
      id = d.Invoices[0].InvoiceID;
    }
    await db.prepare('UPDATE invoices SET xero_invoice_id = ?2 WHERE id = ?1').bind(inv.id, id).run();
    return id;
  }
  if (q.kind === 'payment') {
    if (inv.xero_payment_id) return inv.xero_payment_id;
    const into = inv.paid_method === 'card' ? s.clearing_code : s.bank_code;
    if (!into) throw new Error(`Choose the ${inv.paid_method === 'card' ? 'Stripe' : 'bank'} account in the Xero settings first.`);
    const d = await xero(env, 'PUT', '/Payments', { Payments: [{ Invoice: { InvoiceID: inv.xero_invoice_id }, Account: acct(into), Date: day(inv.paid_at), Amount: inv.amount / 100,
      Reference: inv.paid_method === 'card' ? `Stripe ${inv.stripe_payment ?? ''}`.trim() : inv.paid_note || 'Bank transfer' }] });
    const id = d.Payments[0].PaymentID;
    await db.prepare('UPDATE invoices SET xero_payment_id = ?2 WHERE id = ?1').bind(inv.id, id).run();
    return id;
  }
  if (q.kind === 'fee') {
    if (!s.clearing_code) throw new Error('Choose the Stripe account in the Xero settings first.');
    const d = await xero(env, 'PUT', '/BankTransactions', { BankTransactions: [{ Type: 'SPEND', Contact: { Name: 'Stripe' }, BankAccount: acct(s.clearing_code), Date: day(inv.paid_at),
      Reference: `Stripe fee ${inv.number}`, LineAmountTypes: 'Inclusive', LineItems: [{ Description: `Stripe fee on invoice ${inv.number}`, Quantity: 1, UnitAmount: inv.stripe_fee / 100, AccountCode: s.fees_code, TaxType: s.fees_tax }] }] });
    return d.BankTransactions[0].BankTransactionID;
  }
  if (q.kind === 'paid_in_xero') {
    if (inv.status === 'paid') return 'already';
    await markPaid(env, inv, { method: 'bank', note: 'Reconciled in Xero' });
    await db.prepare(`UPDATE invoices SET xero_payment_id = 'xero' WHERE id = ?1`).bind(inv.id).run();
    return 'marked';
  }
  throw new Error(`Unknown kind ${q.kind}`);
}

// Invoices must be in Xero before their payments, payments before fees.
const ORDER = { invoice: 1, paid_in_xero: 2, payment: 3, fee: 4, payout: 5 };

/** Send the approved ones (and any kind set to "send without asking"). */
export async function processQueue(env, limit = 12) {
  const db = env.DB;
  const s = await xeroSettings(db);
  const auto = Object.entries(s.auto).filter(([, on]) => on).map(([k]) => k);
  const rows = (await db.prepare(`SELECT * FROM xero_queue WHERE status = 'approved' OR (status = 'pending' AND kind IN (${auto.map((k) => `'${k}'`).join(',') || "''"})) ORDER BY id`).all()).results
    .sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.id - b.id).slice(0, limit);
  let done = 0, failed = 0;
  for (const q of rows) {
    try {
      const id = await doItem(env, q, s);
      await db.prepare(`UPDATE xero_queue SET status = 'done', xero_id = ?2, error = NULL, done_at = ?3 WHERE id = ?1`).bind(q.id, String(id), new Date().toISOString()).run();
      done++;
    } catch (e) {
      await db.prepare(`UPDATE xero_queue SET status = 'failed', error = ?2 WHERE id = ?1`).bind(q.id, String(e.message).slice(0, 500)).run();
      failed++;
    }
  }
  return { done, failed };
}

/** The timer's step: queue what's new, send what's approved, and hourly look for invoices paid in Xero. */
export async function xeroTimer(env) {
  if (!xeroReady(env)) return 'no keys';
  const c = await xeroConnection(env.DB);
  if (!c?.refresh) return 'not connected';
  const queued = await queueNew(env);
  let paid = 0;
  if (new Date().getUTCMinutes() < 5) paid = await checkPaidInXero(env).catch((e) => { console.error('xero: paid check', e.message); return 0; });
  const r = await processQueue(env);
  return `${queued} queued, ${paid} paid in Xero, ${r.done} sent, ${r.failed} failed`;
}

/** Xero's accounts and tax rates, for the settings' choices. */
export async function xeroChoices(env) {
  const [a, t] = await Promise.all([xero(env, 'GET', '/Accounts?where=Status%3D%3D%22ACTIVE%22'), xero(env, 'GET', '/TaxRates')]);
  return {
    accounts: (a.Accounts ?? []).map((x) => ({ id: x.AccountID, code: x.Code ?? '', name: x.Name, type: x.Type, cls: x.Class, bank: x.Type === 'BANK' })),
    taxes: (t.TaxRates ?? []).filter((x) => x.Status === 'ACTIVE').map((x) => ({ type: x.TaxType, name: x.Name, rate: x.EffectiveRate })),
  };
}
