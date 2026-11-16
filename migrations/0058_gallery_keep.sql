-- Keeping a gallery online (functions-lib/gallery-keep.js): the couple pays online to keep it for
-- another 12 months. The payment becomes a paid invoice on their client (invoices.gallery_id says which
-- gallery it kept), and reminder emails go 30 and 7 days before it expires (reminded_for: which
-- reminder went for which expiry date, e.g. '2027-05-16:7').
ALTER TABLE invoices ADD COLUMN gallery_id TEXT;
ALTER TABLE photo_galleries ADD COLUMN reminded_for TEXT;

INSERT OR IGNORE INTO templates (key, name, subject, body, updated_at) VALUES ('gallery-expiring', 'Gallery expiring reminder',
  'Your gallery is online until {{expiry_date}}',
  '<p>Hi {{first_name}},</p><p>Just a friendly reminder that your gallery, <strong>{{gallery_name}}</strong>, is online until <strong>{{expiry_date}}</strong>.</p><p>If you haven’t already, now is a great time to download your favourite photos so they’re safely kept.</p><p><a href="{{gallery_link}}" class="button">Open your gallery</a></p><p>If you’d like to keep your gallery online for family and friends to enjoy, you can keep it for another {{keep_months}} months for {{keep_price}}:</p><p><a href="{{keep_link}}" class="button">Keep my gallery online</a></p><p>If you have any questions, just reply to this email.</p><p>Warm regards,</p>',
  '2026-11-16T00:00:00.000Z');
