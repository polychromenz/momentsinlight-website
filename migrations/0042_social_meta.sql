-- Social milestone 2 (functions-lib/meta.js): approved Facebook and Instagram posts publish themselves.
-- media: the photo files made when Tony approved it (public addresses Meta fetches), in order.
ALTER TABLE social_posts ADD COLUMN media TEXT;
ALTER TABLE social_posts ADD COLUMN remote_url TEXT;   -- the post on Facebook or Instagram once it's out
ALTER TABLE social_posts ADD COLUMN posting_at TEXT;   -- when publishing started (a stuck one is flagged after 30 minutes)
