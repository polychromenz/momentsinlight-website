// Finding a contact's email address in Tony's Gmail (read only), e.g. a venue's coordinator.
//   GET /api/studio/crm/gmail-find?q=abelestate.co.nz   (a website, a domain or a business name)
//   -> { addresses: [{ email, name, messages, last, subject }] } most-used first
// Searches Gmail the way its own search box does; only the senders and recipients are read.
import { json } from '../../../../functions-lib/studio.js';
import { googleToken } from '../../../../functions-lib/gmail.js';

const ME = /@momentsinlight\.co\.nz$|^polychromenz@gmail\.com$/i;

export async function onRequestGet({ request, env }) {
  const raw = String(new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 100);
  if (!raw) return json({ error: 'What should I look for?' }, 400);
  // A website becomes its domain, so both "from" and "to" that domain match.
  const domain = raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const q = /\.[a-z]{2,}$/i.test(domain) ? `(from:${domain} OR to:${domain})` : `"${raw.replace(/"/g, '')}"`;
  try {
    const token = await googleToken(env);
    const api = (path) => fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json());
    const list = await api(`messages?maxResults=40&q=${encodeURIComponent(q)}`);
    const found = new Map();
    for (const m of list.messages ?? []) {
      const msg = await api(`messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`);
      const h = Object.fromEntries((msg.payload?.headers ?? []).map((x) => [x.name.toLowerCase(), x.value]));
      for (const part of [h.from, h.to, h.cc].filter(Boolean).join(',').split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
        const email = (part.match(/<([^>]+)>/)?.[1] ?? part).trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || ME.test(email)) continue;
        const name = part.includes('<') ? part.split('<')[0].replace(/"/g, '').trim() : '';
        const when = new Date(Number(msg.internalDate)).toISOString();
        const f = found.get(email) ?? { email, name, messages: 0, last: '', subject: '' };
        f.messages++;
        if (when > f.last) { f.last = when; f.subject = h.subject ?? ''; }
        if (!f.name && name) f.name = name;
        found.set(email, f);
      }
    }
    return json({ query: q, addresses: [...found.values()].sort((a, b) => b.messages - a.messages || b.last.localeCompare(a.last)) });
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}
