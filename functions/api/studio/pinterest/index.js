// Pinterest connection (Studio > Social; functions-lib/pinterest.js).
//   GET  /api/studio/pinterest                           -> { ready, connection }
//   POST /api/studio/pinterest { action: 'board', id }    the board pins go to
//   POST /api/studio/pinterest { action: 'disconnect' }
import { json } from '../../../../functions-lib/studio.js';
import { pinterestStatus, chooseBoard, disconnectPinterest } from '../../../../functions-lib/pinterest.js';

export async function onRequestGet({ env }) {
  return json(await pinterestStatus(env));
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  try {
    if (d.action === 'board') await chooseBoard(env, d.id);
    else if (d.action === 'disconnect') await disconnectPinterest(env.DB);
    else return json({ error: 'What should happen?' }, 400);
    return json(await pinterestStatus(env));
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}
