// Albums: the Seldex files, made in Tony's browser from the full-size originals (like the print lab files,
// src/prints/lab-files.ts). Every spread is drawn at exactly 300 dpi (2W × H inches plus any bleed in
// ALBUM_MARGINS), saved as a JPEG marked 300 dpi with an sRGB colour profile, named 001.jpg onwards, in
// one ZIP (stored, not compressed: JPEGs don't shrink) with an order sheet.
import { crc32 } from '../../functions-lib/galleries.js';
import { ALBUM_DPI, ALBUM_MARGINS, pageSize, spreadPx } from '../../functions-lib/album-sizes.js';
import { cropBox, spreadRects, type Photo, type Spread } from './album-layouts';

type Album = { id: number; name: string; size: string; orientation: string; bg: string; design: { spreads: Spread[] } };

// ---- An sRGB colour profile (ICC v2, made here rather than copied from anyone) ----
let icc: Uint8Array | null = null;
function srgbProfile(): Uint8Array {
  if (icc) return icc;
  const enc = new TextEncoder();
  const s15 = (v: number) => Math.round(v * 65536);
  const xyz = (x: number, y: number, z: number) => { const b = new DataView(new ArrayBuffer(20)); b.setUint32(0, 0x58595a20); [x, y, z].forEach((v, k) => b.setInt32(8 + 4 * k, s15(v))); return new Uint8Array(b.buffer); };
  const text = (s: string) => { const t = enc.encode(s); const b = new Uint8Array(8 + t.length + 1); b.set(enc.encode('text')); b.set(t, 8); return b; };
  const desc = (s: string) => {
    const t = enc.encode(s); const b = new DataView(new ArrayBuffer(12 + t.length + 1 + 4 + 4 + 2 + 1 + 67));
    b.setUint32(0, 0x64657363); b.setUint32(8, t.length + 1); new Uint8Array(b.buffer).set(t, 12); return new Uint8Array(b.buffer);
  };
  const N = 1024;
  const curve = new DataView(new ArrayBuffer(12 + 2 * N));
  curve.setUint32(0, 0x63757276); curve.setUint32(8, N);
  for (let k = 0; k < N; k++) { const v = k / (N - 1); curve.setUint16(12 + 2 * k, Math.round(65535 * (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))); }
  const trc = new Uint8Array(curve.buffer);
  // sRGB primaries adapted to D50 (the profile connection space), as in the IEC 61966-2-1 profiles.
  const tags: [string, Uint8Array][] = [
    ['desc', desc('sRGB IEC61966-2.1')], ['cprt', text('No copyright, use freely')], ['wtpt', xyz(0.9642, 1, 0.8249)],
    ['rXYZ', xyz(0.4360747, 0.2225045, 0.0139322)], ['gXYZ', xyz(0.3850649, 0.7168786, 0.0971045)], ['bXYZ', xyz(0.1430804, 0.0606169, 0.7141733)],
    ['rTRC', trc], ['gTRC', trc], ['bTRC', trc],
  ];
  const pad = (n: number) => (n + 3) & ~3;
  let at = pad(128 + 4 + 12 * tags.length);
  const place = new Map<Uint8Array, number>();
  const table = tags.map(([sig, data]) => { if (!place.has(data)) { place.set(data, at); at = pad(at + data.length); } return [sig, place.get(data)!, data.length] as const; });
  const out = new Uint8Array(at), v = new DataView(out.buffer);
  v.setUint32(0, at); v.setUint32(8, 0x02100000);
  out.set(enc.encode('mntrRGB XYZ '), 12);
  const d = new Date(); [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 0, 0, 0].forEach((x, k) => v.setUint16(24 + 2 * k, x));
  out.set(enc.encode('acsp'), 36);
  [0.9642, 1, 0.8249].forEach((x, k) => v.setInt32(68 + 4 * k, s15(x)));
  v.setUint32(128, tags.length);
  table.forEach(([sig, off, len], k) => { out.set(enc.encode(sig), 132 + 12 * k); v.setUint32(136 + 12 * k, off); v.setUint32(140 + 12 * k, len); });
  for (const [data, off] of place) out.set(data, off);
  return (icc = out);
}

/** The browser's JPEG, marked 300 dpi (JFIF density) with exactly one sRGB profile (APP2 ICC_PROFILE):
 *  the browser's own JFIF and profile segments (Chrome adds one) are taken out first. */
export function markJpeg(src: Uint8Array, dpi = ALBUM_DPI): Uint8Array {
  const enc = new TextEncoder();
  // Keep every segment before the image data except APP0 (JFIF) and APP2 ICC profiles.
  const keep: Uint8Array[] = [];
  let p0 = 2;
  while (p0 + 4 <= src.length && src[p0] === 0xff && src[p0 + 1] !== 0xda) {
    const m = src[p0 + 1], len = (src[p0 + 2] << 8) | src[p0 + 3];
    const icc = m === 0xe2 && String.fromCharCode(...src.subarray(p0 + 4, p0 + 15)) === 'ICC_PROFILE';
    if (m !== 0xe0 && !icc) keep.push(src.subarray(p0, p0 + 2 + len));
    p0 += 2 + len;
  }
  const head = new Uint8Array(keep.reduce((a, x) => a + x.length, 0));
  keep.reduce((at, x) => (head.set(x, at), at + x.length), 0);
  const tail = src.subarray(p0);
  const jpg = new Uint8Array(2 + head.length + tail.length);
  jpg.set([0xff, 0xd8]); jpg.set(head, 2); jpg.set(tail, 2 + head.length);
  const rest = 2; // after SOI
  const jfif = new Uint8Array([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, dpi >> 8, dpi & 255, dpi >> 8, dpi & 255, 0, 0]);
  const p = srgbProfile();
  const app2 = new Uint8Array(2 + 2 + 14 + p.length);
  const len = app2.length - 2;
  app2.set([0xff, 0xe2, len >> 8, len & 255]); app2.set(enc.encode('ICC_PROFILE\0'), 4); app2.set([1, 1], 16); app2.set(p, 18);
  const out = new Uint8Array(2 + jfif.length + app2.length + jpg.length - rest);
  out.set([0xff, 0xd8]); out.set(jfif, 2); out.set(app2, 2 + jfif.length); out.set(jpg.subarray(rest), 2 + jfif.length + app2.length);
  return out;
}

/** A store-only ZIP from [name, bytes] pairs, keeping the bytes as Blobs (an album is a few hundred MB). */
function zip(files: { name: string; blob: Blob; crc: number; size: number }[]): Blob {
  const enc = new TextEncoder();
  const parts: BlobPart[] = [], central: BlobPart[] = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const n = enc.encode(f.name);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
    h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, f.crc, true);
    h.setUint32(18, f.size, true); h.setUint32(22, f.size, true); h.setUint16(26, n.length, true);
    parts.push(h.buffer, n as BlobPart, f.blob);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, f.crc, true); c.setUint32(20, f.size, true); c.setUint32(24, f.size, true);
    c.setUint16(28, n.length, true); c.setUint32(42, offset, true);
    const entry = new Uint8Array(46 + n.length); entry.set(new Uint8Array(c.buffer)); entry.set(n, 46);
    central.push(entry as BlobPart);
    offset += 30 + n.length + f.size;
  }
  const size = files.reduce((a, f) => a + 46 + new TextEncoder().encode(f.name).length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

const jpeg = async (c: OffscreenCanvas) => markJpeg(new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.95 })).arrayBuffer()));

/** One spread drawn at full size: the JPEG bytes, as one double-page file, or (pages) the left and right
 *  pages as two files cut exactly at the fold, for Seldex's SDS designer, which only takes a photo per page
 *  (Tony, 2026-11-19: SDS slots can't be merged across the fold). getPhoto gives the original. */
export async function renderSpread(album: Album, s: Spread, photos: Map<string, Photo>, getPhoto: (id: string) => Promise<ImageBitmap>, pages = false): Promise<Uint8Array[]> {
  const page = pageSize(album.size, album.orientation), px = spreadPx(album.size, album.orientation), b = ALBUM_MARGINS.bleed;
  const canvas = new OffscreenCanvas(px.w, px.h);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = album.bg; ctx.fillRect(0, 0, px.w, px.h);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const W = page.w * 2, eps = 1e-6;
  for (const f of spreadRects(s, page, photos)) {
    const id = s.slots[f.slot];
    if (!id) continue;
    // A frame on an outside edge runs on into the bleed.
    const x0 = f.x <= eps ? -b : f.x, y0 = f.y <= eps ? -b : f.y;
    const x1 = f.x + f.w >= W - eps ? W + b : f.x + f.w, y1 = f.y + f.h >= page.h - eps ? page.h + b : f.y + f.h;
    const bmp = await getPhoto(id);
    const c = cropBox({ w: x1 - x0, h: y1 - y0 }, bmp.width, bmp.height, s.crops[f.slot]);
    const dx = Math.round((x0 + b) * ALBUM_DPI), dy = Math.round((y0 + b) * ALBUM_DPI);
    ctx.drawImage(bmp, c.sx, c.sy, c.sw, c.sh, dx, dy, Math.round((x1 + b) * ALBUM_DPI) - dx, Math.round((y1 + b) * ALBUM_DPI) - dy);
  }
  if (!pages) return [await jpeg(canvas)];
  const half = px.w / 2; // the fold (bleed, if any, is on the outside edges so the halves are equal)
  const out: Uint8Array[] = [];
  for (const x of [0, half]) {
    const c = new OffscreenCanvas(half, px.h);
    c.getContext('2d')!.drawImage(canvas, x, 0, half, px.h, 0, 0, half, px.h);
    out.push(await jpeg(c));
  }
  return out;
}

/** Fetch an original as an ImageBitmap (keeps the last couple, as a photo is often in two spreads in a row). */
export function originals(galleryId: string, photos: Map<string, Photo & { filename?: string }>) {
  const cache = new Map<string, ImageBitmap>();
  return {
    async get(id: string) {
      const hit = cache.get(id);
      if (hit) return hit;
      const r = await fetch(`/api/studio/galleries/original?gallery=${encodeURIComponent(galleryId)}&id=${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error(`Couldn’t get the full-size photo for ${photos.get(id)?.filename ?? id}.`);
      const bmp = await createImageBitmap(await r.blob());
      cache.set(id, bmp);
      while (cache.size > 3) { const [k, v] = cache.entries().next().value!; v.close(); cache.delete(k); }
      return bmp;
    },
    close() { for (const v of cache.values()) v.close(); cache.clear(); },
  };
}

/** Make and download the ZIP. progress(n, of) as each spread is done. pages: single pages for SDS
 *  (001-L.jpg, 001-R.jpg, 002-L.jpg…, which sort in page order) instead of double-page spreads. */
export async function albumFiles(album: Album, galleryId: string, photos: Map<string, Photo & { filename?: string }>, sheet: string, progress: (n: number, of: number) => void, pages = false) {
  const spreads = album.design.spreads;
  const src = originals(galleryId, photos);
  const files: { name: string; blob: Blob; crc: number; size: number }[] = [];
  try {
    for (let k = 0; k < spreads.length; k++) {
      progress(k, spreads.length);
      const parts = await renderSpread(album, spreads[k], photos, src.get, pages);
      parts.forEach((bytes, i) => {
        const name = `${String(k + 1).padStart(3, '0')}${pages ? (i ? '-R' : '-L') : ''}.jpg`;
        files.push({ name, blob: new Blob([bytes as BlobPart], { type: 'image/jpeg' }), crc: crc32(bytes), size: bytes.length });
      });
    }
  } finally { src.close(); }
  progress(spreads.length, spreads.length);
  const s = new TextEncoder().encode(sheet.replace(/\r?\n/g, '\r\n'));
  files.push({ name: 'Order sheet.txt', blob: new Blob([s]), crc: crc32(s), size: s.length });
  const url = URL.createObjectURL(zip(files));
  const a = document.createElement('a');
  const safe = (x: string) => x.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
  a.href = url; a.download = `${safe(album.name) || 'Album'} ${pages ? 'SDS pages' : 'Seldex spreads'}.zip`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

/** The whole album as one print PDF (Tony, 2026-11-19): one PDF page per spread at the exact spread size
 *  (2W × H inches plus any bleed), each holding that spread's 300 dpi JPEG unchanged, tagged sRGB. */
export async function albumPdf(album: Album, galleryId: string, photos: Map<string, Photo & { filename?: string }>, progress: (n: number, of: number) => void) {
  const spreads = album.design.spreads;
  const page = pageSize(album.size, album.orientation), b = ALBUM_MARGINS.bleed, px = spreadPx(album.size, album.orientation);
  const wPt = +((page.w * 2 + 2 * b) * 72).toFixed(2), hPt = +((page.h + 2 * b) * 72).toFixed(2);
  const enc = new TextEncoder();
  const parts: BlobPart[] = [];
  const offsets: number[] = [];
  let at = 0;
  const put = (x: string | Uint8Array) => { const u = typeof x === 'string' ? enc.encode(x) : x; parts.push(u as BlobPart); at += u.length; };
  const obj = (n: number, body: string, stream?: Uint8Array) => {
    offsets[n] = at;
    if (stream) { put(`${n} 0 obj\n${body}\nstream\n`); put(stream); put('\nendstream\nendobj\n'); }
    else put(`${n} 0 obj\n${body}\nendobj\n`);
  };
  // Objects: 1 catalog, 2 pages, 3 sRGB profile, 4 info, then 3 a spread: page, contents, image.
  const first = 5, kids = spreads.map((_, k) => `${first + 3 * k} 0 R`).join(' ');
  put(new Uint8Array([...enc.encode('%PDF-1.4\n%'), 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // header, with the binary marker
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${spreads.length} >>`);
  const icc = srgbProfile();
  obj(3, `<< /N 3 /Alternate /DeviceRGB /Length ${icc.length} >>`, icc);
  const title = album.name.replace(/[()\\]/g, ' ');
  obj(4, `<< /Title (${title.replace(/[^\x20-\x7e]/g, '')}) /Creator (Moments Studio album designer) /Producer (Moments Studio) >>`);
  const src = originals(galleryId, photos);
  try {
    for (let k = 0; k < spreads.length; k++) {
      progress(k, spreads.length);
      const [jpg] = await renderSpread(album, spreads[k], photos, src.get);
      const n = first + 3 * k;
      const content = enc.encode(`q ${wPt} 0 0 ${hPt} 0 0 cm /Im0 Do Q`);
      obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt} ${hPt}] /TrimBox [${b * 72} ${b * 72} ${wPt - b * 72} ${hPt - b * 72}] /Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`);
      obj(n + 1, `<< /Length ${content.length} >>`, content);
      obj(n + 2, `<< /Type /XObject /Subtype /Image /Width ${px.w} /Height ${px.h} /ColorSpace [/ICCBased 3 0 R] /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>`, jpg);
    }
  } finally { src.close(); }
  progress(spreads.length, spreads.length);
  const count = first + 3 * spreads.length;
  const xref = at;
  put(`xref\n0 ${count}\n0000000000 65535 f \n${Array.from({ length: count - 1 }, (_, i) => `${String(offsets[i + 1]).padStart(10, '0')} 00000 n \n`).join('')}`);
  put(`trailer\n<< /Size ${count} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const url = URL.createObjectURL(new Blob(parts, { type: 'application/pdf' }));
  const a = document.createElement('a');
  const safe = (x: string) => x.replace(/[\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
  a.href = url; a.download = `${safe(album.name) || 'Album'} print.pdf`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
