-- Rankings (functions-lib/rankings.js): Google results for the tracked searches from DataForSEO,
-- phone and desktop, from Auckland. A run is the NZ date it was asked for (weekly on Monday, or
-- "Check now" once a day).
CREATE TABLE serp_tasks (
  id TEXT PRIMARY KEY,                 -- DataForSEO's task id
  run TEXT NOT NULL,
  keyword TEXT NOT NULL,
  device TEXT NOT NULL,                -- mobile | desktop
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | done | error
  error TEXT,
  posted_at TEXT NOT NULL
);
CREATE INDEX serp_tasks_pending ON serp_tasks (status, posted_at);
CREATE TABLE serp_results (
  run TEXT NOT NULL,
  keyword TEXT NOT NULL,
  device TEXT NOT NULL,
  position INTEGER,                    -- your best place in the ordinary results (null = not in the top 20)
  url TEXT,                            -- your page Google showed
  has_map INTEGER NOT NULL DEFAULT 0,  -- the map listings showed for this search
  map_position INTEGER,                -- your place in them (null = not there)
  top TEXT NOT NULL DEFAULT '[]',      -- the top 10 results and the map listings, JSON
  checked_at TEXT NOT NULL,
  PRIMARY KEY (run, keyword, device)
);
-- Fix-list tasks remember which fix they're for, so they close themselves when the check passes.
ALTER TABLE tasks ADD COLUMN ref TEXT;
