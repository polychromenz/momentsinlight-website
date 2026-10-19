// Who else can use the studio, and how (Studio > Settings > People). Sign-in itself is Cloudflare
// Access (an email must be on the studio's Access list); this decides what a signed-in person may
// do. Anyone not listed here is an owner (Tony): everything. Listed people are 'read' (look, change
// nothing) or 'edit' (everything except Settings > People). Saved in settings 'studio_people'.
export const ACCESS = { read: 'Look only', edit: 'Can make changes' };

export async function studioPeople(db) {
  const r = await db.prepare(`SELECT value FROM settings WHERE key = 'studio_people'`).first();
  return r ? JSON.parse(r.value) : [];
}
export async function savePeople(db, list) {
  const clean = (Array.isArray(list) ? list : []).map((p) => ({
    email: String(p.email ?? '').trim().toLowerCase().slice(0, 200),
    name: String(p.name ?? '').trim().slice(0, 80),
    access: ACCESS[p.access] ? p.access : 'read',
  })).filter((p) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email));
  await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('studio_people', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`)
    .bind(JSON.stringify(clean), new Date().toISOString()).run();
  return clean;
}
/** { email, name, access: 'owner' | 'edit' | 'read' } for a signed-in email. */
export async function accessFor(db, email) {
  const p = (await studioPeople(db)).find((x) => x.email === String(email ?? '').toLowerCase());
  return p ? { email: p.email, name: p.name, access: p.access } : { email, name: '', access: 'owner' };
}
