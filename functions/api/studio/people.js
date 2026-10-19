// Studio > Settings > People (functions-lib/people.js).
//   GET  /api/studio/people           -> { me, people, access }   (people only for an owner)
//   POST /api/studio/people { people: [{ email, name, access: 'read' | 'edit' }] }   owners only (the middleware checks)
import { json } from '../../../functions-lib/studio.js';
import { studioPeople, savePeople, ACCESS } from '../../../functions-lib/people.js';

export async function onRequestGet({ env, data }) {
  const me = data.user;
  return json({ me, access: ACCESS, people: me.access === 'owner' ? await studioPeople(env.DB) : [] });
}

export async function onRequestPost({ request, env, data }) {
  const d = await request.json().catch(() => ({}));
  const list = (d.people ?? []).filter((p) => String(p.email ?? '').toLowerCase() !== data.user.email);
  return json({ people: await savePeople(env.DB, list) });
}
