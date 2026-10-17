-- The client portal (/portal?t=…): one private link per job (jobs.portal_token, made when first
-- needed), gallery links Tony adds (Pic-Time for now), and which library documents each couple can
-- download from their portal. The welcome text, gallery intro and banner photo are in settings
-- ('portal'); see functions-lib/portal.js for the defaults. Files couples upload from the portal
-- go in `uploads` (questionnaire_id NULL).
ALTER TABLE jobs ADD COLUMN portal_token TEXT;
CREATE UNIQUE INDEX jobs_portal_token ON jobs (portal_token);

CREATE TABLE galleries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs (id),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX galleries_job ON galleries (job_id);

CREATE TABLE job_documents (
  job_id INTEGER NOT NULL REFERENCES jobs (id),
  document_id INTEGER NOT NULL,
  PRIMARY KEY (job_id, document_id)
);
