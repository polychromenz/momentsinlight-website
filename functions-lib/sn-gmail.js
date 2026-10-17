// Studio Ninja's emails in Tony's Gmail, for the import: SN sent him a notification for each new
// enquiry (and for quotes accepted, contracts signed…), which hold what SN's own exports leave
// out (past leads that didn't book, enquiry and booking dates).
//
// Step 1, survey(): what kinds of SN emails there are and how many per year, with one example of
// each kind with the details blanked out (labels kept, values hidden), so the reader for step 2
// can be written to match. Read only: nothing in Gmail is changed. The result is kept in
// settings ('sn_survey') so it can be checked from the studio.
import { googleToken } from './gmail.js';

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const QUERY = '(from:studioninja OR "studio ninja" OR studioninja.co)';

async function gmail(env, path) {
  const r = await fetch(`${API}/${path}`, { headers: { authorization: `Bearer ${await googleToken(env)}` } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Gmail ${r.status}: ${d.error?.message ?? ''}`);
  return d;
}

/** Message ids for a search (up to max). */
export async function search(env, q, max = 500) {
  const ids = [];
  let page = '';
  while (ids.length < max) {
    const d = await gmail(env, `messages?maxResults=${Math.min(500, max - ids.length)}&q=${encodeURIComponent(q)}${page ? `&pageToken=${page}` : ''}`);
    ids.push(...(d.messages ?? []).map((m) => m.id));
    if (!d.nextPageToken) break;
    page = d.nextPageToken;
  }
  return ids;
}

const header = (m, name) => m.payload?.headers?.find((x) => x.name.toLowerCase() === name)?.value ?? '';
export const meta = (env, id) => gmail(env, `messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
export const full = (env, id) => gmail(env, `messages/${id}?format=full`);

/** A message's text (plain part, or the HTML part with tags removed). */
export function textOf(m) {
  const parts = [];
  const walk = (p) => { if (!p) return; if (p.parts) p.parts.forEach(walk); else if (p.body?.data) parts.push({ type: p.mimeType, text: new TextDecoder().decode(Uint8Array.from(atob(p.body.data.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))) }); };
  walk(m.payload);
  const plain = parts.find((p) => p.type === 'text/plain');
  if (plain) return plain.text;
  const html = parts.find((p) => p.type === 'text/html')?.text ?? '';
  return html.replace(/<(br|\/p|\/div|\/tr|\/h\d|\/li)[^>]*>/gi, '\n').replace(/<\/t[dh]>/gi, '\t').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}

/** A subject with its details hidden, to group emails of the same kind. */
export const kindOf = (subject) => subject
  .replace(/[\w.+-]+@[\w.-]+/g, '<email>')
  .replace(/\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4}\b/gi, '<date>')
  .replace(/\d+/g, '#')
  .replace(/(:|-|–|from|for|by)\s+.*$/i, '$1 <…>')
  .trim();

/** An email's layout with the details blanked: labels kept, values hidden. */
// Only labels are kept: a line ending in ':' (Studio Ninja puts the value on the next line, so
// that line is hidden too), and every other line is shown as its first word only. No names,
// messages or details can come through.
function redact(text) {
  const lines = text.replace(/[^\n]*\{[^}]*\}/g, '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 80);
  const out = [];
  let afterLabel = false;
  for (const l of lines) {
    const label = l.match(/^([A-Za-z][A-Za-z /&()'?-]{1,60}):\s*(.*)$/);
    if (label) { out.push(`${label[1]}: …`); afterLabel = !label[2]; continue; }
    if (afterLabel) { afterLabel = false; continue; } // that label's value
    out.push(`${l.split(/\s+/)[0].replace(/[^A-Za-z']/g, '') || '…'} …`);
  }
  return out.join('\n');
}

/** Step 1: the survey. Cloudflare allows about 50 outside requests per call, so it stays lean:
 *  a couple of searches, 24 sampled subjects, then for the main kinds a count and one layout. */
export async function survey(env) {
  const ids = await search(env, QUERY, 1000);
  const step = Math.max(1, Math.floor(ids.length / 24));
  const sample = ids.filter((_, i) => i % step === 0).slice(0, 24);
  const metas = await Promise.all(sample.map((id) => meta(env, id).catch(() => null)));
  const kinds = new Map();
  for (const m of metas.filter(Boolean)) {
    const from = (header(m, 'from').match(/<([^>]+)>/)?.[1] ?? header(m, 'from')).toLowerCase();
    const subject = kindOf(header(m, 'subject'));
    const k = `${from} · ${subject}`;
    const cur = kinds.get(k) ?? { kind: k, from: from.replace(/^[^@]+@/, '…@'), domain: from.split('@')[1] ?? '', subject, sampled: 0, example: m.id };
    cur.sampled++;
    kinds.set(k, cur);
  }
  // The main kinds from Studio Ninja itself: how many there are, and the layout of one.
  const list = [...kinds.values()].filter((k) => /studioninja/.test(k.domain)).sort((a, b) => b.sampled - a.sampled).slice(0, 7);
  for (const k of list) {
    const words = k.subject.replace(/<[^>]*>/g, ' ').replace(/[#:–-]/g, ' ').trim();
    try { k.count = (await search(env, `from:${k.domain} subject:("${words}")`, 500)).length; } catch (e) { k.count = null; }
    try { k.layout = redact(textOf(await full(env, k.example))); } catch (e) { k.layout = `(couldn’t read: ${e.message})`; }
    delete k.example;
  }
  const result = { at: new Date().toISOString(), total_found: ids.length, kinds: list, others: [...kinds.values()].filter((k) => !list.includes(k)).map((k) => ({ subject: k.subject, from: k.from, sampled: k.sampled })) };
  await env.DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('sn_survey', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`)
    .bind(JSON.stringify(result), result.at).run();
  return result;
}

// ---- Step 2: reading the emails (into the sn_gmail table, migrations/0019_sn_gmail.sql) ----
// Studio Ninja's notification layouts: "Label:" lines with the value on the next line(s).
export const KINDS = {
  lead: 'from:studioninja.app subject:("New lead from")',
  quote_accepted: 'from:studioninja.app subject:("Your quote for")',
  contract_signed: 'from:studioninja.app subject:("Your contract for")',
};
const BATCH = 35; // emails read per call (Cloudflare allows about 50 outside requests)

/** "Label:" → value pairs from an SN email (values may run over several lines). */
export function fieldsOf(text) {
  const lines = text.replace(/[^\n]*\{[^}]*\}/g, '').split('\n').map((l) => l.trim());
  const out = {};
  let key = null;
  for (const l of lines) {
    if (/^(Regards,|Click here|Feedback or questions|PS -)/.test(l)) { key = null; continue; }
    const m = l.match(/^([A-Za-z][A-Za-z /&()'?-]{1,60}):\s*(.*)$/);
    // A label starts a new field the first time it appears (people type "Venue:" etc. in their
    // own message too; those stay part of the message).
    // Inside their message only Studio Ninja's own question labels end it.
    const inMessage = key && /wedding plans|message/i.test(key);
    if (m && !(m[1].trim() in out) && (!inMessage || /\?$/.test(m[1].trim()))) { key = m[1].trim(); out[key] = m[2] || ''; continue; }
    if (key && l) out[key] = out[key] ? `${out[key]}\n${l}` : l;
  }
  return out;
}

/** The job name in an SN subject: "Your quote for Jane Smith (Website Contact Form Wedding) has been accepted" → the name part. */
const subjectName = (s) => s.replace(/^(New lead from|Your quote for|Your contract for)\s+/i, '').replace(/\s+(has been accepted|is signed|has been signed).*$/i, '').trim();

/** Read the next batch of one kind. Returns how many there are, how many are read, how many left. */
export async function readBatch(env, kind) {
  const ids = await search(env, KINDS[kind], 1000);
  const have = new Set((await env.DB.prepare('SELECT message_id FROM sn_gmail WHERE kind = ?1').bind(kind).all()).results.map((r) => r.message_id));
  const todo = ids.filter((id) => !have.has(id)).slice(0, BATCH);
  const msgs = await Promise.all(todo.map((id) => full(env, id).catch(() => null)));
  const now = new Date().toISOString();
  const stmts = [];
  for (const m of msgs.filter(Boolean)) {
    const subject = header(m, 'subject');
    const f = kind === 'lead' ? fieldsOf(textOf(m)) : {};
    const data = kind === 'lead'
      ? { first_name: f['First Name'] ?? '', last_name: f['Last Name'] ?? '', email: (f.Email ?? '').toLowerCase(), phone: f['Phone (optional)'] ?? f.Phone ?? '',
        service: f['Which services are you interested in?'] ?? '', venue: f.Venue ?? '', event_date: f['Event Date'] ?? '',
        source: f['How did you hear about us?'] ?? f['How did you hear about me?'] ?? '', message: f['Tell me a little about your wedding plans'] ?? '', other: Object.keys(f) }
      : { job: subjectName(subject), accepted: /accepted/i.test(textOf(m)) };
    stmts.push(env.DB.prepare('INSERT OR IGNORE INTO sn_gmail (message_id, kind, received_at, subject, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(m.id, kind, new Date(Number(m.internalDate)).toISOString(), subject, JSON.stringify(data), now));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return { kind, total: ids.length, read: have.size + stmts.length, left: Math.max(0, ids.length - have.size - stmts.length) };
}

/** Where step 2 is up to, for each kind (no Gmail calls). */
export async function progress(env) {
  const rows = (await env.DB.prepare('SELECT kind, count(*) n, min(received_at) first, max(received_at) last FROM sn_gmail GROUP BY kind').all()).results;
  return Object.fromEntries(Object.keys(KINDS).map((k) => [k, rows.find((r) => r.kind === k) ?? { n: 0 }]));
}
