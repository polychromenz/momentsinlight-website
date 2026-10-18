// The Rankings page (/studio/rankings): functions-lib/rankings.js.
//   GET  /api/studio/crm/rankings
//   POST /api/studio/crm/rankings  { action: 'check' }                      ask Google now (once a day)
//                                  { action: 'collect' }                    fetch finished results
//                                  { action: 'target', keyword, page }      the page for a search ('' = automatic)
//                                  { action: 'task', keyword, key, title, detail }  add a fix as a task
//                                  { action: 'compare', keyword }           look at the top 3 pages
//                                  { action: 'suggest', keyword, key, target, pages? }  a before-and-after for one fix
//                                  { action: 'apply', items }               save the (edited) suggestion
//                                  { action: 'level', keyword, level }      main | supporting | low
import { json } from '../../../../functions-lib/studio.js';
import { rankingsReport, postRun, collect, serpReady, compareTop, setTarget, setLevel } from '../../../../functions-lib/rankings.js';
import { suggestFix, toChanges } from '../../../../functions-lib/rankings-fix.js';
import { saveFixes } from '../../../../functions-lib/seo-fix.js';

export async function onRequestGet({ env }) {
  try {
    return json(await rankingsReport(env));
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const text = (v, max) => String(v ?? '').trim().slice(0, max);
  try {
    if (d.action === 'check') {
      if (!serpReady(env)) return json({ error: 'DataForSEO isn’t set up yet (see the steps on this page).' }, 400);
      const r = await postRun(env);
      return json(r.already ? { message: 'Already checked today; the results come in within a few minutes.' } : r.none ? { error: 'Track a search first.' } : { message: `Asked Google for ${r.posted / 2} searches on phone and desktop. Results in about 5 minutes.` });
    }
    if (d.action === 'collect') return json({ collected: serpReady(env) ? await collect(env, 20) : 0 });
    if (d.action === 'target') { await setTarget(env.DB, text(d.keyword, 100), text(d.page, 300)); return json({ ok: true }); }
    if (d.action === 'compare') return json(await compareTop(env, text(d.keyword, 100)));
    if (d.action === 'suggest') return json(await suggestFix(env, { keyword: text(d.keyword, 100), key: text(d.key, 40), target: text(d.target, 300) || '/', pages: Array.isArray(d.pages) ? d.pages.map((p) => text(p, 300)) : [], keep: Array.isArray(d.keep) ? d.keep.map((k) => text(k, 100)).slice(0, 10) : [] }));
    if (d.action === 'level') { await setLevel(env.DB, text(d.keyword, 100), text(d.level, 20)); return json({ ok: true }); }
    if (d.action === 'apply') {
      const changes = toChanges(Array.isArray(d.items) ? d.items.slice(0, 20) : []);
      if (!changes.length) return json({ error: 'Nothing to apply.' }, 400);
      return json(await saveFixes(env, changes));
    }
    if (d.action === 'task') {
      const ref = `seo:${text(d.keyword, 100)}:${text(d.key, 40)}`;
      const open = await env.DB.prepare(`SELECT id FROM tasks WHERE ref = ?1 AND status = 'open'`).bind(ref).first();
      if (open) return json({ ok: true, id: open.id });
      const r = await env.DB.prepare(`INSERT INTO tasks (title, notes, kind, ref, created_at) VALUES (?1, ?2, 'seo', ?3, ?4) RETURNING id`)
        .bind(text(`${d.title} (“${d.keyword}”)`, 200), text(d.detail, 2000), ref, new Date().toISOString()).first();
      return json({ ok: true, id: r.id });
    }
    return json({ error: 'What should happen?' }, 400);
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}
