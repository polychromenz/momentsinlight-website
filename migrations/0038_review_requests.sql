-- Review requests (feature ideas, 20 Oct 2026): a gentle reminder after the wedding review request,
-- and review requests for portrait and headshot clients. New steps are "Email you review and send"
-- so Tony sees each one before it goes; any of them stops if the client has already left a Google
-- review (stop_on 'reviewed', checked in functions/api/crm/run.js). Wording editable in Settings > Email templates.
INSERT OR IGNORE INTO templates (key, name, subject, body, updated_at) VALUES
('review-reminder', 'Review reminder', 'A quick favour?', 'Hi {{first_name}},

I hope you''ve been enjoying your photos! Just a gentle nudge in case my last email got buried: if you have a couple of minutes, a short review on [Google](https://g.page/r/Cbkm1-AS-EIDEAE/review) would really help other people find me.

And if anything isn''t quite right, just reply and let me know. I''d love the chance to make it right.

Thanks so much,', '2026-10-20T00:00:00.000Z'),
('review-request-shoot', 'Review request (portraits and headshots)', 'Thank you, and a small favour', 'Hi {{first_name}},

Thank you so much for choosing me for your photos. I really hope you love them!

I rely heavily on word of mouth and on reviews. If you don''t mind spending a few minutes to give me a short review on [Google](https://g.page/r/Cbkm1-AS-EIDEAE/review), it would mean the world to me.

If you''re not completely happy, I want to hear from you and see how I can help to make things right.

Thanks again, and take care,', '2026-10-20T00:00:00.000Z');

-- Wedding: the existing review request stops if they've already reviewed, and a reminder 10 days later.
UPDATE workflows SET steps = replace(steps, '"after_step":"09-photos-ready","days":3}', '"after_step":"09-photos-ready","days":3,"stop_on":"reviewed"}'), updated_at = '2026-10-20T00:00:00.000Z' WHERE key = 'wedding';
UPDATE workflows SET steps = json_insert(steps, '$[#]', json('{"id":"11-review-reminder","title":"11 Review reminder","kind":"ready_email","template":"review-reminder","when":"step","after_step":"10-review","days":10,"stop_on":"reviewed"}')), updated_at = '2026-10-20T00:00:00.000Z'
  WHERE key = 'wedding' AND steps NOT LIKE '%11-review-reminder%';

-- Portraits and headshots: three weeks after the shoot (after the gallery's usually out), then a reminder.
UPDATE workflows SET steps = json_insert(json_insert(steps, '$[#]', json('{"id":"07-review","title":"P7 Review request","kind":"ready_email","template":"review-request-shoot","when":"after","days":21,"stop_on":"reviewed"}')),
  '$[#]', json('{"id":"08-review-reminder","title":"P8 Review reminder","kind":"ready_email","template":"review-reminder","when":"step","after_step":"07-review","days":10,"stop_on":"reviewed"}')), updated_at = '2026-10-20T00:00:00.000Z'
  WHERE key = 'portrait' AND steps NOT LIKE '%07-review%';
UPDATE workflows SET steps = json_insert(json_insert(steps, '$[#]', json('{"id":"07-review","title":"H7 Review request","kind":"ready_email","template":"review-request-shoot","when":"after","days":21,"stop_on":"reviewed"}')),
  '$[#]', json('{"id":"08-review-reminder","title":"H8 Review reminder","kind":"ready_email","template":"review-reminder","when":"step","after_step":"07-review","days":10,"stop_on":"reviewed"}')), updated_at = '2026-10-20T00:00:00.000Z'
  WHERE key = 'headshot' AND steps NOT LIKE '%07-review%';

-- Google reviews seen (names), so a reminder isn't sent to someone who has already reviewed.
CREATE TABLE IF NOT EXISTS google_reviewers (
  name TEXT PRIMARY KEY,
  seen_at TEXT NOT NULL
);
