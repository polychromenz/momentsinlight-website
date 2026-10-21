// Bank reconciliation helper (Studio > Payments > Reconcile). Tony's way of reconciling, from his
// accountant (OneDrive "Accounts processing examples.docx"): each Stripe payout on the BNZ statement is
// matched to the invoices it paid (part-payments split), with the Stripe fees as an adjustment to
// 500 Stripe Fees (No GST); bank transfers from couples are matched to their invoices; everything else
// is coded. It took hours and was fiddly.
//
// Xero won't let an app click Reconcile on a bank statement line, so the studio does everything behind
// it: from Tony's BNZ export and the Stripe payout report it builds a plan for every line, he approves
// it, and the studio creates the matching transactions in Xero, each the exact amount and date of its
// bank line, so Xero's Reconcile screen offers it and Tony just clicks OK down the list.
//
//   Stripe payout  -> a payment on each invoice into the "Stripe" clearing bank account (gross), the
//                     fees as a spend from it (500 Stripe Fees, No GST), and a transfer of the net from
//                     it to BNZ: the BNZ line matches the transfer.
//   From a couple  -> a payment on their invoice into BNZ.
//   Anything else  -> a spend or receive money on BNZ, coded the way that payee was coded before.
//   Already there  -> left alone (anything already in Xero for that amount and date, reconciled or not).
// Nothing goes to Xero until Tony approves; everything made carries the run's reference and can be
// undone (transfers by hand: Xero's API can't delete them).
import { xero, xeroSettings, xeroChoices } from './xero.js';

// ---- Reading the exports ----
/** A CSV file as rows of fields (quotes, commas and newlines inside quotes handled). */
export function parseCsv(text) {
  const rows = [];
  let row = [], f = '', q = false;
  const s = String(text ?? '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { f += '"'; i++; }
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(f); f = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else f += c;
  }
  row.push(f);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}
const cents = (v) => {
  const t = String(v ?? '').replace(/[^0-9.()-]/g, '');
  if (!t) return null;
  const neg = /^\(.*\)$/.test(t) || t.startsWith('-');
  const n = Number(t.replace(/[()-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) * (neg ? -1 : 1) : null;
};
/** "21/11/2025", "21/11/25", "2025-11-21", "2025/11/21", "21 Nov 2025" -> "2025-11-21". */
export function isoDate(v) {
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(s);
  return Number.isNaN(d.valueOf()) ? null : d.toISOString().slice(0, 10);
}
const col = (head, ...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };

/** The bank export (BNZ's CSV, or similar): [{ n, date, amount (cents, + in / - out), payee, details }]. */
export function readBank(text) {
  const rows = parseCsv(text);
  const at = rows.findIndex((r) => r.some((x) => /^date$/i.test(x.trim())));
  if (at < 0) throw new Error('The bank file has no "Date" column. Export it as CSV from BNZ internet banking.');
  const head = rows[at].map((x) => x.trim().toLowerCase());
  const c = {
    date: col(head, 'date', 'transaction date'), amount: col(head, 'amount'), debit: col(head, 'debit', 'withdrawal', 'withdrawals'), credit: col(head, 'credit', 'deposit', 'deposits'),
    payee: col(head, 'payee', 'other party', 'description', 'details', 'payee name'), part: col(head, 'particulars'), code: col(head, 'code', 'analysis code'),
    ref: col(head, 'reference'), type: col(head, 'tran type', 'type', 'transaction type'),
  };
  const out = [];
  for (const r of rows.slice(at + 1)) {
    const date = isoDate(r[c.date]);
    let amount = c.amount >= 0 ? cents(r[c.amount]) : null;
    if (amount == null && (c.debit >= 0 || c.credit >= 0)) amount = (cents(r[c.credit]) ?? 0) - Math.abs(cents(r[c.debit]) ?? 0);
    if (!date || !amount) continue;
    const pick = (i) => (i >= 0 ? String(r[i] ?? '').trim() : '');
    out.push({ n: out.length + 1, date, amount, payee: pick(c.payee), details: [pick(c.part), pick(c.code), pick(c.ref)].filter(Boolean).join(' · '), type: pick(c.type) });
  }
  if (!out.length) throw new Error('No transactions were found in the bank file.');
  return out;
}

/** Stripe's payout reconciliation report (or balance history with the payout column): payouts with their charges and fees. */
export function readStripe(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('The Stripe file is empty.');
  const head = rows[0].map((x) => x.trim().toLowerCase());
  const c = {
    payout: col(head, 'automatic_payout_id', 'payout_id', 'transfer', 'payout'), payoutAt: col(head, 'automatic_payout_effective_at', 'automatic_payout_effective_at_utc', 'payout_expected_arrival_date'),
    gross: col(head, 'gross', 'amount'), fee: col(head, 'fee'), net: col(head, 'net'), cat: col(head, 'reporting_category', 'type'),
    desc: col(head, 'description'), when: col(head, 'created_utc', 'created', 'created (utc)', 'created_at'), email: col(head, 'customer_email'),
  };
  if (c.payout < 0) throw new Error('The Stripe file has no payout column. Use Stripe’s “Payout reconciliation” report (itemised).');
  const payouts = new Map();
  for (const r of rows.slice(1)) {
    const id = String(r[c.payout] ?? '').trim();
    if (!id) continue;
    const p = payouts.get(id) ?? { id, date: null, net: 0, fee: 0, items: [] };
    const item = { category: String(r[c.cat] ?? '').toLowerCase(), gross: cents(r[c.gross]) ?? 0, fee: Math.abs(cents(r[c.fee]) ?? 0), net: cents(r[c.net]) ?? 0,
      desc: String(r[c.desc] ?? ''), date: isoDate(r[c.when]), email: c.email >= 0 ? String(r[c.email] ?? '') : '' };
    item.invoice = item.desc.match(/invoice\s*#?\s*([A-Za-z0-9-]+)/i)?.[1] ?? null;
    p.items.push(item);
    p.net += item.net; p.fee += item.fee;
    p.date = isoDate(r[c.payoutAt]) ?? (item.date && (!p.date || item.date > p.date) ? item.date : p.date);
    payouts.set(id, p);
  }
  if (!payouts.size) throw new Error('No payouts were found in the Stripe file.');
  return [...payouts.values()];
}

// ---- Xero ----
const xeroDate = (v) => {
  const m = String(v ?? '').match(/\/Date\((\d+)/);
  return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : isoDate(v);
};
const dt = (iso) => `DateTime(${iso.slice(0, 4)},${iso.slice(5, 7)},${iso.slice(8, 10)})`;
const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
async function pages(env, path, key, max = 10) {
  const out = [];
  for (let page = 1; page <= max; page++) {
    const d = await xero(env, 'GET', `${path}${path.includes('?') ? '&' : '?'}page=${page}`);
    const list = d[key] ?? [];
    out.push(...list);
    if (list.length < 100) break;
  }
  return out;
}
const where = (s) => `where=${encodeURIComponent(s)}`;

async function xeroData(env, from, to) {
  const s = await xeroSettings(env.DB);
  // One call first, so the sign-in is refreshed once (Xero's refresh tokens work once only) before the calls in parallel.
  await xero(env, 'GET', '/Organisation');
  const choices = await xeroChoices(env);
  const [invoices, txns, payments, transfers, history] = await Promise.all([
    pages(env, `/Invoices?${where(`Type=="ACCREC"&&Date>=${dt(addDays(from, -730))}`)}&Statuses=AUTHORISED,PAID&summaryOnly=true`, 'Invoices', 15),
    pages(env, `/BankTransactions?${where(`Date>=${dt(addDays(from, -10))}&&Date<=${dt(addDays(to, 10))}`)}`, 'BankTransactions'),
    pages(env, `/Payments?${where(`Date>=${dt(addDays(from, -45))}&&Date<=${dt(addDays(to, 10))}`)}`, 'Payments'),
    pages(env, `/BankTransfers?${where(`Date>=${dt(addDays(from, -10))}&&Date<=${dt(addDays(to, 10))}`)}`, 'BankTransfers', 3),
    pages(env, `/BankTransactions?${where(`Date>=${dt(addDays(to, -550))}&&Date<${dt(from)}`)}`, 'BankTransactions', 8),
  ]);
  return { s, choices, invoices, txns, payments, transfers, history };
}

// ---- Planning ----
const norm = (t) => String(t ?? '').toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
const payeeKey = (t) => norm(t).split(' ').filter((w) => w.length > 1).slice(0, 3).join(' ');
const near = (a, b, days) => Math.abs(Date.parse(a) - Date.parse(b)) <= days * 86400_000;
const money = (c) => `$${(Math.abs(c) / 100).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Build the plan for a period from the bank lines, Stripe payouts and what's in Xero. */
export async function buildPlan(env, { from, to, bank, stripe }, data = null) {
  const X = data ?? await xeroData(env, from, to); // (data: for testing without Xero)
  const bankId = X.s.bank_code, clearingId = X.s.clearing_code;
  const acct = new Map(X.choices.accounts.map((a) => [a.code, a]));
  const lines = bank.filter((l) => l.date >= from && l.date <= to);

  // What's already in Xero on the bank account (reconciled or not): signed cents and date.
  const existing = [
    ...X.txns.filter((t) => t.BankAccount?.AccountID === bankId && t.Status !== 'DELETED').map((t) => ({ amount: Math.round(t.Total * 100) * (/SPEND/.test(t.Type) ? -1 : 1), date: xeroDate(t.DateString ?? t.Date), what: `${t.Contact?.Name ?? ''} ${t.Reference ?? ''}`.trim() })),
    ...X.payments.filter((p) => p.Account?.AccountID === bankId && p.Status !== 'DELETED').map((p) => ({ amount: Math.round(p.Amount * 100) * (p.PaymentType === 'ACCPAYPAYMENT' ? -1 : 1), date: xeroDate(p.Date), what: `Payment ${p.Invoice?.InvoiceNumber ?? ''}` })),
    ...X.transfers.flatMap((t) => [
      t.ToBankAccount?.AccountID === bankId && { amount: Math.round(t.Amount * 100), date: xeroDate(t.DateString ?? t.Date), what: `Transfer from ${t.FromBankAccount?.Name ?? ''}` },
      t.FromBankAccount?.AccountID === bankId && { amount: -Math.round(t.Amount * 100), date: xeroDate(t.DateString ?? t.Date), what: `Transfer to ${t.ToBankAccount?.Name ?? ''}` },
    ].filter(Boolean)),
  ];
  const claimed = new Set();
  const already = (l) => {
    const i = existing.findIndex((e, k) => !claimed.has(k) && e.amount === l.amount && near(e.date, l.date, 3));
    if (i < 0) return null;
    claimed.add(i);
    return existing[i];
  };
  // Payments already on an invoice (any account), so a payout isn't applied twice.
  const paidOn = (invoiceId, amount, date) => X.payments.some((p) => p.Invoice?.InvoiceID === invoiceId && p.Status !== 'DELETED' && Math.round(p.Amount * 100) === amount && near(xeroDate(p.Date), date, 30));
  const invByNo = new Map(X.invoices.map((i) => [String(i.InvoiceNumber).toLowerCase(), i]));
  // How each payee was coded before (most common account and tax).
  const coded = new Map();
  for (const t of X.history) {
    if (t.BankAccount?.AccountID !== bankId || t.Status === 'DELETED' || !t.LineItems?.length) continue;
    const li = t.LineItems[0];
    if (!li.AccountCode) continue;
    for (const k of [payeeKey(t.Contact?.Name), payeeKey(t.Reference)].filter(Boolean)) {
      const m = coded.get(k) ?? new Map();
      const v = `${li.AccountCode}|${li.TaxType ?? ''}|${t.Contact?.Name ?? ''}`;
      m.set(v, (m.get(v) ?? 0) + 1);
      coded.set(k, m);
    }
  }
  const codingFor = (l) => {
    for (const k of [payeeKey(l.payee), payeeKey(`${l.payee} ${l.details}`), payeeKey(l.details)]) {
      const m = k && coded.get(k);
      if (m) { const [v] = [...m.entries()].sort((a, b) => b[1] - a[1])[0]; const [code, tax, contact] = v.split('|'); return { code, tax, contact: contact || l.payee }; }
    }
    return null;
  };
  const usedPayouts = new Set();

  const plan = lines.map((l) => {
    const line = { ...l, kind: 'other', status: 'check', note: '', actions: [] };
    const text = `${l.payee} ${l.details}`;
    const ex = already(l);
    if (ex) return { ...line, kind: 'done', status: 'done', note: `Already in Xero (${ex.what || 'a transaction'}, ${ex.date}): reconcile it as it is.` };

    // A Stripe payout (Studio Ninja's account paid out as "STUDIO NINJA TRF …", or Stripe's own).
    if (l.amount > 0 && /stripe|studio\s*ninja/i.test(text)) {
      line.kind = 'payout';
      const p = (stripe ?? []).filter((x) => !usedPayouts.has(x.id) && Math.abs(x.net - l.amount) <= 1 && (!x.date || near(x.date, l.date, 7)))
        .sort((a, b) => Math.abs(Date.parse(a.date ?? l.date) - Date.parse(l.date)) - Math.abs(Date.parse(b.date ?? l.date) - Date.parse(l.date)))[0];
      if (!p) return { ...line, note: stripe?.length ? 'No Stripe payout of this amount near this date in the Stripe file.' : 'Add the Stripe payout report to plan this one.' };
      usedPayouts.add(p.id);
      if (!clearingId) return { ...line, note: 'Choose the Stripe clearing account in Xero first (see the top of this page).' };
      const charges = p.items.filter((i) => i.gross > 0 && /charge|payment/.test(i.category || 'charge'));
      const odd = p.items.filter((i) => !(i.gross > 0 && /charge|payment/.test(i.category || 'charge')) && i.net !== 0);
      const problems = [];
      const pays = [];
      for (const ch of charges) {
        const inv = ch.invoice && invByNo.get(ch.invoice.toLowerCase());
        if (!inv) { problems.push(`${money(ch.gross)} for invoice ${ch.invoice ?? '(no number)'}: not found in Xero`); continue; }
        if (paidOn(inv.InvoiceID, ch.gross, ch.date ?? l.date)) { pays.push({ t: 'skip', note: `${inv.InvoiceNumber} ${money(ch.gross)} already applied in Xero` }); continue; }
        pays.push({ t: 'payment', invoice_id: inv.InvoiceID, invoice: inv.InvoiceNumber, contact: inv.Contact?.Name ?? '', amount: ch.gross, date: ch.date ?? l.date, into: 'clearing' });
      }
      for (const o of odd) problems.push(`${o.category || 'item'} ${o.net < 0 ? '−' : ''}${money(o.net)}: ${o.desc.slice(0, 60)}`);
      line.actions = [...pays.filter((a) => a.t === 'payment'), ...(p.fee ? [{ t: 'fee', amount: p.fee, date: l.date }] : []), { t: 'transfer', amount: l.amount, date: l.date }];
      line.payout = { id: p.id, gross: charges.reduce((a, c) => a + c.gross, 0), fee: p.fee, net: p.net };
      line.note = `${pays.filter((a) => a.t === 'payment').map((a) => `${a.contact} ${a.invoice} ${money(a.amount)}`).join(' + ')}${p.fee ? ` − ${money(p.fee)} Stripe fees` : ''}${pays.some((a) => a.t === 'skip') ? ` (${pays.filter((a) => a.t === 'skip').map((a) => a.note).join('; ')})` : ''}`;
      line.status = problems.length ? 'check' : 'ready';
      if (problems.length) line.note += `. To check: ${problems.join('; ')}`;
      return line;
    }

    // Money in from a couple: their invoice, by its number in the reference, else their name and amount.
    if (l.amount > 0) {
      const open = X.invoices.filter((i) => i.Status === 'AUTHORISED');
      const words = norm(text).split(' ');
      const byNo = open.find((i) => text.toLowerCase().includes(String(i.InvoiceNumber).toLowerCase()));
      const byName = open.filter((i) => { const n = norm(i.Contact?.Name).split(' ').filter((w) => w.length > 1); return n.length && n.slice(0, 2).every((w) => words.includes(w)); });
      const inv = byNo ?? byName.find((i) => Math.round(i.AmountDue * 100) === l.amount) ?? (byName.length === 1 && Math.round(byName[0].AmountDue * 100) >= l.amount ? byName[0] : null);
      if (inv) {
        if (paidOn(inv.InvoiceID, l.amount, l.date)) return { ...line, kind: 'done', status: 'done', note: `Already applied to ${inv.InvoiceNumber} in Xero.` };
        return { ...line, kind: 'client', status: 'ready', actions: [{ t: 'payment', invoice_id: inv.InvoiceID, invoice: inv.InvoiceNumber, contact: inv.Contact?.Name ?? '', amount: l.amount, date: l.date, into: 'bank' }],
          note: `Payment on ${inv.Contact?.Name} ${inv.InvoiceNumber} (${money(Math.round(inv.AmountDue * 100))} owing)` };
      }
    }

    // Everything else: coded the way this payee was before.
    const c = codingFor(l);
    line.kind = l.amount < 0 ? 'spend' : 'receive';
    if (c && acct.has(c.code)) {
      line.status = 'ready';
      line.choice = { code: c.code, tax: c.tax, contact: c.contact };
      line.note = `${acct.get(c.code).name} (${c.code}), as before`;
    } else {
      line.choice = { code: '', tax: '', contact: l.payee };
      line.note = 'New payee: choose the account and tax.';
    }
    line.actions = [{ t: line.kind, amount: Math.abs(l.amount), date: l.date }];
    return line;
  });

  const by = (k) => plan.filter((p) => p.kind === k).length;
  return {
    lines: plan,
    summary: { lines: plan.length, ready: plan.filter((p) => p.status === 'ready').length, check: plan.filter((p) => p.status === 'check').length, done: by('done'),
      payouts: by('payout'), clients: by('client'), spend: by('spend'), receive: by('receive'),
      in: plan.filter((p) => p.amount > 0).reduce((a, p) => a + p.amount, 0), out: plan.filter((p) => p.amount < 0).reduce((a, p) => a + p.amount, 0),
      stripe_unused: (stripe ?? []).filter((p) => !usedPayouts.has(p.id) && p.date >= from && p.date <= to).map((p) => ({ id: p.id, date: p.date, net: p.net })) },
    accounts: X.choices.accounts.filter((a) => !a.bank).map((a) => ({ code: a.code, name: a.name })),
    taxes: X.choices.taxes,
    clearing: !!clearingId,
  };
}

// ---- Doing it ----
const ymd = (iso) => iso.slice(0, 10);
const dollars = (c) => Math.round(c) / 100;

/** Create one line's transactions in Xero. Returns [{ kind, id }]. */
export async function sendLine(env, line, s, run) {
  const ref = `Studio recon ${run} #${line.n}`;
  const made = [];
  for (const a of line.actions) {
    if (a.t === 'payment') {
      const into = a.into === 'clearing' ? s.clearing_code : s.bank_code;
      const d = await xero(env, 'PUT', '/Payments', { Payments: [{ Invoice: { InvoiceID: a.invoice_id }, Account: { AccountID: into }, Date: ymd(a.date), Amount: dollars(a.amount), Reference: ref, IsReconciled: a.into === 'clearing' }] });
      made.push({ kind: 'payment', id: d.Payments[0].PaymentID });
    } else if (a.t === 'fee') {
      const d = await xero(env, 'PUT', '/BankTransactions', { BankTransactions: [{ Type: 'SPEND', Contact: { Name: 'Stripe' }, BankAccount: { AccountID: s.clearing_code }, Date: ymd(a.date), Reference: ref, LineAmountTypes: 'Inclusive', IsReconciled: true,
        LineItems: [{ Description: `Stripe fees: payout ${line.payout?.id ?? ''}`.trim(), Quantity: 1, UnitAmount: dollars(a.amount), AccountCode: s.fees_code, TaxType: s.fees_tax }] }] });
      made.push({ kind: 'banktransaction', id: d.BankTransactions[0].BankTransactionID });
    } else if (a.t === 'transfer') {
      const d = await xero(env, 'PUT', '/BankTransfers', { BankTransfers: [{ FromBankAccount: { AccountID: s.clearing_code }, ToBankAccount: { AccountID: s.bank_code }, Amount: dollars(a.amount), Date: ymd(a.date), Reference: ref, FromIsReconciled: true }] });
      made.push({ kind: 'transfer', id: d.BankTransfers[0].BankTransferID });
    } else if (a.t === 'spend' || a.t === 'receive') {
      const c = line.choice ?? {};
      if (!c.code) throw new Error('Choose the account first.');
      const d = await xero(env, 'PUT', '/BankTransactions', { BankTransactions: [{ Type: a.t === 'spend' ? 'SPEND' : 'RECEIVE', Contact: { Name: (c.contact || line.payee || 'Unknown').slice(0, 255) }, BankAccount: { AccountID: s.bank_code },
        Date: ymd(a.date), Reference: ref, LineAmountTypes: 'Inclusive', IsReconciled: false,
        LineItems: [{ Description: [line.payee, line.details].filter(Boolean).join(' · ').slice(0, 4000) || 'Bank line', Quantity: 1, UnitAmount: dollars(a.amount), AccountCode: c.code, ...(c.tax ? { TaxType: c.tax } : {}) }] }] });
      made.push({ kind: 'banktransaction', id: d.BankTransactions[0].BankTransactionID });
    }
  }
  return made;
}

/** Take back what a run made (payments and bank transactions; transfers are listed for Tony to delete). */
export async function undoMade(env, made) {
  const left = [];
  for (const m of made) {
    try {
      if (m.kind === 'payment') await xero(env, 'POST', `/Payments/${m.id}`, { Payments: [{ PaymentID: m.id, Status: 'DELETED' }] });
      else if (m.kind === 'banktransaction') await xero(env, 'POST', `/BankTransactions/${m.id}`, { BankTransactions: [{ BankTransactionID: m.id, Status: 'DELETED' }] });
      else left.push(m);
    } catch (e) { left.push({ ...m, error: e.message }); }
  }
  return left;
}
export { xeroSettings };
