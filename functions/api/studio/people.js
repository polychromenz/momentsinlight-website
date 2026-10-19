// Studio > Settings > People (functions-lib/people.js, functions-lib/areas.js).
//   GET  /api/studio/people   -> { me, areas, levels, people }   (people only for an owner; anyone can ask who they are)
//   POST /api/studio/people { people: [{ email, name, areas: { clients: 'hidden' | 'look' | 'change', … } }] }   owners only
import { json } from '../../../functions-lib/studio.js';
import { studioPeople, savePeople } from '../../../functions-lib/people.js';
import { AREAS, LEVELS } from '../../../functions-lib/areas.js';

export async function onRequestGet({ env, data }) {
  const me = data.user;
  return json({ me, areas: AREAS, levels: LEVELS, people: me.access === 'owner' ? await studioPeople(env.DB) : [] });
}

export async function onRequestPost({ request, env, data }) {
  const d = await request.json().catch(() => ({}));
  const list = (d.people ?? []).filter((p) => String(p.email ?? '').toLowerCase() !== data.user.email);
  return json({ people: await savePeople(env.DB, list) });
}
