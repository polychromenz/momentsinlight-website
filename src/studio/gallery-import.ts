// Adding photos to a gallery from the studio (MIL Galleries 1b): a Pic-Time download (a folder with
// a folder per section) or a few photos into one section. The browser makes the 2048px and 600px
// copies, then sends all three sizes. It can stop and carry on: photos already sent are skipped
// (each is known by its section and file name), and half-sent ones finish.

export type Job = { file: File; section: string; key: string; order: number };
export type Plan = { sections: { name: string; is_bw: boolean; files: number; done: number }[]; jobs: Job[]; skipped: string[] };
type Detail = { sections: any[]; images: any[] };

const BW = /(\bb\s*\+\s*w\b|\bb\s*&\s*w\b|\bbw\b|black\s*(and|&)\s*white|\bmono\b)/i;
const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
export const isBw = (name: string) => BW.test(name);

/** Work out sections and photos from the chosen files (folder names → sections). */
export function plan(files: File[], detail: Detail, intoSection?: string): Plan {
  const skipped: string[] = [];
  const by = new Map<string, File[]>();
  // Tony's Wedding Collection Export plugin saves <wedding>\Color\<section> and <wedding>\Mono\<section>
  // (and web copies under Web\, which aren't needed: the browser makes its own web sizes).
  const hasFull = files.some((f) => !(f.webkitRelativePath || '').split('/').slice(0, -1).some((p) => /^web$/i.test(p)));
  let web = 0;
  for (const f of files) {
    if (!/\.jpe?g$/i.test(f.name)) { if (!f.name.startsWith('.') && !/^(thumbs\.db|desktop\.ini)$/i.test(f.name)) skipped.push(f.name); continue; }
    const parts = (f.webkitRelativePath || f.name).split('/');
    const between = parts.slice(0, -2); // the chosen folder and any between it and the section (e.g. Mono)
    if (hasFull && between.some((p) => /^web$/i.test(p))) { web++; continue; }
    const mono = between.some((p) => /^(mono|b\s*\+?\s*w|black and white)$/i.test(p));
    const base = intoSection ?? (parts.length >= 3 ? parts[parts.length - 2] : 'Photos');
    const section = !intoSection && mono && !isBw(base) ? `${base} B+W` : base;
    (by.get(section) ?? by.set(section, []).get(section)!).push(f);
  }
  const ready = new Set(detail.images.filter((i) => i.status === 'ready').map((i) => i.lightroom_id));
  const names = [...by.keys()].sort(natural.compare);
  const jobs: Job[] = [];
  const sections = names.map((name) => {
    const list = by.get(name)!.sort((a, b) => natural.compare(a.name, b.name));
    let done = 0;
    list.forEach((file, order) => {
      const key = `file:${name}/${file.name}`;
      if (ready.has(key)) done++;
      else jobs.push({ file, section: name, key, order });
    });
    return { name, is_bw: isBw(name), files: list.length, done };
  });
  if (web) skipped.push(`${web} web-size copies (the full-size ones are used)`);
  return { sections, jobs, skipped };
}

async function api(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Something went wrong (${r.status}).`);
  return d;
}

async function resize(src: CanvasImageSource, w: number, h: number, long: number, quality: number) {
  const s = Math.min(1, long / Math.max(w, h));
  const c = new OffscreenCanvas(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return { canvas: c, blob: await c.convertToBlob({ type: 'image/jpeg', quality }) };
}

async function put(id: string, size: string, body: Blob) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(`/api/studio/galleries/photos?id=${id}&size=${size}`, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body });
      const d = await r.json().catch(() => ({}));
      if (r.ok) return;
      if (r.status < 500 || attempt >= 4) throw new Error(d.error || `Upload failed (${r.status}).`);
    } catch (e) {
      if (attempt >= 4) throw e;
    }
    await new Promise((res) => setTimeout(res, 1500 * attempt));
  }
}

export type Progress = { done: number; total: number; bytes: number; current: string; failed: { name: string; error: string }[] };

/** Send everything in the plan (three at a time). */
export async function run(galleryId: string, p: Plan, detail: Detail, onProgress: (p: Progress) => void, stopped: () => boolean) {
  // Sections first (re-used if they exist from an earlier run).
  const sectionId = new Map<string, number>();
  for (const s of p.sections) {
    const have = detail.sections.find((x) => x.source_key === `folder:${s.name}`) ?? detail.sections.find((x) => x.name === s.name);
    sectionId.set(s.name, have ? have.id : (await api('/api/studio/galleries/photos', 'POST', { action: 'section', gallery_id: galleryId, name: s.name, is_bw: s.is_bw, source_key: `folder:${s.name}` })).id);
  }
  const known = new Map(detail.images.map((i) => [i.lightroom_id, i]));
  const prog: Progress = { done: 0, total: p.jobs.length, bytes: 0, current: '', failed: [] };
  let next = 0;
  async function one(job: Job) {
    prog.current = job.file.name;
    onProgress(prog);
    const bmp = await createImageBitmap(job.file);
    try {
      const { id } = await api('/api/studio/galleries/photos', 'POST', { action: 'image', gallery_id: galleryId, section_id: sectionId.get(job.section), filename: job.file.name, width: bmp.width, height: bmp.height, sort_order: job.order, lightroom_id: job.key });
      const had = known.get(job.key);
      const web = await resize(bmp, bmp.width, bmp.height, 2048, 0.86);
      const thumb = await resize(web.canvas, web.canvas.width, web.canvas.height, 600, 0.8);
      if (!had?.has_thumb) await put(id, 'thumb', thumb.blob);
      if (!had?.has_web) await put(id, 'web', web.blob);
      if (!had?.has_original) await put(id, 'original', job.file);
      prog.bytes += job.file.size;
    } finally {
      bmp.close();
    }
  }
  async function worker() {
    while (next < p.jobs.length && !stopped()) {
      const job = p.jobs[next++];
      try { await one(job); } catch (e) { prog.failed.push({ name: `${job.section} / ${job.file.name}`, error: (e as Error).message }); }
      prog.done++;
      onProgress(prog);
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return prog;
}
