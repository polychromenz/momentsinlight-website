// A couple's portal, from the studio (the Portal card on the client page).
//   GET  /api/studio/crm/portal?job=12             their portal link, galleries, shared documents and uploads
//   GET  /api/studio/crm/portal?job=12&upload=9    a file they uploaded
//   POST /api/studio/crm/portal  { job_id, action: 'gallery', title, url, note? }   add a gallery link
//                                { job_id, action: 'gallery-remove', id }
//                                { job_id, action: 'share', document_ids: [..] }     which documents they see
//                                { job_id, action: 'upload-remove', id }
import { json } from '../../../../functions-lib/studio.js';
import { portalToken, portalLink } from '../../../../functions-lib/portal.js';
import { listDocuments, loadNamed } from '../../../../functions-lib/documents.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const jobId = Number(url.searchParams.get('job'));
  if (!jobId) return json({ error: 'Which job?' }, 400);
  if (url.searchParams.has('upload')) {
    const u = await env.DB.prepare('SELECT * FROM uploads WHERE id = ?1 AND job_id = ?2').bind(Number(url.searchParams.get('upload')), jobId).first();
    const f = u && await loadNamed(env.DB, `upload-${u.id}`);
    if (!f) return json({ error: 'That file isn’t here any more.' }, 404);
    return new Response(Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0)), { headers: { 'content-type': u.type, 'content-disposition': `inline; filename="${u.name.replace(/"/g, '')}"`, 'cache-control': 'private, no-store' } });
  }
  try {
    const [t, galleries, shared, docs, uploads] = await Promise.all([
      portalToken(env.DB, jobId),
      env.DB.prepare('SELECT id, title, url, note FROM galleries WHERE job_id = ?1 ORDER BY id').bind(jobId).all(),
      env.DB.prepare('SELECT document_id FROM job_documents WHERE job_id = ?1').bind(jobId).all(),
      listDocuments(env.DB),
      env.DB.prepare('SELECT u.id, u.name, u.size, u.created_at, u.questionnaire_id FROM uploads u WHERE u.job_id = ?1 ORDER BY u.id').bind(jobId).all(),
    ]);
    const on = new Set(shared.results.map((r) => r.document_id));
    return json({ link: portalLink(t), path: `/portal?t=${t}`, galleries: galleries.results,
      documents: docs.map(({ id, name, size }) => ({ id, name, size, shared: on.has(id) })), uploads: uploads.results });
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => null);
  const jobId = Number(d?.job_id);
  if (!jobId || !(await env.DB.prepare('SELECT 1 FROM jobs WHERE id = ?1').bind(jobId).first())) return json({ error: 'That job doesn’t exist.' }, 404);
  const text = (v, max) => (v ?? '').toString().trim().slice(0, max);
  if (d.action === 'gallery') {
    const title = text(d.title, 120);
    let url = text(d.url, 500);
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    try { new URL(url); } catch { return json({ error: 'That gallery link doesn’t look right.' }, 400); }
    if (!title) return json({ error: 'Give the gallery a name, e.g. “Your practice shoot”.' }, 400);
    await env.DB.prepare('INSERT INTO galleries (job_id, title, url, note, created_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(jobId, title, url, text(d.note, 300), new Date().toISOString()).run();
    return json({ ok: true });
  }
  if (d.action === 'gallery-remove') {
    await env.DB.prepare('DELETE FROM galleries WHERE id = ?1 AND job_id = ?2').bind(Number(d.id), jobId).run();
    return json({ ok: true });
  }
  if (d.action === 'share') {
    const ids = new Set((await env.DB.prepare('SELECT id FROM documents').all()).results.map((r) => r.id));
    const pick = [...new Set((Array.isArray(d.document_ids) ? d.document_ids : []).map(Number))].filter((id) => ids.has(id));
    await env.DB.batch([
      env.DB.prepare('DELETE FROM job_documents WHERE job_id = ?1').bind(jobId),
      ...pick.map((id) => env.DB.prepare('INSERT INTO job_documents (job_id, document_id) VALUES (?1, ?2)').bind(jobId, id)),
    ]);
    return json({ ok: true });
  }
  if (d.action === 'upload-remove') {
    const r = await env.DB.prepare('DELETE FROM uploads WHERE id = ?1 AND job_id = ?2').bind(Number(d.id), jobId).run();
    if (r.meta.changes) await env.DB.prepare('DELETE FROM files WHERE name = ?1').bind(`upload-${Number(d.id)}`).run();
    return json({ ok: true });
  }
  return json({ error: 'What should happen?' }, 400);
}
