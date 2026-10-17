-- When the timer last looked at a job's Gmail conversation for new emails (functions/api/crm/run.js
-- checks a dozen jobs per run, the longest unchecked first).
ALTER TABLE jobs ADD COLUMN mail_checked_at TEXT;
