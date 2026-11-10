-- The path an enquirer took through the site: a random browser id (kept in the browser, the same
-- across tabs) on each page view, and on the enquiry, so the new-enquiry email and the client page
-- can list the pages they looked at. Still no names or IP addresses in the visit log.
ALTER TABLE page_views ADD COLUMN vid TEXT;
CREATE INDEX page_views_vid ON page_views (vid, at);
ALTER TABLE jobs ADD COLUMN visitor_id TEXT;
