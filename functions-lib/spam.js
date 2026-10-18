// The enquiry form's spam check: sales pitches (SEO, web design, "new platform" offers) and bots.
// Leans towards letting things through: a real couple, or a real business wanting photos, must
// never be caught. Anything caught is kept (enquiry_spam) and can be released from the studio.
import { chat } from './ai.js';

// Phrases that turn up in pitches and almost never in a real enquiry.
const PITCH = [
  /\bsorry to bother you\b/i, /\bchecking your website\b/i, /\b(not )?ranking on google\b/i, /\bfirst page of google\b/i,
  /\bseo\b/i, /\bsearch engine optimi[sz]ation\b/i, /\bbacklinks?\b/i, /\bguest post/i, /\bdomain authority\b/i,
  /\bweb ?design(er)?s?\b/i, /\bredesign\b/i, /\bwebsite (traffic|audit|development)\b/i, /\bleads? generation\b/i,
  /\bdigital marketing\b/i, /\bsocial media (marketing|management)\b/i, /\b(free|no[- ]obligation) (quote|audit|proposal|consultation)\b/i,
  /\bincrease (your )?(sales|traffic|revenue|bookings)\b/i, /\bour (agency|platform|team of experts)\b/i, /\bexcited to introduce\b/i,
  /\bunsubscribe\b/i, /\bwhatsapp\b/i, /\bcrypto|bitcoin\b/i, /\bloan\b/i, /\bvirtual assistant\b/i, /\bappointment setting\b/i,
];

const SYSTEM = `You sort enquiries sent through a wedding photographer's website contact form (Moments In Light, Auckland, New Zealand).
Answer with one word:
PITCH = someone selling something TO the photographer: SEO, website design or redesign, marketing, advertising, leads, apps or platforms to join, software, outsourcing, loans, link building, or a generic mass message.
GENUINE = anyone who might want photos taken or is a real person writing to the photographer: couples, families, businesses wanting a shoot, venues, planners, award organisers looking for a photographer, past clients, complaints, personal messages.
If you are not sure, answer GENUINE.`;

/** Is this enquiry spam? Returns { spam, reason }. f = the cleaned form; ms = time from page load to sending (or null). */
export async function spamCheck(env, f, ms) {
  if (ms !== null && ms >= 0 && ms < 3000) return { spam: true, reason: `Sent ${Math.round(ms / 100) / 10} seconds after the page opened (a bot)` };
  const text = `${f.message}\n${f.venue}`;
  const hits = PITCH.filter((r) => r.test(text)).map((r) => (text.match(r) ?? [''])[0].toLowerCase());
  const links = (text.match(/https?:\/\/|www\./gi) ?? []).length;
  if (hits.length >= 2 || (hits.length && links >= 1)) return { spam: true, reason: `Sales pitch wording: ${[...new Set(hits)].slice(0, 4).join(', ')}${links ? `, ${links} link${links === 1 ? '' : 's'}` : ''}` };
  if (!f.message || f.message.length < 25) return { spam: false, reason: '' };
  try {
    const out = await chat(env, [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Service chosen: ${f.service}\nEvent date: ${f.date}\nVenue: ${f.venue}\nMessage:\n${f.message.slice(0, 2500)}` },
    ], 5);
    if (/^\W*PITCH\b/i.test(String(out))) return { spam: true, reason: `Looks like a sales pitch (AI check${hits.length ? `; wording: ${hits[0]}` : ''})` };
  } catch (e) {
    console.error('spam check: AI unavailable', e?.message);
  }
  return { spam: false, reason: '' };
}

/** Keep a caught enquiry for the studio's Spam list. */
export const keepSpam = (env, f, reason) =>
  env.DB.prepare('INSERT INTO enquiry_spam (data, reason, created_at) VALUES (?1, ?2, ?3)').bind(JSON.stringify(f), reason, new Date().toISOString()).run();
