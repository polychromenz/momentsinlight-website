// Slideshow Reels for Studio › Social (src/studio/social.ts): the post's photos as a 1080×1920 MP4 with
// music, made on Tony's PC when he previews or approves a Reel. Each photo is shown whole over a soft,
// blurred copy of itself (tall photos fill the frame), with a slow zoom and a cross-fade to the next; the
// music fades in and out. Encoded with the browser's own H.264/AAC encoders (WebCodecs) and packed by
// mp4-muxer with the index at the front, as Instagram asks. Quicker than real time: nothing plays.
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

const W = 1080, H = 1920, FPS = 30;
const PER = 3;      // seconds each photo is on screen
const FADE = 0.7;   // cross-fade between photos
const RATE = 48000;

/** How long a Reel of n photos runs (the last photo is held a little longer, then fades to black). */
export const reelSeconds = (n: number) => n * PER + 1;

async function picture(url: string) {
  const blob = await (await fetch(url, { mode: 'cors' })).blob();
  const img = await createImageBitmap(blob);
  // The soft background, made once per photo (blurring every frame would be slow).
  const bg = document.createElement('canvas');
  bg.width = W / 4; bg.height = H / 4;
  const b = bg.getContext('2d')!;
  const cover = Math.max(bg.width / img.width, bg.height / img.height);
  b.filter = 'blur(10px) brightness(0.8)';
  b.drawImage(img, (bg.width - img.width * cover) / 2, (bg.height - img.height * cover) / 2, img.width * cover, img.height * cover);
  return { img, bg };
}
type Pic = Awaited<ReturnType<typeof picture>>;

function drawPic(ctx: CanvasRenderingContext2D, p: Pic, t: number, alpha: number) {
  ctx.globalAlpha = alpha;
  ctx.drawImage(p.bg, -40, -70, W + 80, H + 140);
  const r = p.img.width / p.img.height;
  // Tall photos (nearly the screen's shape) fill it; others are shown whole across the width.
  const base = r < 0.72 ? Math.max(W / p.img.width, H / p.img.height) : Math.min(W / p.img.width, H / p.img.height);
  const k = base * (1 + 0.07 * t);
  const w = p.img.width * k, h = p.img.height * k;
  ctx.drawImage(p.img, (W - w) / 2, (H - h) / 2, w, h);
  ctx.globalAlpha = 1;
}

async function videoConfig() {
  for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42002a']) {
    const c: VideoEncoderConfig = { codec, width: W, height: H, bitrate: 8_000_000, framerate: FPS, avc: { format: 'avc' } };
    if ((await VideoEncoder.isConfigSupported(c)).supported) return c;
  }
  throw new Error('This browser can’t make videos. Use Chrome or Edge on your PC.');
}

/** Make the Reel. photos: full-size image addresses, in order; music: the MP3. */
export async function makeReel(photos: string[], music: ArrayBuffer, progress: (share: number) => void = () => {}): Promise<Blob> {
  if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') throw new Error('This browser can’t make videos. Use Chrome or Edge on your PC.');
  if (!photos.length) throw new Error('The Reel needs at least one photo.');
  const total = reelSeconds(photos.length);
  const pics = await Promise.all(photos.map(picture));
  const audioCfg: AudioEncoderConfig = { codec: 'mp4a.40.2', sampleRate: RATE, numberOfChannels: 2, bitrate: 192_000 };
  if (!(await AudioEncoder.isConfigSupported(audioCfg)).supported) throw new Error('This browser can’t encode the music. Use Chrome or Edge on your PC.');

  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H, frameRate: FPS },
    audio: { codec: 'aac', numberOfChannels: 2, sampleRate: RATE }, fastStart: 'in-memory', firstTimestampBehavior: 'offset' });
  let failed: Error | null = null;

  // ---- Pictures ----
  const ve = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => (failed = e) });
  ve.configure(await videoConfig());
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  const frames = Math.round(total * FPS);
  for (let f = 0; f < frames; f++) {
    if (failed) throw failed;
    const s = f / FPS;
    const i = Math.min(pics.length - 1, Math.floor(s / PER));
    const into = s - i * PER;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (i > 0 && into < FADE) drawPic(ctx, pics[i - 1], Math.min(1, (s - (i - 1) * PER) / (PER + FADE)), 1);
    drawPic(ctx, pics[i], Math.min(1, into / (PER + FADE)), i > 0 && into < FADE ? into / FADE : 1);
    const end = total - s; // fade to black over the last 0.6 seconds
    if (end < 0.6) { ctx.fillStyle = `rgba(0,0,0,${1 - end / 0.6})`; ctx.fillRect(0, 0, W, H); }
    const frame = new VideoFrame(cv, { timestamp: Math.round((f * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
    ve.encode(frame, { keyFrame: f % (FPS * 2) === 0 });
    frame.close();
    while (ve.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 5));
    if (f % 15 === 0) progress((f / frames) * 0.9);
  }
  await ve.flush();

  // ---- Music: from the start, looped if short, fading in and out ----
  const ac = new AudioContext({ sampleRate: RATE });
  const buf = await ac.decodeAudioData(music.slice(0));
  await ac.close();
  const left = buf.getChannelData(0), right = buf.numberOfChannels > 1 ? buf.getChannelData(1) : left;
  const ae = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => (failed = e) });
  ae.configure(audioCfg);
  const all = Math.round(total * RATE), fadeIn = 0.4 * RATE, fadeOut = 2 * RATE, step = 4800;
  for (let at = 0; at < all; at += step) {
    const n = Math.min(step, all - at);
    const data = new Float32Array(n * 2);
    for (let k = 0; k < n; k++) {
      const x = at + k, src = x % buf.length;
      const g = Math.min(1, x / fadeIn, (all - x) / fadeOut);
      data[k] = left[src] * g;
      data[n + k] = right[src] * g;
    }
    const a = new AudioData({ format: 'f32-planar', sampleRate: RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((at * 1e6) / RATE), data });
    ae.encode(a);
    a.close();
  }
  await ae.flush();
  if (failed) throw failed;
  pics.forEach((p) => p.img.close());
  muxer.finalize();
  progress(1);
  return new Blob([(muxer.target as ArrayBufferTarget).buffer], { type: 'video/mp4' });
}
