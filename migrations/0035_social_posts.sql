-- Social media manager (docs/social-media-manager-plan.md): drafts the studio makes a week ahead,
-- which Tony edits and approves. Gallery photos marked Social are photo_picks with purpose 'social'.
CREATE TABLE IF NOT EXISTS social_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,                -- instagram | facebook | google | pinterest
  post_at TEXT NOT NULL,                 -- NZ time, 'YYYY-MM-DDTHH:MM'
  status TEXT NOT NULL DEFAULT 'draft',  -- draft | approved | skipped | posted | failed
  source TEXT NOT NULL,                  -- photos | blog | review | tip
  source_ref TEXT,                       -- gallery id, blog post id (#photo for pins), review name, tip key
  label TEXT,                            -- what it is, for the calendar (and a pin's title)
  caption TEXT NOT NULL DEFAULT '',
  link TEXT,
  photos TEXT NOT NULL DEFAULT '[]',     -- [{ src, w, h, image_id?, gallery_id?, crop? }]
  ai INTEGER NOT NULL DEFAULT 0,         -- caption drafted by AI (not yet edited)
  error TEXT,
  remote_id TEXT,                        -- the platform's id once it's posted itself (later milestones)
  created_at TEXT NOT NULL,
  approved_at TEXT,
  posted_at TEXT
);
CREATE INDEX IF NOT EXISTS social_posts_at ON social_posts (post_at);
CREATE INDEX IF NOT EXISTS social_posts_source ON social_posts (source, source_ref);
