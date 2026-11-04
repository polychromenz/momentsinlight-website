// Small shared pieces: the top bar, loading and error states, a toast, and formatting.
import { useEffect, useState, type ReactNode } from 'react';
import { useNav } from './nav';

export function Top({ title, sub, back = true, right }: { title: string; sub?: string; back?: boolean; right?: ReactNode }) {
  const nav = useNav();
  return (
    <header className="top">
      {back && <button type="button" className="back" aria-label="Back" onClick={() => nav.pop()}>‹</button>}
      <div className="top-title"><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {right}
    </header>
  );
}

export const Loading = () => <p className="muted pad">Loading…</p>;
export const Problem = ({ error, retry }: { error: string; retry?: () => void }) => (
  <div className="card pad"><p className="err">{error}</p>{retry && <button type="button" className="btn" onClick={retry}>Try again</button>}</div>
);

/** Load something from the studio: [data, error, reload]. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]): [T | null, string, () => void] {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setError('');
    load().then((d) => live && setData(d)).catch((e) => live && setError(e.message));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return [data, error, () => setN((x) => x + 1)];
}

let showToast: (t: string, bad?: boolean) => void = () => {};
export const toast = (t: string, bad = false) => showToast(t, bad);
export function Toaster() {
  const [t, setT] = useState<{ text: string; bad: boolean } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    showToast = (text, bad = false) => { setT({ text, bad }); clearTimeout(timer); timer = setTimeout(() => setT(null), bad ? 5000 : 2800); };
  }, []);
  return t ? <div className={`toast${t.bad ? ' bad' : ''}`} role="status">{t.text}</div> : null;
}

// ---- Formatting (New Zealand style) ----
const d = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
export const longDate = (iso?: string | null) => (iso ? d(iso).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const shortDate = (iso?: string | null) => (iso ? d(iso).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' }) : '');
export const when = (iso?: string | null) => (iso ? d(iso).toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
export const money = (n?: number | null) => (n == null ? '' : `$${Number(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const time12 = (t?: string | null) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
};
export const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
export const STAGE: Record<string, string> = { lead: 'Lead', booked: 'Booked', completed: 'Completed', lost: 'Not going ahead' };
