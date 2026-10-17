// A couple's questionnaires in the studio.
//   GET    /api/studio/crm/questionnaire?id=3             their questions, answers and uploads
//   GET    /api/studio/crm/questionnaire?id=3&file=12     one of their uploads
//   POST   /api/studio/crm/questionnaire  { job_id, key }        make one for them (key = which questionnaire)
//                                         { id, action: 'reopen' }  let them send it in again
//   DELETE /api/studio/crm/questionnaire?id=3             remove it, with their answers and uploads
import { json } from '../../../../functions-lib/studio.js';
import { makeQuestionnaire, uploadsFor, questionnaireLink } from '../../../../functions-lib/questionnaires.js';
import { loadNamed } from '../../../../functions-lib/documents.js';

const find = (env, id) => env.DB.prepare('SELECT * FROM questionnaires WHERE id = ?1').bind(Number(id)).first();

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const q = await find(env, url.searchParams.get('id'));
  if (!q) return json({ error: 'That questionnaire doesn’t exist.' }, 404);
  const uploads = await uploadsFor(env.DB, q.id);
  if (url.searchParams.has('file')) {
    const u = uploads.find((x) => x.id === Number(url.searchParams.get('file')));
    const f = u && await loadNamed(env.DB, `upload-${u.id}`);
    if (!f) return json({ error: 'That file isn’t here any more.' }, 404);
    return new Response(Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0)), { headers: { 'content-type': u.type, 'content-disposition': `inline; filename="${u.name.replace(/"/g, '')}"`, 'cache-control': 'private, no-store' } });
  }
  return json({ id: q.id, name: q.name, status: q.status, submitted_at: q.submitted_at, updated_at: q.updated_at, link: questionnaireLink(q),
    questions: JSON.parse(q.questions), answers: JSON.parse(q.answers), uploads });
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => null);
  try {
    if (d?.job_id) {
      const q = await makeQuestionnaire(env, Number(d.job_id), (d.key ?? '').toString());
      return json({ ok: true, id: q.id, link: questionnaireLink(q) });
    }
    if (d?.action === 'reopen') {
      await env.DB.prepare(`UPDATE questionnaires SET status = 'open' WHERE id = ?1`).bind(Number(d.id)).run();
      return json({ ok: true });
    }
  } catch (e) {
    return json({ error: e.message }, 400);
  }
  return json({ error: 'What should happen?' }, 400);
}

export async function onRequestDelete({ request, env }) {
  const q = await find(env, new URL(request.url).searchParams.get('id'));
  if (!q) return json({ error: 'That questionnaire doesn’t exist.' }, 404);
  const ups = await uploadsFor(env.DB, q.id);
  await env.DB.batch([
    ...ups.map((u) => env.DB.prepare('DELETE FROM files WHERE name = ?1').bind(`upload-${u.id}`)),
    env.DB.prepare('DELETE FROM uploads WHERE questionnaire_id = ?1').bind(q.id),
    env.DB.prepare('DELETE FROM questionnaires WHERE id = ?1').bind(q.id),
  ]);
  return json({ ok: true });
}
