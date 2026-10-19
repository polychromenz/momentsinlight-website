// Everything the studio holds about one client, as a ZIP (for a Privacy Act request: see /privacy).
//   GET /api/studio/crm/export?job=12   (or ?client=34)
// The ZIP has summary.txt (readable), personal-data.json (every record) and files/ (documents and
// uploads that belong to them). Links' secret tokens are left out. Library documents shared with
// everyone (e.g. the wedding guide) aren't theirs, so aren't included.
import { json } from '../../../../functions-lib/studio.js';
import { loadDocument, loadNamed } from '../../../../functions-lib/documents.js';
import { crc32 } from '../../../../functions-lib/galleries.js';
import { zipStream } from '../../../../functions-lib/zip.js';

const SECRET = /token|secret|key|hash|password/i;
const clean = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !SECRET.test(k))));
const enc = new TextEncoder();
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const safe = (s) => String(s ?? 'file').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 120);

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const u = new URL(request.url);
  const job = u.searchParams.get('job') ? await db.prepare('SELECT client_id FROM jobs WHERE id = ?1').bind(Number(u.searchParams.get('job'))).first() : null;
  const clientId = Number(u.searchParams.get('client')) || job?.client_id;
  const client = clientId && await db.prepare('SELECT * FROM clients WHERE id = ?1').bind(clientId).first();
  if (!client) return json({ error: 'That client doesn’t exist.' }, 404);
  const email = String(client.email ?? '').toLowerCase();
  const all = async (sql, ...binds) => { try { return clean((await db.prepare(sql).bind(...binds).all()).results); } catch { return []; } };

  const jobs = await all('SELECT * FROM jobs WHERE client_id = ?1 ORDER BY id', clientId);
  const ids = JSON.stringify(jobs.map((j) => j.id));
  const inJobs = (t) => all(`SELECT * FROM ${t} WHERE job_id IN (SELECT value FROM json_each(?1)) ORDER BY id`, ids);
  const data = {
    exported_at: new Date().toISOString(),
    client: clean([client])[0],
    jobs,
    messages: await all('SELECT * FROM messages WHERE client_id = ?1 OR job_id IN (SELECT value FROM json_each(?2)) ORDER BY id', clientId, ids),
    quotes: await inJobs('quotes'),
    contracts: await inJobs('contracts'),
    invoices: await inJobs('invoices'),
    questionnaires: await inJobs('questionnaires'),
    appointments: await inJobs('appointments'),
    portal_galleries: await inJobs('galleries'),
    uploads: await all('SELECT id, job_id, questionnaire_id, name, type, size, created_at FROM uploads WHERE job_id IN (SELECT value FROM json_each(?1)) ORDER BY id', ids),
    documents: await all('SELECT id, job_id, name, type, size, created_at FROM documents WHERE job_id IN (SELECT value FROM json_each(?1)) ORDER BY id', ids),
    steps: await inJobs('steps'),
    photo_galleries: await all('SELECT id, name, type, event_date, venue, status, created_at, expires_at FROM photo_galleries WHERE client_id = ?1 OR job_id IN (SELECT value FROM json_each(?2))', clientId, ids),
    gallery_access: await all('SELECT * FROM gallery_viewers WHERE lower(email) = ?1', email),
    gallery_links: await all('SELECT id, gallery_id, kind, name, email, created_at FROM gallery_links WHERE lower(email) = ?1', email),
    guide_signups: await all('SELECT * FROM guide_signups WHERE lower(email) = ?1', email),
    contacts: await all('SELECT * FROM contacts WHERE lower(email) = ?1', email),
  };

  // Their files.
  const files = [];
  for (const d of data.documents) {
    const f = await loadDocument(db, d.id);
    if (f) files.push({ name: `files/documents/${d.id}-${safe(f.name)}`, bytes: b64(f.base64) });
  }
  for (const up of data.uploads) {
    const f = await loadNamed(db, `upload-${up.id}`);
    if (f) files.push({ name: `files/uploads/${up.id}-${safe(up.name)}`, bytes: b64(f.base64) });
  }

  const name = `${client.first_name} ${client.last_name}`.trim();
  const count = (k) => `${data[k].length} ${k.replace(/_/g, ' ')}`;
  const summary = [
    `Personal information held by Moments in Light about ${name} (${client.email})`,
    `Exported ${new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' })}`,
    '',
    `Name: ${name}`, `Email: ${client.email}`, `Phone: ${client.phone || '-'}`, `Address: ${client.address || '-'}`,
    `Photos can be used in ads and marketing: ${client.ads_ok === 0 ? 'no' : 'yes'}`, `In the studio since: ${String(client.created_at).slice(0, 10)}`,
    '',
    'Enquiries and bookings:',
    ...jobs.map((j) => `- ${j.title} (${j.job_type}${j.event_date ? `, ${j.event_date}` : ''}${j.venue ? `, ${j.venue}` : ''}): ${j.stage}`),
    '',
    'Also held: ' + ['messages', 'quotes', 'contracts', 'invoices', 'questionnaires', 'appointments', 'photo_galleries', 'gallery_access', 'guide_signups'].map(count).join(', ') + '.',
    `Files included: ${files.length}.`,
    '',
    'Every record is in personal-data.json; their documents and uploads are in files/.',
  ].join('\r\n');

  const entries = [
    { name: 'summary.txt', bytes: enc.encode(summary) },
    { name: 'personal-data.json', bytes: enc.encode(JSON.stringify(data, null, 2)) },
    ...files,
  ].map((e) => ({ name: e.name, size: e.bytes.length, crc: crc32(e.bytes), open: async () => e.bytes }));
  const { stream, length } = zipStream(entries);
  return new Response(stream, {
    headers: {
      'content-type': 'application/zip',
      'content-length': String(length),
      'content-disposition': `attachment; filename="${safe(`${name} - personal data`)}.zip"`,
      'cache-control': 'no-store',
    },
  });
}
