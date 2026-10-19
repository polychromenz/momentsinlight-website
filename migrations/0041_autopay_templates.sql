-- Automatic instalments (functions-lib/autopay.js): the email when a card payment doesn't go through.
-- (The jobs/invoices columns are in 0040_bookings.sql.) Wording editable in Settings > Email templates.
INSERT OR IGNORE INTO templates (key, name, subject, body, updated_at) VALUES
('autopay-failed', 'Automatic payment didn’t go through', 'Your payment for invoice {{invoice_number}}', 'Hi {{first_name}},

Just a heads up: the automatic payment of **{{payment_amount}}** for invoice {{invoice_number}} ({{invoice_label}}) didn''t go through on your {{autopay_card}}. That can happen when a card has expired or a bank double-checks a payment, so no stress.

You can pay it here whenever suits: {{invoice_link}}

If anything''s changed or you''d like to sort it another way, just reply to this email.

Thanks so much,', '2026-10-20T00:00:00.000Z');
