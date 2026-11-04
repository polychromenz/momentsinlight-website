// The app: link the phone first (screens/Link.tsx), then four tabs — Clients, Calendar, Contacts
// and More. A newer version on the website shows a banner (side-loaded, so no Play Store updates).
import { Browser } from '@capacitor/browser';
import { useEffect, useState } from 'react';
import { latestVersion, loadKey, SITE, whenUnlinked } from './api';
import { NavProvider } from './nav';
import { Toaster } from './ui';
import { Link } from './screens/Link';
import { Clients } from './screens/Clients';
import { Calendar } from './screens/Calendar';
import { Contacts } from './screens/Contacts';
import { More } from './screens/More';

declare const __APP_VERSION__: string;
export const VERSION = __APP_VERSION__;
const newer = (a: string, b: string) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};
export const openDownload = () => Browser.open({ url: `${SITE}/api/studio/app?download=1` });

const TABS = [
  { key: 'clients', label: 'Clients', icon: '♡' },
  { key: 'calendar', label: 'Calendar', icon: '▦' },
  { key: 'contacts', label: 'Contacts', icon: '☏' },
  { key: 'more', label: 'More', icon: '⋯' },
] as const;
type Tab = (typeof TABS)[number]['key'];

export function App() {
  const [linked, setLinked] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('clients');
  const [update, setUpdate] = useState('');
  useEffect(() => {
    loadKey().then((k) => setLinked(!!k));
    whenUnlinked(() => setLinked(false));
    latestVersion().then((l) => { if (l.version && newer(l.version, VERSION)) setUpdate(l.version); });
  }, []);
  if (linked === null) return null;
  if (!linked) return <><Link onLinked={() => setLinked(true)} /><Toaster /></>;
  const root = (
    <>
      {update && <div className="banner">Version {update} is ready.<button type="button" onClick={openDownload}>Install</button></div>}
      {tab === 'clients' && <Clients />}
      {tab === 'calendar' && <Calendar />}
      {tab === 'contacts' && <Contacts />}
      {tab === 'more' && <More onUnlinked={() => setLinked(false)} />}
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}><span>{t.icon}</span>{t.label}</button>
        ))}
      </nav>
    </>
  );
  return <><NavProvider root={root} /><Toaster /></>;
}
