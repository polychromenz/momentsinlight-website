-- Workflows become data: Settings > Workflows edits them, and each job type chooses one
-- (lists.workflow = workflows.key). Steps are JSON; see functions-lib/workflows.js. Planned steps
-- keep a copy of their rule (steps.config) so a changed wedding date can move them.
-- Seeds: Wedding (as agreed, with the planning steps), Portrait and Headshot (from the drafts).
CREATE TABLE workflows (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  steps TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
INSERT INTO workflows (key, name, steps, updated_at) VALUES ('wedding', 'Wedding', '[{"id":"01-enquiry-response","title":"01 Enquiry response","kind":"auto_email","template":"wedding-01-enquiry-response","when":"enquiry","hours":1},{"id":"02-follow-up","title":"02 Follow-up","kind":"ready_email","template":"wedding-02-follow-up","when":"enquiry","days":4,"stop_on":"reply,booked"},{"id":"03-final-follow-up","title":"03 Final follow-up","kind":"ready_email","template":"wedding-03-final-follow-up","when":"enquiry","days":10,"stop_on":"reply,booked"},{"id":"04-thanks-for-booking","title":"04 Thanks for booking","kind":"auto_email","template":"wedding-04-thanks-for-booking","when":"deposit","days":0},{"id":"05-plan-your-day","title":"05 Plan your day","kind":"auto_email","template":"wedding-05-plan-your-day","when":"before","days":42},{"id":"questionnaire","title":"Wedding Day Questionnaire","kind":"auto_email","template":"wedding-questionnaire","when":"before","days":41,"questionnaire":"wedding-day"},{"id":"book-practice-shoot","title":"Book the practice shoot (if it isn’t booked yet)","kind":"todo","when":"step","after_step":"05-plan-your-day","days":14},{"id":"06-practice-photos-ready","title":"06 Practice photos ready","kind":"ready_email","template":"wedding-06-practice-photos-ready","when":"manual","gallery":true},{"id":"07-runorder","title":"07 RunOrder offer","kind":"auto_email","template":"wedding-07-runorder","when":"before","days":28},{"id":"07-1-week-to-go","title":"07.1 One week to go","kind":"auto_email","template":"wedding-07-1-week-to-go","when":"before","days":7},{"id":"upload-sneak-peek","title":"Upload a sneak peek to Facebook","kind":"todo","when":"after","days":1},{"id":"08-sneak-peek","title":"08 Sneak peek","kind":"ready_email","template":"wedding-08-sneak-peek","when":"after","days":1},{"id":"finish-gallery","title":"Finish post-production and upload the gallery","kind":"todo","when":"after","days":21},{"id":"09-photos-ready","title":"09 Wedding photos ready","kind":"ready_email","template":"wedding-09-photos-ready","when":"manual","gallery":true},{"id":"10-review","title":"10 Review request","kind":"auto_email","template":"wedding-10-review","when":"step","after_step":"09-photos-ready","days":3}]', '2026-10-17T00:00:00.000Z');
INSERT INTO workflows (key, name, steps, updated_at) VALUES ('portrait', 'Portrait', '[{"id":"01-enquiry-response","title":"P1 Enquiry response","kind":"ready_email","template":"portrait-01-enquiry-response","when":"enquiry","hours":1},{"id":"02-follow-up","title":"P2 Enquiry follow-up","kind":"ready_email","template":"portrait-02-follow-up","when":"enquiry","days":4,"stop_on":"reply,booked"},{"id":"03-final-follow-up","title":"P3 Enquiry final follow-up","kind":"ready_email","template":"portrait-03-final-follow-up","when":"enquiry","days":10,"stop_on":"reply,booked"},{"id":"04-thanks-for-booking","title":"P4 Thanks for booking","kind":"ready_email","template":"portrait-04-thanks-for-booking","when":"booked","days":1},{"id":"05-pre-shoot","title":"P5 Pre-shoot reminder and details","kind":"ready_email","template":"portrait-05-pre-shoot","when":"before","days":2},{"id":"06-after-shoot","title":"P6 Post-shoot email","kind":"ready_email","template":"portrait-06-after-shoot","when":"after","days":1}]', '2026-10-17T00:00:00.000Z');
INSERT INTO workflows (key, name, steps, updated_at) VALUES ('headshot', 'Headshot', '[{"id":"01-enquiry-response","title":"H1 Enquiry response","kind":"ready_email","template":"headshot-01-enquiry-response","when":"enquiry","hours":1},{"id":"02-follow-up","title":"H2 Enquiry follow-up","kind":"ready_email","template":"headshot-02-follow-up","when":"enquiry","days":4,"stop_on":"reply,booked"},{"id":"03-final-follow-up","title":"H3 Enquiry final follow-up","kind":"ready_email","template":"headshot-03-final-follow-up","when":"enquiry","days":10,"stop_on":"reply,booked"},{"id":"04-thanks-for-booking","title":"H4 Thanks for booking","kind":"ready_email","template":"headshot-04-thanks-for-booking","when":"booked","days":1},{"id":"05-pre-shoot","title":"H5 Pre-shoot reminder and details","kind":"ready_email","template":"headshot-05-pre-shoot","when":"before","days":2},{"id":"06-after-shoot","title":"H6 Post-shoot email","kind":"ready_email","template":"headshot-06-after-shoot","when":"after","days":1}]', '2026-10-17T00:00:00.000Z');
INSERT OR IGNORE INTO templates (key, name, subject, body, attachments, updated_at) VALUES ('portrait-01-enquiry-response', 'P1 Enquiry response', 'Re: Your portrait enquiry', 'Hi {{first_name}},

Thanks so much for getting in touch, I''d love to help you create some portraits you''ll treasure.

People get portraits for all sorts of reasons: to celebrate a milestone, for a professional
portfolio, to leave a precious memory for their family, or just because they enjoy it. I can
shoot almost anywhere: at your home, somewhere special to you, or in the studio for a more
classic look.

It all starts with an idea. The best next step is a quick chat so I can hear what you have in
mind, and share a few ideas on how we can take it from nice pictures to amazing ones.

**[check: your portrait session pricing, or "I''ll put together a quote once we''ve chatted"]**

If you''d like something really special, my **Premium Portrait Experience** includes studio
hire, professional hair and makeup, a relaxed two-hour studio session, 10 edited images with
full professional skin retouching, and 10 beautiful 8×10 prints in a bound wallet, all for
$1,995.

You''re welcome to book a time to chat here: **[check: your booking link for portrait calls]**

Speak soon,', '[]', '2026-10-17T00:00:00.000Z');
INSERT OR IGNORE INTO templates (key, name, subject, body, attachments, updated_at) VALUES ('portrait-02-follow-up', 'P2 Enquiry follow-up', 'Re: Your portrait enquiry', 'Hi {{first_name}},

Just checking in as I hadn''t heard back from you, I know how busy life gets.

I wanted to see whether you had any questions about a portrait session or how I work. If you''d
like to chat things through, you can book a time that suits you here: **[check: booking link]**

No pressure at all, just let me know where you''re at.

Speak soon,', '[]', '2026-10-17T00:00:00.000Z');
INSERT OR IGNORE INTO templates (key, name, subject, body, attachments, updated_at) VALUES ('portrait-03-final-follow-up', 'P3 Enquiry final follow-up', 'Following up :-)', 'Hi {{first_name}},

Just a quick note to close the loop. I haven''t heard back, so I''ll assume the timing isn''t
quite right or your plans have changed, and that''s completely fine.

If you''d like to pick things up again any time, just reply to this email or book a quick chat
here: **[check: booking link]**. Portraits also make awesome Christmas, birthday or Mother''s Day
gifts, so keep me in mind!

All the best,', '[]', '2026-10-17T00:00:00.000Z');
INSERT OR IGNORE INTO templates (key, name, subject, body, attachments, updated_at) VALUES ('portrait-04-thanks-for-booking', 'P4 Thanks for booking', 'Thank you so much for booking!', 'Hey {{first_name}},

Thank you so much for booking your portrait session, I''m really looking forward to it!

Here''s what happens next:

**Before your shoot**
I''ll send you posing guides ahead of the day so you can do a little homework and come ready to
smash it out of the park. A couple of days before, I''ll send you a reminder with all the
details, and I''ll give you a quick call the day before to make sure everything''s set.

**On the day**
Relax and enjoy it. I''ll guide you the whole way, from the light to the poses that suit you
best. Having someone who''s not just a photographer but also your cheerleader really does bring
out the best in your photos.

**After your shoot**
About a week after, we''ll get together to look through your images and choose your favourites,
along with any prints or wall art you''d love. **[check: how you describe the viewing session]**

You can view your booking details any time in your client portal: {{portal_link}}

If you have any questions before then, just get in touch.

Cheers,', '[]', '2026-10-17T00:00:00.000Z');
INSERT OR IGNORE INTO templates (key, name, subject, body, attachments, updated_at) VALUES ('portrait-05-pre-shoot', 'P5 Pre-shoot reminder and details', 'See you on {{shoot_date}}!', 'Hey {{first_name}},

Just a quick reminder that your portrait session is coming up:

- **When:** {{shoot_date}} at {{shoot_time}}
- **Where:** {{location}}

A few tips to help you look and feel your best:

- **[check: what to wear, e.g. solid colours, a couple of outfit options]**
- **[check: hair and makeup notes, if not the premium experience]**
- Have a look at the posing guides I sent through, even a quick practice in the mirror helps.
- Get a good night''s sleep and drink plenty of water.

I''ll give you a quick call the day before to confirm everything. If anything changes, just let
me know.

See you soon,', '[]', '2026-10-17T00:00:00.000Z');
INSERT OR IGNORE INTO templates (key, name, subject, body, attachments, updated_at) VALUES ('portrait-06-after-shoot', 'P6 Post-shoot email', 'Thank you for a fantastic shoot!', 'Hey {{first_name}},

Thanks again for a fantastic session yesterday, I had a great time and I''m really excited about
what we captured.

I''m going through your images now and preparing them for our viewing session, where we''ll look
at them together and you can choose your favourites. **[check: when and where the viewing
session happens, and whether to bring anyone]**

If you haven''t already booked a time for the viewing, you can pick one here: **[check: booking
link]**

Talk soon,', '[]', '2026-10-17T00:00:00.000Z');
INSERT OR IGNORE INTO templates (key, name, subject, body, attachments, updated_at) VALUES ('headshot-01-enquiry-response', 'H1 Enquiry response', 'Re: Your headshot enquiry', 'Hi {{first_name}},

Thanks so much for getting in touch about headshots.

Your headshot is often the very first thing clients, colleagues or potential employers see, so
it''s worth getting right. I make it simple: with a portable studio setup I can come to your
office, workplace or chosen location anywhere in Auckland, whether it''s one headshot or a team
of 10, 100 or more, with a consistent look across everyone.

**[check: headshot pricing, e.g. per person or per session, and turnaround]**

The best next step is a quick chat about how many people, where, and the style you''re after
(corporate, creative, casual or contemporary). You can book a time here: **[check: booking
link]**

Speak soon,', '[]', '2026-10-17T00:00:00.000Z');
INSERT OR IGNORE INTO templates (key, name, subject, body, attachments, updated_at) VALUES ('headshot-02-follow-up', 'H2 Enquiry follow-up', 'Re: Your headshot enquiry', 'Hi {{first_name}},

Just checking in as I hadn''t heard back. Happy to answer any questions about headshots for you
or your team, or to put together a quote once I know numbers and location.

You can book a quick chat here: **[check: booking link]**

Speak soon,', '[]', '2026-10-17T00:00:00.000Z');
INSERT OR IGNORE INTO templates (key, name, subject, body, attachments, updated_at) VALUES ('headshot-03-final-follow-up', 'H3 Enquiry final follow-up', 'Following up :-)', 'Hi {{first_name}},

Just a quick note to close the loop. I haven''t heard back, so I''ll assume the timing isn''t
right just now, and that''s completely fine.

Whenever you''re ready to refresh your headshots, or your team''s, just reply to this email and
we''ll get it sorted.

All the best,', '[]', '2026-10-17T00:00:00.000Z');
INSERT OR IGNORE INTO templates (key, name, subject, body, attachments, updated_at) VALUES ('headshot-04-thanks-for-booking', 'H4 Thanks for booking', 'Thanks for booking your headshots!', 'Hey {{first_name}},

Thanks so much for booking, I''m looking forward to it.

**Before the shoot**
A couple of days before, I''ll send you a reminder with the details and a few tips on what to
wear. I''ll also give you a quick call the day before to confirm the setup.
**[check: what you need from them, e.g. a room, power, a list of names and times for a team]**

**On the day**
I''ll bring the lighting, background and everything else. Each person only needs a few minutes,
and I''ll guide them through it so everyone looks relaxed and confident.

**After the shoot**
**[check: how headshots are delivered: viewing session, or gallery and selection, and how
quickly]**

You can view your booking details any time in your client portal: {{portal_link}}

Cheers,', '[]', '2026-10-17T00:00:00.000Z');
INSERT OR IGNORE INTO templates (key, name, subject, body, attachments, updated_at) VALUES ('headshot-05-pre-shoot', 'H5 Pre-shoot reminder and details', 'Your headshots on {{shoot_date}}', 'Hey {{first_name}},

Just a quick reminder that your headshot session is coming up:

- **When:** {{shoot_date}} at {{shoot_time}}
- **Where:** {{location}}

A few tips for everyone being photographed:

- **[check: what to wear, e.g. solid colours, avoid busy patterns, bring a spare top]**
- Bring anything you need to freshen up: a comb, lip balm, glasses cleaner.
- Relax, it''s quick and painless, I promise!

I''ll give you a call the day before to confirm everything.

See you soon,', '[]', '2026-10-17T00:00:00.000Z');
INSERT OR IGNORE INTO templates (key, name, subject, body, attachments, updated_at) VALUES ('headshot-06-after-shoot', 'H6 Post-shoot email', 'Thanks for having me!', 'Hey {{first_name}},

Thanks for having me yesterday, it was great working with you **[check: "and your team"]**.

I''m working through the images now. **[check: next step: viewing session, or "You''ll receive a
gallery to choose your favourites by …"]**

If you have any questions in the meantime, just let me know.

Cheers,', '[]', '2026-10-17T00:00:00.000Z');
INSERT OR IGNORE INTO templates (key, name, subject, body, attachments, updated_at) VALUES ('wedding-questionnaire', 'Wedding Day Questionnaire', 'Your wedding day questionnaire', 'Hey {{first_name}},

As promised, here is your wedding day questionnaire. It only takes a few minutes, and your answers help me plan everything for your day.

[Fill in your questionnaire]({{questionnaire_link}})

Your answers save as you go, so you can come back to it any time before we meet.

Cheers,', '[]', '2026-10-17T00:00:00.000Z');
UPDATE lists SET workflow = 'portrait' WHERE kind = 'job_type' AND value IN ('Portraits', 'Lifestyle') AND workflow IS NULL;
UPDATE lists SET workflow = 'headshot' WHERE kind = 'job_type' AND value = 'Headshots' AND workflow IS NULL;
ALTER TABLE steps ADD COLUMN config TEXT;
ALTER TABLE jobs ADD COLUMN event_time TEXT;
