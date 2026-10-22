// The couple's portal (/portal?t=…) talks to this. Public, but each portal is only reachable
// with its job's long random token.
//   GET    /api/portal?t=…               everything for their portal
//   GET    /api/portal?t=…&doc=4         a document Tony shared with them
//   GET    /api/portal?t=…&upload=9      a file they uploaded
//   POST   /api/portal   form data: t, file      upload a file (photos or PDFs, up to 10 MB)
//   DELETE /api/portal?t=…&upload=9      remove a file they uploaded
import { findByPortal, portalData } from '../../functions-lib/portal.js';
import { loadDocument, loadNamed, storeNamed } from '../../functions-lib/documents.js';
import { alertTony } from '../../functions-lib/crm.js';
import { MAX_UPLOAD } from '../../functions-lib/questionnaire-form.js';
import { toBase64 } from '../../functions-lib/pdf.js';

const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const GONE = 'This portal isn’t available. Please get in touch with Tony.';
const OK_TYPE = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf)$/;
const file = (bytes, type, name) => new Response(bytes, { headers: { 'content-type': type, 'content-disposition': `inline; filename="${name.replace(/"/g, '')}"`, 'cache-control': 'private, no-store' } });
const bytesOf = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const job = await findByPortal(env.DB, url.searchParams.get('t'));
  if (!job) return reply({ error: GONE }, 404);
  if (url.searchParams.has('doc')) {
    const id = Number(url.searchParams.get('doc'));
    const shared = await env.DB.prepare('SELECT 1 FROM job_documents WHERE job_id = ?1 AND document_id = ?2').bind(job.id, id).first();
    const d = shared && await loadDocument(env.DB, id);
    return d ? file(bytesOf(d.base64), d.type, d.name) : reply({ error: 'That file isn’t here any more.' }, 404);
  }
  if (url.searchParams.has('upload')) {
    const u = await env.DB.prepare('SELECT * FROM uploads WHERE id = ?1 AND job_id = ?2').bind(Number(url.searchParams.get('upload')), job.id).first();
    const f = u && await loadNamed(env.DB, `upload-${u.id}`);
    return f ? file(bytesOf(f.base64), u.type, u.name) : reply({ error: 'That file isn’t here any more.' }, 404);
  }
  return reply(await portalData(env.DB, job));
}

export async function onRequestPost({ request, env }) {
  const form = await request.formData().catch(() => null);
  const job = form && await findByPortal(env.DB, form.get('t'));
  if (!job) return reply({ error: GONE }, 404);
  const f = form.get('file');
  if (!f || typeof f === 'string') return reply({ error: 'Which file?' }, 400);
  if (f.size > MAX_UPLOAD) return reply({ error: `“${f.name}” is over 10 MB. Please choose a smaller version.` }, 400);
  const type = f.type || (/\.heic$/i.test(f.name) ? 'image/heic' : '');
  if (!OK_TYPE.test(type)) return reply({ error: `“${f.name}” isn’t a photo or PDF.` }, 400);
  const count = await env.DB.prepare('SELECT count(*) n FROM uploads WHERE job_id = ?1 AND from_studio = 0').bind(job.id).first();
  if (count.n >= 40) return reply({ error: 'That’s the most files for one booking (40). Remove one to add another.' }, 400);
  const name = f.name.replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 120) || 'file';
  const row = await env.DB.prepare('INSERT INTO uploads (job_id, name, type, size, created_at) VALUES (?1, ?2, ?3, ?4, ?5) RETURNING id, name, size, type, created_at')
    .bind(job.id, name, type, f.size, new Date().toISOString()).first();
  try {
    await storeNamed(env.DB, `upload-${row.id}`, type, toBase64(new Uint8Array(await f.arrayBuffer())));
  } catch (e) {
    await env.DB.prepare('DELETE FROM uploads WHERE id = ?1').bind(row.id).run();
    throw e;
  }
  await alertTony(env, `${job.first_name} added a file to their portal`, [['File', name], ['Booking', job.title]],
    `https://www.momentsinlight.co.nz/studio/crm/job?id=${job.id}`).catch((e) => console.error('portal upload alert', e));
  return reply(row);
}

export async function onRequestDelete({ request, env }) {
  const url = new URL(request.url);
  const job = await findByPortal(env.DB, url.searchParams.get('t'));
  if (!job) return reply({ error: GONE }, 404);
  const id = Number(url.searchParams.get('upload'));
  const r = await env.DB.prepare('DELETE FROM uploads WHERE id = ?1 AND job_id = ?2 AND from_studio = 0').bind(id, job.id).run();
  if (r.meta.changes) await env.DB.prepare('DELETE FROM files WHERE name = ?1').bind(`upload-${id}`).run();
  return reply({ ok: true });
}
