// Studio CRM settings: job types, lead sources and email templates.
//   GET /api/studio/crm/settings
//   PUT /api/studio/crm/settings  { list: 'job_type' | 'lead_source', items: [{ value, label, workflow, on_form }] }
//                                 { template: { key?, name, subject, body } }   (no key = a new one)
// Lists are saved whole, in the order given. Renaming an item doesn't change jobs that already
// use the old name (they keep it as text).
import { json } from '../../../../functions-lib/studio.js';
import { WORKFLOWS } from '../../../../functions-lib/crm.js';

const LISTS = ['job_type', 'lead_source'];

export async function onRequestGet({ env }) {
  const [lists, templates, schedules] = await Promise.all([
    env.DB.prepare('SELECT kind, value, label, workflow, on_form FROM lists ORDER BY kind, sort, id').all(),
    env.DB.prepare('SELECT key, name, subject, body, attachment, updated_at FROM templates ORDER BY key').all(),
    env.DB.prepare('SELECT key, name, parts FROM payment_schedules ORDER BY name').all(),
  ]);
  const by = (k) => lists.results.filter((r) => r.kind === k).map(({ kind, ...r }) => ({ ...r, on_form: !!r.on_form }));
  return json({
    job_type: by('job_type'),
    lead_source: by('lead_source'),
    templates: templates.results,
    schedules: schedules.results.map((s) => ({ ...s, parts: JSON.parse(s.parts) })),
    workflows: Object.keys(WORKFLOWS),
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
      items.push({ value, label: text(it.label, 120) || value, workflow: d.list === 'job_type' && WORKFLOWS[it.workflow] ? it.workflow : null, on_form: it.on_form ? 1 : 0 });
    }
    if (!items.length) return json({ error: 'The list needs at least one item.' }, 400);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM lists WHERE kind = ?1').bind(d.list),
      ...items.map((it, i) => env.DB.prepare('INSERT INTO lists (kind, value, label, workflow, on_form, sort) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
        .bind(d.list, it.value, it.label, it.workflow, it.on_form, i)),
    ]);
    return json({ ok: true });
  }

  if (d?.template) {
    const t = d.template;
    const name = text(t.name, 120);
    const subject = text(t.subject, 300);
    const body = (t.body ?? '').toString().replace(/\r\n/g, '\n').trim().slice(0, 50000);
    if (!name || !subject || !body) return json({ error: 'A template needs a name, a subject and some text.' }, 400);
    if (t.key) {
      const r = await env.DB.prepare('UPDATE templates SET name = ?2, subject = ?3, body = ?4, updated_at = ?5 WHERE key = ?1').bind(t.key, name, subject, body, now).run();
      if (!r.meta.changes) return json({ error: 'That template no longer exists.' }, 404);
      return json({ ok: true, key: t.key });
    }
    let key = slug(name) || 'template';
    for (let n = 2; await env.DB.prepare('SELECT 1 FROM templates WHERE key = ?1').bind(key).first(); n++) key = `${slug(name)}-${n}`;
    await env.DB.prepare('INSERT INTO templates (key, name, subject, body, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(key, name, subject, body, now).run();
    return json({ ok: true, key });
  }
  return json({ error: 'Nothing to save.' }, 400);
}
