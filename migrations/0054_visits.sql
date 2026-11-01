-- Which Google ad search brought an enquiry (JSON: term, match, campaign, gclid, landing page),
-- and the site's own visit log for Studio > SEO > Pages: each page a visitor viewed, how long it
-- was open and how far they scrolled, and whether the visit started from an ad. No names or IP
-- addresses: a visit is a random id the browser keeps for that tab only.
ALTER TABLE jobs ADD COLUMN ad_click TEXT;

CREATE TABLE page_views (
  id INTEGER PRIMARY KEY,
  sid TEXT NOT NULL,          -- the visit (random, per browser tab)
  seq INTEGER NOT NULL,       -- 1 = the page they landed on, 2 = the next, ...
  path TEXT NOT NULL,
  ref TEXT,                   -- where the visit came from (landing page only): google, facebook, ...
  ad INTEGER NOT NULL DEFAULT 0,
  ad_term TEXT,
  secs INTEGER NOT NULL DEFAULT 0,   -- time the page was on screen
  scroll INTEGER NOT NULL DEFAULT 0, -- furthest scrolled, percent
  mobile INTEGER NOT NULL DEFAULT 0,
  at TEXT NOT NULL,
  UNIQUE (sid, seq)
);
CREATE INDEX page_views_at ON page_views (at);
