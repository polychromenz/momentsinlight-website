-- Studio CRM: a library of documents (Settings > Documents) that email templates can attach.
-- Each document's file is stored privately in pieces in `files` under the name 'doc-<id>'.
-- Templates list their documents in `attachments` (a JSON list of document ids); the old single
-- `attachment` column is no longer used. The wedding guide moves into the library.
CREATE TABLE documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,           -- the file name the client sees, e.g. 'Moments in Light - Wedding Guide 2026.pdf'
  type TEXT NOT NULL,           -- e.g. 'application/pdf'
  size INTEGER NOT NULL,        -- bytes
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
ALTER TABLE templates ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]';
INSERT INTO documents (id, name, type, size, created_at, updated_at)
  SELECT 1, 'Moments in Light - Wedding Guide 2026.pdf', 'application/pdf', 2241043, '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'
  WHERE EXISTS (SELECT 1 FROM files WHERE name = 'wedding guide 2026.pdf');
UPDATE files SET name = 'doc-1' WHERE name = 'wedding guide 2026.pdf';
UPDATE templates SET attachments = '[1]' WHERE attachment = 'wedding guide 2026.pdf' AND EXISTS (SELECT 1 FROM documents WHERE id = 1);
