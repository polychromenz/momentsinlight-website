-- Gallery photos Tony picks for Google Ads (and later social posts). Only he sees these.
-- crop_wide / crop_square: { x, y, w, h } as fractions of the photo; null square = wide only.
-- status: picked (suggested crops, not yet approved) | approved (files made, waiting for the Ads
-- script) | added (in Google Ads) | failed (see error).
CREATE TABLE photo_picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_id TEXT NOT NULL,
  gallery_id TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'ads',
  crop_wide TEXT,
  crop_square TEXT,
  status TEXT NOT NULL DEFAULT 'picked',
  asset_wide TEXT,
  asset_square TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  approved_at TEXT,
  added_at TEXT,
  UNIQUE (image_id, purpose)
);
CREATE INDEX photo_picks_gallery ON photo_picks (gallery_id);
