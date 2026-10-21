-- Music for slideshow Reels (Tony's Pixabay tracks, files in R2 GALLERY_WEB social/music/) and
-- each post's format: 'photos' (as before) or 'reel' (a slideshow video made in the editor).
CREATE TABLE IF NOT EXISTS social_music (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  mood TEXT NOT NULL DEFAULT '',
  file TEXT NOT NULL,
  seconds REAL,
  created_at TEXT NOT NULL
);
ALTER TABLE social_posts ADD COLUMN format TEXT NOT NULL DEFAULT 'photos';
ALTER TABLE social_posts ADD COLUMN music_id INTEGER;
