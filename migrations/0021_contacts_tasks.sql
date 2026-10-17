-- Contacts: venues and suppliers Tony works with or emails (SEO outreach for backlinks, etc.),
-- their emails (sent from the studio in the email design, replies picked up by the timer), and
-- studio tasks that aren't about a client (with a due date; on Today, the dashboard and the
-- morning email). See functions/api/studio/contacts.js and functions-lib/contacts.js.
--
-- outreach: none | emailed | replied | live | declined
-- link_page: their page where a link to Tony's site should be; the timer checks it (link_found).
CREATE TABLE contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Venue',
  contact_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  our_page TEXT NOT NULL DEFAULT '',
  outreach TEXT NOT NULL DEFAULT 'none',
  link_page TEXT NOT NULL DEFAULT '',
  link_found INTEGER,
  link_checked_at TEXT,
  last_emailed_at TEXT,
  mail_checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO contacts (business, type, our_page, created_at, updated_at) VALUES
  ('Abel Estate', 'Venue', '/abel-estate', '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
  ('Bridgewater Estate', 'Venue', '/bridgewater-estate-wedding-photographer', '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
  ('Kumeu Valley Estate', 'Venue', '/kumeu-valley-estate-wedding-photographer', '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
  ('Markovina Vineyard Estate', 'Venue', '/markovina-vineyard-estate-wedding-photographer', '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
  ('Settlers Country Manor', 'Venue', '/settlers-country-manor-wedding-photographer', '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
  ('The Barn Waimauku', 'Venue', '/the-barn-waimauku-wedding-photographer', '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z'),
  ('Tui Hills', 'Venue', '/tui-hills', '2026-10-17T00:00:00.000Z', '2026-10-17T00:00:00.000Z');

CREATE TABLE contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts (id),
  direction TEXT NOT NULL,      -- out | in
  subject TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  attachments TEXT NOT NULL DEFAULT '',
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  sent_at TEXT NOT NULL
);
CREATE INDEX contact_messages_contact ON contact_messages (contact_id, sent_at);

-- status: open | done
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  contact_id INTEGER,
  kind TEXT NOT NULL DEFAULT 'task',   -- task | follow_up | link_gone
  created_at TEXT NOT NULL,
  done_at TEXT,
  done_note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX tasks_open ON tasks (status, due_date);

-- A first draft for Tony to edit (Settings > Email templates). {{contact_name}}, {{business}} and
-- {{our_page}} come from the contact.
INSERT OR IGNORE INTO templates (key, name, subject, body, attachments, updated_at) VALUES ('backlink-request', 'Backlink request (venues)', 'A page about weddings at {{business}}',
'<p>Hi {{contact_name}},</p><p>I''m Tony from Moments in Light. I''ve photographed weddings at {{business}} and put together a page about it on my website, with photos from those days:</p><p><a href="{{our_page}}">{{our_page}}</a></p><p>You''re very welcome to use it. If you have a page for recommended suppliers or photographers, I''d be grateful if you could add a link to it there. [check: anything you''d like to offer in return, e.g. photos for their own website or socials, with credit]</p><p>Thanks so much, and I hope to see you at another wedding soon.</p>', '[]', '2026-10-17T00:00:00.000Z');
