-- Pinterest boards per pin (functions-lib/social.js PIN_BOARDS): which themed board a pin goes to.
ALTER TABLE social_posts ADD COLUMN board TEXT;
