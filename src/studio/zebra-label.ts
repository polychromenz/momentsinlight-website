// Address labels straight to Tony's Zebra GC420t (Tony, 2026-11-19: through the print dialog the label
// came out at 50 × 50 mm on his 100 × 100 mm roll). The label is drawn on a canvas at the printer's
// own resolution (203 dpi = 8 dots per mm, so 800 × 800 dots), in Raleway with the ML logo, turned into
// black and white, and sent as a ZPL graphic through Zebra Browser Print (Zebra's free app on Tony's
// PC, which listens on localhost:9100). No driver, no scaling.
export type LabelData = { number: string; name: string; lines: string[]; phone?: string; from?: string };

const DOTS = 800;          // 100 mm at 8 dots per mm
const MM = 8;
// Browser Print listens on https://localhost:9101 (for https pages like the studio) and http://localhost:9100.
// Only the secure port is used (2026-11-19): the plain http fallback made Tony's Edge mark the whole
// site "Not secure" for him (visitors weren't affected). If https fails, the label uses the print dialog.
const PORTS = ['https://localhost:9101'];
let BP = PORTS[0];

let fontsReady: Promise<void> | null = null;
function loadFonts() {
  fontsReady ??= (async () => {
    for (const w of ['500', '600']) {
      const f = new FontFace('RalewayLabel', `url(/fonts/pdf/raleway-${w}.ttf)`, { weight: w });
      document.fonts.add(await f.load());
    }
  })();
  return fontsReady;
}
const loadImg = (src: string) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });

/** Words wrapped to a width, at the canvas's current font. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(/\s+/)) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > width && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

/** The label drawn at 800 × 800 dots. */
export async function drawLabel(d: LabelData) {
  await loadFonts();
  const logo = await loadImg('/brand/label-logo.png');
  const c = document.createElement('canvas'); c.width = DOTS; c.height = DOTS;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff'; x.fillRect(0, 0, DOTS, DOTS); x.fillStyle = '#000';
  const L = 7 * MM, R = DOTS - 7 * MM, W = R - L;
  let y = 8 * MM;
  // Top: logo left, order number right, a rule under.
  const lh = 17 * MM, lw = (logo.width / logo.height) * lh;
  x.drawImage(logo, L, y, lw, lh);
  x.font = `600 ${4.6 * MM}px RalewayLabel`; x.textAlign = 'right'; x.textBaseline = 'bottom';
  x.fillText(d.number, R, y + lh);
  x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  y += lh + 3 * MM; x.fillRect(L, y, W, 0.6 * MM); y += 0.6 * MM + 5 * MM;
  // Deliver to
  const text = (s: string, size: number, weight: string, gap = 1.18, track = 0) => {
    x.font = `${weight} ${size * MM}px RalewayLabel`;
    (x as any).letterSpacing = `${track}px`;
    for (const ln of wrap(x, s, W)) { y += size * MM * 0.82; x.fillText(ln, L, y); y += size * MM * (gap - 0.82); }
    (x as any).letterSpacing = '0px';
  };
  text('DELIVER TO', 3.8, '600', 1.5, 6);
  text(d.name, 7.6, '600', 1.15);
  for (const l of d.lines) text(l, 6.6, '500', 1.18);
  if (d.phone) { y += 1 * MM; text(d.phone, 5, '500'); }
  // Return address at the bottom.
  if (d.from) {
    const from = d.from.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    x.font = `500 ${4 * MM}px RalewayLabel`;
    const h = 2.4 * MM + 3.6 * MM * 1.5 + from.length * 4 * MM * 1.25;
    y = DOTS - 7 * MM - h;
    x.fillRect(L, y, W, 0.5 * MM); y += 0.5 * MM + 2.4 * MM;
    text('IF UNDELIVERED, RETURN TO', 3.6, '600', 1.5, 5);
    for (const l of from) text(l, 4, '500', 1.25);
  }
  return c;
}

/** The canvas as a ZPL label: one black-and-white graphic covering the whole 800 × 800 dots. */
export function toZpl(c: HTMLCanvasElement) {
  const { data } = c.getContext('2d')!.getImageData(0, 0, DOTS, DOTS);
  const row = DOTS / 8;
  let hex = '';
  for (let yy = 0; yy < DOTS; yy++) {
    for (let b = 0; b < row; b++) {
      let byte = 0;
      for (let k = 0; k < 8; k++) {
        const i = (yy * DOTS + b * 8 + k) * 4;
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (lum < 140) byte |= 0x80 >> k;   // dark = burn a dot
      }
      hex += byte.toString(16).padStart(2, '0');
    }
  }
  const total = row * DOTS;
  return `^XA^PW${DOTS}^LL${DOTS}^LH0,0^FO0,0^GFA,${total},${total},${row},${hex.toUpperCase()}^FS^PQ1^XZ`;
}

/** Zebra Browser Print's default printer, or null when the app isn't running here. */
export async function zebraPrinter() {
  for (const base of PORTS) {
    try {
      const r = await fetch(`${base}/default?type=printer`, { signal: AbortSignal.timeout(2500) });
      if (!r.ok) continue;
      const p = await r.json().catch(() => null);
      if (p && p.uid) { BP = base; return p; }
      // No default chosen in Browser Print: use the first printer it can see (Tony's has just the GC420t).
      const r2 = await fetch(`${base}/available`, { signal: AbortSignal.timeout(2500) });
      const list = r2.ok ? await r2.json().catch(() => null) : null;
      const first = (list?.printer ?? []).find((x: any) => x?.uid);
      if (first) { BP = base; return first; }
    } catch { /* not on this port */ }
  }
  return null;
}

/** Print the label on the Zebra. Throws with a plain message if it can't. */
export async function printOnZebra(d: LabelData, printer: any) {
  const zpl = toZpl(await drawLabel(d));
  const r = await fetch(`${BP}/write`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ device: printer, data: zpl }) });
  if (!r.ok) throw new Error(`The Zebra didn’t take the label (${r.status}). Check it’s on and has labels loaded.`);
}
