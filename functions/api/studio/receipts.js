// Receipts and tax invoices in Tony's mailbox (for costs paid on his personal card, which the
// business then owes him: Shareholder Current Account). Two steps:
//   GET  /api/studio/receipts?from=2026-04-01&to=2026-09-30&page=…   likely receipts, 40 at a time
//                                   -> { items: [{ id, at, from, subject, snippet, files }], next }
//   POST /api/studio/receipts { file: [{ id, month: '2026-04' }, …] }  label each one Invoice/YYYY-MM
//   POST /api/studio/receipts { action: 'amounts', ids: [≤20] }  each email's money amounts (totals first)
//   POST /api/studio/receipts { action: 'xero', from, to }       what Xero has: bank transactions and bills
// Labelling needs the gmail.modify permission (Reconnect Google once). Emails stay in the Inbox.
import { json } from '../../../functions-lib/studio.js';
import { googleToken, connection } from '../../../functions-lib/gmail.js';
import { xero } from '../../../functions-lib/xero.js';

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const WORDS = '(receipt OR invoice OR "tax invoice" OR "order confirmation" OR "your order" OR "payment received" OR "payment confirmation" OR subscription OR billing OR "amount paid" OR renewal)';

async function gmail(env, path, init = {}) {
  const r = await fetch(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${await googleToken(env)}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Gmail said ${r.status}: ${d.error?.message ?? ''}`);
  return d;
}
const day = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s ?? '') ? s : null);
const plus1 = (s) => new Date(Date.parse(`${s}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const from = day(url.searchParams.get('from')), to = day(url.searchParams.get('to'));
  if (!from || !to) return json({ error: 'Which dates?' }, 400);
  try {
    const q = `after:${from.replace(/-/g, '/')} before:${plus1(to).replace(/-/g, '/')} -in:sent -in:chats -in:drafts ${WORDS}`;
    const list = await gmail(env, `/messages?${new URLSearchParams({ q, maxResults: '40', ...(url.searchParams.get('page') ? { pageToken: url.searchParams.get('page') } : {}) })}`);
    const items = [];
    for (const m of list.messages ?? []) {
      const d = await gmail(env, `/messages/${m.id}?format=full&fields=id,internalDate,snippet,labelIds,payload(headers,filename,parts(filename,parts(filename,parts(filename))))`);
      const h = (n) => d.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? '';
      const files = [];
      const walk = (p) => { if (!p) return; if (p.filename) files.push(p.filename); (p.parts ?? []).forEach(walk); };
      walk(d.payload);
      items.push({ id: d.id, at: new Date(Number(d.internalDate)).toISOString(), from: h('from'), to: h('to'), subject: h('subject'), snippet: d.snippet ?? '', files, labels: d.labelIds ?? [] });
    }
    return json({ items, next: list.nextPageToken ?? null, total: list.resultSizeEstimate ?? null });
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}

// The email as plain text (HTML tags and entities removed), for finding the amounts.
function bodyText(d) {
  const parts = [];
  const walk = (p) => {
    if (!p) return;
    if (p.parts) { p.parts.forEach(walk); return; }
    if (!p.filename && p.body?.data && /^text\//.test(p.mimeType)) parts.push({ type: p.mimeType, text: new TextDecoder().decode(Uint8Array.from(atob(p.body.data.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))) });
  };
  walk(d.payload);
  const raw = parts.find((p) => p.type === 'text/html')?.text ?? parts.find((p) => p.type === 'text/plain')?.text ?? '';
  return raw.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#36;/g, '$').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}
// Money in the text: "NZ$1,016.22", "$ 5,291.00", "USD 12.00", "€9.99"; ones next to Total / Amount paid first.
function amounts(text) {
  const found = [];
  const re = /(NZ\$|US\$|AU\$|A\$|USD|NZD|AUD|EUR|GBP|€|£|\$)\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+\.\d{2})(?:\s?(NZD|USD|AUD|EUR|GBP))?/g;
  let m;
  while ((m = re.exec(text))) {
    const cur = (m[3] || ({ 'NZ$': 'NZD', 'US$': 'USD', 'AU$': 'AUD', 'A$': 'AUD', '€': 'EUR', '£': 'GBP', '$': '' }[m[1]] ?? m[1])).toUpperCase();
    const before = text.slice(Math.max(0, m.index - 40), m.index).toLowerCase();
    const total = /(grand total|total|amount paid|paid|amount due|amount charged|charged|payment of|amounting to)[^a-z]*$/.test(before);
    found.push({ cur, value: Math.round(Number(m[2].replace(/,/g, '')) * 100), total, near: before.slice(-30).trim() });
  }
  return found.sort((a, b) => Number(b.total) - Number(a.total) || b.value - a.value).slice(0, 6);
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => null);
  if (d?.action === 'amounts') {
    const ids = (Array.isArray(d.ids) ? d.ids : []).filter((x) => typeof x === 'string').slice(0, 20);
    try {
      const out = [];
      for (const id of ids) {
        const m = await gmail(env, `/messages/${id}?format=full`);
        const h = (n) => m.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? '';
        out.push({ id, at: new Date(Number(m.internalDate)).toISOString(), from: h('from'), subject: h('subject'), amounts: amounts(`${h('subject')} ${bodyText(m)}`) });
      }
      return json({ items: out });
    } catch (e) { return json({ error: e.message }, 400); }
  }
  if (d?.action === 'xero') {
    const from = day(d.from), to = day(d.to);
    if (!from || !to) return json({ error: 'Which dates?' }, 400);
    const dt = (s) => `DateTime(${s.replace(/-/g, ',')})`;
    const where = (s) => `where=${encodeURIComponent(s)}`;
    const pages = async (path, key) => {
      const list = [];
      for (let page = 1; page <= 10; page++) {
        const r = (await xero(env, 'GET', `${path}&page=${page}`))[key] ?? [];
        list.push(...r);
        if (r.length < 100) break;
      }
      return list;
    };
    try {
      const txns = await pages(`/BankTransactions?${where(`Date>=${dt(from)}&&Date<=${dt(to)}`)}`, 'BankTransactions');
      const bills = await pages(`/Invoices?${where(`Type=="ACCPAY"&&Date>=${dt(from)}&&Date<=${dt(to)}`)}&summaryOnly=true`, 'Invoices');
      const date = (x) => new Date(Number(/\d+/.exec(x ?? '')?.[0] ?? 0)).toISOString().slice(0, 10);
      return json({
        txns: txns.filter((t) => t.Status !== 'DELETED').map((t) => ({ kind: t.Type, date: date(t.Date), total: Math.round((t.Total ?? 0) * 100), contact: t.Contact?.Name ?? '', ref: t.Reference ?? '', account: t.BankAccount?.Name ?? '', text: (t.LineItems ?? []).map((l) => l.Description).join(' ') })),
        bills: bills.filter((b) => !['DELETED', 'VOIDED'].includes(b.Status)).map((b) => ({ kind: 'BILL', date: date(b.Date), total: Math.round((b.Total ?? 0) * 100), contact: b.Contact?.Name ?? '', ref: b.InvoiceNumber ?? '', status: b.Status })),
      });
    } catch (e) { return json({ error: e.message }, 400); }
  }
  const file =Array.isArray(d?.file) ? d.file.filter((f) => typeof f?.id === 'string' && /^\d{4}-\d{2}$/.test(f.month ?? '')) : [];
  if (!file.length) return json({ error: 'Nothing to file.' }, 400);
  const c = await connection(env.DB);
  if (!/gmail\.modify/.test(c?.scopes ?? '')) return json({ error: 'The studio can only read your Gmail. Reconnect Google (Clients page) and allow it to manage your email labels, then try again.' }, 400);
  try {
    // Invoice, then Invoice/2026-04 etc. (Gmail shows "/" as a sub-folder).
    const have = new Map(((await gmail(env, '/labels')).labels ?? []).map((l) => [l.name, l.id]));
    const label = async (name) => {
      if (!have.has(name)) have.set(name, (await gmail(env, '/labels', { method: 'POST', body: JSON.stringify({ name, labelListVisibility: 'labelShow', messageListVisibility: 'show' }) })).id);
      return have.get(name);
    };
    await label('Invoice');
    const byMonth = new Map();
    for (const f of file) byMonth.set(f.month, [...(byMonth.get(f.month) ?? []), f.id]);
    const done = {};
    for (const [month, ids] of byMonth) {
      const id = await label(`Invoice/${month}`);
      await gmail(env, '/messages/batchModify', { method: 'POST', body: JSON.stringify({ ids, addLabelIds: [id] }) });
      done[month] = ids.length;
    }
    return json({ ok: true, done });
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}
