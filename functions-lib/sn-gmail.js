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
    const d = await gmail(env, `messages?maxResults=${Math.min(100, max - ids.length)}&q=${encodeURIComponent(q)}${page ? `&pageToken=${page}` : ''}`);
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
function redact(text) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 60).map((l) => {
    const label = l.match(/^([A-Za-z][A-Za-z /&()'?-]{1,40}):\s*(.*)$/);
    if (label) return `${label[1]}: ${label[2] ? '…' : ''}`;
    if (l.includes('\t')) return l.split('\t').map((c) => (c.trim() ? (/^[A-Za-z /&()'?-]{1,30}$/.test(c.trim()) && !/\s\S+\s\S+\s/.test(c) ? c.trim() : '…') : '')).join(' | ');
    // Other lines: first few words, names and numbers hidden.
    return l.split(/\s+/).slice(0, 8).map((w, i) => (/[@\d]/.test(w) ? '#' : i > 0 && /^[A-Z][a-z]/.test(w) ? 'Xxx' : w)).join(' ') + (l.split(/\s+/).length > 8 ? ' …' : '');
  }).join('\n');
}

/** Step 1: the survey. */
export async function survey(env) {
  const ids = await search(env, QUERY, 600);
  // Kinds from a spread of the emails (newest to oldest).
  const step = Math.max(1, Math.floor(ids.length / 120));
  const sample = ids.filter((_, i) => i % step === 0).slice(0, 120);
  const metas = await Promise.all(sample.map((id) => meta(env, id).catch(() => null)));
  const kinds = new Map();
  for (const m of metas.filter(Boolean)) {
    const from = (header(m, 'from').match(/<([^>]+)>/)?.[1] ?? header(m, 'from')).toLowerCase().replace(/^[^@]+@/, '…@');
    const k = `${from} · ${kindOf(header(m, 'subject'))}`;
    const cur = kinds.get(k) ?? { kind: k, from, subject: kindOf(header(m, 'subject')), sampled: 0, example: m.id, years: {} };
    cur.sampled++;
    kinds.set(k, cur);
  }
  // Each kind: how many per year (Gmail search counts), and its layout.
  const list = [...kinds.values()].sort((a, b) => b.sampled - a.sampled).slice(0, 15);
  for (const k of list) {
    const words = k.subject.replace(/<[^>]*>|[#:–-]/g, ' ').split(/\s+/).filter((w) => w.length > 2).slice(0, 4).join(' ');
    for (const y of [2020, 2021, 2022, 2023, 2024, 2025, 2026]) {
      const d = await gmail(env, `messages?maxResults=1&q=${encodeURIComponent(`${QUERY} subject:(${words}) after:${y}/01/01 before:${y + 1}/01/01`)}`).catch(() => ({}));
      if (d.resultSizeEstimate) k.years[y] = d.resultSizeEstimate;
    }
    try { k.layout = redact(textOf(await full(env, k.example))); } catch (e) { k.layout = `(couldn’t read: ${e.message})`; }
    delete k.example;
  }
  const result = { at: new Date().toISOString(), total_found: ids.length, more: ids.length >= 600, kinds: list };
  await env.DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('sn_survey', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`)
    .bind(JSON.stringify(result), result.at).run();
  return result;
}
