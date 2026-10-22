// Studio > Settings > Notification bars (functions-lib/notices.js).
//   GET  /api/studio/notices  -> { site: { text, link }, gallery: { text } }
//   POST /api/studio/notices { site: { text, link }, gallery: { text } }   blank text = no bar
import { json } from '../../../functions-lib/studio.js';
import { notices, saveNotices } from '../../../functions-lib/notices.js';

export async function onRequestGet({ env }) {
  return json(await notices(env.DB));
}

export async function onRequestPost({ request, env }) {
  return json(await saveNotices(env.DB, await request.json().catch(() => ({}))));
}
