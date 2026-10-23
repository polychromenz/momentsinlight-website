-- Tagging venues and suppliers in social posts (functions-lib/social-tags.js): each contact's
-- Instagram handle and Facebook page, and each post's tags (contact ids; NULL = the venue, if it's
-- a contact, until Tony changes them).
ALTER TABLE contacts ADD COLUMN instagram TEXT NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN facebook TEXT NOT NULL DEFAULT '';
ALTER TABLE social_posts ADD COLUMN tags TEXT;
