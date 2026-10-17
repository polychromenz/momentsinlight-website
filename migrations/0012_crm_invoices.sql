-- Studio CRM invoices. When a contract is signed, one invoice is made per payment in the
-- accepted quote's schedule (deposit, second, final). Each is sent automatically on its send
-- date (the deposit straight away; later ones 2 weeks before they're due), with reminders on the
-- due date and 3 days late. Couples pay by card (Stripe Checkout) or bank transfer at
-- /invoice?t=…; card payments are marked paid by Stripe's webhook, bank transfers by Tony.
-- Money is whole cents, including GST. status: scheduled | sent | paid | void
CREATE TABLE invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs (id),
  quote_id INTEGER REFERENCES quotes (id),
  contract_id INTEGER REFERENCES contracts (id),
  number TEXT NOT NULL UNIQUE,          -- e.g. 'MIL-2027-0001'
  label TEXT NOT NULL,                  -- e.g. 'Deposit (10%)'
  description TEXT NOT NULL DEFAULT '', -- e.g. 'The Deluxe Experience (8+ hours), wedding 17 April 2027'
  amount INTEGER NOT NULL,
  due_date TEXT NOT NULL,               -- NZ date
  send_at TEXT NOT NULL,                -- when it's emailed (UTC)
  token TEXT NOT NULL UNIQUE,           -- the couple's private link
  status TEXT NOT NULL DEFAULT 'scheduled',
  sent_at TEXT,
  reminders INTEGER NOT NULL DEFAULT 0, -- reminders sent (on the due date, then 3 days late)
  last_reminder_at TEXT,
  paid_at TEXT,
  paid_method TEXT,                     -- 'card' | 'bank' | 'other'
  paid_note TEXT NOT NULL DEFAULT '',
  stripe_session TEXT,
  stripe_payment TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX invoices_job ON invoices (job_id);
CREATE INDEX invoices_due ON invoices (status, send_at);

-- Invoice emails. Tony's Studio Ninja "Invoice" email gets a button to view and pay (its link
-- was lost in the export), unless he's already edited it.
UPDATE templates SET body = replace(body, 'Please click here to view and pay your invoice online', '[View and pay your invoice]({{invoice_link}})')
  WHERE key = 'invoice' AND updated_at = '2026-10-17T00:00:00.000Z';
UPDATE templates SET subject = 'Invoice {{invoice_number}}: {{invoice_label}}' WHERE key = 'invoice' AND updated_at = '2026-10-17T00:00:00.000Z';
INSERT OR IGNORE INTO templates (key, name, subject, body, attachments, updated_at) VALUES ('invoice-reminder', 'Invoice reminder', 'Reminder: invoice {{invoice_number}}',
'<p>Dear {{first_name}},</p><p>This is a courtesy message to let you know you have a payment of {{payment_amount}} due on {{payment_due_date}}.</p><p><a href="{{invoice_link}}" class="button">View and pay your invoice</a></p><p>If you have any questions please don’t hesitate to contact me.</p><p>Regards</p>', '[]', '2026-10-17T07:00:00.000Z');
INSERT OR IGNORE INTO templates (key, name, subject, body, attachments, updated_at) VALUES ('payment-receipt', 'Payment receipt', 'Thank you for your payment',
'<p>Dear {{first_name}},</p><p>This is a courtesy message to let you know we have received your payment of {{payment_amount}} (receipt attached).</p><p><a href="{{invoice_link}}" class="button">View your invoice</a></p><p>If you have any questions please don’t hesitate to contact me.</p><p>Regards,</p>', '[]', '2026-10-17T07:00:00.000Z');
