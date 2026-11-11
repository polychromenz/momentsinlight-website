-- The partner's own email and phone on a job (next to partner_name), shown on the client page and
-- in the phone app. Recorded only: studio emails still go to the main client.
ALTER TABLE jobs ADD COLUMN partner_email TEXT NOT NULL DEFAULT '';
ALTER TABLE jobs ADD COLUMN partner_phone TEXT NOT NULL DEFAULT '';
