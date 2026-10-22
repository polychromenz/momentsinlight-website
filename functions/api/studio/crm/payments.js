// The Payments page (/studio/payments): every invoice, with its client and job.
//   GET /api/studio/crm/payments -> { invoices: [...], today }
import { json } from '../../../../functions-lib/studio.js';
import { nzNow } from '../../../../functions-lib/schedules.js';

export async function onRequestGet({ env }) {
  const rows = await env.DB.prepare(`SELECT i.id, i.job_id, i.number, i.label, i.amount, i.due_date, i.send_at, i.status, i.sent_at, i.paid_at, i.paid_method,
      j.title AS job, j.job_type, j.event_date, j.stage, c.first_name, c.last_name
    FROM invoices i JOIN jobs j ON j.id = i.job_id LEFT JOIN clients c ON c.id = j.client_id
    WHERE i.status <> 'group' ORDER BY i.due_date, i.id`).all();
  return json({ invoices: rows.results, today: nzNow().date });
}
