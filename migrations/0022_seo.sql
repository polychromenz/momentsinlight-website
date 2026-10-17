-- SEO in the studio (functions-lib/seo.js, /studio/seo): each week the timer saves where the site
-- ranks on Google for Tony's tracked searches (from Google Search Console), so the SEO page can
-- show the trend. Settings ('seo'): the Search Console property, tracked searches, posts goal.
CREATE TABLE seo_positions (
  week TEXT NOT NULL,          -- the Monday, YYYY-MM-DD
  keyword TEXT NOT NULL,
  position REAL,               -- average position (1 = top); NULL = not in Google's results that week
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week, keyword)
);
