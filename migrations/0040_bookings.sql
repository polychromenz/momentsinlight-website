-- Online booking (functions-lib/booking.js, www.momentsinlight.co.nz/book).
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type_key TEXT NOT NULL,
  type_name TEXT NOT NULL,
  job_id INTEGER NOT NULL,
  appointment_id INTEGER,
  invoice_id INTEGER,                 -- paid sessions
  date TEXT NOT NULL,                 -- NZ date
  time TEXT NOT NULL,                 -- 'HH:MM' NZ time
  status TEXT NOT NULL,               -- held (waiting for payment) | confirmed | lapsed
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bookings_status ON bookings (status);

-- Automatic instalments (functions-lib/autopay.js): a couple's saved card, charged on each invoice's due date.
ALTER TABLE jobs ADD COLUMN autopay INTEGER NOT NULL DEFAULT 0;   -- they agreed to automatic payments
ALTER TABLE jobs ADD COLUMN stripe_customer TEXT;
ALTER TABLE jobs ADD COLUMN stripe_payment_method TEXT;
ALTER TABLE jobs ADD COLUMN autopay_card TEXT;                     -- e.g. 'Visa ending 4242', for the emails
ALTER TABLE invoices ADD COLUMN autopay_tried_at TEXT;
ALTER TABLE invoices ADD COLUMN autopay_error TEXT;

INSERT OR IGNORE INTO templates (key, name, subject, body, updated_at) VALUES
('booking-confirmed', 'Booking confirmed', 'You’re booked in: {{booking_name}}, {{booking_when}}', 'Hi {{first_name}},

Thanks for booking a {{booking_name}}. You’re all set for **{{booking_when}}**.

Where: {{booking_where}}

If anything changes or you need a different time, just reply to this email and we’ll sort it out.

Looking forward to it,', '2026-10-20T00:00:00.000Z');
