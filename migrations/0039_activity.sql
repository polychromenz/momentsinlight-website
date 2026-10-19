-- Who did what on each client (functions-lib/activity.js), shown on the client page.
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  who TEXT NOT NULL,        -- e.g. 'Tony', 'Mel'
  email TEXT NOT NULL DEFAULT '',
  what TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_job ON activity (job_id, at);
