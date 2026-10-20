// Who else can use the studio, and how (Studio > Settings > People). Sign-in itself is Cloudflare
// Access (an email must be on the studio's Access list); this decides what a signed-in person may
// do. Anyone not listed here is an owner (Tony): everything. Listed people have, for each area of
// the studio (functions-lib/areas.js), Hidden, Look only or Can change. Saved in settings 'studio_people'.
// Each person can also be allowed to send one-off emails (✉ Write email) whatever their Clients
// level (send_email), and has their own email signature (name, role, phone, photo) for those emails.
import { AREAS, LEVELS } from './areas.js';

/** Older entries had one level for everything ('read' or 'edit'): turn that into per-area levels. */
const areasOf = (p) => {
  const base = p.access === 'edit' ? 'change' : 'look';
  return Object.fromEntries(Object.keys(AREAS).map((a) => [a, LEVELS[p.areas?.[a]] ? p.areas[a] : base]));
};

export async function studioPeople(db) {
  const r = await db.prepare(`SELECT value FROM settings WHERE key = 'studio_people'`).first();
  return (r ? JSON.parse(r.value) : []).map((p) => ({ email: p.email, name: p.name ?? '', areas: areasOf(p), send_email: !!p.send_email, signature: sigOf(p) }));
}
const t = (v, n) => String(v ?? '').trim().slice(0, n);
const sigOf = (p) => ({ name: t(p.signature?.name, 80) || t(p.name, 80), role: t(p.signature?.role, 80), phone: t(p.signature?.phone, 40),
  photo: /^https:\/\/photos\.momentsinlight\.co\.nz\/people\/[\w.-]+$/.test(p.signature?.photo ?? '') ? p.signature.photo : '' });
export async function savePeople(db, list) {
  const clean = (Array.isArray(list) ? list : []).map((p) => ({
    email: String(p.email ?? '').trim().toLowerCase().slice(0, 200),
    name: String(p.name ?? '').trim().slice(0, 80),
    areas: areasOf(p),
    send_email: !!p.send_email,
    signature: sigOf(p),
  })).filter((p) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email));
  await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('studio_people', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`)
    .bind(JSON.stringify(clean), new Date().toISOString()).run();
  return clean;
}
/** { email, name, access: 'owner' | 'person', areas } for a signed-in email. */
export async function accessFor(db, email) {
  const p = (await studioPeople(db)).find((x) => x.email === String(email ?? '').toLowerCase());
  return p ? { email: p.email, name: p.name, access: 'person', areas: p.areas, send_email: p.send_email, signature: p.signature } : { email, name: '', access: 'owner', areas: null };
}
