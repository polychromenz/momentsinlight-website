// Studio CRM settings: job types, lead sources and email templates.
//   GET /api/studio/crm/settings
//   PUT /api/studio/crm/settings  { list: 'job_type' | 'lead_source', items: [{ value, label, workflow, on_form }] }
//                                 { template: { key?, name, subject, body } }   (no key = a new one)
// Lists are saved whole, in the order given. Renaming an item doesn't change jobs that already
// use the old name (they keep it as text).
import { json } from '../../../../functions-lib/studio.js';
import { WORKFLOWS } from '../../../../functions-lib/crm.js';
import { listDocuments } from '../../../../functions-lib/documents.js';

const LISTS = ['job_type', 'lead_source'];

export async function onRequestGet({ env }) {
  const [lists, templates, schedules, documents, contracts] = await Promise.all([
    env.DB.prepare('SELECT kind, value, label, workflow, on_form, contract_key FROM lists ORDER BY kind, sort, id').all(),
    env.DB.prepare('SELECT key, name, subject, body, attachments, updated_at FROM templates ORDER BY key').all(),
    env.DB.prepare('SELECT key, name, parts FROM payment_schedules ORDER BY name').all(),
    listDocuments(env.DB),
    env.DB.prepare('SELECT key, name, body, updated_at FROM contract_templates ORDER BY name').all(),
  ]);
  const by = (k) => lists.results.filter((r) => r.kind === k).map(({ kind, ...r }) => ({ ...r, on_form: !!r.on_form }));
  return json({
    job_type: by('job_type'),
    lead_source: by('lead_source'),
    templates: templates.results.map((t) => ({ ...t, attachments: JSON.parse(t.attachments || '[]') })),
    documents: documents.map(({ id, name, size, type, updated_at, used_by }) => ({ id, name, size, type, updated_at, used_by })),
    schedules: schedules.results.map((s) => ({ ...s, parts: JSON.parse(s.parts) })),
    workflows: Object.keys(WORKFLOWS),
    contracts: contracts.results,
  });
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export async function onRequestPut({ request, env }) {
  const d = await request.json().catch(() => null);
  const now = new Date().toISOString();
  const text = (v, max) => (v ?? '').toString().trim().slice(0, max);

  if (d?.list) {
    if (!LISTS.includes(d.list) || !Array.isArray(d.items)) return json({ error: 'Which list?' }, 400);
    const seen = new Set();
    const items = [];
    for (const it of d.items) {
      const value = text(it.value, 80);
      if (!value) continue;
      if (seen.has(value.toLowerCase())) return json({ error: `“${value}” is in the list twice.` }, 400);
      seen.add(value.toLowerCase());
      items.push({ value, label: text(it.label, 120) || value, workflow: d.list === 'job_type' && WORKFLOWS[it.workflow] ? it.workflow : null, on_form: it.on_form ? 1 : 0, contract_key: d.list === 'job_type' && it.contract_key ? text(it.contract_key, 80) : null });
    }
    if (!items.length) return json({ error: 'The list needs at least one item.' }, 400);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM lists WHERE kind = ?1').bind(d.list),
      ...items.map((it, i) => env.DB.prepare('INSERT INTO lists (kind, value, label, workflow, on_form, sort, contract_key) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
        .bind(d.list, it.value, it.label, it.workflow, it.on_form, i, it.contract_key)),
    ]);
    return json({ ok: true });
  }

  if (d?.template) {
    const t = d.template;
    const name = text(t.name, 120);
    const subject = text(t.subject, 300);
    const body = (t.body ?? '').toString().replace(/\r\n/g, '\n').trim().slice(0, 50000);
    if (!name || !subject || !body) return json({ error: 'A template needs a name, a subject and some text.' }, 400);
    const docIds = new Set((await env.DB.prepare('SELECT id FROM documents').all()).results.map((r) => r.id));
    const attachments = JSON.stringify([...new Set((Array.isArray(t.attachments) ? t.attachments : []).map(Number))].filter((id) => docIds.has(id)));
    if (t.key) {
      const r = await env.DB.prepare('UPDATE templates SET name = ?2, subject = ?3, body = ?4, attachments = ?6, updated_at = ?5 WHERE key = ?1').bind(t.key, name, subject, body, now, attachments).run();
      if (!r.meta.changes) return json({ error: 'That template no longer exists.' }, 404);
      return json({ ok: true, key: t.key });
    }
    let key = slug(name) || 'template';
    for (let n = 2; await env.DB.prepare('SELECT 1 FROM templates WHERE key = ?1').bind(key).first(); n++) key = `${slug(name)}-${n}`;
    await env.DB.prepare('INSERT INTO templates (key, name, subject, body, attachments, updated_at) VALUES (?1, ?2, ?3, ?4, ?6, ?5)').bind(key, name, subject, body, now, attachments).run();
    return json({ ok: true, key });
  }
  // Contracts: { contract: { key?, name, body } }. Contracts already sent keep their own copy.
  if (d?.contract) {
    const name = text(d.contract.name, 120);
    const body = (d.contract.body ?? '').toString().trim().slice(0, 200000);
    if (!name || !body) return json({ error: 'A contract needs a name and its wording.' }, 400);
    let key = d.contract.key;
    if (key) {
      const r = await env.DB.prepare('UPDATE contract_templates SET name = ?2, body = ?3, updated_at = ?4 WHERE key = ?1').bind(key, name, body, now).run();
      if (!r.meta.changes) return json({ error: 'That contract no longer exists.' }, 404);
    } else {
      key = slug(name) || 'contract';
      for (let n = 2; await env.DB.prepare('SELECT 1 FROM contract_templates WHERE key = ?1').bind(key).first(); n++) key = `${slug(name)}-${n}`;
      await env.DB.prepare('INSERT INTO contract_templates (key, name, body, updated_at) VALUES (?1, ?2, ?3, ?4)').bind(key, name, body, now).run();
    }
    return json({ ok: true, key });
  }
  // Payment schedules: { schedule: { key?, name, parts: [{ label, percent, when, days?, months? }] } }
  // or { delete_schedule: key } (not while a quote template uses it; sent quotes keep a copy).
  if (d?.schedule) {
    const sc = d.schedule;
    const name = text(sc.name, 120);
    if (!name) return json({ error: 'A payment schedule needs a name.' }, 400);
    if (!Array.isArray(sc.parts) || !sc.parts.length) return json({ error: 'Add at least one payment.' }, 400);
    const parts = [];
    for (const p of sc.parts) {
      const percent = Math.round(Number(p.percent) * 100) / 100;
      if (!(percent > 0 && percent <= 100)) return json({ error: 'Each payment needs a percentage between 1 and 100.' }, 400);
      const when = ['accept', 'before', 'after'].includes(p.when) ? p.when : 'accept';
      const n = Math.max(0, Math.round(Number(p.amount) || 0));
      const part = { percent, label: text(p.label, 60) || 'Payment', when };
      if (n) part[p.unit === 'months' && when !== 'accept' ? 'months' : 'days'] = n;
      parts.push(part);
    }
    const total = Math.round(parts.reduce((a, p) => a + p.percent, 0) * 100) / 100;
    if (total !== 100) return json({ error: `The payments add up to ${total}%; they need to add up to 100%.` }, 400);
    let key = sc.key;
    if (key) {
      const r = await env.DB.prepare('UPDATE payment_schedules SET name = ?2, parts = ?3, updated_at = ?4 WHERE key = ?1').bind(key, name, JSON.stringify(parts), now).run();
      if (!r.meta.changes) return json({ error: 'That schedule no longer exists.' }, 404);
    } else {
      key = slug(name) || 'schedule';
      for (let n = 2; await env.DB.prepare('SELECT 1 FROM payment_schedules WHERE key = ?1').bind(key).first(); n++) key = `${slug(name)}-${n}`;
      await env.DB.prepare('INSERT INTO payment_schedules (key, name, parts, updated_at) VALUES (?1, ?2, ?3, ?4)').bind(key, name, JSON.stringify(parts), now).run();
    }
    return json({ ok: true, key });
  }
  if (d?.delete_schedule) {
    const used = await env.DB.prepare('SELECT name FROM quote_templates WHERE schedule_key = ?1').bind(d.delete_schedule).all();
    if (used.results.length) return json({ error: `The ${used.results.map((r) => r.name).join(', ')} quote template uses it. Choose another schedule there first.` }, 409);
    await env.DB.prepare('DELETE FROM payment_schedules WHERE key = ?1').bind(d.delete_schedule).run();
    return json({ ok: true });
  }
  return json({ error: 'Nothing to save.' }, 400);
}
