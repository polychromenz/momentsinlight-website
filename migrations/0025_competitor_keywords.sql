-- The searches each competitor ranks for in New Zealand (DataForSEO Labs, fetched on request).
CREATE TABLE competitor_keywords (
  contact_id INTEGER NOT NULL,
  keyword TEXT NOT NULL,
  position INTEGER,
  volume INTEGER,          -- searches a month (Google Ads estimate)
  url TEXT,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (contact_id, keyword)
);
