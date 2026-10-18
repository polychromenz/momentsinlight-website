// The client gallery: download many photos as one ZIP, made as it downloads (functions-lib/zip.js).
//   GET /api/gallery/zip?v=<visitor token>&what=all|section:<id>|list:<id>|ids:<id>,<id>…&size=original|web
// A folder per section, plus the print release. Full size only if the link allows it; links with a
// watermark can't download ZIPs (their photos come one at a time, watermarked).
import { json } from '../../../functions-lib/studio.js';
import { fileKey, crc32, gallerySettings } from '../../../functions-lib/galleries.js';
import { viewerAccess, galleryView, logEvent } from '../../../functions-lib/gallery-access.js';
import { zipStream } from '../../../functions-lib/zip.js';

const safe = (s) => String(s ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Photos';

export const PRINT_RELEASE = `PRINT RELEASE

These photographs were taken by Tony Gorham of Moments In Light (momentsinlight.co.nz).

You are welcome to print these photographs for your own personal use, at any size and at any print lab you like, and to share them with family and friends and on social media (a credit to Moments In Light is always appreciated).

Moments In Light keeps the copyright. Please don't sell the photographs, use them in advertising, or enter them in competitions without asking first.

Thank you, and enjoy your photos.
Tony Gorham · Moments In Light · 021 625 943`;

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const a = await viewerAccess(env, u.searchParams.get('v'));
  if (!a) return json({ error: 'This gallery link no longer works. Please reload the page.' }, 401);
  if (a.link.downloads === 'none' || a.link.watermark) return json({ error: 'Downloads aren’t switched on for this gallery.' }, 403);
  const full = u.searchParams.get('size') === 'original' && a.link.downloads === 'highres';
  const what = u.searchParams.get('what') ?? 'all';
  // Only what this visitor can see.
  const view = await galleryView(env, a.gallery, a.link, null);
  let pick = view.images.filter((i) => !i.ch || a.link.kind === 'main_client');
  let label = 'All photos';
  if (what.startsWith('section:')) { const sid = Number(what.slice(8)); pick = pick.filter((i) => i.s === sid); label = view.sections.find((s) => s.id === sid)?.name ?? 'Section'; }
  else if (what.startsWith('list:')) {
    const l = await env.DB.prepare('SELECT * FROM gallery_lists WHERE id = ?1 AND gallery_id = ?2').bind(Number(what.slice(5)), a.gallery.id).first();
    const mine = l && (l.owner_link_id === a.link.id || l.owner_viewer_id === a.viewer.id || a.link.list_id === l.id);
    if (!mine) return json({ error: 'That list isn’t here.' }, 404);
    const ids = new Set((await env.DB.prepare('SELECT image_id FROM gallery_list_items WHERE list_id = ?1').bind(l.id).all()).results.map((r) => r.image_id));
    pick = pick.filter((i) => ids.has(i.id)); label = l.name;
  } else if (what.startsWith('ids:')) { const ids = new Set(what.slice(4).split(',')); pick = pick.filter((i) => ids.has(i.id)); label = `${pick.length} photos`; }
  if (!pick.length) return json({ error: 'There are no photos to download there.' }, 404);
  if (pick.length > 3000) return json({ error: 'That’s too many photos for one download.' }, 400);

  const rows = (await env.DB.prepare(`SELECT id, filename, bytes, crc32, web_bytes, web_crc FROM gallery_images WHERE gallery_id = ?1 AND id IN (SELECT value FROM json_each(?2))`)
    .bind(a.gallery.id, JSON.stringify(pick.map((i) => i.id))).all()).results;
  const byId = new Map(rows.map((r) => [r.id, r]));
  // Web copies uploaded before their size was kept: measure them once now.
  if (!full) {
    for (const r of rows.filter((x) => !x.web_bytes)) {
      const o = await env.GALLERY_WEB.get(fileKey(a.gallery.id, r.id, 'web'));
      if (!o) continue;
      const bytes = new Uint8Array(await o.arrayBuffer());
      r.web_bytes = bytes.length; r.web_crc = crc32(bytes);
      await env.DB.prepare('UPDATE gallery_images SET web_bytes = ?2, web_crc = ?3 WHERE id = ?1').bind(r.id, r.web_bytes, r.web_crc).run();
    }
  }
  const multi = new Set(pick.map((i) => i.s)).size > 1;
  const secName = new Map(view.sections.map((s) => [s.id, safe(s.name)]));
  const used = new Set();
  const entries = [];
  for (const i of pick) {
    const r = byId.get(i.id);
    const size = full ? r?.bytes : r?.web_bytes;
    const crc = full ? r?.crc32 : r?.web_crc;
    if (!size || crc === null || crc === undefined) continue;
    const base = safe((r.filename || i.id).replace(/\.jpe?g$/i, ''));
    let name = `${multi ? `${secName.get(i.s)}/` : ''}${base}.jpg`;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${multi ? `${secName.get(i.s)}/` : ''}${base} (${n}).jpg`;
    used.add(name.toLowerCase());
    entries.push({ name, size, crc, open: async () => (await (full ? env.GALLERY_FILES : env.GALLERY_WEB).get(fileKey(a.gallery.id, i.id, full ? 'original' : 'web')))?.body ?? null });
  }
  const s = await gallerySettings(env.DB);
  const release = new TextEncoder().encode((s.print_release || PRINT_RELEASE).replace(/\r?\n/g, '\r\n'));
  entries.push({ name: 'Print release.txt', size: release.length, crc: crc32(release), open: async () => release });
  const { stream, length } = zipStream(entries);
  await logEvent(env, a, 'download', null, { what, size: full ? 'original' : 'web', n: entries.length - 1 });
  const fileName = safe(`${a.gallery.name} - ${label}${full ? '' : ' (web size)'}`);
  return new Response(stream, {
    headers: {
      'content-type': 'application/zip',
      'content-length': String(length),
      'content-disposition': `attachment; filename="${fileName.replace(/[^\x20-\x7e]/g, '_')}.zip"; filename*=UTF-8''${encodeURIComponent(fileName)}.zip`,
      'cache-control': 'private, no-store',
    },
  });
}
