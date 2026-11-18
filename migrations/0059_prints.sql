-- Prints from the client galleries (MIL Galleries 3a, decided with Tony 2026-11-18; functions-lib/prints.js).
-- The product list comes from Tony's Pic-Time price list (Studio > Galleries > Prints > Import). Couples
-- (and anyone with a gallery link) pick a photo, product and size, set the crop, and pay by card
-- (Stripe Checkout, which also collects the delivery address). Orders wait for Tony's approval; for
-- now he orders from the lab himself (Atkins or Seldex), so `lab` and `hold_until` are kept ready
-- for sending orders to a lab automatically later. Only Tony sees the shop until he switches it on.

CREATE TABLE IF NOT EXISTS print_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,          -- Pic-Time's "Product": Prints, Canvas, Frames, Matted Frames…
  type TEXT NOT NULL DEFAULT '',   -- paper (Fine Art, Matte, Semi Gloss), frame or canvas edge colour
  name TEXT NOT NULL,              -- e.g. "20x30cm Fine art"
  lab TEXT NOT NULL DEFAULT '',    -- Atkins Lab, Seldex
  kind TEXT NOT NULL DEFAULT 'other', -- how it's drawn and sold: print, deckled, matted, canvas, frame, float, matted-frame, circle, board, other (not sold per photo yet)
  w_cm REAL,                       -- the photo's size on it (short side first), for the crop ratio
  h_cm REAL,
  cost REAL,                       -- the lab's cost, in its own currency
  cost_currency TEXT NOT NULL DEFAULT 'AUD',
  price INTEGER NOT NULL DEFAULT 0, -- what the client pays, NZ$ cents incl. GST
  tiers TEXT,                      -- bulk prices: JSON [{ q, base, add }] (cents): q or more of it cost base + (n - q) × add
  active INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS print_products_key ON print_products (category, type, name, lab);

CREATE TABLE IF NOT EXISTS print_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,     -- P-2026-0001
  gallery_id TEXT NOT NULL,
  link_id INTEGER,
  viewer_id INTEGER,
  job_id INTEGER,                  -- the gallery's client, when the buyer is the couple (invoice + Xero)
  buyer_kind TEXT,                 -- the link kind: main_client, invited, guest, studio
  status TEXT NOT NULL DEFAULT 'pending', -- pending (at Stripe), paid (waiting for Tony), approved, ordered, shipped, cancelled
  name TEXT, email TEXT, phone TEXT,
  address TEXT,                    -- JSON from Stripe: { name, line1, line2, city, state, postal_code, country }
  note TEXT,                       -- from the buyer
  subtotal INTEGER NOT NULL DEFAULT 0, freight INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0, -- cents incl. GST
  stripe_session TEXT, stripe_payment TEXT,
  invoice_id INTEGER,
  test INTEGER NOT NULL DEFAULT 0, -- Tony trying it out (no payment, no invoice, emails to Tony)
  paid_at TEXT, hold_until TEXT, approved_at TEXT, ordered_at TEXT, shipped_at TEXT, cancelled_at TEXT,
  lab_ref TEXT,                    -- the lab's order number(s)
  tracking TEXT,
  tony_note TEXT,
  created_at TEXT NOT NULL, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS print_orders_status ON print_orders (status, created_at);
CREATE INDEX IF NOT EXISTS print_orders_gallery ON print_orders (gallery_id);

CREATE TABLE IF NOT EXISTS print_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  image_id TEXT NOT NULL,
  product_id INTEGER,
  product TEXT NOT NULL,           -- a copy of the product as bought: JSON { category, type, name, lab, kind, w_cm, h_cm }
  qty INTEGER NOT NULL DEFAULT 1,
  amount INTEGER NOT NULL DEFAULT 0, -- this line's share in cents (bulk prices worked out per product across the order)
  crop TEXT,                       -- JSON { x, y, w, h } as fractions of the photo, and landscape: 0/1
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS print_order_items_order ON print_order_items (order_id);

-- Tony can switch prints off for a gallery (its Details tab).
ALTER TABLE photo_galleries ADD COLUMN prints_off INTEGER NOT NULL DEFAULT 0;
-- Which prints order a paid invoice came from.
ALTER TABLE invoices ADD COLUMN print_order_id INTEGER;

INSERT OR IGNORE INTO templates (key, name, subject, body, updated_at) VALUES ('print-order', 'Prints order confirmation',
  'Your print order {{order_number}}',
  '<p>Hi {{first_name}},</p><p>Thank you for your order! Here’s what you ordered from <strong>{{gallery_name}}</strong>:</p>{{order_items}}<p>Tony checks every order by hand before it goes to the lab, so the colours and crops are just right. Printing and delivery usually take two to three weeks, and you’ll get an email when it’s on its way.</p><p>If you’d like to change anything, just reply to this email.</p><p>Warm regards,</p>',
  '2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO templates (key, name, subject, body, updated_at) VALUES ('print-shipped', 'Prints order on its way',
  'Your prints are on their way',
  '<p>Hi {{first_name}},</p><p>Good news: your print order {{order_number}} is on its way to you.</p>{{tracking}}<p>I hope you love them. If anything isn’t right when they arrive, just reply to this email.</p><p>Warm regards,</p>',
  '2026-11-18T00:00:00.000Z');
