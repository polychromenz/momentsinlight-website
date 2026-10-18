// Where client emails go (Settings > Email templates, top card).
//   GET  /api/studio/crm/send-mode           -> { mode: 'test' | 'live', new_live: { on, since } }
//   POST /api/studio/crm/send-mode { on }     Tony switching "new enquiries live" on or off
// In test mode every client email comes to Tony. With "new enquiries live" on, people who first
// enquire after it's switched on (and aren't in the Studio Ninja import) get theirs for real; see
// liveForNew() in functions-lib/crm.js. Full live mode is the CRM_SEND_MODE secret, Tony's alone.
import { json } from '../../../../functions-lib/studio.js';
import { sendMode } from '../../../../functions-lib/crm.js';

const current = async (db) => {
  const r = await db.prepare(`SELECT value FROM settings WHERE key = 'send_new_live'`).first();
  return r ? JSON.parse(r.value) : { on: false, since: null };
};

export async function onRequestGet({ env }) {
  return json({ mode: sendMode(env), new_live: await current(env.DB) });
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const was = await current(env.DB);
  // "since" is set when it's first switched on and kept, so turning it off and on doesn't widen who counts as new.
  const value = d.on ? { on: true, since: was.since ?? new Date().toISOString() } : { on: false, since: was.since };
  await env.DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('send_new_live', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`)
    .bind(JSON.stringify(value), new Date().toISOString()).run();
  return json({ ok: true, new_live: value });
}
