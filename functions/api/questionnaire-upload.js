// Photos or files a couple adds to their questionnaire (e.g. reference photos). Up to 10 MB each,
// images or PDFs only, 20 per questionnaire. Stored privately in D1 (files 'upload-<id>').
//   POST   /api/questionnaire-upload   form data: t, question, file   → { id, name, size }
//   DELETE /api/questionnaire-upload?t=…&id=12
import { findQuestionnaire } from './questionnaire.js';
import { storeNamed } from '../../functions-lib/documents.js';
import { MAX_UPLOAD } from '../../functions-lib/questionnaire-form.js';
import { toBase64 } from '../../functions-lib/pdf.js';

const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const OK_TYPE = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf)$/;

export async function onRequestPost({ request, env }) {
  const form = await request.formData().catch(() => null);
  const q = form && await findQuestionnaire(env, form.get('t'));
  if (!q) return reply({ error: 'This questionnaire isn’t available.' }, 404);
  const question = JSON.parse(q.questions).find((x) => x.id === form.get('question') && x.type === 'file');
  const file = form.get('file');
  if (!question || !file || typeof file === 'string') return reply({ error: 'Which file?' }, 400);
  if (file.size > MAX_UPLOAD) return reply({ error: `“${file.name}” is over 10 MB. Please choose a smaller version.` }, 400);
  const type = file.type || (/\.heic$/i.test(file.name) ? 'image/heic' : '');
  if (!OK_TYPE.test(type)) return reply({ error: `“${file.name}” isn’t a photo or PDF.` }, 400);
  const count = await env.DB.prepare('SELECT count(*) n FROM uploads WHERE questionnaire_id = ?1').bind(q.id).first();
  if (count.n >= 20) return reply({ error: 'That’s the most files for one questionnaire (20). Remove one to add another.' }, 400);
  const name = file.name.replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 120) || 'file';
  const row = await env.DB.prepare('INSERT INTO uploads (job_id, questionnaire_id, question_id, name, type, size, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) RETURNING id')
    .bind(q.job_id, q.id, question.id, name, type, file.size, new Date().toISOString()).first();
  try {
    await storeNamed(env.DB, `upload-${row.id}`, type, toBase64(new Uint8Array(await file.arrayBuffer())));
  } catch (e) {
    await env.DB.prepare('DELETE FROM uploads WHERE id = ?1').bind(row.id).run();
    throw e;
  }
  return reply({ id: row.id, question_id: question.id, name, size: file.size });
}

export async function onRequestDelete({ request, env }) {
  const url = new URL(request.url);
  const q = await findQuestionnaire(env, url.searchParams.get('t'));
  if (!q) return reply({ error: 'This questionnaire isn’t available.' }, 404);
  const id = Number(url.searchParams.get('id'));
  const r = await env.DB.prepare('DELETE FROM uploads WHERE id = ?1 AND questionnaire_id = ?2').bind(id, q.id).run();
  if (r.meta.changes) await env.DB.prepare('DELETE FROM files WHERE name = ?1').bind(`upload-${id}`).run();
  return reply({ ok: true });
}
