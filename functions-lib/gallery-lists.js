// MIL Galleries 1d: favourites and lists, client hiding, sharing a list, sending a list to Tony,
// and selection requests (lists Tony sets up with a minimum/maximum and a deadline).
// Lists belong to the link for the couple and invited people (the same on every device they use)
// and to the visitor for guests. a = viewerAccess(): { viewer, link, gallery }.
import { newId } from './galleries.js';
import { linkUrl } from './gallery-access.js';
import { alertTony } from './crm.js';

const ownedByLink = (a) => ['main_client', 'invited'].includes(a.link.kind);
const ownerSql = (a) => (ownedByLink(a) ? ['owner_link_id = ?2', a.link.id] : ['owner_viewer_id = ?2', a.viewer.id]);
export const canList = (a) => !!a.link.allow_lists && a.link.kind !== 'list_share';
export const PURPOSES = { album: 'Album', retouch: 'Retouching', prints: 'Prints', other: 'Something else' };

/** This visitor's lists, favourites first, each with its photo ids. */
export async function myLists(env, a) {
  if (!canList(a)) return [];
  const [where, owner] = ownerSql(a);
  const lists = (await env.DB.prepare(`SELECT * FROM gallery_lists WHERE gallery_id = ?1 AND ${where} ORDER BY kind = 'favourites' DESC, kind = 'selection_request' DESC, id`).bind(a.gallery.id, owner).all()).results;
  if (!lists.length) return [];
  const items = (await env.DB.prepare(`SELECT list_id, image_id FROM gallery_list_items WHERE list_id IN (SELECT value FROM json_each(?1)) ORDER BY added_at`).bind(JSON.stringify(lists.map((l) => l.id))).all()).results;
  return lists.map((l) => ({
    id: l.id, name: l.name, kind: l.kind, purpose: l.purpose, status: l.status, min: l.min_count, max: l.max_count, deadline: l.deadline,
    instructions: l.instructions, note: l.note, submitted_at: l.submitted_at, ids: items.filter((i) => i.list_id === l.id).map((i) => i.image_id),
  }));
}

async function newList(env, a, name, kind = 'custom') {
  const own = ownedByLink(a);
  const r = await env.DB.prepare(`INSERT INTO gallery_lists (gallery_id, owner_viewer_id, owner_link_id, name, kind, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) RETURNING id`)
    .bind(a.gallery.id, own ? null : a.viewer.id, own ? a.link.id : null, String(name).trim().slice(0, 60) || 'My list', kind, new Date().toISOString()).first();
  return r.id;
}
async function favourites(env, a) {
  const [where, owner] = ownerSql(a);
  const f = await env.DB.prepare(`SELECT id FROM gallery_lists WHERE gallery_id = ?1 AND ${where} AND kind = 'favourites'`).bind(a.gallery.id, owner).first();
  return f?.id ?? newList(env, a, 'Favourites', 'favourites');
}
async function ownList(env, a, id) {
  const [where, owner] = ownerSql(a);
  const l = await env.DB.prepare(`SELECT * FROM gallery_lists WHERE id = ?1 AND gallery_id = ?3 AND ${where.replace('?2', '?2')}`).bind(Number(id), owner, a.gallery.id).first();
  if (!l) throw new Error('That list isn’t here any more.');
  return l;
}
const editable = (l) => { if (l.status !== 'open') throw new Error('This list has been sent to Tony, so it can’t be changed now. Ask him to reopen it.'); };
const event = (env, a, type, meta = {}, imageId = null) => a.viewer.role === 'studio' ? Promise.resolve() : env.DB.prepare('INSERT INTO gallery_events (gallery_id, viewer_id, link_id, type, image_id, meta, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
  .bind(a.gallery.id, a.viewer.id, a.link.id, type, imageId, JSON.stringify(meta), new Date().toISOString()).run();

/** Photo ids that belong to this gallery (and that this visitor can see). */
async function validIds(env, a, ids) {
  const rows = (await env.DB.prepare(`SELECT id FROM gallery_images WHERE gallery_id = ?1 AND hidden = 0 AND status = 'ready' AND id IN (SELECT value FROM json_each(?2))`)
    .bind(a.gallery.id, JSON.stringify((ids ?? []).map(String).slice(0, 2000))).all()).results;
  return rows.map((r) => r.id);
}

/** Everything a visitor can do with lists and hiding. Returns what the page needs to update. */
export async function act(env, a, d) {
  const db = env.DB;
  const now = new Date().toISOString();
  if (d.action === 'hide') {
    if (a.link.kind !== 'main_client') throw new Error('Only the couple can hide photos.');
    const ids = await validIds(env, a, d.ids ?? [d.id]);
    await db.prepare('UPDATE gallery_images SET client_hidden = ?3 WHERE gallery_id = ?1 AND id IN (SELECT value FROM json_each(?2))').bind(a.gallery.id, JSON.stringify(ids), d.hidden ? 1 : 0).run();
    await event(env, a, d.hidden ? 'client_hide' : 'client_unhide', { n: ids.length });
    return { ok: true };
  }
  if (!canList(a)) throw new Error('Lists aren’t switched on for this link.');
  if (d.action === 'fav') {
    const list = await favourites(env, a);
    const [id] = await validIds(env, a, [d.id]);
    if (!id) throw new Error('That photo isn’t here.');
    if (d.on) await db.prepare('INSERT OR IGNORE INTO gallery_list_items (list_id, image_id, added_at) VALUES (?1, ?2, ?3)').bind(list, id, now).run();
    else await db.prepare('DELETE FROM gallery_list_items WHERE list_id = ?1 AND image_id = ?2').bind(list, id).run();
    if (d.on) await event(env, a, 'favourite', {}, id);
    return { ok: true, lists: await myLists(env, a) };
  }
  if (d.action === 'list-new') {
    const id = await newList(env, a, d.name);
    if (d.ids?.length) await act(env, a, { action: 'list-add', list_id: id, ids: d.ids });
    return { ok: true, id, lists: await myLists(env, a) };
  }
  const l = await ownList(env, a, d.list_id);
  if (d.action === 'list-add' || d.action === 'list-remove') {
    editable(l);
    const ids = await validIds(env, a, d.ids);
    if (d.action === 'list-add') {
      if (l.max_count) {
        const n = (await db.prepare('SELECT count(*) n FROM gallery_list_items WHERE list_id = ?1').bind(l.id).first()).n;
        const fresh = ids.length - (await db.prepare('SELECT count(*) n FROM gallery_list_items WHERE list_id = ?1 AND image_id IN (SELECT value FROM json_each(?2))').bind(l.id, JSON.stringify(ids)).first()).n;
        if (n + fresh > l.max_count) throw new Error(`“${l.name}” can have up to ${l.max_count} photos (it has ${n}).`);
      }
      const stmts = ids.map((id) => db.prepare('INSERT OR IGNORE INTO gallery_list_items (list_id, image_id, added_at) VALUES (?1, ?2, ?3)').bind(l.id, id, now));
      for (let i = 0; i < stmts.length; i += 400) await db.batch(stmts.slice(i, i + 400));
      await event(env, a, 'list_add', { list: l.id, n: ids.length });
    } else {
      await db.prepare('DELETE FROM gallery_list_items WHERE list_id = ?1 AND image_id IN (SELECT value FROM json_each(?2))').bind(l.id, JSON.stringify(ids)).run();
    }
    return { ok: true, lists: await myLists(env, a) };
  }
  if (d.action === 'list-rename') {
    if (l.kind !== 'custom') throw new Error('This list’s name can’t be changed.');
    await db.prepare('UPDATE gallery_lists SET name = ?2 WHERE id = ?1').bind(l.id, String(d.name ?? '').trim().slice(0, 60) || l.name).run();
    return { ok: true, lists: await myLists(env, a) };
  }
  if (d.action === 'list-delete') {
    if (l.kind !== 'custom') throw new Error('This list can’t be deleted.');
    await db.batch([
      db.prepare('DELETE FROM gallery_list_items WHERE list_id = ?1').bind(l.id),
      db.prepare('DELETE FROM gallery_links WHERE list_id = ?1').bind(l.id),
      db.prepare('DELETE FROM gallery_lists WHERE id = ?1').bind(l.id),
    ]);
    return { ok: true, lists: await myLists(env, a) };
  }
  if (d.action === 'list-share') {
    // A link showing only this list. It can never allow more than the link it came from.
    let s = await db.prepare(`SELECT token FROM gallery_links WHERE list_id = ?1 AND kind = 'list_share'`).bind(l.id).first();
    if (!s) {
      const token = newId(24);
      await db.prepare(`INSERT INTO gallery_links (gallery_id, kind, name, token, watermark, downloads, allow_lists, require_email, list_id, parent_link_id, created_at)
        VALUES (?1, 'list_share', ?2, ?3, ?4, ?5, 0, 0, ?6, ?7, ?8)`)
        .bind(a.gallery.id, `${l.name} (shared by ${a.viewer.name || a.link.name || 'a visitor'})`, token, a.link.watermark, a.link.downloads === 'highres' ? 'web' : a.link.downloads, l.id, a.link.id, now).run();
      s = { token };
      await event(env, a, 'share', { list: l.id });
    }
    return { ok: true, url: linkUrl(a.gallery.slug, s.token) };
  }
  if (d.action === 'list-send') {
    editable(l);
    const n = (await db.prepare('SELECT count(*) n FROM gallery_list_items WHERE list_id = ?1').bind(l.id).first()).n;
    if (!n) throw new Error('Add some photos to the list first.');
    if (l.min_count && n < l.min_count) throw new Error(`Please choose at least ${l.min_count} photos (you have ${n}).`);
    const purpose = PURPOSES[d.purpose] ? d.purpose : l.purpose ?? 'other';
    const note = String(d.note ?? '').trim().slice(0, 2000);
    await db.prepare(`UPDATE gallery_lists SET status = 'submitted', purpose = ?2, note = ?3, submitted_at = ?4 WHERE id = ?1`).bind(l.id, purpose, note, now).run();
    await event(env, a, 'list_submit', { list: l.id, n, purpose });
    await alertTony(env, `${a.viewer.name || a.link.name || 'A client'} sent you “${l.name}” (${n} photo${n === 1 ? '' : 's'})`, [
      ['Gallery', a.gallery.name], ['From', [a.viewer.name || a.link.name, a.viewer.email].filter(Boolean).join(' · ')], ['For', PURPOSES[purpose]], ['Note', note], ['Photos', String(n)],
    ], `https://www.momentsinlight.co.nz/studio/gallery?id=${a.gallery.id}&tab=lists`);
    return { ok: true, lists: await myLists(env, a) };
  }
  throw new Error('What should happen?');
}

/** For the studio: every list in a gallery, with whose it is and its photos' file names. */
export async function galleryLists(env, galleryId) {
  const db = env.DB;
  const lists = (await db.prepare(`SELECT l.*, k.name link_name, k.kind link_kind, v.name viewer_name, v.email viewer_email FROM gallery_lists l
    LEFT JOIN gallery_links k ON k.id = l.owner_link_id LEFT JOIN gallery_viewers v ON v.id = l.owner_viewer_id
    WHERE l.gallery_id = ?1 ORDER BY l.submitted_at IS NULL, l.submitted_at DESC, l.id DESC`).bind(galleryId).all()).results;
  const items = lists.length ? (await db.prepare(`SELECT li.list_id, i.id, i.filename FROM gallery_list_items li JOIN gallery_images i ON i.id = li.image_id
    WHERE li.list_id IN (SELECT value FROM json_each(?1)) ORDER BY i.sort_order`).bind(JSON.stringify(lists.map((l) => l.id))).all()).results : [];
  return lists.map((l) => ({ ...l, owner: l.viewer_name || l.viewer_email || l.link_name || 'Visitor', photos: items.filter((i) => i.list_id === l.id).map(({ id, filename }) => ({ id, filename })) }));
}
