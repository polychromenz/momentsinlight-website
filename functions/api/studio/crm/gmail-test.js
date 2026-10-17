// Send Tony a test email from his own Gmail, to check the connection works.
//   POST /api/studio/crm/gmail-test
// Goes to tony@momentsinlight.co.nz (a safe address), through the same sending path as client
// emails, test-mode lock included.
import { json } from '../../../../functions-lib/studio.js';
import { sendEmail, connection } from '../../../../functions-lib/gmail.js';

export async function onRequestPost({ env }) {
  try {
    const c = await connection(env.DB);
    const sent = await sendEmail(env, {
      to: 'tony@momentsinlight.co.nz',
      subject: 'Moments Studio: Gmail is connected',
      html: `<div style="font-family:Raleway,Arial,sans-serif;font-size:16px;line-height:1.7;color:#333">
<p>Hi Tony,</p><p>This is a test from Moments Studio. If you're reading it, the studio can send email from your Gmail${c?.email ? ` (${c.email})` : ''}, and it will show in your Sent folder.</p></div>`,
    });
    return json({ ok: true, to: sent.to });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
