// Questionnaires on the server: checking a template's questions (Settings), making a couple's
// questionnaire from a template, and checking their answers. Drawing the form is in
// questionnaire-form.js (shared with the browser). Tables: migrations/0014_crm_questionnaires.sql.
import { TYPES, FILLS, ASKS, missing } from './questionnaire-form.js';
import { loadJob } from './crm-send.js';
import { longDate } from './quotes.js';

export const SITE = 'https://www.momentsinlight.co.nz';
const token = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
const text = (v, max) => (v ?? '').toString().trim().slice(0, max);

/** A template's questions, checked and tidied. Throws a plain-English error if one's not right. */
export function cleanQuestions(list) {
  if (!Array.isArray(list)) throw new Error('The questions are missing.');
  const ids = new Set();
  return list.slice(0, 200).map((q, i) => {
    const type = TYPES[q.type] ? q.type : 'short';
    const label = text(q.label, type === 'text' ? 3000 : 500);
    if (!label) throw new Error(`Question ${i + 1} needs some wording.`);
    let id = /^[a-z0-9-]{1,40}$/.test(q.id || '') && !ids.has(q.id) ? q.id : '';
    if (!id) { do id = `q${Math.random().toString(36).slice(2, 8)}`; while (ids.has(id)); }
    ids.add(id);
    const out = { id, type, label };
    if (['select', 'radio', 'checks'].includes(type)) {
      const options = [...new Set((Array.isArray(q.options) ? q.options : String(q.options ?? '').split('\n')).map((o) => text(o, 200)).filter(Boolean))].slice(0, 30);
      if (!options.length) throw new Error(`“${label.slice(0, 50)}” needs some options to choose from.`);
      out.options = options;
    }
    if (ASKS(out)) {
      if (q.required) out.required = true;
      if (q.half) out.half = true;
      if (['short', 'long'].includes(type) && text(q.placeholder, 200)) out.placeholder = text(q.placeholder, 200);
      if (type === 'short' && FILLS[q.fill]) out.fill = q.fill;
    }
    return out;
  });
}

/** Make a couple's questionnaire from a template (a copy of its questions, with what's known filled in). */
export async function makeQuestionnaire(env, jobId, key) {
  const db = env.DB;
  const t = await db.prepare('SELECT * FROM questionnaire_templates WHERE key = ?1').bind(key).first();
  if (!t) throw new Error('That questionnaire no longer exists (Settings > Questionnaires).');
  const job = await loadJob(db, jobId);
  if (!job) throw new Error('That job doesn’t exist.');
  const questions = JSON.parse(t.questions);
  const answers = {};
  for (const q of questions) if (q.fill && job[q.fill]) answers[q.id] = String(job[q.fill]);
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO questionnaires (job_id, template_key, name, intro, questions, answers, token, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8) RETURNING *`)
    .bind(jobId, key, t.name, t.intro, t.questions, JSON.stringify(answers), token(), now).first();
}

/** Their answers, kept only for the questions asked and within sensible sizes. */
export function cleanAnswers(questions, input) {
  const out = {};
  for (const q of questions) {
    if (!ASKS(q) || q.type === 'file') continue;
    const v = input?.[q.id];
    if (q.type === 'checks') out[q.id] = (Array.isArray(v) ? v : []).filter((o) => q.options.includes(o));
    else if (q.type === 'radio' || q.type === 'select') out[q.id] = q.options.includes(v) ? v : '';
    else out[q.id] = text(v, q.type === 'long' ? 5000 : 500);
  }
  return out;
}

/** What's still needed before it can be sent in (file questions count their uploads). */
export function stillNeeded(questions, answers, uploads) {
  const withFiles = { ...answers };
  for (const q of questions) if (q.type === 'file') withFiles[q.id] = uploads.filter((u) => u.question_id === q.id).map((u) => u.id);
  return missing(questions, withFiles);
}

/** A questionnaire's uploads. */
export const uploadsFor = async (db, id) => (await db.prepare('SELECT id, question_id, name, type, size, created_at FROM uploads WHERE questionnaire_id = ?1 ORDER BY id').bind(id).all()).results;

/** The link a couple uses to fill it in. */
export const questionnaireLink = (q) => `${SITE}/questionnaire?t=${q.token}`;

/** A plain summary of the answers, for Tony's alert email. */
export function answerRows(questions, answers, uploads) {
  return questions.filter(ASKS).map((q) => {
    const v = q.type === 'file' ? uploads.filter((u) => u.question_id === q.id).map((u) => u.name).join(', ') : answers[q.id];
    return [q.label.replace(/:$/, ''), Array.isArray(v) ? v.join(', ') : (v || '–')];
  });
}

export const dateLine = (job) => [job.event_date && longDate(job.event_date), job.venue].filter(Boolean).join(' · ');
