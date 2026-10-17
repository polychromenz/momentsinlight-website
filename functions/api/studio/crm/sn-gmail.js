// Studio Ninja emails in Gmail, for the import (functions-lib/sn-gmail.js).
//   GET  /api/studio/crm/sn-gmail          the last survey's results
//   POST /api/studio/crm/sn-gmail          run the survey now (read only; takes up to a minute)
import { json } from '../../../../functions-lib/studio.js';
import { survey } from '../../../../functions-lib/sn-gmail.js';

export async function onRequestGet({ env }) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'sn_survey'`).first();
  return json(row ? JSON.parse(row.value) : { none: true });
}

export async function onRequestPost({ env }) {
  try {
    return json(await survey(env));
  } catch (e) {
    return json({ error: /Gmail isn’t connected|expired/.test(e.message) ? e.message : `The survey stopped: ${e.message}` }, 500);
  }
}
