-- The "Quote ready" email now shows each package's payment plan ({{payment_plan}}), unless Tony
-- has already edited the email (then it's left as he wrote it).
UPDATE templates SET body = '<p>Hi {{first_name}},</p><p>Thanks so much for chatting with me about your wedding. Here''s your quote, with both packages so you can choose what suits you best.</p><p><a href="{{quote_link}}" class="button">View your quote</a></p><h3>Your payments</h3><p>{{payment_plan}}</p><p>The quote is valid until {{quote_valid_until}}. When you''re ready, just choose your package and click Accept, and I''ll send your contract.</p><p>If you have any questions at all, just reply to this email or give me a call.</p><p>Speak soon,</p>'
WHERE key = 'quote-ready' AND updated_at = '2026-10-17T00:00:00.000Z';
