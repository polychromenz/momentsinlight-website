// The couple's questionnaire page (/questionnaire?t=…) talks to this. Public, but each
// questionnaire is only reachable with its long random token.
//   GET  /api/questionnaire?t=…              the questions, their answers so far and their uploads
//   GET  /api/questionnaire?t=…&file=12      one of their uploaded files
//   PUT  /api/questionnaire  { t, answers }  save as they go (no alert)
//   POST /api/questionnaire  { t, answers }  send it in: checks the needed answers, alerts Tony
// They can still change answers after sending it in; sending again alerts Tony again.
import { loadJob } from '../../functions-lib/crm-send.js';
import { alertTony } from '../../functions-lib/crm.js';
import { cleanAnswers, stillNeeded, uploadsFor, answerRows, dateLine } from '../../functions-lib/questionnaires.js';
import { loadNamed } from '../../functions-lib/documents.js';

const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
export const findQuestionnaire = (env, t) => (/^[a-f0-9]{48}$/.test(t || '') ? env.DB.prepare('SELECT * FROM questionnaires WHERE token = ?1').bind(t).first() : null);
const GONE = 'This questionnaire isn’t available. Please get in touch with Tony.';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const q = await findQuestionnaire(env, url.searchParams.get('t'));
  if (!q) return reply({ error: GONE }, 404);
  const uploads = await uploadsFor(env.DB, q.id);
  if (url.searchParams.has('file')) {
    const u = uploads.find((x) => x.id === Number(url.searchParams.get('file')));
    const f = u && await loadNamed(env.DB, `upload-${u.id}`);
    if (!f) return reply({ error: 'That file isn’t here any more.' }, 404);
    return new Response(Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0)), { headers: { 'content-type': u.type, 'content-disposition': `inline; filename="${u.name.replace(/"/g, '')}"`, 'cache-control': 'private, no-store' } });
  }
  const job = await loadJob(env.DB, q.job_id);
  return reply({
    name: q.name, intro: q.intro, questions: JSON.parse(q.questions), answers: JSON.parse(q.answers),
    status: q.status, submitted_at: q.submitted_at, updated_at: q.updated_at,
    uploads: uploads.map(({ id, question_id, name, size }) => ({ id, question_id, name, size })),
    couple: job.partner_name ? `${job.first_name} & ${job.partner_name}` : job.first_name, when: dateLine(job),
  });
}

async function save(request, env, submit) {
  const d = await request.json().catch(() => null);
  const q = await findQuestionnaire(env, d?.t);
  if (!q) return reply({ error: GONE }, 404);
  const questions = JSON.parse(q.questions);
  const answers = cleanAnswers(questions, d.answers);
  const uploads = await uploadsFor(env.DB, q.id);
  const now = new Date().toISOString();
  if (submit) {
    const need = stillNeeded(questions, answers, uploads);
    if (need.length) return reply({ error: 'A few answers are still needed (marked in red).', missing: need.map((x) => x.id) }, 400);
  }
  await env.DB.prepare(`UPDATE questionnaires SET answers = ?2, updated_at = ?3${submit ? `, status = 'submitted', submitted_at = ?3` : ''} WHERE id = ?1`).bind(q.id, JSON.stringify(answers), now).run();
  if (submit) {
    const job = await loadJob(env.DB, q.job_id);
    await alertTony(env, `${q.status === 'submitted' ? 'Questionnaire updated' : 'Questionnaire filled in'}: ${job.title}`,
      [['Questionnaire', q.name], ...answerRows(questions, answers, uploads)],
      `https://www.momentsinlight.co.nz/studio/crm/job?id=${job.id}`).catch((e) => console.error('questionnaire alert', e));
  }
  return reply({ ok: true, saved_at: now });
}

export const onRequestPut = ({ request, env }) => save(request, env, false);
export const onRequestPost = ({ request, env }) => save(request, env, true);
