// AI help on the client page (feature ideas, 20 Oct 2026). Drafts only: Tony edits and sends.
//   POST /api/studio/crm/ai { action: 'reply', job_id, reply? }   a suggested email (reply: the message row it answers)
//   POST /api/studio/crm/ai { action: 'summary', job_id }         a short summary of where things are with this client
// Uses the job, their emails (the one being answered read in full from Gmail), Tony's notes,
// invoices and the next steps. Workers AI (functions-lib/ai.js).
import { json } from '../../../../functions-lib/studio.js';
import { loadJob } from '../../../../functions-lib/crm-send.js';
import { message } from '../../../../functions-lib/gmail.js';
import { chat } from '../../../../functions-lib/ai.js';

const strip = (h) => String(h ?? '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&rsquo;/g, '’').replace(/\n{3,}/g, '\n\n').trim();
// Drop the quoted earlier conversation from a reply ("On … wrote:").
const fresh = (t) => t.split(/\n(?:On .{5,120} wrote:|-{2,} ?Original Message|From: .+\nSent: )/)[0].trim();
const money = (c) => `$${(c / 100).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const nzDate = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');

async function context(env, job, replyId) {
  const db = env.DB;
  const [msgs, invoices, steps] = await Promise.all([
    db.prepare(`SELECT id, direction, subject, body, gmail_message_id, sent_at FROM messages WHERE job_id = ?1 ORDER BY sent_at DESC LIMIT 8`).bind(job.id).all(),
    db.prepare(`SELECT label, amount, status, due_date FROM invoices WHERE job_id = ?1 AND status <> 'void' ORDER BY due_date`).bind(job.id).all(),
    db.prepare(`SELECT title, due_at, status FROM steps WHERE job_id = ?1 AND status IN ('scheduled', 'due') ORDER BY due_at LIMIT 5`).bind(job.id).all(),
  ]);
  const emails = [];
  for (const m of msgs.results.reverse()) {
    let text = strip(m.body);
    // Their emails (and the one being answered) are read in full from Gmail.
    if ((!text || m.id === replyId) && m.gmail_message_id) text = await message(env, m.gmail_message_id).then((g) => fresh(g.text || strip(g.html))).catch(() => text);
    emails.push(`${m.direction === 'in' ? 'THEM' : 'TONY'} (${m.sent_at.slice(0, 10)}), “${m.subject}”: ${text.slice(0, m.id === replyId ? 3000 : 700) || '(no text)'}`);
  }
  const facts = [
    `Client: ${job.first_name} ${job.last_name}${job.partner_name ? ` and ${job.partner_name}` : ''}`,
    `Type: ${job.job_type || 'Wedding'}; stage: ${job.stage}`,
    job.event_date && `Date: ${nzDate(job.event_date)}${job.event_time ? ` at ${job.event_time}` : ''}`,
    job.venue && `Venue: ${job.venue}`,
    job.notes && `Tony's notes: ${String(job.notes).slice(0, 1500)}`,
    invoices.results.length && `Invoices: ${invoices.results.map((i) => `${i.label} ${money(i.amount)} ${i.status}${i.status !== 'paid' ? ` (due ${i.due_date})` : ''}`).join('; ')}`,
    steps.results.length && `Coming up in the studio: ${steps.results.map((s) => `${s.title} (${s.due_at.slice(0, 10)})`).join('; ')}`,
  ].filter(Boolean).join('\n');
  return { facts, emails: emails.join('\n\n') };
}

const VOICE = `You help Tony Gorham, a wedding and portrait photographer in West Auckland, New Zealand (Moments in Light), with his client emails.
Write as Tony: warm, relaxed, genuine, first person, New Zealand English spelling. Use first names. Keep it short and clear.
Never invent facts: no prices, dates, availability or promises that aren't in the details given. Where Tony needs to fill something in, write [check: what to add] in square brackets.`;

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const job = await loadJob(env.DB, Number(d.job_id));
  if (!job) return json({ error: 'That client isn’t here any more.' }, 404);
  try {
    const replyId = d.reply ? Number(d.reply) : null;
    const { facts, emails } = await context(env, job, replyId);
    if (d.action === 'summary') {
      const text = await chat(env, [
        { role: 'system', content: `${VOICE}\nNow write a private summary for Tony (not an email).` },
        { role: 'user', content: `Summarise where things are with this client in 3 to 5 short bullet points ("- "): who they are and what they want, where they're at (booked, paid, waiting on what), the last contact and anything they asked that hasn't been answered, and what's next. Plain text only.\n\nDetails:\n${facts}\n\nEmails (oldest first):\n${emails || '(none)'}` },
      ], 350);
      return json({ summary: text.replace(/^["“]|["”]$/g, '').trim() });
    }
    if (d.action === 'reply') {
      const ask = replyId
        ? 'Write Tony’s reply to their latest email (the THEM email with the longest text is the one being answered). Answer what they asked, using only the details given.'
        : 'Write a short, friendly email from Tony to this client that fits where things are (for example a check-in or the next step). Use only the details given.';
      const text = await chat(env, [
        { role: 'system', content: VOICE },
        { role: 'user', content: `${ask} Start with "Hi ${job.first_name}," and end before the sign-off (no name or signature; that's added). Plain text, short paragraphs, no subject line.\n\nDetails:\n${facts}\n\nEmails (oldest first):\n${emails || '(none)'}` },
      ], 600);
      const clean = text.replace(/^(subject:.*\n+)/i, '').replace(/^["“]|["”]$/g, '').trim();
      const html = clean.split(/\n{2,}/).map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`).join('');
      return json({ body: html });
    }
    return json({ error: 'What should happen?' }, 400);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
