-- Photos kept out of social posts and pins (functions-lib/kids.js): children-only photos, as the
-- studio's image AI sees them (checked once each), or as Tony sets them (manual = 1).
CREATE TABLE IF NOT EXISTS photo_flags (
  key TEXT PRIMARY KEY,          -- gallery image id, or a blog photo's address
  src TEXT NOT NULL,
  kids INTEGER NOT NULL DEFAULT 0,
  manual INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT '',
  checked_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS photo_flags_kids ON photo_flags (kids);
