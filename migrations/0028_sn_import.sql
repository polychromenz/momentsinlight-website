-- The Studio Ninja import (dry run first). Everything it adds carries the batch name, so the
-- whole import can be undone. Imported jobs are on hold: the timer sends nothing for them
-- (no automatic emails, invoices or reminders, no calendar sync, no blog tasks) until Tony
-- switches them on at switch-over.
ALTER TABLE clients ADD COLUMN import_batch TEXT;
ALTER TABLE jobs ADD COLUMN import_batch TEXT;
ALTER TABLE jobs ADD COLUMN hold INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN import_batch TEXT;
-- A document can belong to one job (e.g. a couple's signed Studio Ninja contract) instead of the
-- shared library; job documents don't appear in Settings > Documents.
ALTER TABLE documents ADD COLUMN job_id INTEGER;
ALTER TABLE documents ADD COLUMN import_batch TEXT;
CREATE INDEX jobs_import ON jobs (import_batch);
