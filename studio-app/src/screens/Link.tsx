// Linking this phone to the studio, once: the app makes a random code and opens the studio's
// /studio/app page in the phone's browser (where Tony signs in as usual). When he taps "Link this
// phone" there, the studio makes this phone's key and the app collects it (api.claim).
import { Browser } from '@capacitor/browser';
import { useEffect, useRef, useState } from 'react';
import { claim, saveKey, SITE } from '../api';
import { toast } from '../ui';

const newCode = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');

export function Link({ onLinked }: { onLinked: () => void }) {
  const [name, setName] = useState('Tony’s phone');
  const [code, setCode] = useState('');
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  useEffect(() => () => clearInterval(timer.current), []);

  async function start() {
    const c = newCode();
    setCode(c);
    await Browser.open({ url: `${SITE}/studio/app?code=${c}&name=${encodeURIComponent(name)}` });
    const until = Date.now() + 15 * 60_000;
    clearInterval(timer.current);
    timer.current = setInterval(async () => {
      if (Date.now() > until) { clearInterval(timer.current); setCode(''); toast('That took too long. Tap Link this phone again.', true); return; }
      const got = await claim(c);
      if (!got) return;
      clearInterval(timer.current);
      await saveKey(got.token, got.name);
      Browser.close().catch(() => {});
      toast('Linked. Welcome to the studio.');
      onLinked();
    }, 2000);
  }

  return (
    <main className="pad" style={{ paddingTop: '18vh' }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, margin: '0 0 6px' }}>Moments Studio</h1>
      <p className="muted" style={{ marginTop: 0 }}>Clients, calendar and contacts, on your phone.</p>
      <div className="card form" style={{ margin: '24px 0' }}>
        <label>Name for this phone<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></label>
        <button type="button" className="btn solid block" onClick={start}>Link this phone</button>
        {code
          ? <p className="small muted" style={{ margin: 0 }}>Your browser opened the studio. Sign in if it asks, then tap <strong>Link this phone</strong> there. This screen carries on by itself.</p>
          : <p className="small muted" style={{ margin: 0 }}>This opens the studio in your browser to sign in, once. After that the app keeps its own key (you can switch it off in the studio, under Phone app).</p>}
      </div>
    </main>
  );
}
