// Pinterest for Studio > Social: the studio's own Pinterest app (developers.pinterest.com, "Moments in
// Light Studio"; docs/social-api-applications.md). Tony clicks Connect Pinterest on the Social page and
// allows the studio in; the callback keeps the tokens (encrypted, settings 'pinterest_conn') and his
// boards, and he picks the board pins go to. Approved pins publish themselves at their time, like
// Facebook and Instagram (functions-lib/meta.js publish / publishDue): the editor makes the 2:3 image
// (1000×1500) and uploads it to photos.momentsinlight.co.nz, and Pinterest fetches it from there.
//
// While the app has Trial access, Pinterest refuses real pins (only its sandbox takes them), so
// publish() in meta.js falls back to the RSS feed; Standard access (applied for
// from the app's page) makes them public. Access tokens last 30 days and are refreshed automatically.
//
// Needs the Cloudflare settings PINTEREST_APP_ID and PINTEREST_APP_SECRET (a secret), and the app's
// redirect URI set to REDIRECT below.

export const SITE = 'https://www.momentsinlight.co.nz';
export const REDIRECT = `${SITE}/api/studio/pinterest/callback`;
const API = 'https://api.pinterest.com/v5';
const SCOPES = ['boards:read', 'boards:write', 'pins:read', 'pins:write', 'user_accounts:read'];

export const pinterestReady = (env) => !!(env.PINTEREST_APP_ID && env.PINTEREST_APP_SECRET);
export const pinterestLoginUrl = (env, state) => `https://www.pinterest.com/oauth/?${new URLSearchParams({ client_id: env.PINTEREST_APP_ID, redirect_uri: REDIRECT, response_type: 'code', scope: SCOPES.join(','), state })}`;

// ---- Tokens, kept encrypted (key from PINTEREST_APP_SECRET) ----
const enc = new TextEncoder();
const b64 = (u) => { let s = ''; for (const c of new Uint8Array(u)) s += String.fromCharCode(c); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function key(env) {
  const base = await crypto.subtle.importKey('raw', enc.encode(env.PINTEREST_APP_SECRET), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('moments-studio-pinterest'), info: enc.encode('tokens') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function seal(env, text) { const iv = crypto.getRandomValues(new Uint8Array(12)); return `${b64(iv)}.${b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(env), enc.encode(text)))}`; }
async function open(env, v) { const [iv, d] = v.split('.'); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await key(env), unb64(d))); }

export async function pinterestConnection(db) {
  const r = await db.prepare(`SELECT value FROM settings WHERE key = 'pinterest_conn'`).first();
  return r ? JSON.parse(r.value) : null;
}
async function saveConn(db, v) {
  if (!v) return db.prepare(`DELETE FROM settings WHERE key = 'pinterest_conn'`).run();
  await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('pinterest_conn', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`)
    .bind(JSON.stringify(v), new Date().toISOString()).run();
}
export const disconnectPinterest = (db) => saveConn(db, null);
const publicConn = (c) => c && { username: c.username, boards: c.boards ?? [], board_id: c.board_id ?? null, board_name: c.board_name ?? null, connected_at: c.connected_at };
export const pinterestStatus = async (env) => ({ ready: pinterestReady(env), connection: publicConn(await pinterestConnection(env.DB)) });
/** Connected with a board chosen (so approved pins publish themselves)? */
export const pinterestOn = async (db) => !!(await pinterestConnection(db))?.board_id;

const basic = (env) => `Basic ${btoa(`${env.PINTEREST_APP_ID}:${env.PINTEREST_APP_SECRET}`)}`;
async function tokenCall(env, body) {
  const r = await fetch(`${API}/oauth/token`, { method: 'POST', headers: { authorization: basic(env), 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error(`Pinterest sign-in said ${r.status}: ${d.message ?? d.error ?? ''}`);
  return d;
}
/** A Pinterest API call with a fresh token; throws with Pinterest's own message. */
async function api(env, method, path, body) {
  const db = env.DB;
  let c = await pinterestConnection(db);
  if (!c?.refresh) throw new Error('Pinterest isn’t connected.');
  if (!c.access || Date.now() > Date.parse(c.access_until) - 86400_000) {
    const t = await tokenCall(env, { grant_type: 'refresh_token', refresh_token: await open(env, c.refresh) }).catch((e) => {
      throw new Error(`${e.message}. Click Reconnect Pinterest on the Social page.`);
    });
    c = { ...c, access: await seal(env, t.access_token), access_until: new Date(Date.now() + (t.expires_in ?? 2592000) * 1000).toISOString(), ...(t.refresh_token ? { refresh: await seal(env, t.refresh_token) } : {}) };
    await saveConn(db, c);
  }
  const r = await fetch(`${API}${path}`, { method, headers: { authorization: `Bearer ${await open(env, c.access)}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Pinterest: ${d.message || r.status}`);
  return d;
}

/** After Tony allows the studio in: tokens, his username and boards. */
export async function finishPinterestConnect(env, code) {
  const t = await tokenCall(env, { grant_type: 'authorization_code', code, redirect_uri: REDIRECT, continuous_refresh: 'true' });
  const before = await pinterestConnection(env.DB);
  await saveConn(env.DB, { ...(before ?? {}), access: await seal(env, t.access_token), refresh: await seal(env, t.refresh_token), access_until: new Date(Date.now() + (t.expires_in ?? 2592000) * 1000).toISOString(), connected_at: new Date().toISOString() });
  const me = await api(env, 'GET', '/user_account');
  const boards = await listBoards(env);
  const c = await pinterestConnection(env.DB);
  // Keep the board chosen before; otherwise one called "wedding…", else the only one.
  const pick = boards.find((b) => b.id === before?.board_id) ?? boards.find((b) => /wedding/i.test(b.name)) ?? (boards.length === 1 ? boards[0] : null);
  await saveConn(env.DB, { ...c, username: me.username ?? '', boards, board_id: pick?.id ?? null, board_name: pick?.name ?? null });
}
async function listBoards(env) {
  const out = [];
  let bookmark = '';
  for (let n = 0; n < 5; n++) {
    const d = await api(env, 'GET', `/boards?page_size=100${bookmark ? `&bookmark=${encodeURIComponent(bookmark)}` : ''}`);
    out.push(...(d.items ?? []).map((b) => ({ id: b.id, name: b.name })));
    if (!d.bookmark) break;
    bookmark = d.bookmark;
  }
  return out;
}
/** Tony picking the board pins go to (the list is read again, in case he's made a new one). */
export async function chooseBoard(env, id) {
  const boards = await listBoards(env);
  const b = boards.find((x) => x.id === String(id));
  if (!b) throw new Error('That board isn’t there any more.');
  await saveConn(env.DB, { ...(await pinterestConnection(env.DB)), boards, board_id: b.id, board_name: b.name });
}

/** Publish one approved pin now. Returns { id, url }. */
export async function publishPin(env, p) {
  const c = await pinterestConnection(env.DB);
  if (!c?.board_id) throw new Error('Choose the Pinterest board on the Social page first.');
  const media = JSON.parse(p.media || '[]');
  if (!media.length) throw new Error('Its image wasn’t made. Open the pin, Back to draft, then Approve again.');
  const photo = JSON.parse(p.photos || '[]')[0] ?? {};
  const d = await api(env, 'POST', '/pins', {
    board_id: c.board_id,
    title: String(p.label ?? '').slice(0, 100),
    description: String(p.caption ?? '').slice(0, 500),
    ...(p.link ? { link: p.link } : {}),
    ...(photo.alt ? { alt_text: String(photo.alt).slice(0, 500) } : {}),
    media_source: { source_type: 'image_url', url: media[0] },
  });
  return { id: d.id, url: `https://www.pinterest.com/pin/${d.id}/` };
}
