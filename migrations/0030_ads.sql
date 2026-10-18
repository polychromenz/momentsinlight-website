-- Ads & SEO command centre (docs/MIL-Ads-SEO-Command-Centre-Spec.md), phase 1: data in.
-- Google Ads data arrives from Tony's Ads Script (scripts/google-ads/sync.js -> /api/ads/*); every
-- import re-sends the last 30 days (90 the first time) and replaces them, because Google revises
-- conversions. Money in NZD cents.
CREATE TABLE ads_campaign (               -- each campaign's settings, as of the last import
  campaign_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT,
  channel_type TEXT,                      -- SEARCH, DISPLAY, PERFORMANCE_MAX, SMART…
  channel_sub_type TEXT,
  bidding TEXT,                           -- e.g. MAXIMIZE_CLICKS, MAXIMIZE_CONVERSIONS, TARGET_CPA
  search_network INTEGER, partner_network INTEGER, display_network INTEGER,
  geo_target_type TEXT,                   -- PRESENCE or PRESENCE_OR_INTEREST
  budget_cents INTEGER,
  start_date TEXT,
  data TEXT NOT NULL DEFAULT '{}',        -- anything else (locations, languages, ad schedule…)
  updated_at TEXT NOT NULL
);
CREATE TABLE ads_campaign_daily (
  date TEXT NOT NULL, campaign_id TEXT NOT NULL,
  cost_cents INTEGER NOT NULL DEFAULT 0, impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0,
  conversions REAL NOT NULL DEFAULT 0, conversion_value REAL NOT NULL DEFAULT 0,
  search_impression_share REAL, lost_is_budget REAL, lost_is_rank REAL,
  PRIMARY KEY (date, campaign_id)
);
CREATE TABLE ads_keyword_daily (
  date TEXT NOT NULL, campaign_id TEXT NOT NULL, ad_group_id TEXT NOT NULL, criterion_id TEXT NOT NULL,
  text TEXT NOT NULL, match_type TEXT, status TEXT, quality_score INTEGER,
  cost_cents INTEGER NOT NULL DEFAULT 0, impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0, conversions REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (date, ad_group_id, criterion_id)
);
CREATE TABLE ads_search_term_daily (
  date TEXT NOT NULL, campaign_id TEXT NOT NULL, ad_group_id TEXT NOT NULL, search_term TEXT NOT NULL,
  matched_keyword TEXT, match_type TEXT,
  cost_cents INTEGER NOT NULL DEFAULT 0, impressions INTEGER NOT NULL DEFAULT 0, clicks INTEGER NOT NULL DEFAULT 0, conversions REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (date, ad_group_id, search_term, matched_keyword)
);
CREATE INDEX ads_search_term ON ads_search_term_daily (search_term);
-- Everything else the script sends, as it came: ad groups, ads, negatives, locations, conversion actions…
CREATE TABLE ads_entity (
  kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (kind, id)
);
CREATE TABLE ads_import_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_at TEXT NOT NULL, report TEXT, rows_received INTEGER NOT NULL DEFAULT 0, ok INTEGER NOT NULL DEFAULT 1, error TEXT
);
-- Changes queued from the dashboard for the script to make in Google Ads (phase 3).
CREATE TABLE ads_action (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL, payload TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL, applied_at TEXT, error TEXT
);
-- Search Console, query x page x day (kept from the Google connection; ~2-3 days behind).
CREATE TABLE gsc_query_daily (
  date TEXT NOT NULL, query TEXT NOT NULL, page TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0, impressions INTEGER NOT NULL DEFAULT 0, ctr REAL, position REAL,
  PRIMARY KEY (date, query, page)
);
CREATE INDEX gsc_query ON gsc_query_daily (query);
-- How each search relates to the business (joins Ads and Search Console).
CREATE TABLE keyword_map (
  term TEXT PRIMARY KEY, target_page TEXT, intent TEXT, notes TEXT NOT NULL DEFAULT ''
);
