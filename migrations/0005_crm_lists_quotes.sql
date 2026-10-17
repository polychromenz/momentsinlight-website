-- Studio CRM phase 2: editable lists (job types, lead sources), payment schedules, quote
-- templates and quotes. Seeded from Studio Ninja (17 Oct 2026); edited in the studio Settings.

-- Job types and lead sources. on_form = shown on the enquiry form; workflow = the workflow a new
-- enquiry of this type follows (job types only).
CREATE TABLE lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                 -- 'job_type' | 'lead_source'
  value TEXT NOT NULL,                -- stored on jobs (e.g. 'Bride and Groom')
  label TEXT NOT NULL,                -- shown on the form (e.g. 'A couple I photographed')
  workflow TEXT,
  on_form INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  UNIQUE (kind, value)
);
INSERT INTO lists (kind, value, label, workflow, on_form, sort) VALUES ('job_type', 'Wedding', 'Wedding', 'wedding', 1, 0);
INSERT INTO lists (kind, value, label, workflow, on_form, sort) VALUES ('job_type', 'Portraits', 'Portraits', NULL, 1, 1);
INSERT INTO lists (kind, value, label, workflow, on_form, sort) VALUES ('job_type', 'Family', 'Family', NULL, 1, 2);
INSERT INTO lists (kind, value, label, workflow, on_form, sort) VALUES ('job_type', 'Headshots', 'Headshots', NULL, 1, 3);
INSERT INTO lists (kind, value, label, workflow, on_form, sort) VALUES ('job_type', 'Lifestyle', 'Lifestyle', NULL, 1, 4);
INSERT INTO lists (kind, value, label, workflow, on_form, sort) VALUES ('job_type', 'Event', 'Event', NULL, 1, 5);
INSERT INTO lists (kind, value, label, workflow, on_form, sort) VALUES ('job_type', 'Commercial / Advertising', 'Commercial / Advertising', NULL, 1, 6);
INSERT INTO lists (kind, value, label, on_form, sort) VALUES ('lead_source', 'Google', 'Google', 1, 0);
INSERT INTO lists (kind, value, label, on_form, sort) VALUES ('lead_source', 'Instagram', 'Instagram', 1, 1);
INSERT INTO lists (kind, value, label, on_form, sort) VALUES ('lead_source', 'Facebook', 'Facebook', 1, 2);
INSERT INTO lists (kind, value, label, on_form, sort) VALUES ('lead_source', 'MyWeddingGuide', 'My Wedding Guide', 1, 3);
INSERT INTO lists (kind, value, label, on_form, sort) VALUES ('lead_source', 'Word of mouth', 'A friend or family member', 1, 4);
INSERT INTO lists (kind, value, label, on_form, sort) VALUES ('lead_source', 'Bride and Groom', 'A couple I photographed', 1, 5);
INSERT INTO lists (kind, value, label, on_form, sort) VALUES ('lead_source', 'Referral', 'Another wedding supplier', 1, 6);
INSERT INTO lists (kind, value, label, on_form, sort) VALUES ('lead_source', 'Blog post', 'Your blog', 1, 7);
INSERT INTO lists (kind, value, label, on_form, sort) VALUES ('lead_source', 'Online directory', 'An online directory', 1, 8);
INSERT INTO lists (kind, value, label, on_form, sort) VALUES ('lead_source', 'Verve Magazine', 'Verve Magazine', 1, 9);
INSERT INTO lists (kind, value, label, on_form, sort) VALUES ('lead_source', 'Reddit', 'Reddit', 1, 10);
INSERT INTO lists (kind, value, label, on_form, sort) VALUES ('lead_source', 'Event', 'An event or wedding show', 1, 11);

-- Payment schedules: parts = [{ percent, label, when: 'accept' | 'before' | 'after', days?, months? }]
-- ('before'/'after' the event date; 'accept' = when the quote is accepted, plus any days).
CREATE TABLE payment_schedules (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parts TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO payment_schedules (key, name, parts, updated_at) VALUES ('wedding-10-40-50', 'Moments In Light Wedding payment schedule 10/40/50', '[{"percent":10,"label":"Deposit","when":"accept"},{"percent":40,"label":"Second payment","when":"before","months":2},{"percent":50,"label":"Final payment","when":"before","months":1}]', '2026-10-17T00:00:00.000Z');
INSERT INTO payment_schedules (key, name, parts, updated_at) VALUES ('50-50', '50/50', '[{"percent":50,"label":"First payment","when":"before","days":3},{"percent":50,"label":"Final payment","when":"after","days":3}]', '2026-10-17T00:00:00.000Z');
INSERT INTO payment_schedules (key, name, parts, updated_at) VALUES ('due-7-days', 'Due in 7 Days', '[{"percent":100,"label":"Payment","when":"accept","days":7}]', '2026-10-17T00:00:00.000Z');

-- Quote templates: packages = [{ name, subtitle, price (cents, incl. GST), description (Markdown),
-- recommended }], extras = [{ name, price, description }] the couple can add.
CREATE TABLE quote_templates (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  job_type TEXT,
  intro TEXT NOT NULL DEFAULT '',
  packages TEXT NOT NULL DEFAULT '[]',
  extras TEXT NOT NULL DEFAULT '[]',
  schedule_key TEXT,
  valid_days INTEGER NOT NULL DEFAULT 30,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
INSERT INTO quote_templates (key, name, job_type, intro, packages, extras, schedule_key, valid_days, notes, updated_at) VALUES ('wedding', 'Wedding Pick and Choose', 'Wedding', 'Thank you so much for considering me. If you are ready to go ahead, just click the Accept button and then you''ll get a contract to sign and a deposit invoice. It''s really quick and easy, you can even do this on your phone. If you do have any remaining questions, you can call me anytime.', '[{"name":"The Classic Experience","subtitle":"6+ hours","price":299500,"description":"You choose how you use the time, along with the support and preparation to feel relaxed and confident in front of the camera.\n\n- **Full wedding day coverage 6+ hours**– For those who know exactly what they want and don’t need everything covered. You choose when I start either from bridal prep or later on. Some couple prioritise the evening and some prioritise getting ready and all those details\n- **Pre-wedding consultation** – So I understand your vision, I’ll listen to your plans and take that on board.\n- **Engagement / practice shoot** - get to know me and have professional images for invites and signage etc. (done near to booking) **1 hour shoot** at one of several locations that I know well.\n- **Professionally edited high-resolution images** - In both colour and black and white, having both makes for more compelling galleries and albums.\n- **Beautiful curated online gallery for viewing and sharing** - Easily accessible for you and your loved ones.\n- **Travel within Auckland** - As long as your wedding is in Auckland you are good to go.","recommended":false},{"name":"The Deluxe Experience","subtitle":"8+ hours","price":399500,"description":"This is designed to give you complete coverage of your day, along with the support and preparation to feel relaxed and confident in front of the camera.\n\n- **Full wedding day coverage 8+ hours**– let’s not watch the clock. From bridal prep, ceremony, bridal party photos and reception, right through to first dance and party time. No need to think about what’s included!\n- **Pre-wedding consultation** – So I understand your vision, I’ll listen to your plans and take that on board.\n- **Engagement / practice shoot** - get to know me and have professional images for invites and signage etc. (done near to booking) **2 hours shoot** within Auckland.\n- **Professionally edited high-resolution images** - In both colour and black and white, having both makes for more compelling galleries and albums.\n- **Beautiful curated online gallery for viewing and sharing** - Easily accessible for you and your loved ones.\n- **Prints** - A set of 10 fine art 8x10” prints\n- **Travel within Auckland** - As long as your wedding is in Auckland you are good to go.","recommended":true}]', '[]', 'wedding-10-40-50', 30, 'For weddings shot within Auckland (travel costs outside Auckland). Please note that this quote is valid for 30 days.', '2026-10-17T00:00:00.000Z');

-- Quotes sent to a client. token = the private link. Packages etc. are copied from the template
-- when the quote is made, so later template edits never change a sent quote.
-- status: draft | sent | accepted | declined | withdrawn
CREATE TABLE quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs (id),
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  intro TEXT NOT NULL DEFAULT '',
  packages TEXT NOT NULL DEFAULT '[]',
  extras TEXT NOT NULL DEFAULT '[]',
  discount INTEGER NOT NULL DEFAULT 0,
  discount_label TEXT NOT NULL DEFAULT '',
  schedule TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  valid_until TEXT,
  chosen_package INTEGER,
  chosen_extras TEXT NOT NULL DEFAULT '[]',
  total INTEGER,
  accepted_name TEXT,
  accepted_ip TEXT,
  accepted_at TEXT,
  sent_at TEXT,
  viewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX quotes_job ON quotes (job_id);

-- The email that sends a quote (wording drafted for Tony to edit in Settings).
INSERT OR IGNORE INTO templates (key, name, subject, body, attachment, updated_at) VALUES ('quote-ready', 'Quote ready', 'Your wedding photography quote', 'Hi {{first_name}},

Thanks so much for chatting with me about your wedding. Here''s your quote, with both packages so you can choose what suits you best.

[View your quote]({{quote_link}})

The quote is valid until {{quote_valid_until}}. When you''re ready, just choose your package and click Accept, and I''ll send your contract.

If you have any questions at all, just reply to this email or give me a call.

Speak soon,', NULL, '2026-10-17T00:00:00.000Z');
