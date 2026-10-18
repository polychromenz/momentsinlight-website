-- MIL Galleries (docs/MIL-Galleries-Spec.md, Phase 1); 'photo_galleries' because 'galleries' is the portal's gallery links. Photos live in R2:
--   GALLERY_FILES (mil-galleries, private)    galleries/{galleryId}/original/{imageId}.jpg
--   GALLERY_WEB   (mil-galleries-web, public at photos.momentsinlight.co.nz)
--                                              {galleryId}/{imageId}_2048.jpg and _600.jpg
-- Gallery and image ids are long random strings, so web addresses can't be guessed.
CREATE TABLE photo_galleries (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,                 -- the gallery's address: galleries.momentsinlight.co.nz/{slug}
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Wedding',      -- Wedding | Portraits | Headshots | Events (configurable)
  event_date TEXT,
  description TEXT NOT NULL DEFAULT '',
  venue TEXT NOT NULL DEFAULT '',
  spouse_a TEXT NOT NULL DEFAULT '',
  spouse_b TEXT NOT NULL DEFAULT '',
  family_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',      -- draft | online | offline
  expires_at TEXT,                           -- NZ date; null = never
  extension_price INTEGER,                   -- cents to keep it online 12 more months; null = the default, 0 = free
  cover_image_id TEXT,
  template_id INTEGER,
  client_id INTEGER,
  job_id INTEGER,
  show_on_portfolio INTEGER NOT NULL DEFAULT 0,
  seo_title TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'studio',     -- studio | lightroom | pictime
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX photo_galleries_client ON photo_galleries (client_id);

CREATE TABLE gallery_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gallery_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_bw INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  source_key TEXT                            -- e.g. a Lightroom collection id + label, for re-publishing
);
CREATE INDEX gallery_sections_gallery ON gallery_sections (gallery_id, sort_order);

CREATE TABLE gallery_images (
  id TEXT PRIMARY KEY,
  gallery_id TEXT NOT NULL,
  section_id INTEGER,
  filename TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  bytes INTEGER,                             -- the full-size file
  crc32 INTEGER,                             -- of the full-size file (for streamed ZIPs)
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_hero INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,         -- hidden by Tony (not shown to anyone)
  lightroom_id TEXT,
  checksum TEXT,
  taken_at TEXT,
  contributor_id INTEGER,
  has_original INTEGER NOT NULL DEFAULT 0,
  has_web INTEGER NOT NULL DEFAULT 0,
  has_thumb INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'uploading',  -- uploading | ready
  created_at TEXT NOT NULL
);
CREATE INDEX gallery_images_gallery ON gallery_images (gallery_id, section_id, sort_order);
CREATE INDEX gallery_images_lr ON gallery_images (gallery_id, lightroom_id);

CREATE TABLE gallery_videos (
  id TEXT PRIMARY KEY,
  gallery_id TEXT NOT NULL,
  section_id INTEGER,
  filename TEXT NOT NULL,
  bytes INTEGER,
  duration REAL,
  downloadable INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Who can see a gallery, and what they can do.
CREATE TABLE gallery_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gallery_id TEXT NOT NULL,
  kind TEXT NOT NULL,                        -- main_client | invited | guest | vendor | list_share
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  token TEXT NOT NULL UNIQUE,
  access_code TEXT,
  visible_section_ids TEXT,                  -- JSON array; null = all
  watermark INTEGER NOT NULL DEFAULT 0,
  downloads TEXT NOT NULL DEFAULT 'highres', -- none | web | highres
  allow_lists INTEGER NOT NULL DEFAULT 1,
  allow_shop INTEGER NOT NULL DEFAULT 0,
  require_email INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  vendor_id INTEGER,
  list_id INTEGER,
  parent_link_id INTEGER,                    -- a list_share link can never allow more than its parent
  sent_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX gallery_links_gallery ON gallery_links (gallery_id);

CREATE TABLE gallery_viewers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gallery_id TEXT NOT NULL,
  link_id INTEGER,
  email TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'guest',
  consent_marketing INTEGER NOT NULL DEFAULT 0,
  token TEXT NOT NULL UNIQUE,                -- kept in the viewer's browser
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL
);
CREATE INDEX gallery_viewers_gallery ON gallery_viewers (gallery_id, email);

CREATE TABLE gallery_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gallery_id TEXT NOT NULL,
  owner_viewer_id INTEGER,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'custom',       -- favourites | custom | selection_request
  purpose TEXT,                              -- album | retouch | prints | other
  status TEXT NOT NULL DEFAULT 'open',       -- open | submitted | locked
  min_count INTEGER,
  max_count INTEGER,
  deadline TEXT,
  instructions TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  submitted_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX gallery_lists_gallery ON gallery_lists (gallery_id, owner_viewer_id);

CREATE TABLE gallery_list_items (
  list_id INTEGER NOT NULL,
  image_id TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (list_id, image_id)
);

-- Views, downloads, shares, favourites, lists… for the dashboards.
CREATE TABLE gallery_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gallery_id TEXT NOT NULL,
  viewer_id INTEGER,
  link_id INTEGER,
  type TEXT NOT NULL,
  image_id TEXT,
  meta TEXT NOT NULL DEFAULT '{}',
  at TEXT NOT NULL
);
CREATE INDEX gallery_events_gallery ON gallery_events (gallery_id, type, at);

CREATE TABLE gallery_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
