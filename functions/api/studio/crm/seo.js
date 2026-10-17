// The SEO page (/studio/seo).
//   GET  /api/studio/crm/seo?part=search|tracked|venues|content|health|settings
//   POST /api/studio/crm/seo  { action: 'settings', keywords?, posts_goal? }
//                         { action: 'ideas', seeds: [...] }      Google's suggestions for those
//                         { action: 'health' }                   run the site check now (one batch;
//                                                                 the page keeps calling until it's done)
import { json } from '../../../../functions-lib/studio.js';
import { gscReady, searchReport, trackedKeywords, keywordIdeas, venueIdeas, contentStatus, siteHealth, seoSettings, saveSeoSettings } from '../../../../functions-lib/seo.js';
import { connection } from '../../../../functions-lib/gmail.js';

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
      const keywords = Array.isArray(d.keywords) ? [...new Set(d.keywords.map((k) => String(k).toLowerCase().trim().slice(0, 100)).filter(Boolean))].slice(0, 40) : s.keywords;
      const goal = d.posts_goal !== undefined ? Math.max(0, Math.min(30, Math.round(Number(d.posts_goal) || 0))) : s.posts_goal;
      await saveSeoSettings(env.DB, { ...s, keywords, posts_goal: goal });
      return json({ ok: true });
    }
    if (d.action === 'ideas') return json({ ideas: await keywordIdeas(env, (Array.isArray(d.seeds) ? d.seeds : []).map((x) => String(x).slice(0, 80))) });
    if (d.action === 'health') return json({ result: await siteHealth(env, { now: !!d.start }) });
    return json({ error: 'What should happen?' }, 400);
  } catch (e) {
    return json({ error: e.message }, 400);
  }
}
