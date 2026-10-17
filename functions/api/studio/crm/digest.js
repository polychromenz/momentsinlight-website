// The morning email, on demand: POST /api/studio/crm/digest emails Tony today's summary now
// (the same email the timer sends from 7am; see functions-lib/digest.js).
import { json } from '../../../../functions-lib/studio.js';
import { sendDigestNow } from '../../../../functions-lib/digest.js';

export async function onRequestPost({ env }) {
  try {
    return json({ ok: true, items: await sendDigestNow(env) });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
