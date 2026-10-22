// Receipts and tax invoices in Tony's mailbox (for costs paid on his personal card, which the
// business then owes him: Shareholder Current Account). Two steps:
//   GET  /api/studio/receipts?from=2026-04-01&to=2026-09-30&page=…   likely receipts, 40 at a time
//                                   -> { items: [{ id, at, from, subject, snippet, files }], next }
//   POST /api/studio/receipts { file: [{ id, month: '2026-04' }, …] }  label each one Invoice/YYYY-MM
// Labelling needs the gmail.modify permission (Reconnect Google once). Emails stay in the Inbox.
import { json } from '../../../functions-lib/studio.js';
import { googleToken, connection } from '../../../functions-lib/gmail.js';

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

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => null);
  const file = Array.isArray(d?.file) ? d.file.filter((f) => typeof f?.id === 'string' && /^\d{4}-\d{2}$/.test(f.month ?? '')) : [];
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
