-- The names of the files attached to each email, so the studio can show them when an email is opened.
ALTER TABLE messages ADD COLUMN attachments TEXT NOT NULL DEFAULT '';
