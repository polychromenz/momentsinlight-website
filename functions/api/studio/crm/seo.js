// The SEO page (/studio/seo).
//   GET  /api/studio/crm/seo?part=search|tracked|venues|content|health|competitors|settings
//   POST /api/studio/crm/seo  { action: 'settings', keywords?, posts_goal? }
//                         { action: 'ideas', seeds: [...] }      Google's suggestions for those
//                         { action: 'health' }                   run the site check now (one batch;
//                                                                 the page keeps calling until it's done)
//                         { action: 'competitor', id }          read that competitor's sitemap now
//                         { action: 'competitor_keywords', id }  the searches they rank for (DataForSEO)
//                         { action: 'track', keywords: [...] }   add searches to the tracked list
//                         { action: 'competitor_remove', id }    remove a competitor (and what was saved about them)
import { json } from '../../../../functions-lib/studio.js';
import { gscReady, searchReport, trackedKeywords, keywordIdeas, venueIdeas, contentStatus, siteHealth, seoSettings, saveSeoSettings, competitorReport, checkCompetitor } from '../../../../functions-lib/seo.js';
import { connection } from '../../../../functions-lib/gmail.js';
import { competitorKeywords } from '../../../../functions-lib/rankings.js';

export async function onRequestGet({ request, env }) {
  const part = new URL(request.url).searchParams.get('part');
  try {
    if (part === 'search') {
      if (!(await connection(env.DB))) return json({ connect: 'gmail' });
      if (!(await gscReady(env.DB))) return json({ connect: 'reconnect' });
      return json(await searchReport(env));
    }
    if (part === 'tracked') return json({ keywords: await trackedKeywords(env.DB) });
    if (part === 'venues') return json({ venues: await venueIdeas(env) });
    if (part === 'content') return json(await contentStatus(env));
    if (part === 'competitors') return json(await competitorReport(env));
    if (part === 'health') { const r = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'site_health'`).first(); return json(r ? JSON.parse(r.value) : { none: true }); }
    return json(await seoSettings(env.DB));
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  try {
    if (d.action === 'settings') {
      const s = await seoSettings(env.DB);
      const keywords = Array.isArray(d.keywords) ? [...new Set(d.keywords.map((k) => String(k).toLowerCase().trim().slice(0, 100)).filter(Boolean))].slice(0, 50) : s.keywords;
      const goal = d.posts_goal !== undefined ? Math.max(0, Math.min(30, Math.round(Number(d.posts_goal) || 0))) : s.posts_goal;
      await saveSeoSettings(env.DB, { ...s, keywords, posts_goal: goal });
      return json({ ok: true });
    }
    if (d.action === 'ideas') return json({ ideas: await keywordIdeas(env, (Array.isArray(d.seeds) ? d.seeds : []).map((x) => String(x).slice(0, 80))) });
    if (d.action === 'competitor') {
      const c = await env.DB.prepare(`SELECT id, website FROM contacts WHERE id = ?1 AND type = 'Competitor'`).bind(Number(d.id)).first();
      if (!c?.website) return json({ error: 'Add their website on the contact first.' }, 400);
      const r = await checkCompetitor(env, c);
      return r.error ? json({ error: r.error }, 400) : json(r);
    }
    if (d.action === 'competitor_keywords') {
      const c = await env.DB.prepare(`SELECT id, business, website FROM contacts WHERE id = ?1 AND type = 'Competitor'`).bind(Number(d.id)).first();
      if (!c) return json({ error: 'That competitor doesn’t exist.' }, 404);
      return json(await competitorKeywords(env, c));
    }
    if (d.action === 'competitor_remove') {
      const id = Number(d.id);
      const c = await env.DB.prepare(`SELECT id FROM contacts WHERE id = ?1 AND type = 'Competitor'`).bind(id).first();
      if (!c) return json({ error: 'That competitor doesn’t exist.' }, 404);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM competitor_pages WHERE contact_id = ?1').bind(id),
        env.DB.prepare('DELETE FROM competitor_keywords WHERE contact_id = ?1').bind(id),
        env.DB.prepare('DELETE FROM tasks WHERE contact_id = ?1').bind(id),
        env.DB.prepare('DELETE FROM contact_messages WHERE contact_id = ?1').bind(id),
        env.DB.prepare('DELETE FROM contacts WHERE id = ?1').bind(id),
      ]);
      return json({ ok: true });
    }
    if (d.action === 'track') {
      const s = await seoSettings(env.DB);
      const add = (Array.isArray(d.keywords) ? d.keywords : []).map((k) => String(k).toLowerCase().trim().slice(0, 100)).filter(Boolean);
      const keywords = [...new Set([...s.keywords, ...add])].slice(0, 50);
      await saveSeoSettings(env.DB, { ...s, keywords });
      return json({ ok: true, count: keywords.length });
    }
    if (d.action === 'health') return json({ result: await siteHealth(env, { now: !!d.start }) });
    return json({ error: 'What should happen?' }, 400);
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}
