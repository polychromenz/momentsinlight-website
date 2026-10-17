// Gmail for the studio CRM: Tony connects his Google Workspace account once (Connect Gmail in
// the studio), then client emails are sent from his own address and show in his Sent folder.
//
// Settings (Cloudflare > the site > Settings > Variables and secrets, Production):
//   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET  the "Moments Studio" OAuth client in Google Cloud
//                                         (project Moments Studio, audience Internal)
// The long-lived refresh token is kept in the settings table, encrypted with a key derived from
// GMAIL_CLIENT_SECRET (replacing that secret just means connecting Gmail again).
//
// SAFETY: sendEmail() always passes the message through outgoing() (the test-mode lock in
// crm.js) before anything leaves; nothing else in the CRM sends client email.
import { outgoing } from './crm.js';

// gmail.send/readonly: send as Tony and see replies. calendar.app.created: the studio's own
// "Moments in Light" calendar only (functions-lib/calendar.js); it can't see his other calendars.
// webmasters.readonly: Search Console numbers for the SEO page (read only).
export const SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/calendar.app.created', 'https://www.googleapis.com/auth/webmasters.readonly', 'openid', 'email'];
export const REDIRECT = 'https://www.momentsinlight.co.nz/api/studio/crm/gmail-callback';

// ---- Encrypting the refresh token (AES-GCM, key from the client secret via HKDF) ----
const enc = new TextEncoder();
const b64 = (bytes) => {
  const u = new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(bin);
};
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function key(env) {
  const base = await crypto.subtle.importKey('raw', enc.encode(env.GMAIL_CLIENT_SECRET), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('moments-studio-gmail'), info: enc.encode('refresh-token') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encrypt(env, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(env), enc.encode(text));
  return `${b64(iv)}.${b64(data)}`;
}
async function decrypt(env, value) {
  const [iv, data] = value.split('.');
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await key(env), unb64(data)));
}

// ---- Connection status and access tokens ----
export async function connection(db) {
  const row = await db.prepare(`SELECT value FROM settings WHERE key = 'gmail'`).first();
  return row ? JSON.parse(row.value) : null;
}
export async function saveConnection(db, value) {
  await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('gmail', ?1, ?2)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(JSON.stringify(value), new Date().toISOString()).run();
}

let cached = { token: '', until: 0 };
/** An access token for Google (Gmail, and the studio calendar). */
export async function googleToken(env) {
  if (cached.token && Date.now() < cached.until) return cached.token;
  const c = await connection(env.DB);
  if (!c?.refresh) throw new Error('Gmail isn’t connected. Use “Connect Gmail” in the studio.');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ client_id: env.GMAIL_CLIENT_ID, client_secret: env.GMAIL_CLIENT_SECRET, refresh_token: await decrypt(env, c.refresh), grant_type: 'refresh_token' }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error === 'invalid_grant' ? 'The Gmail connection has expired. Use “Connect Gmail” in the studio again.' : `Google said ${r.status}: ${d.error_description || d.error || ''}`);
  cached = { token: d.access_token, until: Date.now() + (d.expires_in - 120) * 1000 };
  return cached.token;
}

/** A Gmail conversation's messages: id, when, who from, subject and a short snippet. */
export async function thread(env, threadId) {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, {
    headers: { authorization: `Bearer ${await googleToken(env)}` },
  });
  if (r.status === 404) return [];
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Gmail couldn’t read the conversation (${r.status}): ${d.error?.message ?? ''}`);
  const h = (m, name) => m.payload?.headers?.find((x) => x.name.toLowerCase() === name)?.value ?? '';
  return (d.messages ?? []).map((m) => ({
    id: m.id,
    at: new Date(Number(m.internalDate)).toISOString(),
    from: (h(m, 'from').match(/<([^>]+)>/)?.[1] ?? h(m, 'from')).trim().toLowerCase(),
    subject: h(m, 'subject'),
    snippet: (m.snippet ?? '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
  }));
}

// ---- Building and sending a message ----
const b64url = (s) => b64(enc.encode(s)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const header = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(enc.encode(s))}?=`);
const wrap76 = (s) => s.replace(/.{76}/g, '$&\r\n');

/**
 * Send a client email from Tony's Gmail, through the test-mode lock.
 * @param {{ to: string, subject: string, html: string, text?: string, threadId?: string,
 *           attachments?: { name: string, type: string, base64: string }[] }} msg
 * @returns {{ id: string, threadId: string, to: string, redirected: boolean, intended: string }}
 */
export async function sendEmail(env, msg) {
  const out = outgoing(env, { to: msg.to, subject: msg.subject, html: msg.html });
  const conn = await connection(env.DB);
  const from = conn?.email ? `Tony Gorham <${conn.email}>` : 'Tony Gorham <tony@momentsinlight.co.nz>';
  const boundary = `b${crypto.randomUUID().replace(/-/g, '')}`;
  const alt = `a${crypto.randomUUID().replace(/-/g, '')}`;
  const text = msg.text ?? out.html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h\d|li|tr)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
  const parts = [
    `From: ${from}`, `To: ${out.to}`, `Subject: ${header(out.subject)}`, 'MIME-Version: 1.0',
    // A reply: these make it thread in their email program too, not just in Gmail.
    ...(msg.inReplyTo ? [`In-Reply-To: ${msg.inReplyTo}`, `References: ${msg.references || msg.inReplyTo}`] : []),
    `Content-Type: multipart/mixed; boundary="${boundary}"`, '',
    `--${boundary}`, `Content-Type: multipart/alternative; boundary="${alt}"`, '',
    `--${alt}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(b64(enc.encode(text))),
    `--${alt}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(b64(enc.encode(out.html))),
    `--${alt}--`,
  ];
  for (const a of msg.attachments ?? []) {
    parts.push(`--${boundary}`, `Content-Type: ${a.type}; name="${a.name}"`, 'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename="${a.name}"`, '', wrap76(a.base64));
  }
  parts.push(`--${boundary}--`, '');
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { authorization: `Bearer ${await googleToken(env)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw: b64url(parts.join('\r\n')), ...(msg.threadId ? { threadId: msg.threadId } : {}) }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Gmail couldn’t send it (${r.status}): ${d.error?.message ?? ''}`);
  return { id: d.id, threadId: d.threadId, to: out.to, redirected: out.redirected, intended: out.intended };
}

/** One email in full, for reading it in the studio: who, when, subject, its HTML (or text) and
 *  attachment names, and its Message-ID (to reply to it). */
export async function message(env, id) {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`, { headers: { authorization: `Bearer ${await googleToken(env)}` } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Gmail couldn’t open that email (${r.status}): ${d.error?.message ?? ''}`);
  const h = (name) => d.payload?.headers?.find((x) => x.name.toLowerCase() === name)?.value ?? '';
  const parts = []; const files = [];
  const walk = (p) => {
    if (!p) return;
    if (p.parts) { p.parts.forEach(walk); return; }
    if (p.filename) { files.push(p.filename); return; }
    if (p.body?.data) parts.push({ type: p.mimeType, text: new TextDecoder().decode(Uint8Array.from(atob(p.body.data.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))) });
  };
  walk(d.payload);
  return {
    id: d.id, threadId: d.threadId, at: new Date(Number(d.internalDate)).toISOString(),
    from: h('from'), to: h('to'), subject: h('subject'), messageId: h('message-id'), references: h('references'),
    html: parts.find((p) => p.type === 'text/html')?.text ?? '', text: parts.find((p) => p.type === 'text/plain')?.text ?? '', files,
  };
}
