// The studio CRM's document library (Settings > Documents): files Tony uploads once and attaches
// to emails (wedding guide, price list, posing guide…). Stored privately in D1 in pieces (D1
// limits one value's size); see migrations/0007_crm_documents.sql. Never public.

export const MAX_FILE = 10 * 1024 * 1024;   // 10 MB per document
export const MAX_EMAIL = 24 * 1024 * 1024;  // Gmail allows 25 MB per email; leave room for the text
const PART = 90_000;                         // base64 characters per stored piece

const fileName = (id) => `doc-${id}`;

/** All documents, with the templates that attach each one. */
export async function listDocuments(db) {
  const [docs, templates] = await Promise.all([
    db.prepare('SELECT id, name, type, size, created_at, updated_at FROM documents ORDER BY name COLLATE NOCASE').all(),
    db.prepare('SELECT key, name, attachments FROM templates').all(),
  ]);
  return docs.results.map((d) => ({
    ...d,
    used_by: templates.results.filter((t) => JSON.parse(t.attachments || '[]').includes(d.id)).map((t) => t.name),
  }));
}

/** Store (or replace) a document's file. base64 = the file's contents. */
export async function storeFile(db, id, type, base64) {
  const now = new Date().toISOString();
  const parts = [];
  for (let i = 0; i < base64.length; i += PART) parts.push(base64.slice(i, i + PART));
  const stmts = [db.prepare('DELETE FROM files WHERE name = ?1').bind(fileName(id)),
    ...parts.map((data, i) => db.prepare('INSERT INTO files (name, part, type, data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(fileName(id), i, type, data, now))];
  for (let i = 0; i < stmts.length; i += 40) await db.batch(stmts.slice(i, i + 40));
}

/** A document as an email attachment: { name, type, base64, size }, or null if it's gone. */
export async function loadDocument(db, id) {
  const doc = await db.prepare('SELECT id, name, type, size FROM documents WHERE id = ?1').bind(id).first();
  if (!doc) return null;
  const parts = await db.prepare('SELECT data FROM files WHERE name = ?1 ORDER BY part').bind(fileName(id)).all();
  if (!parts.results.length) return null;
  return { name: doc.name, type: doc.type, size: doc.size, base64: parts.results.map((p) => p.data).join('') };
}

/** The attachments for an email (document ids), checked: all present and under Gmail's limit. */
export async function attachmentsFor(db, ids) {
  const out = [];
  for (const id of [...new Set((ids ?? []).map(Number).filter(Boolean))]) {
    const doc = await loadDocument(db, id);
    if (!doc) throw new Error('One of the attached documents is no longer in the library. Untick it or choose another.');
    out.push(doc);
  }
  const total = out.reduce((a, d) => a + d.size, 0);
  if (total > MAX_EMAIL) throw new Error(`The attachments come to ${(total / 1048576).toFixed(1)} MB; Gmail allows about 25 MB per email. Untick one.`);
  return out;
}

export const deleteFile = (db, id) => db.prepare('DELETE FROM files WHERE name = ?1').bind(fileName(id)).run();
