-- The email that sends a couple their signed contract (attached as a PDF). Drafted for Tony to
-- edit in Settings > Email templates.
INSERT OR IGNORE INTO templates (key, name, subject, body, attachments, updated_at) VALUES ('contract-signed', 'Contract signed', 'Your signed contract',
'<p>Hi {{first_name}},</p><p>Thank you for signing your contract. Your signed copy is attached for your records.</p><p>Next, I''ll send your deposit invoice to secure your date.</p><p>If you have any questions at all, just reply to this email.</p><p>Cheers,</p>', '[]', '2026-10-17T06:00:00.000Z');
