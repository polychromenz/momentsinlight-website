// The studio phone app (studio-app/): linking a phone and checking its key.
//
// Linking: the app makes a random code and opens /studio/app?code=… in the phone's browser, where
// Tony is signed in through Cloudflare Access. He taps "Link this phone"; that makes the phone's
// key (link()). The app, which has been asking /api/app/claim?code=… every couple of seconds,
// collects the key once (claim()) and keeps it. Its later calls carry "Authorization: Bearer <key>"
// to /api/app/*, which check it (deviceFor()) and then run the normal studio code as that person.
// Only a hash of each key is kept, and Tony can switch a phone off at /studio/app.

const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s))));
const newKey = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const CODE = /^[a-f0-9]{32,64}$/;
const LINK_MINUTES = 15;

/** Approve a phone (from the signed-in browser): makes its key, ready for the phone to collect. */
export async function link(db, code, email, name) {
  if (!CODE.test(String(code ?? ''))) throw new Error('That link code isn’t right. Start again from the app.');
  const codeHash = await sha256(code);
  if (await db.prepare('SELECT 1 FROM app_link_codes WHERE code_hash = ?1').bind(codeHash).first()) throw new Error('This phone is already linked. Go back to the app.');
  const token = newKey();
  const now = new Date().toISOString();
  const d = await db.prepare('INSERT INTO app_devices (email, name, token_hash, created_at) VALUES (?1, ?2, ?3, ?4) RETURNING id')
    .bind(email, String(name || 'Phone').trim().slice(0, 60) || 'Phone', await sha256(token), now).first();
  await db.prepare('INSERT INTO app_link_codes (code_hash, device_id, token, created_at) VALUES (?1, ?2, ?3, ?4)').bind(codeHash, d.id, token, now).run();
  return d.id;
}

/** The phone collects its key, once. Null until Tony has approved it (or after it expires). */
export async function claim(db, code) {
  if (!CODE.test(String(code ?? ''))) return null;
  const since = new Date(Date.now() - LINK_MINUTES * 60_000).toISOString();
  await db.prepare('DELETE FROM app_link_codes WHERE created_at < ?1').bind(since).run();
  const row = await db.prepare('DELETE FROM app_link_codes WHERE code_hash = ?1 RETURNING device_id, token').bind(await sha256(code)).first();
  if (!row) return null;
  const d = await db.prepare('SELECT id, name, email FROM app_devices WHERE id = ?1 AND revoked_at IS NULL').bind(row.device_id).first();
  return d ? { token: row.token, name: d.name, email: d.email } : null;
}

/** Who a request's key belongs to: { id, email, name }, or null. */
export async function deviceFor(db, request) {
  const key = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!/^[a-f0-9]{64}$/.test(key)) return null;
  const d = await db.prepare('SELECT id, email, name, last_used_at FROM app_devices WHERE token_hash = ?1 AND revoked_at IS NULL').bind(await sha256(key)).first();
  if (!d) return null;
  // Note when it was last used (at most once an hour, to keep writes down).
  const now = new Date();
  if (!d.last_used_at || now - new Date(d.last_used_at) > 3600_000) await db.prepare('UPDATE app_devices SET last_used_at = ?2 WHERE id = ?1').bind(d.id, now.toISOString()).run();
  return d;
}

export const listDevices = async (db) =>
  (await db.prepare('SELECT id, email, name, created_at, last_used_at, revoked_at FROM app_devices ORDER BY revoked_at IS NOT NULL, created_at DESC').all()).results;

export const revoke = (db, id) => db.prepare('UPDATE app_devices SET revoked_at = ?2 WHERE id = ?1 AND revoked_at IS NULL').bind(Number(id), new Date().toISOString()).run();
