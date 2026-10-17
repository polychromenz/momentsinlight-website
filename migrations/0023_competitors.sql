-- Competitor watch (functions-lib/seo.js): every page listed in each competitor's sitemap, so new
-- pages (blog posts, venue pages) show up week by week. A competitor is a contact of type Competitor.
CREATE TABLE competitor_pages (
  contact_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  lastmod TEXT,
  first_seen TEXT NOT NULL,
  baseline INTEGER NOT NULL DEFAULT 0,   -- 1 = there at the first check (not "new")
  PRIMARY KEY (contact_id, url)
);
ALTER TABLE contacts ADD COLUMN watch_checked_at TEXT;
ALTER TABLE contacts ADD COLUMN watch_error TEXT;
