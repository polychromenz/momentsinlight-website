// A quote, contract, invoice or receipt as its PDF (the same one the studio makes), drawn in the app
// with pdf.js because Android's web view can't show PDFs. Zoom with − and +; Share sends the file to
// another app (Gmail, WhatsApp, Files…).
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useEffect, useRef, useState } from 'react';
import { apiFile } from '../api';
import { Loading, Problem, toast, Top } from '../ui';

GlobalWorkerOptions.workerSrc = workerUrl;
const ZOOMS = [1, 1.5, 2, 3];

const toBase64 = (bytes: Uint8Array) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

export function PdfView({ title, sub, path, fileName }: { title: string; sub?: string; path: string; fileName: string }) {
  const pages = useRef<HTMLDivElement>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(0);
  const [n, setN] = useState(0);

  useEffect(() => { apiFile(path).then(setBytes).catch((e) => setError(e.message)); }, [path, n]);

  // Draw every page, sharp at the current zoom (re-drawn when zooming).
  useEffect(() => {
    if (!bytes || !pages.current) return;
    let live = true;
    const box = pages.current;
    (async () => {
      const doc = await getDocument({ data: bytes.slice() }).promise;
      box.replaceChildren();
      const width = box.clientWidth * ZOOMS[zoom];
      for (let p = 1; p <= doc.numPages && live; p++) {
        const page = await doc.getPage(p);
        const base = page.getViewport({ scale: 1 });
        const scale = (width / base.width) * (window.devicePixelRatio || 1);
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        canvas.style.width = `${width}px`;
        canvas.className = 'pdf-page';
        box.append(canvas);
        await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
      }
    })().catch((e) => live && setError(`Couldn’t show it: ${e.message}`));
    return () => { live = false; };
  }, [bytes, zoom]);

  async function share() {
    if (!bytes) return;
    try {
      if (!Capacitor.isNativePlatform()) {
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/pdf' })), download: fileName });
        a.click();
        return;
      }
      const f = await Filesystem.writeFile({ path: fileName, data: toBase64(bytes), directory: Directory.Cache });
      await Share.share({ title: fileName, files: [f.uri] });
    } catch (e) {
      if (!/cancel/i.test((e as Error).message)) toast(`Couldn’t share it: ${(e as Error).message}`, true);
    }
  }

  return (
    <>
      <Top title={title} sub={sub} />
      {error ? <Problem error={error} retry={() => { setError(''); setN((x) => x + 1); }} /> : !bytes ? <Loading /> : null}
      <div className="pdf-wrap"><div ref={pages} className="pdf-pages" /></div>
      {bytes && (
        <div className="bar">
          <button type="button" className="btn" disabled={zoom === 0} onClick={() => setZoom(zoom - 1)} aria-label="Zoom out">−</button>
          <button type="button" className="btn" disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom(zoom + 1)} aria-label="Zoom in">+</button>
          <button type="button" className="btn solid" style={{ flex: 2 }} onClick={share}>Share</button>
        </div>
      )}
    </>
  );
}
