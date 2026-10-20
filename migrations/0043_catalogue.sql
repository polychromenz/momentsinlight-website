-- Packages and products (Settings > Packages & products, like Studio Ninja's): Tony's library to
-- build quotes from. A quote copies what it uses, so later edits here never change a sent quote.
-- kind: package (they choose one) | product (an add-on they can tick, e.g. second shooter, prints)
CREATE TABLE IF NOT EXISTS catalogue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL DEFAULT 0,      -- cents, GST inclusive
  recommended INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- To start with: the wedding quote's two packages, Tony's Studio Ninja family shoots, and his two
-- studio-shoot add-ons (from his Studio Ninja settings, 20 Oct 2026).
INSERT INTO catalogue (kind, name, subtitle, description, price, recommended, sort, created_at, updated_at)
SELECT 'package', json_extract(p.value, '$.name'), COALESCE(json_extract(p.value, '$.subtitle'), ''), COALESCE(json_extract(p.value, '$.description'), ''),
  json_extract(p.value, '$.price'), COALESCE(json_extract(p.value, '$.recommended'), 0), p.key, datetime('now'), datetime('now')
FROM quote_templates t, json_each(t.packages) p WHERE t.key = 'wedding';

INSERT INTO catalogue (kind, name, subtitle, description, price, sort, created_at, updated_at) VALUES
  ('package', 'Family photoshoot', '2 hours', '', 40000, 10, datetime('now'), datetime('now')),
  ('package', 'Family photoshoot', '3 hours', '', 50000, 11, datetime('now'), datetime('now')),
  ('package', 'Family photoshoot', '4 hours', '', 60000, 12, datetime('now'), datetime('now')),
  ('product', '2 hour studio shoot at Mackenzie Studios', '', '2 hours in the studio at Mackenzie Studios.

Editing of all good images: if it''s in focus and not a duplicate, I will edit it.

**Beauty retouching**
I will cover full skin retouching on 10 images, and I''m happy to do more at a cost. Unless it''s an extreme close-up it''s not usually required.

**Travel**
This is included, so nothing to worry about here.', 65000, 20, datetime('now'), datetime('now')),
  ('product', '4 hour studio shoot at Mackenzie Studios', '', '4 hours in the studio at Mackenzie Studios.', 110000, 21, datetime('now'), datetime('now'));
