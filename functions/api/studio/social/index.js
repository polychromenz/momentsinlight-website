// Studio > Social (functions-lib/social.js): the drafts, Tony's edits and approvals, and the Social
// mark on gallery photos.
//   GET  /api/studio/social?from=YYYY-MM-DD&to=YYYY-MM-DD   -> { posts, platforms, ideas, marked, drafts_on, meta }
//   POST /api/studio/social { action: 'mark', gallery_id, image_ids, on? }   mark photos Social (on omitted = toggle one)
//   POST /api/studio/social { action: 'save', id, caption, post_at, link, label, photos, shape? }   shape: Instagram's '4:5', '1:1' or 'original'
//   POST /api/studio/social { action: 'approve' | 'unapprove' | 'skip' | 'restore' | 'posted', id }
//   POST /api/studio/social { action: 'post_now', id }      publish an approved Facebook/Instagram post now (functions-lib/meta.js)
//   POST /api/studio/social { action: 'recaption', id }     a fresh AI caption (not saved until Save)
//   POST /api/studio/social { action: 'swap', id }          a different idea in the same slot
//   POST /api/studio/social { action: 'draft_now' }         fill the week ahead now rather than on the timer
//   POST /api/studio/social { action: 'drafts', on }        pause or resume the automatic drafts
import { json } from '../../../../functions-lib/studio.js';
import { adsBlocked } from '../../../../functions-lib/picks.js';
import { PLATFORMS, ideas, recaption, swapDraft, socialTimer } from '../../../../functions-lib/social.js';
import { metaStatus, connectedFor, publishPost } from '../../../../functions-lib/meta.js';

const shape = (p) => ({ ...p, photos: JSON.parse(p.photos || '[]') });

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '');
  const from = ok(q.get('from')) ? q.get('from') : new Date().toISOString().slice(0, 10);
  const to = ok(q.get('to')) ? q.get('to') : from;
  const db = env.DB;
  const [posts, marked, set, idea, meta] = await Promise.all([
    db.prepare(`SELECT * FROM social_posts WHERE post_at >= ?1 AND post_at <= ?2 AND source <> 'none' ORDER BY post_at, platform`).bind(from, `${to}T23:59`).all(),
    db.prepare(`SELECT count(*) n FROM photo_picks WHERE purpose = 'social'`).first(),
    db.prepare(`SELECT value FROM settings WHERE key = 'social'`).first(),
    ideas(env).catch(() => []),
    metaStatus(env),
  ]);
  return json({ posts: posts.results.map(shape), platforms: PLATFORMS, ideas: idea, marked: marked.n, drafts_on: !set || JSON.parse(set.value).drafts !== false, meta });
}

const cropOk = (c) => c && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(c[k])) && c.x >= -0.001 && c.y >= -0.001 && c.w > 0.05 && c.h > 0.05 && c.x + c.w <= 1.001 && c.y + c.h <= 1.001;
const clean = (c) => ({ x: +c.x.toFixed(4), y: +c.y.toFixed(4), w: +c.w.toFixed(4), h: +c.h.toFixed(4) });

export async function onRequestPost({ request, env }) {
  const d = await request.json().catch(() => ({}));
  const db = env.DB;
  const now = new Date().toISOString();
  try {
    if (d.action === 'mark') {
      const gid = String(d.gallery_id ?? '');
      const ids = (Array.isArray(d.image_ids) ? d.image_ids : []).map(String).slice(0, 2000);
      if (!ids.length) return json({ error: 'Which photos?' }, 400);
      const have = new Set((await db.prepare(`SELECT image_id FROM photo_picks WHERE gallery_id = ?1 AND purpose = 'social'`).bind(gid).all()).results.map((r) => r.image_id));
      const on = d.on ?? !have.has(ids[0]);
      if (on) {
        const why = await adsBlocked(db, gid);
        if (why) return json({ error: why.replace('no ads', 'no marketing') }, 400);
        const real = new Set((await db.prepare(`SELECT id FROM gallery_images WHERE gallery_id = ?1`).bind(gid).all()).results.map((r) => r.id));
        const add = ids.filter((i) => real.has(i) && !have.has(i));
        for (let n = 0; n < add.length; n += 50)
          await db.batch(add.slice(n, n + 50).map((i) => db.prepare(`INSERT OR IGNORE INTO photo_picks (image_id, gallery_id, purpose, created_at) VALUES (?1, ?2, 'social', ?3)`).bind(i, gid, now)));
      } else {
        for (let n = 0; n < ids.length; n += 50)
          await db.batch(ids.slice(n, n + 50).map((i) => db.prepare(`DELETE FROM photo_picks WHERE image_id = ?1 AND gallery_id = ?2 AND purpose = 'social'`).bind(i, gid)));
      }
      const marked = (await db.prepare(`SELECT image_id FROM photo_picks WHERE gallery_id = ?1 AND purpose = 'social'`).bind(gid).all()).results.map((r) => r.image_id);
      return json({ on, marked });
    }
    if (d.action === 'draft_now') return json({ result: await socialTimer(env) });
    if (d.action === 'drafts') {
      await db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('social', ?1, ?2) ON CONFLICT (key) DO UPDATE SET value = ?1, updated_at = ?2`)
        .bind(JSON.stringify({ drafts: !!d.on }), now).run();
      return json({ drafts_on: !!d.on });
    }

    const p = await db.prepare('SELECT * FROM social_posts WHERE id = ?1').bind(Number(d.id)).first();
    if (!p) return json({ error: 'That post isn’t here any more.' }, 404);
    const set = async (sql, ...binds) => { await db.prepare(`UPDATE social_posts SET ${sql} WHERE id = ?1`).bind(p.id, ...binds).run(); return json({ post: shape(await db.prepare('SELECT * FROM social_posts WHERE id = ?1').bind(p.id).first()) }); };

    if (d.action === 'save') {
      if (p.status === 'posted') return json({ error: 'That one has already been posted.' }, 400);
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(d.post_at ?? '')) return json({ error: 'When should it go out?' }, 400);
      const caption = String(d.caption ?? '').slice(0, PLATFORMS[p.platform].chars);
      // Photos: only the post's own, in Tony's order, with his crops.
      const own = new Map(JSON.parse(p.photos || '[]').map((x) => [x.src, x]));
      const photos = (Array.isArray(d.photos) ? d.photos : []).filter((x) => own.has(x?.src)).slice(0, PLATFORMS[p.platform].max)
        .map((x) => ({ ...own.get(x.src), crop: cropOk(x.crop) ? clean(x.crop) : undefined }));
      if (!photos.length) return json({ error: 'Keep at least one photo (or Skip the post).' }, 400);
      const link = d.link ? String(d.link).trim().slice(0, 500) : null;
      if (link && !/^https:\/\//.test(link)) return json({ error: 'The link should start with https://' }, 400);
      const shapeOk = p.platform === 'instagram' && ['4:5', '1:1', 'original', 'whole'].includes(d.shape) ? d.shape : p.shape ?? null;
      return set(`caption = ?2, post_at = ?3, link = ?4, label = ?5, photos = ?6, shape = ?7, ai = CASE WHEN caption = ?2 THEN ai ELSE 0 END`,
        caption, d.post_at, link, String(d.label ?? p.label ?? '').slice(0, 200), JSON.stringify(photos), shapeOk);
    }
    if (d.action === 'approve') {
      if (p.status !== 'draft') return json({ error: 'Only a draft can be approved.' }, 400);
      if (!p.caption.trim()) return json({ error: 'Write a caption first.' }, 400);
      if (await connectedFor(db, p.platform) && !JSON.parse(p.media || '[]').length) return json({ error: 'The photos didn’t upload. Try Approve again.' }, 400);
      return set(`status = 'approved', approved_at = ?2`, now);
    }
    if (d.action === 'unapprove') return ['approved', 'failed'].includes(p.status) ? set(`status = 'draft', approved_at = NULL, media = NULL, error = NULL`) : json({ error: 'It isn’t approved.' }, 400);
    if (d.action === 'post_now') {
      if (!['approved', 'failed'].includes(p.status)) return json({ error: 'Approve it first.' }, 400);
      if (!await connectedFor(db, p.platform)) return json({ error: `${PLATFORMS[p.platform].name} isn’t connected.` }, 400);
      const r = await publishPost(env, p);
      if (!r.ok) return json({ error: r.error, post: shape(await db.prepare('SELECT * FROM social_posts WHERE id = ?1').bind(p.id).first()) }, 502);
      return json({ post: shape(await db.prepare('SELECT * FROM social_posts WHERE id = ?1').bind(p.id).first()) });
    }
    if (d.action === 'skip') return p.status === 'posted' ? json({ error: 'That one has already been posted.' }, 400) : set(`status = 'skipped'`);
    if (d.action === 'restore') return p.status === 'skipped' ? set(`status = 'draft'`) : json({ error: 'It isn’t skipped.' }, 400);
    if (d.action === 'posted') return ['approved', 'failed'].includes(p.status) ? set(`status = 'posted', posted_at = ?2`, now) : json({ error: 'Approve it first.' }, 400);
    if (d.action === 'recaption') return json(await recaption(env, p));
    if (d.action === 'swap') {
      if (p.status !== 'draft') return json({ error: 'Only a draft can be swapped.' }, 400);
      return json({ swapped: await swapDraft(env, p) });
    }
    return json({ error: 'What should happen?' }, 400);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
