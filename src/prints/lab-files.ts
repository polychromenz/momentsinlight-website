// Prints: the lab files for an order, made in Tony's browser (Studio > Galleries > Prints). Each
// print is cropped from the full-size original at full resolution (no resizing) and saved as a
// high-quality JPEG, named so the lab order is easy to fill in, in a folder per lab, with the
// order sheet. All in one ZIP (stored, not compressed: JPEGs don't shrink).
import { crc32 } from '../../functions-lib/galleries.js';

type Item = { id: number; image_id: string; qty: number; product: { category: string; type: string; name: string; lab: string; w_cm: number; h_cm: number }; crop: { x: number; y: number; w: number; h: number; landscape?: number } | null; filename?: string };

const safe = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();

/** One print, cropped from the original: a JPEG blob. */
async function cropped(galleryId: string, it: Item): Promise<Blob> {
  const r = await fetch(`/api/studio/galleries/original?gallery=${encodeURIComponent(galleryId)}&id=${encodeURIComponent(it.image_id)}`);
  if (!r.ok) throw new Error(`Couldn’t get the full-size photo for ${it.filename ?? it.image_id}.`);
  const bmp = await createImageBitmap(await r.blob());
  const c = it.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const sx = Math.round(c.x * bmp.width), sy = Math.round(c.y * bmp.height);
  const sw = Math.min(bmp.width - sx, Math.round(c.w * bmp.width)), sh = Math.min(bmp.height - sy, Math.round(c.h * bmp.height));
  const canvas = new OffscreenCanvas(sw, sh);
  canvas.getContext('2d')!.drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh);
  bmp.close();
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
}

/** A store-only ZIP from [name, bytes] pairs. */
function zip(files: [string, Uint8Array][]): Blob {
  const enc = new TextEncoder();
  const parts: BlobPart[] = [], central: Uint8Array[] = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const [name, data] of files) {
    const n = enc.encode(name), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, n.length, true); h.setUint16(28, 0, true);
    parts.push(h.buffer, n, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, n.length, true); c.setUint32(42, offset, true);
    const entry = new Uint8Array(46 + n.length); entry.set(new Uint8Array(c.buffer)); entry.set(n, 46);
    central.push(entry);
    offset += 30 + n.length + data.length;
  }
  const size = central.reduce((a, c) => a + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

/** Make and download the ZIP. progress(n, of) as each print is done. */
export async function labFiles(order: { number: string; gallery_id: string }, items: Item[], sheet: string, progress: (n: number, of: number) => void) {
  const files: [string, Uint8Array][] = [];
  let n = 0;
  for (const it of items) {
    progress(n, items.length);
    const p = it.product;
    const land = it.crop?.landscape ? 'landscape' : p.w_cm === p.h_cm ? 'square' : 'portrait';
    const size = it.crop?.landscape ? `${p.h_cm}x${p.w_cm}cm` : `${p.w_cm}x${p.h_cm}cm`;
    const name = safe(`${String(++n).padStart(2, '0')} - ${it.qty}x ${p.category} ${p.type} ${size} ${land} - ${(it.filename ?? it.image_id).replace(/\.[a-z]+$/i, '')}`);
    files.push([`${safe(p.lab || 'Lab')}/${name}.jpg`, new Uint8Array(await (await cropped(order.gallery_id, it)).arrayBuffer())]);
  }
  progress(items.length, items.length);
  files.push(['Order sheet.txt', new TextEncoder().encode(sheet.replace(/\r?\n/g, '\r\n'))]);
  const url = URL.createObjectURL(zip(files));
  const a = document.createElement('a');
  a.href = url; a.download = `${order.number} lab files.zip`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
