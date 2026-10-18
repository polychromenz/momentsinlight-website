-- When each image was first seen on a campaign (an image needs 30 days live before it can be
-- swapped out for a new ad pick; see functions-lib/picks.js). Images already there count as old.
CREATE TABLE ads_image_seen (
  campaign_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  PRIMARY KEY (campaign_id, asset_id)
);
INSERT OR IGNORE INTO ads_image_seen (campaign_id, asset_id, first_seen)
  SELECT json_extract(data, '$.owner'), json_extract(data, '$.asset_id'), '2026-01-01'
  FROM ads_entity WHERE kind = 'image' AND json_extract(data, '$.level') = 'campaign';
