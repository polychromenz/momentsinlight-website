// More: the app's version and updates, opening the full studio in the browser, and unlinking.
import { Browser } from '@capacitor/browser';
import { useEffect, useState } from 'react';
import { forgetKey, latestVersion, phoneName, SITE } from '../api';
import { openDownload, VERSION } from '../App';

export function More({ onUnlinked }: { onUnlinked: () => void }) {
  const [name, setName] = useState('');
  const [latest, setLatest] = useState<string | null>(null);
  useEffect(() => { phoneName().then(setName); latestVersion().then((l) => setLatest(l.version)); }, []);
  async function unlink() {
    if (!confirm('Unlink this phone? You’ll need to sign in to the studio again to use the app. (To stop the key working, also switch it off in the studio under Phone app.)')) return;
    await forgetKey();
    onUnlinked();
  }
  return (
    <>
      <header className="top"><div className="top-title"><h1>More</h1></div></header>
      <section className="card">
        <ul className="list">
          <li className="row"><span className="row-main"><strong>Moments Studio app</strong><small>Version {VERSION}{latest && latest !== VERSION ? ` · ${latest} is available` : latest ? ' · up to date' : ''}</small></span>{latest && latest !== VERSION && <button type="button" className="btn" onClick={openDownload}>Install</button>}</li>
          <li><button type="button" className="row" onClick={() => Browser.open({ url: `${SITE}/studio` })}><span className="row-main"><strong>Open the full studio</strong><small>Everything else (payments, galleries, settings) in your browser</small></span><span className="chev">›</span></button></li>
          <li><button type="button" className="row" onClick={() => Browser.open({ url: `${SITE}/studio/app` })}><span className="row-main"><strong>Linked phones</strong><small>{name ? `This phone: ${name}` : 'See or switch off linked phones'}</small></span><span className="chev">›</span></button></li>
          <li><button type="button" className="row" onClick={unlink}><span className="row-main"><strong style={{ color: 'var(--red)' }}>Unlink this phone</strong></span></button></li>
        </ul>
      </section>
    </>
  );
}
