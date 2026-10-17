// The document library (Settings > Documents).
//   GET    /api/studio/crm/documents              the list, with the templates using each
//   GET    /api/studio/crm/documents?id=3         download one (to check it)
//   POST   /api/studio/crm/documents              { name, type, base64 }  upload a new one
//   PUT    /api/studio/crm/documents              { id, name?, type?, base64? }  rename / replace
//   DELETE /api/studio/crm/documents?id=3         delete (not while a template attaches it)
import { json } from '../../../../functions-lib/studio.js';
import { listDocuments, storeFile, loadDocument, deleteFile, MAX_FILE } from '../../../../functions-lib/documents.js';

const cleanName = (s) => (s ?? '').toString().replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);
const sizeOf = (b64) => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
const validB64 = (s) => typeof s === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(s);

export async function onRequestGet({ request, env }) {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!id) return json({ documents: await listDocuments(env.DB) });
  const doc = await loadDocument(env.DB, id);
  if (!doc) return json({ error: 'That document isn’t in the library.' }, 404);
  const bytes = Uint8Array.from(atob(doc.base64), (c) => c.charCodeAt(0));
  return new Response(bytes, { headers: { 'content-type': doc.type, 'content-disposition': `inline; filename="${doc.name.replace(/"/g, '')}"`, 'cache-control': 'no-store' } });
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => null);
  const name = cleanName(d?.name);
  if (!name || !validB64(d?.base64) || !d.base64) return json({ error: 'Choose a file to upload.' }, 400);
  const size = sizeOf(d.base64);
  if (size > MAX_FILE) return json({ error: `That file is ${(size / 1048576).toFixed(1)} MB; the limit is 10 MB.` }, 400);
  const now = new Date().toISOString();
  const r = await env.DB.prepare('INSERT INTO documents (name, type, size, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4) RETURNING id')
    .bind(name, (d.type || 'application/octet-stream').slice(0, 100), size, now).first();
  try {
    await storeFile(env.DB, r.id, d.type || 'application/octet-stream', d.base64);
  } catch (e) {
    await env.DB.prepare('DELETE FROM documents WHERE id = ?1').bind(r.id).run();
    throw e;
  }
  return json({ ok: true, id: r.id });
}

export async function onRequestPut({ request, env }) {
  const d = await request.json().catch(() => null);
  const doc = d?.id && await env.DB.prepare('SELECT * FROM documents WHERE id = ?1').bind(Number(d.id)).first();
  if (!doc) return json({ error: 'That document isn’t in the library.' }, 404);
  const now = new Date().toISOString();
  if (d.base64 !== undefined) {
    if (!validB64(d.base64) || !d.base64) return json({ error: 'Choose a file.' }, 400);
    const size = sizeOf(d.base64);
    if (size > MAX_FILE) return json({ error: `That file is ${(size / 1048576).toFixed(1)} MB; the limit is 10 MB.` }, 400);
    const type = (d.type || doc.type).slice(0, 100);
    await storeFile(env.DB, doc.id, type, d.base64);
    await env.DB.prepare('UPDATE documents SET type = ?2, size = ?3, updated_at = ?4 WHERE id = ?1').bind(doc.id, type, size, now).run();
  }
  if (d.name !== undefined) {
    const name = cleanName(d.name);
    if (!name) return json({ error: 'A document needs a name.' }, 400);
    await env.DB.prepare('UPDATE documents SET name = ?2, updated_at = ?3 WHERE id = ?1').bind(doc.id, name, now).run();
  }
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const id = Number(new URL(request.url).searchParams.get('id'));
  const doc = (await listDocuments(env.DB)).find((x) => x.id === id);
  if (!doc) return json({ error: 'That document isn’t in the library.' }, 404);
  if (doc.used_by.length) return json({ error: `It’s attached to: ${doc.used_by.join(', ')}. Untick it in those templates first.` }, 409);
  await deleteFile(env.DB, id);
  await env.DB.prepare('DELETE FROM documents WHERE id = ?1').bind(id).run();
  return json({ ok: true });
}
