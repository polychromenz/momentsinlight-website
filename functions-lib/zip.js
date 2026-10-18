// A ZIP made as it downloads: photos are copied straight from R2 into the response, nothing is
// stored. JPEGs don't compress, so files are "stored" (no compression); their sizes and CRC-32s
// are known in advance (worked out at upload), so the exact length is known too (the browser
// shows real progress). Zip64 records are added only when the ZIP passes 4 GB.
const enc = new TextEncoder();
const MAX32 = 0xffffffff;

function dosTime(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/**
 * entries: [{ name, size, crc, open: () => Promise<ReadableStream|Uint8Array|null> }]
 * Returns { stream, length }.
 */
export function zipStream(entries) {
  const { time, date } = dosTime();
  const files = entries.map((e) => ({ ...e, nameBytes: enc.encode(e.name) }));
  // Work out where everything goes first, so the length is known.
  let offset = 0;
  for (const f of files) {
    f.offset = offset;
    offset += 30 + f.nameBytes.length + f.size;
  }
  const cdStart = offset;
  let cdSize = 0;
  for (const f of files) cdSize += 46 + f.nameBytes.length + (f.offset >= MAX32 ? 12 : 0);
  const zip64 = cdStart + cdSize >= MAX32 || files.length >= 0xffff;
  const length = cdStart + cdSize + (zip64 ? 56 + 20 : 0) + 22;

  // FixedLengthStream (Cloudflare) keeps the Content-Length, so browsers show real progress.
  const { readable, writable } = typeof FixedLengthStream === 'function' ? new FixedLengthStream(length) : new TransformStream();
  const writer = writable.getWriter();
  (async () => {
    try {
      for (const f of files) {
        const h = new DataView(new ArrayBuffer(30));
        h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
        h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, f.crc >>> 0, true);
        h.setUint32(18, f.size, true); h.setUint32(22, f.size, true); h.setUint16(26, f.nameBytes.length, true); h.setUint16(28, 0, true);
        await writer.write(new Uint8Array(h.buffer));
        await writer.write(f.nameBytes);
        const body = await f.open();
        if (!body) throw new Error(`missing ${f.name}`);
        if (body instanceof Uint8Array) await writer.write(body);
        else {
          const reader = body.getReader();
          for (;;) { const { done, value } = await reader.read(); if (done) break; await writer.write(value); }
        }
      }
      for (const f of files) {
        const big = f.offset >= MAX32;
        const h = new DataView(new ArrayBuffer(46 + (big ? 12 : 0)));
        h.setUint32(0, 0x02014b50, true); h.setUint16(4, 45, true); h.setUint16(6, big ? 45 : 20, true); h.setUint16(8, 0x0800, true); h.setUint16(10, 0, true);
        h.setUint16(12, time, true); h.setUint16(14, date, true); h.setUint32(16, f.crc >>> 0, true); h.setUint32(20, f.size, true); h.setUint32(24, f.size, true);
        h.setUint16(28, f.nameBytes.length, true); h.setUint16(30, big ? 12 : 0, true); h.setUint16(32, 0, true); h.setUint16(34, 0, true); h.setUint16(36, 0, true);
        h.setUint32(38, 0, true); h.setUint32(42, big ? MAX32 : f.offset, true);
        const bytes = new Uint8Array(h.buffer);
        if (big) {
          const x = new DataView(h.buffer, 46);
          x.setUint16(0, 0x0001, true); x.setUint16(2, 8, true); x.setBigUint64(4, BigInt(f.offset), true);
        }
        // The name goes between the fixed part and the extra field.
        await writer.write(bytes.slice(0, 46));
        await writer.write(f.nameBytes);
        if (big) await writer.write(bytes.slice(46));
      }
      if (zip64) {
        const z = new DataView(new ArrayBuffer(56 + 20));
        z.setUint32(0, 0x06064b50, true); z.setBigUint64(4, 44n, true); z.setUint16(12, 45, true); z.setUint16(14, 45, true);
        z.setUint32(16, 0, true); z.setUint32(20, 0, true); z.setBigUint64(24, BigInt(files.length), true); z.setBigUint64(32, BigInt(files.length), true);
        z.setBigUint64(40, BigInt(cdSize), true); z.setBigUint64(48, BigInt(cdStart), true);
        z.setUint32(56, 0x07064b50, true); z.setUint32(60, 0, true); z.setBigUint64(64, BigInt(cdStart + cdSize), true); z.setUint32(72, 1, true);
        await writer.write(new Uint8Array(z.buffer));
      }
      const e = new DataView(new ArrayBuffer(22));
      e.setUint32(0, 0x06054b50, true); e.setUint16(4, 0, true); e.setUint16(6, 0, true);
      e.setUint16(8, Math.min(files.length, 0xffff), true); e.setUint16(10, Math.min(files.length, 0xffff), true);
      e.setUint32(12, zip64 ? MAX32 : cdSize, true); e.setUint32(16, zip64 ? MAX32 : cdStart, true); e.setUint16(20, 0, true);
      await writer.write(new Uint8Array(e.buffer));
      await writer.close();
    } catch (err) {
      console.error('zip:', err.message);
      await writer.abort(err).catch(() => {});
    }
  })();
  return { stream: readable, length };
}
