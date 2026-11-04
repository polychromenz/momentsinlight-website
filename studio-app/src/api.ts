// Talking to the studio: https://www.momentsinlight.co.nz/api/app/<path>, which runs the studio's
// own /api/studio/<path> code (functions/api/app/[[path]].js on the website). Every call carries this
// phone's key, collected once when the phone was linked (screens/Link.tsx) and kept in Preferences.
import { Preferences } from '@capacitor/preferences';

// VITE_API_URL=http://<pc>:8789 for testing against `wrangler pages dev`.
export const SITE = (import.meta.env.VITE_API_URL as string | undefined) || 'https://www.momentsinlight.co.nz';

let key: string | null = null;

export async function loadKey() {
  key = (await Preferences.get({ key: 'studio-key' })).value;
  return key;
}
export async function saveKey(k: string, name: string) {
  key = k;
  await Preferences.set({ key: 'studio-key', value: k });
  await Preferences.set({ key: 'studio-phone', value: name });
}
export async function forgetKey() {
  key = null;
  await Preferences.remove({ key: 'studio-key' });
}
export const phoneName = async () => (await Preferences.get({ key: 'studio-phone' })).value ?? '';

/** Thrown when the studio no longer knows this phone (switched off, or never linked). */
export class Unlinked extends Error {}
let onUnlinked: () => void = () => {};
export const whenUnlinked = (fn: () => void) => { onUnlinked = fn; };

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${SITE}/api/app/${path}`, {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers: { authorization: `Bearer ${key ?? ''}`, ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: 'no-store',
    });
  } catch {
    throw new Error('No connection to the studio. Check your signal and try again.');
  }
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && d.unlinked) { onUnlinked(); throw new Unlinked(d.error); }
  if (!r.ok) throw new Error(d.error || `The studio said ${r.status}.`);
  return d as T;
}

/** Before a phone is linked: has Tony approved this code yet? The key once he has. */
export async function claim(code: string): Promise<{ token: string; name: string } | null> {
  const r = await fetch(`${SITE}/api/app/claim?code=${code}`, { cache: 'no-store' }).catch(() => null);
  if (!r || r.status !== 200) return null;
  return r.json();
}

export const latestVersion = async (): Promise<{ version: string | null }> =>
  (await fetch(`${SITE}/api/app/latest`, { cache: 'no-store' }).catch(() => null))?.json().catch(() => ({ version: null })) ?? { version: null };
